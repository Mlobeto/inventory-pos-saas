import { Router } from 'express';
import { authMiddleware, requirePermission } from '../../core/middleware/auth.middleware';
import { tenancyMiddleware } from '../../core/tenancy/tenancy.middleware';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { prisma } from '../../config/database';
import { successResponse } from '../../core/utils/response';
import { AppError } from '../../core/errors/AppError';

export const paymentMethodRouter = Router();

paymentMethodRouter.use(authMiddleware, tenancyMiddleware);

paymentMethodRouter.get('/', asyncHandler(async (req, res) => {
  const methods = await prisma.paymentMethod.findMany({
    where: { tenantId: req.tenantId, isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  res.json(successResponse(methods));
}));

paymentMethodRouter.post('/', requirePermission('tenant:settings'), asyncHandler(async (req, res) => {
  const { name, code } = req.body;
  const existing = await prisma.paymentMethod.findUnique({
    where: { tenantId_code: { tenantId: req.tenantId, code } },
  });
  if (existing) throw AppError.alreadyExists('Método de pago con ese código');

  const method = await prisma.paymentMethod.create({
    data: { tenantId: req.tenantId, name, code },
  });
  res.status(201).json(successResponse(method, 'Método de pago creado'));
}));

paymentMethodRouter.patch('/:id', requirePermission('tenant:settings'), asyncHandler(async (req, res) => {
  const method = await prisma.paymentMethod.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId },
  });
  if (!method) throw AppError.notFound('Método de pago');

  const updated = await prisma.paymentMethod.update({
    where: { id: req.params.id },
    data: { name: req.body.name, isActive: req.body.isActive, sortOrder: req.body.sortOrder },
  });
  res.json(successResponse(updated, 'Método de pago actualizado'));
}));
