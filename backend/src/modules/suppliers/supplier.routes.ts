import { Router } from 'express';
import { authMiddleware, requirePermission } from '../../core/middleware/auth.middleware';
import { tenancyMiddleware } from '../../core/tenancy/tenancy.middleware';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { prisma } from '../../config/database';
import { successResponse, paginatedResponse } from '../../core/utils/response';
import { parsePagination, buildPaginationMeta } from '../../core/utils/pagination';
import { AppError } from '../../core/errors/AppError';

export const supplierRouter = Router();

supplierRouter.use(authMiddleware, tenancyMiddleware);

// GET /api/suppliers
supplierRouter.get(
  '/',
  requirePermission('suppliers:read'),
  asyncHandler(async (req, res) => {
    const pagination = parsePagination(req);
    const search = req.query.search as string | undefined;

    const where = {
      tenantId: req.tenantId,
      deletedAt: null,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { taxId: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({ where, skip: pagination.skip, take: pagination.limit, orderBy: { name: 'asc' } }),
      prisma.supplier.count({ where }),
    ]);

    res.json(paginatedResponse(suppliers, buildPaginationMeta(total, pagination)));
  }),
);

// GET /api/suppliers/:id
supplierRouter.get(
  '/:id',
  requirePermission('suppliers:read'),
  asyncHandler(async (req, res) => {
    const supplier = await prisma.supplier.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId, deletedAt: null },
    });
    if (!supplier) throw AppError.notFound('Proveedor');
    res.json(successResponse(supplier));
  }),
);

// POST /api/suppliers
supplierRouter.post(
  '/',
  requirePermission('suppliers:write'),
  asyncHandler(async (req, res) => {
    const { name, taxId, phone, email, address, notes, isGeneric } = req.body;
    const supplier = await prisma.supplier.create({
      data: { tenantId: req.tenantId, name, taxId, phone, email, address, notes, isGeneric: !!isGeneric },
    });
    res.status(201).json(successResponse(supplier, 'Proveedor creado'));
  }),
);

// PATCH /api/suppliers/:id
supplierRouter.patch(
  '/:id',
  requirePermission('suppliers:write'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.supplier.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Proveedor');

    const { name, taxId, phone, email, address, notes } = req.body;
    const updated = await prisma.supplier.update({
      where: { id: req.params.id },
      data: { name, taxId, phone, email, address, notes },
    });
    res.json(successResponse(updated, 'Proveedor actualizado'));
  }),
);

// DELETE /api/suppliers/:id (soft delete)
supplierRouter.delete(
  '/:id',
  requirePermission('suppliers:write'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.supplier.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Proveedor');
    if (existing.isGeneric) throw AppError.conflict('El proveedor genérico no puede eliminarse');

    await prisma.supplier.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });
    res.json(successResponse(null, 'Proveedor eliminado'));
  }),
);
