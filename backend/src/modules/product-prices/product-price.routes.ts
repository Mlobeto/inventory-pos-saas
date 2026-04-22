import { Router } from 'express';
import { authMiddleware, requirePermission } from '../../core/middleware/auth.middleware';
import { tenancyMiddleware } from '../../core/tenancy/tenancy.middleware';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { prisma } from '../../config/database';
import { successResponse } from '../../core/utils/response';
import { AppError } from '../../core/errors/AppError';
import { Decimal } from '@prisma/client/runtime/library';

export const productPriceRouter = Router();

productPriceRouter.use(authMiddleware, tenancyMiddleware);

// GET /api/product-prices?productId=
productPriceRouter.get('/', requirePermission('products:read'), asyncHandler(async (req, res) => {
  const productId = req.query.productId as string;
  if (!productId) throw AppError.validation('productId es requerido');

  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId: req.tenantId, deletedAt: null },
  });
  if (!product) throw AppError.notFound('Producto');

  const prices = await prisma.productPrice.findMany({
    where: { productId, tenantId: req.tenantId },
    include: { paymentMethod: { select: { id: true, code: true, name: true } } },
    orderBy: { paymentMethod: { sortOrder: 'asc' } },
  });
  res.json(successResponse(prices));
}));

// POST /api/product-prices — crear o actualizar precio (upsert)
productPriceRouter.post('/', requirePermission('products:write'), asyncHandler(async (req, res) => {
  const { productId, paymentMethodId, price } = req.body as {
    productId: string;
    paymentMethodId: string;
    price: number;
  };

  // Validar que el producto y el método de pago pertenezcan al tenant
  const [product, method] = await Promise.all([
    prisma.product.findFirst({ where: { id: productId, tenantId: req.tenantId, deletedAt: null } }),
    prisma.paymentMethod.findFirst({ where: { id: paymentMethodId, tenantId: req.tenantId, isActive: true } }),
  ]);
  if (!product) throw AppError.notFound('Producto');
  if (!method) throw AppError.notFound('Método de pago');

  const productPrice = await prisma.productPrice.upsert({
    where: { productId_paymentMethodId: { productId, paymentMethodId } },
    update: { price: new Decimal(price) },
    create: { tenantId: req.tenantId, productId, paymentMethodId, price: new Decimal(price) },
    include: { paymentMethod: { select: { code: true, name: true } } },
  });

  res.status(200).json(successResponse(productPrice, 'Precio guardado'));
}));

// DELETE /api/product-prices/:id
productPriceRouter.delete('/:id', requirePermission('products:write'), asyncHandler(async (req, res) => {
  const price = await prisma.productPrice.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId },
  });
  if (!price) throw AppError.notFound('Precio');

  await prisma.productPrice.delete({ where: { id: req.params.id } });
  res.json(successResponse(null, 'Precio eliminado'));
}));
