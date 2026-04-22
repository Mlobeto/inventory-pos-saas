import { Router } from 'express';
import { authMiddleware, requirePermission } from '../../core/middleware/auth.middleware';
import { tenancyMiddleware } from '../../core/tenancy/tenancy.middleware';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { prisma } from '../../config/database';
import { successResponse, paginatedResponse } from '../../core/utils/response';
import { parsePagination, buildPaginationMeta } from '../../core/utils/pagination';
import { AppError } from '../../core/errors/AppError';
import { StockMovementType } from '@prisma/client';

export const inventoryRouter = Router();

inventoryRouter.use(authMiddleware, tenancyMiddleware);

// GET /api/inventory/stock — stock actual de todos los productos
inventoryRouter.get('/stock', requirePermission('inventory:read'), asyncHandler(async (req, res) => {
  const pagination = parsePagination(req);
  const search = req.query.search as string | undefined;
  const lowStock = req.query.lowStock === 'true';

  const where = {
    tenantId: req.tenantId,
    isActive: true,
    deletedAt: null,
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { internalCode: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
    ...(lowStock && { currentStock: { lte: prisma.product.fields.minStock } }),
  };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        internalCode: true,
        name: true,
        type: true,
        unit: true,
        currentStock: true,
        minStock: true,
      },
    }),
    prisma.product.count({ where }),
  ]);

  res.json(paginatedResponse(products, buildPaginationMeta(total, pagination)));
}));

// GET /api/inventory/movements — historial de movimientos
inventoryRouter.get('/movements', requirePermission('inventory:read'), asyncHandler(async (req, res) => {
  const pagination = parsePagination(req);
  const productId = req.query.productId as string | undefined;
  const type = req.query.type as StockMovementType | undefined;

  const where = {
    tenantId: req.tenantId,
    ...(productId && { productId }),
    ...(type && { type }),
  };

  const [movements, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { createdAt: 'desc' },
      include: {
        product: { select: { id: true, name: true, internalCode: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.stockMovement.count({ where }),
  ]);

  res.json(paginatedResponse(movements, buildPaginationMeta(total, pagination)));
}));

// POST /api/inventory/adjustments — ajuste manual de stock
inventoryRouter.post('/adjustments', requirePermission('inventory:adjust'), asyncHandler(async (req, res) => {
  const { productId, type, quantity, notes } = req.body as {
    productId: string;
    type: 'AJUSTE_POSITIVO' | 'AJUSTE_NEGATIVO';
    quantity: number;
    notes?: string;
  };

  if (quantity <= 0) throw AppError.validation('La cantidad del ajuste debe ser mayor a cero');
  if (!['AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO'].includes(type)) {
    throw AppError.validation('Tipo de ajuste inválido');
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId: req.tenantId, isActive: true, deletedAt: null },
  });
  if (!product) throw AppError.notFound('Producto');

  const delta = type === StockMovementType.AJUSTE_POSITIVO ? quantity : -quantity;
  const newStock = product.currentStock + delta;

  if (newStock < 0) {
    throw AppError.insufficientStock(product.internalCode);
  }

  const movement = await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: productId },
      data: { currentStock: newStock },
    });

    return tx.stockMovement.create({
      data: {
        tenantId: req.tenantId,
        productId,
        type: type as StockMovementType,
        quantity: Math.abs(delta),
        stockBefore: product.currentStock,
        stockAfter: newStock,
        notes,
        referenceType: 'ADJUSTMENT',
        createdById: req.user!.sub,
      },
    });
  });

  res.status(201).json(successResponse(movement, 'Ajuste registrado'));
}));
