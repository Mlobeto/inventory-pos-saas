import { Router } from 'express';
import { authMiddleware, requirePermission } from '../../core/middleware/auth.middleware';
import { tenancyMiddleware } from '../../core/tenancy/tenancy.middleware';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { prisma } from '../../config/database';
import { successResponse } from '../../core/utils/response';
import { AppError } from '../../core/errors/AppError';
import { ProductCodeType } from '@prisma/client';

export const productCodeRouter = Router();

productCodeRouter.use(authMiddleware, tenancyMiddleware);

// GET /api/product-codes?productId=
productCodeRouter.get(
  '/',
  requirePermission('products:read'),
  asyncHandler(async (req, res) => {
    const productId = req.query.productId as string;
    if (!productId) throw AppError.validation('productId es requerido');

    // Verificar que el producto pertenezca al tenant
    const product = await prisma.product.findFirst({
      where: { id: productId, tenantId: req.tenantId, deletedAt: null },
    });
    if (!product) throw AppError.notFound('Producto');

    const codes = await prisma.productCode.findMany({
      where: { productId },
      orderBy: [{ isPrimary: 'desc' }, { type: 'asc' }],
    });
    res.json(successResponse(codes));
  }),
);

// POST /api/product-codes
productCodeRouter.post(
  '/',
  requirePermission('products:write'),
  asyncHandler(async (req, res) => {
    const { productId, code, type, isPrimary } = req.body as {
      productId: string;
      code: string;
      type: ProductCodeType;
      isPrimary?: boolean;
    };

    const product = await prisma.product.findFirst({
      where: { id: productId, tenantId: req.tenantId, deletedAt: null },
    });
    if (!product) throw AppError.notFound('Producto');

    // Verificar unicidad del código dentro del tenant para ese tipo
    const existing = await prisma.productCode.findFirst({
      where: { tenantId: req.tenantId, code, type },
    });
    if (existing) throw AppError.alreadyExists(`Código ${code} del tipo ${type}`);

    const productCode = await prisma.productCode.create({
      data: { tenantId: req.tenantId, productId, code, type, isPrimary: !!isPrimary },
    });
    res.status(201).json(successResponse(productCode, 'Código agregado'));
  }),
);

// DELETE /api/product-codes/:id
productCodeRouter.delete(
  '/:id',
  requirePermission('products:write'),
  asyncHandler(async (req, res) => {
    const code = await prisma.productCode.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
    });
    if (!code) throw AppError.notFound('Código de producto');
    if (code.type === ProductCodeType.INTERNAL) {
      throw AppError.conflict('El código interno no puede eliminarse');
    }

    await prisma.productCode.delete({ where: { id: req.params.id } });
    res.json(successResponse(null, 'Código eliminado'));
  }),
);
