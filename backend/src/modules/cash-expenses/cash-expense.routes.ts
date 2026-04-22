import { Router } from 'express';
import { authMiddleware, requirePermission } from '../../core/middleware/auth.middleware';
import { tenancyMiddleware } from '../../core/tenancy/tenancy.middleware';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { prisma } from '../../config/database';
import { successResponse } from '../../core/utils/response';
import { AppError } from '../../core/errors/AppError';
import { Decimal } from '@prisma/client/runtime/library';
import { CashShiftStatus } from '@prisma/client';

export const cashExpenseRouter = Router();

cashExpenseRouter.use(authMiddleware, tenancyMiddleware);

cashExpenseRouter.get('/', requirePermission('cash-shifts:read'), asyncHandler(async (req, res) => {
  const shiftId = req.query.shiftId as string | undefined;
  const expenses = await prisma.cashExpense.findMany({
    where: { tenantId: req.tenantId, ...(shiftId && { cashShiftId: shiftId }) },
    orderBy: { createdAt: 'desc' },
    include: { createdBy: { select: { firstName: true, lastName: true } } },
  });
  res.json(successResponse(expenses));
}));

cashExpenseRouter.post('/', requirePermission('cash-expenses:write'), asyncHandler(async (req, res) => {
  const { description, amount, category } = req.body as {
    description: string;
    amount: number;
    category?: string;
  };
  const userId = req.user!.sub;

  const shift = await prisma.cashShift.findFirst({
    where: { tenantId: req.tenantId, openedById: userId, status: CashShiftStatus.OPEN },
  });
  if (!shift) throw AppError.shiftNotOpen();

  const expense = await prisma.cashExpense.create({
    data: {
      tenantId: req.tenantId,
      cashShiftId: shift.id,
      description,
      amount: new Decimal(amount),
      category,
      createdById: userId,
    },
  });
  res.status(201).json(successResponse(expense, 'Gasto registrado'));
}));

cashExpenseRouter.delete('/:id', requirePermission('cash-expenses:write'), asyncHandler(async (req, res) => {
  const expense = await prisma.cashExpense.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId },
    include: { cashShift: { select: { status: true } } },
  });
  if (!expense) throw AppError.notFound('Gasto');
  if (expense.cashShift.status !== CashShiftStatus.OPEN) {
    throw AppError.conflict('No se pueden eliminar gastos de un turno cerrado');
  }

  await prisma.cashExpense.delete({ where: { id: req.params.id } });
  res.json(successResponse(null, 'Gasto eliminado'));
}));
