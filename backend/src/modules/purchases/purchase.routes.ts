import { Router } from 'express';
import { authMiddleware, requirePermission } from '../../core/middleware/auth.middleware';
import { tenancyMiddleware } from '../../core/tenancy/tenancy.middleware';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { prisma } from '../../config/database';
import { successResponse, paginatedResponse } from '../../core/utils/response';
import { parsePagination, buildPaginationMeta } from '../../core/utils/pagination';
import { AppError } from '../../core/errors/AppError';
import { PurchaseStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export const purchaseRouter = Router();

purchaseRouter.use(authMiddleware, tenancyMiddleware);

purchaseRouter.get('/', requirePermission('purchases:read'), asyncHandler(async (req, res) => {
  const pagination = parsePagination(req);
  const status = req.query.status as PurchaseStatus | undefined;

  const where = {
    tenantId: req.tenantId,
    deletedAt: null,
    ...(status && { status }),
  };

  const [purchases, total] = await Promise.all([
    prisma.purchase.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { createdAt: 'desc' },
      include: {
        supplier: { select: { id: true, name: true } },
        _count: { select: { details: true, goodsReceipts: true } },
      },
    }),
    prisma.purchase.count({ where }),
  ]);

  res.json(paginatedResponse(purchases, buildPaginationMeta(total, pagination)));
}));

purchaseRouter.get('/:id', requirePermission('purchases:read'), asyncHandler(async (req, res) => {
  const purchase = await prisma.purchase.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId, deletedAt: null },
    include: {
      supplier: true,
      details: { include: { product: { select: { id: true, name: true, internalCode: true } } } },
      goodsReceipts: { select: { id: true, status: true, receivedAt: true } },
    },
  });
  if (!purchase) throw AppError.notFound('Compra');
  res.json(successResponse(purchase));
}));

purchaseRouter.post('/', requirePermission('purchases:write'), asyncHandler(async (req, res) => {
  const { supplierId, invoiceNumber, invoiceDate, notes, items } = req.body as {
    supplierId: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    notes?: string;
    items: Array<{ productId: string; quantityOrdered: number; unitCost: number }>;
  };

  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, tenantId: req.tenantId, deletedAt: null },
  });
  if (!supplier) throw AppError.notFound('Proveedor');

  // Calcular totales
  const subtotal = items.reduce((acc, i) => acc + i.quantityOrdered * i.unitCost, 0);

  const purchase = await prisma.purchase.create({
    data: {
      tenantId: req.tenantId,
      supplierId,
      invoiceNumber,
      invoiceDate: invoiceDate ? new Date(invoiceDate) : undefined,
      notes,
      status: PurchaseStatus.DRAFT,
      subtotal: new Decimal(subtotal),
      totalAmount: new Decimal(subtotal),
      details: {
        create: items.map((i) => ({
          productId: i.productId,
          quantityOrdered: i.quantityOrdered,
          unitCost: new Decimal(i.unitCost),
          subtotal: new Decimal(i.quantityOrdered * i.unitCost),
        })),
      },
    },
    include: {
      supplier: { select: { id: true, name: true } },
      details: { include: { product: { select: { id: true, name: true, internalCode: true } } } },
    },
  });

  res.status(201).json(successResponse(purchase, 'Compra registrada'));
}));

// POST /api/purchases/:id/confirm — confirma la compra y crea AccountsPayable
purchaseRouter.post('/:id/confirm', requirePermission('purchases:write'), asyncHandler(async (req, res) => {
  const purchase = await prisma.purchase.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId, deletedAt: null },
  });
  if (!purchase) throw AppError.notFound('Compra');
  if (purchase.status !== PurchaseStatus.DRAFT) {
    throw AppError.conflict('Solo se pueden confirmar compras en estado DRAFT');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const confirmed = await tx.purchase.update({
      where: { id: purchase.id },
      data: { status: PurchaseStatus.CONFIRMED },
    });

    // Crear cuenta por pagar automáticamente
    await tx.accountsPayable.create({
      data: {
        tenantId: req.tenantId,
        supplierId: purchase.supplierId,
        purchaseId: purchase.id,
        description: `Compra${purchase.invoiceNumber ? ` Factura ${purchase.invoiceNumber}` : ''}`,
        totalAmount: purchase.totalAmount,
        paidAmount: new Decimal(0),
        remainingAmount: purchase.totalAmount,
      },
    });

    return confirmed;
  });

  res.json(successResponse(updated, 'Compra confirmada'));
}));
