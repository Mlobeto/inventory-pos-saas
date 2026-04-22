import { Router } from 'express';
import { authMiddleware, requirePermission } from '../../core/middleware/auth.middleware';
import { tenancyMiddleware } from '../../core/tenancy/tenancy.middleware';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { prisma } from '../../config/database';
import { successResponse, paginatedResponse } from '../../core/utils/response';
import { parsePagination, buildPaginationMeta } from '../../core/utils/pagination';
import { AppError } from '../../core/errors/AppError';
import { SaleReturnType, SaleReturnItemCondition, SaleStatus, StockMovementType, CashShiftStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export const saleReturnRouter = Router();

saleReturnRouter.use(authMiddleware, tenancyMiddleware);

saleReturnRouter.get('/', requirePermission('sale-returns:write'), asyncHandler(async (req, res) => {
  const pagination = parsePagination(req);
  const [returns, total] = await Promise.all([
    prisma.saleReturn.findMany({
      where: { tenantId: req.tenantId },
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { createdAt: 'desc' },
      include: {
        sale: { select: { saleNumber: true } },
        processedBy: { select: { firstName: true, lastName: true } },
        _count: { select: { details: true } },
      },
    }),
    prisma.saleReturn.count({ where: { tenantId: req.tenantId } }),
  ]);
  res.json(paginatedResponse(returns, buildPaginationMeta(total, pagination)));
}));

saleReturnRouter.get('/:id', requirePermission('sale-returns:write'), asyncHandler(async (req, res) => {
  const ret = await prisma.saleReturn.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId },
    include: {
      sale: { select: { saleNumber: true, totalAmount: true } },
      processedBy: { select: { firstName: true, lastName: true } },
      details: {
        include: { product: { select: { id: true, name: true, internalCode: true } } },
      },
    },
  });
  if (!ret) throw AppError.notFound('Devolución');
  res.json(successResponse(ret));
}));

/**
 * POST /api/sale-returns
 * Registra una devolución de venta.
 * Reglas de negocio:
 * - No modifica la venta original directamente.
 * - Crea una entidad SaleReturn vinculada a la Sale.
 * - Si el ítem es restockable, genera StockMovement DEVOLUCION_CLIENTE.
 * - Si el tipo es REFUND y hay caja abierta, puede usarse para reintegro.
 * - Actualiza el estado de la Sale a PARTIALLY_RETURNED o FULLY_RETURNED.
 */
saleReturnRouter.post('/', requirePermission('sale-returns:write'), asyncHandler(async (req, res) => {
  const { saleId, type, reason, items } = req.body as {
    saleId: string;
    type: SaleReturnType;
    reason: string;
    items: Array<{
      saleDetailId: string;
      productId: string;
      quantityReturned: number;
      unitPrice: number;
      condition: SaleReturnItemCondition;
      restockable: boolean;
      notes?: string;
    }>;
  };

  const userId = req.user!.sub;

  const sale = await prisma.sale.findFirst({
    where: { id: saleId, tenantId: req.tenantId },
    include: {
      details: true,
      returns: { include: { details: true } },
    },
  });
  if (!sale) throw AppError.notFound('Venta');
  if (sale.status === SaleStatus.CANCELLED || sale.status === SaleStatus.FULLY_RETURNED) {
    throw AppError.conflict(`No se puede registrar devolución para una venta en estado ${sale.status}`);
  }

  const totalAmount = items.reduce((acc, i) => acc + i.quantityReturned * i.unitPrice, 0);

  const saleReturn = await prisma.$transaction(async (tx) => {
    // Obtener turno abierto (para el cashShiftId si aplica reintegro)
    const openShift = await tx.cashShift.findFirst({
      where: { tenantId: req.tenantId, openedById: userId, status: CashShiftStatus.OPEN },
    });

    const newReturn = await tx.saleReturn.create({
      data: {
        tenantId: req.tenantId,
        saleId,
        type,
        reason,
        totalAmount: new Decimal(totalAmount),
        processedById: userId,
        cashShiftId: type === SaleReturnType.REFUND && openShift ? openShift.id : undefined,
        details: {
          create: items.map((i) => ({
            saleDetailId: i.saleDetailId,
            productId: i.productId,
            quantityReturned: i.quantityReturned,
            unitPrice: new Decimal(i.unitPrice),
            subtotal: new Decimal(i.quantityReturned * i.unitPrice),
            condition: i.condition,
            restockable: i.restockable,
            notes: i.notes,
          })),
        },
      },
    });

    // Reintegrar stock para ítems restockables
    for (const item of items.filter((i) => i.restockable)) {
      const product = await tx.product.findUnique({
        where: { id: item.productId },
        select: { currentStock: true },
      });
      if (!product) continue;

      const stockBefore = product.currentStock;
      const stockAfter = stockBefore + item.quantityReturned;

      await tx.product.update({
        where: { id: item.productId },
        data: { currentStock: stockAfter },
      });

      await tx.stockMovement.create({
        data: {
          tenantId: req.tenantId,
          productId: item.productId,
          type: StockMovementType.DEVOLUCION_CLIENTE,
          quantity: item.quantityReturned,
          stockBefore,
          stockAfter,
          referenceType: 'SALE_RETURN',
          referenceId: newReturn.id,
          createdById: userId,
        },
      });
    }

    // Calcular si la venta fue devuelta totalmente
    const allReturnedQuantities: Record<string, number> = {};
    for (const detail of sale.details) {
      const previouslyReturned = sale.returns
        .flatMap((r) => r.details)
        .filter((rd) => rd.saleDetailId === detail.id)
        .reduce((acc, rd) => acc + rd.quantityReturned, 0);
      const nowReturned = items.find((i) => i.saleDetailId === detail.id)?.quantityReturned ?? 0;
      allReturnedQuantities[detail.id] = previouslyReturned + nowReturned;
    }

    const isFullyReturned = sale.details.every(
      (d) => (allReturnedQuantities[d.id] ?? 0) >= d.quantity,
    );

    await tx.sale.update({
      where: { id: saleId },
      data: {
        status: isFullyReturned ? SaleStatus.FULLY_RETURNED : SaleStatus.PARTIALLY_RETURNED,
      },
    });

    return newReturn;
  });

  res.status(201).json(successResponse(saleReturn, 'Devolución registrada'));
}));
