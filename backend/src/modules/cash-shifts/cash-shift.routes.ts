import { Router } from 'express';
import { authMiddleware, requirePermission } from '../../core/middleware/auth.middleware';
import { tenancyMiddleware } from '../../core/tenancy/tenancy.middleware';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { prisma } from '../../config/database';
import { successResponse, paginatedResponse } from '../../core/utils/response';
import { parsePagination, buildPaginationMeta } from '../../core/utils/pagination';
import { AppError } from '../../core/errors/AppError';
import { CashShiftStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export const cashShiftRouter = Router();

cashShiftRouter.use(authMiddleware, tenancyMiddleware);

// POST /api/cash-shifts/open — abre un turno de caja
cashShiftRouter.post('/open', requirePermission('cash-shifts:open'), asyncHandler(async (req, res) => {
  const { initialAmount } = req.body as { initialAmount: number };
  const userId = req.user!.sub;

  // Verificar que no haya un turno abierto para este usuario en este tenant
  const existingOpen = await prisma.cashShift.findFirst({
    where: { tenantId: req.tenantId, openedById: userId, status: CashShiftStatus.OPEN },
  });
  if (existingOpen) throw AppError.shiftAlreadyOpen();

  const shift = await prisma.cashShift.create({
    data: {
      tenantId: req.tenantId,
      openedById: userId,
      status: CashShiftStatus.OPEN,
      initialAmount: new Decimal(initialAmount),
    },
    include: {
      openedBy: { select: { firstName: true, lastName: true } },
    },
  });

  res.status(201).json(successResponse(shift, 'Turno de caja abierto'));
}));

// GET /api/cash-shifts/current — turno activo del usuario actual
cashShiftRouter.get('/current', requirePermission('cash-shifts:read'), asyncHandler(async (req, res) => {
  const shift = await prisma.cashShift.findFirst({
    where: { tenantId: req.tenantId, openedById: req.user!.sub, status: CashShiftStatus.OPEN },
    include: {
      openedBy: { select: { firstName: true, lastName: true } },
      _count: { select: { sales: true, cashExpenses: true } },
    },
  });

  if (!shift) {
    res.json(successResponse(null));
    return;
  }

  // Calcular totales del turno en tiempo real
  const [salesTotal, expensesTotal, paymentBreakdown, allMethods] = await Promise.all([
    prisma.salePayment.aggregate({
      where: { cashShiftId: shift.id, tenantId: req.tenantId },
      _sum: { amount: true },
    }),
    prisma.cashExpense.aggregate({
      where: { cashShiftId: shift.id, tenantId: req.tenantId },
      _sum: { amount: true },
    }),
    prisma.salePayment.groupBy({
      by: ['paymentMethodId'],
      where: { cashShiftId: shift.id, tenantId: req.tenantId },
      _sum: { amount: true },
    }),
    prisma.paymentMethod.findMany({
      where: { tenantId: req.tenantId, isActive: true },
      select: { id: true, code: true, name: true },
    }),
  ]);

  const totalSales = salesTotal._sum.amount ?? new Decimal(0);
  const totalExpenses = expensesTotal._sum.amount ?? new Decimal(0);
  const calculatedFinal = new Decimal(shift.initialAmount).add(totalSales).sub(totalExpenses);

  const breakdownWithNames = paymentBreakdown.map((pb) => {
    const method = allMethods.find((m) => m.id === pb.paymentMethodId);
    return { ...pb, paymentMethodCode: method?.code ?? '', paymentMethodName: method?.name ?? '' };
  });

  res.json(successResponse({
    ...shift,
    summary: {
      totalSales,
      totalExpenses,
      calculatedFinal,
      paymentBreakdown: breakdownWithNames,
    },
  }));
}));

// POST /api/cash-shifts/close — cierra el turno actual
cashShiftRouter.post('/close', requirePermission('cash-shifts:close'), asyncHandler(async (req, res) => {
  const { finalAmountDeclared, notes } = req.body as {
    finalAmountDeclared: number;
    notes?: string;
  };
  const userId = req.user!.sub;

  const shift = await prisma.cashShift.findFirst({
    where: { tenantId: req.tenantId, openedById: userId, status: CashShiftStatus.OPEN },
  });
  if (!shift) throw AppError.shiftNotOpen();

  // Calcular monto final
  const [salesTotal, expensesTotal] = await Promise.all([
    prisma.salePayment.aggregate({
      where: { cashShiftId: shift.id, tenantId: req.tenantId },
      _sum: { amount: true },
    }),
    prisma.cashExpense.aggregate({
      where: { cashShiftId: shift.id, tenantId: req.tenantId },
      _sum: { amount: true },
    }),
  ]);

  const totalSales = salesTotal._sum.amount ?? new Decimal(0);
  const totalExpenses = expensesTotal._sum.amount ?? new Decimal(0);
  const finalAmountCalculated = new Decimal(shift.initialAmount).add(totalSales).sub(totalExpenses);
  const declared = new Decimal(finalAmountDeclared);
  const difference = declared.sub(finalAmountCalculated);

  const closed = await prisma.cashShift.update({
    where: { id: shift.id },
    data: {
      status: CashShiftStatus.CLOSED,
      closedById: userId,
      closedAt: new Date(),
      finalAmountDeclared: declared,
      finalAmountCalculated,
      difference,
      notes,
    },
    include: {
      openedBy: { select: { firstName: true, lastName: true } },
      closedBy: { select: { firstName: true, lastName: true } },
    },
  });

  res.json(successResponse(closed, 'Turno de caja cerrado'));
}));

// GET /api/cash-shifts — historial
cashShiftRouter.get('/', requirePermission('cash-shifts:read'), asyncHandler(async (req, res) => {
  const pagination = parsePagination(req);
  const [shifts, total] = await Promise.all([
    prisma.cashShift.findMany({
      where: { tenantId: req.tenantId },
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { openedAt: 'desc' },
      include: {
        openedBy: { select: { firstName: true, lastName: true } },
        closedBy: { select: { firstName: true, lastName: true } },
        _count: { select: { sales: true, cashExpenses: true } },
      },
    }),
    prisma.cashShift.count({ where: { tenantId: req.tenantId } }),
  ]);
  res.json(paginatedResponse(shifts, buildPaginationMeta(total, pagination)));
}));

// GET /api/cash-shifts/:id — detalle del turno
cashShiftRouter.get('/:id', requirePermission('cash-shifts:read'), asyncHandler(async (req, res) => {
  const shift = await prisma.cashShift.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId },
    include: {
      openedBy: { select: { firstName: true, lastName: true } },
      closedBy: { select: { firstName: true, lastName: true } },
      sales: {
        select: { id: true, saleNumber: true, totalAmount: true, status: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
      cashExpenses: { orderBy: { createdAt: 'asc' } },
      salePayments: {
        include: { paymentMethod: { select: { code: true, name: true } } },
      },
    },
  });
  if (!shift) throw AppError.notFound('Turno de caja');
  res.json(successResponse(shift));
}));
