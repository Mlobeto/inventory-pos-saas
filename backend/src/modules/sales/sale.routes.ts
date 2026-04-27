import { Router } from 'express';
import { authMiddleware, requirePermission } from '../../core/middleware/auth.middleware';
import { tenancyMiddleware } from '../../core/tenancy/tenancy.middleware';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { prisma } from '../../config/database';
import { successResponse, paginatedResponse } from '../../core/utils/response';
import { parsePagination, buildPaginationMeta } from '../../core/utils/pagination';
import { AppError } from '../../core/errors/AppError';
import { CashShiftStatus, SaleStatus, StockMovementType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { formatSaleNumber, SEQUENCE_ENTITIES } from '../../shared/constants';

export const saleRouter = Router();

saleRouter.use(authMiddleware, tenancyMiddleware);

saleRouter.get('/', requirePermission('sales:read'), asyncHandler(async (req, res) => {
  const pagination = parsePagination(req);
  const { dateFrom, dateTo, customerName, sellerSearch, pendingInvoice, saleNumber } = req.query as {
    dateFrom?: string;
    dateTo?: string;
    customerName?: string;
    sellerSearch?: string;
    pendingInvoice?: string;
    saleNumber?: string;
  };

  const where: Prisma.SaleWhereInput = { tenantId: req.tenantId };

  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo + 'T23:59:59.999Z') } : {}),
    };
  }

  if (customerName) {
    where.customer = { name: { contains: customerName, mode: 'insensitive' } };
  }

  if (sellerSearch) {
    where.seller = {
      OR: [
        { firstName: { contains: sellerSearch, mode: 'insensitive' } },
        { lastName: { contains: sellerSearch, mode: 'insensitive' } },
      ],
    };
  }

  if (pendingInvoice === 'true') {
    where.status = SaleStatus.COMPLETED;
    where.afipInvoice = { is: null };
  }

  if (saleNumber) {
    where.saleNumber = { contains: saleNumber, mode: 'insensitive' };
  }

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { createdAt: 'desc' },
      include: {
        seller: { select: { firstName: true, lastName: true } },
        customer: { select: { id: true, name: true, type: true } },
        payments: { include: { paymentMethod: { select: { code: true, name: true } } } },
        _count: { select: { details: true } },
        afipInvoice: {
          select: { id: true, status: true, invoiceNumber: true, pointOfSale: true, cae: true, caeExpiry: true },
        },
      },
    }),
    prisma.sale.count({ where }),
  ]);
  res.json(paginatedResponse(sales, buildPaginationMeta(total, pagination)));
}));

saleRouter.get('/:id', requirePermission('sales:read'), asyncHandler(async (req, res) => {
  const sale = await prisma.sale.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId },
    include: {
      seller: { select: { firstName: true, lastName: true } },
      cashShift: { select: { id: true, openedAt: true } },
      details: {
        include: { product: { select: { id: true, name: true, internalCode: true } } },
      },
      payments: {
        include: { paymentMethod: { select: { id: true, code: true, name: true } } },
      },
      returns: {
        select: {
          id: true,
          type: true,
          totalAmount: true,
          createdAt: true,
          details: { select: { saleDetailId: true, quantityReturned: true } },
        },
      },
      afipInvoice: {
        select: { id: true, status: true, invoiceNumber: true, pointOfSale: true, cae: true, caeExpiry: true },
      },
    },
  });
  if (!sale) throw AppError.notFound('Venta');
  res.json(successResponse(sale));
}));

/**
 * POST /api/sales
 * Registra una venta completa.
 * - Requiere turno de caja abierto.
 * - Genera número de venta correlativo.
 * - Verifica stock disponible para cada ítem.
 * - Descuenta stock y crea StockMovements.
 * - Registra pagos.
 * Todo en una sola transacción atómica.
 */
saleRouter.post('/', requirePermission('sales:create'), asyncHandler(async (req, res) => {
  const { items, payments, notes, discountAmount: saleDiscount, customerId } = req.body as {
    items: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      unitCost: number;
      discountAmount?: number;
      appliedPriceListCode: string;
    }>;
    payments: Array<{
      paymentMethodId: string;
      amount: number;
      reference?: string;
    }>;
    notes?: string;
    discountAmount?: number;
    customerId?: string;
  };

  const userId = req.user!.sub;

  // Verificar turno de caja abierto
  const shift = await prisma.cashShift.findFirst({
    where: { tenantId: req.tenantId, openedById: userId, status: CashShiftStatus.OPEN },
  });
  if (!shift) throw AppError.shiftNotOpen();

  const sale = await prisma.$transaction(async (tx) => {
    // Número correlativo de venta
    const seq = await tx.tenantSequence.update({
      where: { tenantId_entity: { tenantId: req.tenantId, entity: SEQUENCE_ENTITIES.SALE_NUMBER } },
      data: { lastValue: { increment: 1 } },
    });
    const saleNumber = formatSaleNumber(seq.lastValue);

    // Calcular totales
    const subtotal = items.reduce(
      (acc, i) => acc + i.quantity * i.unitPrice - (i.discountAmount ?? 0),
      0,
    );
    const discountAmount = saleDiscount ?? 0;
    const totalAmount = subtotal - discountAmount;

    // Crear la venta
    const newSale = await tx.sale.create({
      data: {
        tenantId: req.tenantId,
        cashShiftId: shift.id,
        sellerId: userId,
        saleNumber,
        status: SaleStatus.COMPLETED,
        subtotal: new Decimal(subtotal),
        discountAmount: new Decimal(discountAmount),
        totalAmount: new Decimal(totalAmount),
        notes,
        ...(customerId && { customerId }),
        details: {
          create: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: new Decimal(i.unitPrice),
            unitCost: new Decimal(i.unitCost),
            discountAmount: new Decimal(i.discountAmount ?? 0),
            subtotal: new Decimal(i.quantity * i.unitPrice - (i.discountAmount ?? 0)),
            appliedPriceListCode: i.appliedPriceListCode,
          })),
        },
      },
    });

    // Registrar pagos
    await tx.salePayment.createMany({
      data: payments.map((p) => ({
        tenantId: req.tenantId,
        saleId: newSale.id,
        cashShiftId: shift.id,
        paymentMethodId: p.paymentMethodId,
        amount: new Decimal(p.amount),
        reference: p.reference,
      })),
    });

    // Si hay pago en cuenta corriente, crear CustomerReceivable
    const paymentMethods = await tx.paymentMethod.findMany({
      where: { id: { in: payments.map((p) => p.paymentMethodId) }, tenantId: req.tenantId },
      select: { id: true, code: true },
    });
    const methodMap = new Map(paymentMethods.map((m) => [m.id, m.code]));
    const creditPayment = payments.find((p) => methodMap.get(p.paymentMethodId) === 'CREDIT_ACCOUNT');
    if (creditPayment) {
      if (!customerId) throw AppError.validation('Cuenta corriente requiere que se seleccione un cliente');
      await tx.customerReceivable.create({
        data: {
          tenantId: req.tenantId,
          customerId,
          saleId: newSale.id,
          originalAmount: new Decimal(creditPayment.amount),
          remainingAmount: new Decimal(creditPayment.amount),
        },
      });
    }

    // Descontar stock y crear StockMovements
    for (const item of items) {
      const product = await tx.product.findUnique({
        where: { id: item.productId },
        select: { currentStock: true, internalCode: true },
      });
      if (!product) throw AppError.notFound(`Producto ${item.productId}`);
      if (product.currentStock < item.quantity) {
        throw AppError.insufficientStock(product.internalCode);
      }

      const stockBefore = product.currentStock;
      const stockAfter = stockBefore - item.quantity;

      await tx.product.update({
        where: { id: item.productId },
        data: { currentStock: stockAfter },
      });

      await tx.stockMovement.create({
        data: {
          tenantId: req.tenantId,
          productId: item.productId,
          type: StockMovementType.VENTA,
          quantity: item.quantity,
          stockBefore,
          stockAfter,
          unitCost: new Decimal(item.unitCost),
          referenceType: 'SALE',
          referenceId: newSale.id,
          createdById: userId,
        },
      });
    }

    return newSale;
  });

  // Retornar la venta completa
  const fullSale = await prisma.sale.findUnique({
    where: { id: sale.id },
    include: {
      details: { include: { product: { select: { id: true, name: true, internalCode: true } } } },
      payments: { include: { paymentMethod: { select: { code: true, name: true } } } },
    },
  });

  res.status(201).json(successResponse(fullSale, 'Venta registrada'));
}));

// POST /api/sales/:id/cancel
saleRouter.post('/:id/cancel', requirePermission('sales:cancel'), asyncHandler(async (req, res) => {
  const { reason } = req.body as { reason: string };

  const sale = await prisma.sale.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId },
    include: { details: true },
  });
  if (!sale) throw AppError.notFound('Venta');
  if (sale.status !== SaleStatus.COMPLETED) {
    throw AppError.conflict('Solo se pueden cancelar ventas completadas');
  }

  await prisma.$transaction(async (tx) => {
    // Reintegrar stock
    for (const detail of sale.details) {
      const product = await tx.product.findUnique({
        where: { id: detail.productId },
        select: { currentStock: true },
      });
      if (!product) continue;
      const stockAfter = product.currentStock + detail.quantity;
      await tx.product.update({ where: { id: detail.productId }, data: { currentStock: stockAfter } });
      await tx.stockMovement.create({
        data: {
          tenantId: req.tenantId,
          productId: detail.productId,
          type: StockMovementType.AJUSTE_POSITIVO,
          quantity: detail.quantity,
          stockBefore: product.currentStock,
          stockAfter,
          referenceType: 'SALE_CANCEL',
          referenceId: sale.id,
          notes: `Cancelación venta ${sale.saleNumber}`,
          createdById: req.user!.sub,
        },
      });
    }

    await tx.sale.update({
      where: { id: sale.id },
      data: { status: SaleStatus.CANCELLED, cancelledAt: new Date(), cancelReason: reason },
    });
  });

  res.json(successResponse(null, 'Venta cancelada'));
}));
