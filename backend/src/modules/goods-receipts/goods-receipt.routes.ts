import { Router } from 'express';
import { authMiddleware, requirePermission } from '../../core/middleware/auth.middleware';
import { tenancyMiddleware } from '../../core/tenancy/tenancy.middleware';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { prisma } from '../../config/database';
import { successResponse, paginatedResponse } from '../../core/utils/response';
import { parsePagination, buildPaginationMeta } from '../../core/utils/pagination';
import { AppError } from '../../core/errors/AppError';
import { GoodsReceiptStatus, PurchaseStatus, StockMovementType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export const goodsReceiptRouter = Router();

goodsReceiptRouter.use(authMiddleware, tenancyMiddleware);

goodsReceiptRouter.get('/', requirePermission('purchases:read'), asyncHandler(async (req, res) => {
  const pagination = parsePagination(req);
  const [receipts, total] = await Promise.all([
    prisma.goodsReceipt.findMany({
      where: { tenantId: req.tenantId },
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { receivedAt: 'desc' },
      include: {
        purchase: { select: { id: true, invoiceNumber: true } },
        receivedBy: { select: { firstName: true, lastName: true } },
        _count: { select: { details: true } },
      },
    }),
    prisma.goodsReceipt.count({ where: { tenantId: req.tenantId } }),
  ]);
  res.json(paginatedResponse(receipts, buildPaginationMeta(total, pagination)));
}));

goodsReceiptRouter.get('/:id', requirePermission('purchases:read'), asyncHandler(async (req, res) => {
  const receipt = await prisma.goodsReceipt.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId },
    include: {
      purchase: true,
      receivedBy: { select: { firstName: true, lastName: true } },
      details: {
        include: {
          product: { select: { id: true, name: true, internalCode: true } },
          purchaseDetail: { select: { quantityOrdered: true } },
        },
      },
    },
  });
  if (!receipt) throw AppError.notFound('Recepción');
  res.json(successResponse(receipt));
}));

/**
 * POST /api/goods-receipts
 * Registra la recepción de mercadería.
 * - Crea la recepción con sus detalles.
 * - Genera StockMovements (INGRESO_COMPRA) para cada ítem recibido.
 * - Actualiza Product.currentStock en la misma transacción.
 * - Actualiza el estado de la Purchase (PARTIALLY_RECEIVED / FULLY_RECEIVED).
 */
goodsReceiptRouter.post('/', requirePermission('purchases:write'), asyncHandler(async (req, res) => {
  const { purchaseId, notes, items } = req.body as {
    purchaseId: string;
    notes?: string;
    items: Array<{
      purchaseDetailId: string;
      productId: string;
      quantityExpected: number;
      quantityReceived: number;
      unitCost: number;
      notes?: string;
    }>;
  };

  const purchase = await prisma.purchase.findFirst({
    where: { id: purchaseId, tenantId: req.tenantId, deletedAt: null },
    include: { details: true },
  });
  if (!purchase) throw AppError.notFound('Compra');
  if (
    purchase.status === PurchaseStatus.DRAFT ||
    purchase.status === PurchaseStatus.CANCELLED ||
    purchase.status === PurchaseStatus.FULLY_RECEIVED
  ) {
    throw AppError.conflict(`No se puede registrar recepción para una compra en estado ${purchase.status}`);
  }

  const userId = req.user!.sub;

  const receipt = await prisma.$transaction(async (tx) => {
    // Determinar estado de la recepción
    const allComplete = items.every((i) => i.quantityReceived >= i.quantityExpected);
    const receiptStatus = allComplete ? GoodsReceiptStatus.COMPLETE : GoodsReceiptStatus.PARTIAL;

    // Crear recepción
    const newReceipt = await tx.goodsReceipt.create({
      data: {
        tenantId: req.tenantId,
        purchaseId,
        receivedById: userId,
        status: receiptStatus,
        notes,
        details: {
          create: items.map((i) => ({
            purchaseDetailId: i.purchaseDetailId,
            productId: i.productId,
            quantityExpected: i.quantityExpected,
            quantityReceived: i.quantityReceived,
            difference: i.quantityReceived - i.quantityExpected,
            unitCost: new Decimal(i.unitCost),
            notes: i.notes,
          })),
        },
      },
      include: { details: true },
    });

    // Para cada ítem con cantidad recibida > 0, actualizar stock
    for (const item of items.filter((i) => i.quantityReceived > 0)) {
      const product = await tx.product.findUnique({
        where: { id: item.productId },
        select: { currentStock: true },
      });
      if (!product) continue;

      const stockBefore = product.currentStock;
      const stockAfter = stockBefore + item.quantityReceived;

      await tx.product.update({
        where: { id: item.productId },
        data: { currentStock: stockAfter },
      });

      await tx.stockMovement.create({
        data: {
          tenantId: req.tenantId,
          productId: item.productId,
          type: StockMovementType.INGRESO_COMPRA,
          quantity: item.quantityReceived,
          stockBefore,
          stockAfter,
          unitCost: new Decimal(item.unitCost),
          referenceType: 'GOODS_RECEIPT',
          referenceId: newReceipt.id,
          createdById: userId,
        },
      });
    }

    // Actualizar estado de la compra
    const allReceived = purchase.details.every((pd) => {
      const received = items.find((i) => i.purchaseDetailId === pd.id);
      return received && received.quantityReceived >= pd.quantityOrdered;
    });

    await tx.purchase.update({
      where: { id: purchaseId },
      data: { status: allReceived ? PurchaseStatus.FULLY_RECEIVED : PurchaseStatus.PARTIALLY_RECEIVED },
    });

    return newReceipt;
  });

  res.status(201).json(successResponse(receipt, 'Recepción registrada'));
}));
