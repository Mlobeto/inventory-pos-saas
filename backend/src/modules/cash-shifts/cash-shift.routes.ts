import { Router } from 'express';
import { authMiddleware, requirePermission } from '../../core/middleware/auth.middleware';
import { tenancyMiddleware } from '../../core/tenancy/tenancy.middleware';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { prisma } from '../../config/database';
import { successResponse, paginatedResponse } from '../../core/utils/response';
import { parsePagination, buildPaginationMeta } from '../../core/utils/pagination';
import { AppError } from '../../core/errors/AppError';
import { CashShiftStatus, SaleStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { computeShiftTotals, syncClosedShiftArqueo } from './cash-shift.service';

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
  const totals = await computeShiftTotals(prisma, shift.id, req.tenantId, shift.initialAmount);

  res.json(successResponse({ ...shift, summary: totals }));
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

  // Solo el efectivo (menos gastos y reintegros) forma el saldo físico de caja
  const totals = await computeShiftTotals(prisma, shift.id, req.tenantId, shift.initialAmount);

  const finalAmountCalculated = totals.calculatedCash;
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
        where: { sale: { status: { not: SaleStatus.CANCELLED } } },
        include: { paymentMethod: { select: { code: true, name: true } } },
      },
      saleReturns: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          type: true,
          totalAmount: true,
          reason: true,
          createdAt: true,
          sale: { select: { saleNumber: true } },
        },
      },
    },
  });
  if (!shift) throw AppError.notFound('Turno de caja');

  // Se recalcula con los datos vigentes: si después del cierre se anuló una venta,
  // el saldo guardado quedaría desalineado con el detalle que se muestra.
  const totals = await computeShiftTotals(prisma, shift.id, req.tenantId, shift.initialAmount);
  await syncClosedShiftArqueo(shift, totals);

  res.json(successResponse({ ...shift, summary: totals }));
}));
