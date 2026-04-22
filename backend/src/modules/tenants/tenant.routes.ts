import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { authMiddleware, requirePermission } from '../../core/middleware/auth.middleware';
import { tenancyMiddleware } from '../../core/tenancy/tenancy.middleware';
import { prisma } from '../../config/database';
import { successResponse } from '../../core/utils/response';
import { AppError } from '../../core/errors/AppError';

export const tenantRouter = Router();

// GET /api/tenants/current — datos del tenant actual
tenantRouter.get(
  '/current',
  authMiddleware,
  tenancyMiddleware,
  requirePermission('tenant:settings'),
  asyncHandler(async (req, res) => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId },
      select: { id: true, name: true, slug: true, status: true, settings: true, createdAt: true },
    });
    if (!tenant) throw AppError.tenantNotFound();
    res.json(successResponse(tenant));
  }),
);

// PATCH /api/tenants/current — actualizar nombre/settings del tenant
tenantRouter.patch(
  '/current',
  authMiddleware,
  tenancyMiddleware,
  requirePermission('tenant:settings'),
  asyncHandler(async (req, res) => {
    const { name } = req.body as { name?: string };
    const updated = await prisma.tenant.update({
      where: { id: req.tenantId },
      data: { ...(name && { name }) },
      select: { id: true, name: true, slug: true, status: true },
    });
    res.json(successResponse(updated, 'Datos del negocio actualizados'));
  }),
);
