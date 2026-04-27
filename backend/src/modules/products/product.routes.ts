import { Router } from 'express';
import { authMiddleware, requirePermission } from '../../core/middleware/auth.middleware';
import { tenancyMiddleware } from '../../core/tenancy/tenancy.middleware';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { prisma } from '../../config/database';
import { successResponse, paginatedResponse } from '../../core/utils/response';
import { parsePagination, buildPaginationMeta } from '../../core/utils/pagination';
import { AppError } from '../../core/errors/AppError';
import { ProductType } from '@prisma/client';
import { formatProductCode, SEQUENCE_ENTITIES } from '../../shared/constants';

export const productRouter = Router();

productRouter.use(authMiddleware, tenancyMiddleware);

// GET /api/products — listado con búsqueda y filtros
productRouter.get(
  '/',
  requirePermission('products:read'),
  asyncHandler(async (req, res) => {
    const pagination = parsePagination(req);
    const search = req.query.search as string | undefined;
    const type = req.query.type as ProductType | undefined;

    const where = {
      tenantId: req.tenantId,
      deletedAt: null,
      isActive: req.query.inactive ? undefined : true,
      ...(type && { type }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { internalCode: { contains: search, mode: 'insensitive' as const } },
          { productCodes: { some: { code: { contains: search, mode: 'insensitive' as const } } } },
        ],
      }),
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { name: 'asc' },
        include: {
          productCodes: { orderBy: { isPrimary: 'desc' } },
          productPrices: { include: { paymentMethod: { select: { id: true, code: true, name: true } } } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    res.json(paginatedResponse(products, buildPaginationMeta(total, pagination)));
  }),
);

// GET /api/products/search — búsqueda rápida para POS (incluye barcode)
productRouter.get(
  '/search',
  requirePermission('products:read'),
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string)?.trim();
    if (!q) {
      res.json(successResponse([]));
      return;
    }

    const products = await prisma.product.findMany({
      where: {
        tenantId: req.tenantId,
        isActive: true,
        deletedAt: null,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { internalCode: { contains: q, mode: 'insensitive' } },
          { productCodes: { some: { code: { contains: q, mode: 'insensitive' } } } },
        ],
      },
      take: 10,
      include: {
        productCodes: true,
        productPrices: { include: { paymentMethod: { select: { id: true, code: true, name: true } } } },
      },
    });

    res.json(successResponse(products));
  }),
);

// GET /api/products/:id
productRouter.get(
  '/:id',
  requirePermission('products:read'),
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId, deletedAt: null },
      include: {
        productCodes: true,
        productPrices: { include: { paymentMethod: true } },
        purchaseDetails: {
          orderBy: { purchase: { createdAt: 'desc' } },
          take: 1,
          include: {
            purchase: {
              select: { supplier: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });
    if (!product) throw AppError.notFound('Producto');
    res.json(successResponse(product));
  }),
);

// POST /api/products — crea producto y genera internalCode correlativo
productRouter.post(
  '/',
  requirePermission('products:write'),
  asyncHandler(async (req, res) => {
    const { name, description, type, unit, minStock, barcode } = req.body as {
      name: string;
      description?: string;
      type?: ProductType;
      unit?: string;
      minStock?: number;
      barcode?: string;
    };

    // Generar código correlativo en transacción atómica
    const product = await prisma.$transaction(async (tx) => {
      // Incrementar secuencia de forma atómica
      const seq = await tx.tenantSequence.update({
        where: { tenantId_entity: { tenantId: req.tenantId, entity: SEQUENCE_ENTITIES.PRODUCT_CODE } },
        data: { lastValue: { increment: 1 } },
      });

      const internalCode = formatProductCode(seq.lastValue);

      const created = await tx.product.create({
        data: {
          tenantId: req.tenantId,
          internalCode,
          name,
          description,
          type: type ?? 'REVENTA',
          unit: unit ?? 'UN',
          minStock: minStock ?? 0,
        },
      });

      if (barcode?.trim()) {
        await tx.productCode.create({
          data: {
            tenantId: req.tenantId,
            productId: created.id,
            code: barcode.trim(),
            type: 'BARCODE',
            isPrimary: true,
          },
        });
      }

      return tx.product.findUniqueOrThrow({
        where: { id: created.id },
        include: { productCodes: true, productPrices: true },
      });
    });

    res.status(201).json(successResponse(product, 'Producto creado'));
  }),
);

// PATCH /api/products/:id
productRouter.patch(
  '/:id',
  requirePermission('products:write'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Producto');

    const { name, description, unit, minStock, isActive, barcode } = req.body;

    const updated = await prisma.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id: req.params.id },
        data: { name, description, unit, minStock, isActive },
        include: { productCodes: true, productPrices: { include: { paymentMethod: true } } },
      });

      if (barcode !== undefined) {
        const trimmed = (barcode as string)?.trim() ?? '';
        // Eliminar todos los barcodes primarios existentes del producto
        await tx.productCode.deleteMany({
          where: { productId: req.params.id, type: 'BARCODE', isPrimary: true },
        });
        if (trimmed) {
          await tx.productCode.upsert({
            where: { tenantId_code_type: { tenantId: req.tenantId, code: trimmed, type: 'BARCODE' } },
            create: { tenantId: req.tenantId, productId: req.params.id, code: trimmed, type: 'BARCODE', isPrimary: true },
            update: { productId: req.params.id, isPrimary: true },
          });
        }
        // Re-fetch productCodes actualizado
        product.productCodes = await tx.productCode.findMany({ where: { productId: req.params.id } });
      }

      return product;
    });

    res.json(successResponse(updated, 'Producto actualizado'));
  }),
);

// DELETE /api/products/:id (soft delete)
productRouter.delete(
  '/:id',
  requirePermission('products:write'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Producto');

    await prisma.product.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date(), isActive: false },
    });
    res.json(successResponse(null, 'Producto eliminado'));
  }),
);
