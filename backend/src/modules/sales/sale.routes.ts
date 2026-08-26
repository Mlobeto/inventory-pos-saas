import { Router } from 'express';
import { authMiddleware, requirePermission } from '../../core/middleware/auth.middleware';
import { tenancyMiddleware } from '../../core/tenancy/tenancy.middleware';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { prisma } from '../../config/database';
import { successResponse, paginatedResponse } from '../../core/utils/response';
import { parsePagination, buildPaginationMeta } from '../../core/utils/pagination';
import { AppError } from '../../core/errors/AppError';
import {
  CashShiftStatus,
  CustomerReceivableStatus,
  Prisma,
  SaleReturnType,
  SaleStatus,
  StockMovementType,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { formatSaleNumber, SEQUENCE_ENTITIES } from '../../shared/constants';
import { recalculateClosedShift } from '../cash-shifts/cash-shift.service';

export const saleRouter = Router();

saleRouter.use(authMiddleware, tenancyMiddleware);

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

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
  const { items, payments, notes, discountAmount: saleDiscount, customerId, exchangeReturnId } = req.body as {
    items: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      unitCost: number;
      discountAmount?: number;
      appliedPriceListCode: string;
      customName?: string;
    }>;
    payments: Array<{
      paymentMethodId: string;
      amount: number;
      reference?: string;
    }>;
    notes?: string;
    discountAmount?: number;
    customerId?: string;
    exchangeReturnId?: string;
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

    let finalPayments = [...payments];
    let linkedExchangeReturnId: string | null = null;

    if (exchangeReturnId) {
      const saleReturn = await tx.saleReturn.findFirst({
        where: {
          id: exchangeReturnId,
          tenantId: req.tenantId,
          type: SaleReturnType.EXCHANGE,
          replacementSaleId: null,
        },
      });
      if (!saleReturn) {
        throw AppError.validation('La devolución de cambio no existe o ya fue utilizada');
      }

      const exchangeMethod = await tx.paymentMethod.findFirst({
        where: { tenantId: req.tenantId, code: 'EXCHANGE_CREDIT', isActive: true },
      });
      if (!exchangeMethod) {
        throw AppError.validation('Método de pago "Crédito por devolución" no configurado');
      }

      const incomingMethods = await tx.paymentMethod.findMany({
        where: { id: { in: payments.map((p) => p.paymentMethodId) }, tenantId: req.tenantId },
        select: { id: true, code: true },
      });
      const incomingMap = new Map(incomingMethods.map((m) => [m.id, m.code]));

      const creditAmount = Math.min(Number(saleReturn.totalAmount), totalAmount);
      finalPayments = payments.filter((p) => incomingMap.get(p.paymentMethodId) !== 'EXCHANGE_CREDIT');

      if (creditAmount > 0) {
        finalPayments.push({
          paymentMethodId: exchangeMethod.id,
          amount: creditAmount,
        });
      }

      const paidTotal = finalPayments.reduce((acc, p) => acc + p.amount, 0);
      if (paidTotal < totalAmount - 0.01) {
        throw AppError.validation('Los pagos no cubren el total. Solo debe cobrarse la diferencia del cambio.');
      }
      if (paidTotal > totalAmount + 0.01) {
        throw AppError.validation('Los pagos superan el total de la venta');
      }

      linkedExchangeReturnId = saleReturn.id;
    }

    // Se registra lo que se aplica a la venta, no lo que entregó el cliente:
    // el excedente en efectivo es vuelto y no debe sumar a la caja.
    let pendingToCover = totalAmount;
    const appliedPayments: typeof finalPayments = [];
    for (const payment of finalPayments) {
      if (pendingToCover <= 0.005) break;
      const applied = Math.min(payment.amount, pendingToCover);
      appliedPayments.push({ ...payment, amount: round2(applied) });
      pendingToCover = round2(pendingToCover - applied);
    }
    finalPayments = appliedPayments;

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
            ...(i.customName?.trim() && { customName: i.customName.trim() }),
          })),
        },
      },
    });

    // Registrar pagos
    await tx.salePayment.createMany({
      data: finalPayments.map((p) => ({
        tenantId: req.tenantId,
        saleId: newSale.id,
        cashShiftId: shift.id,
        paymentMethodId: p.paymentMethodId,
        amount: new Decimal(p.amount),
        reference: p.reference,
      })),
    });

    if (linkedExchangeReturnId) {
      await tx.saleReturn.update({
        where: { id: linkedExchangeReturnId },
        data: { replacementSaleId: newSale.id },
      });
    }

    // Si hay pago en cuenta corriente, crear CustomerReceivable
    const paymentMethods = await tx.paymentMethod.findMany({
      where: { id: { in: finalPayments.map((p) => p.paymentMethodId) }, tenantId: req.tenantId },
      select: { id: true, code: true },
    });
    const methodMap = new Map(paymentMethods.map((m) => [m.id, m.code]));
    const creditPayment = finalPayments.find((p) => methodMap.get(p.paymentMethodId) === 'CREDIT_ACCOUNT');
    if (creditPayment) {
      if (!customerId) throw AppError.validation('Cuenta corriente requiere que se seleccione un cliente');

      const debt = new Decimal(creditPayment.amount);
      const receivable = await tx.customerReceivable.create({
        data: {
          tenantId: req.tenantId,
          customerId,
          saleId: newSale.id,
          originalAmount: debt,
          remainingAmount: debt,
        },
      });

      // Si el cliente tiene saldo a favor, la deuda se cancela contra ese saldo.
      // El dinero ya entró a la caja cuando hizo el ingreso a cuenta.
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
        select: { creditBalance: true },
      });
      const available = new Decimal(customer?.creditBalance ?? 0);

      if (available.gt(0)) {
        const applied = Decimal.min(available, debt);
        const remaining = debt.sub(applied);

        await tx.customerReceivable.update({
          where: { id: receivable.id },
          data: {
            paidAmount: applied,
            remainingAmount: remaining,
            status: remaining.lte(0)
              ? CustomerReceivableStatus.PAID
              : CustomerReceivableStatus.PARTIAL,
          },
        });

        await tx.customerPayment.create({
          data: {
            tenantId: req.tenantId,
            customerId,
            receivableId: receivable.id,
            amount: applied,
            paymentMethod: 'Saldo a favor',
            notes: `Aplicado automáticamente a la venta ${saleNumber}`,
            createdById: userId,
          },
        });

        await tx.customer.update({
          where: { id: customerId },
          data: { creditBalance: { decrement: applied } },
        });
      }
    }

    // Descontar stock y crear StockMovements (solo productos con tracksStock)
    for (const item of items) {
      const product = await tx.product.findUnique({
        where: { id: item.productId },
        select: { currentStock: true, internalCode: true, tracksStock: true },
      });
      if (!product) throw AppError.notFound(`Producto ${item.productId}`);
      if (!product.tracksStock) continue;

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
    // Reintegrar stock (solo productos con tracksStock)
    for (const detail of sale.details) {
      const product = await tx.product.findUnique({
        where: { id: detail.productId },
        select: { currentStock: true, tracksStock: true },
      });
      if (!product || !product.tracksStock) continue;
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

    // La deuda de cuenta corriente se anula. Lo que ya se había cobrado
    // (incluido el saldo a favor aplicado) vuelve a quedar a favor del cliente.
    const receivable = await tx.customerReceivable.findFirst({
      where: { saleId: sale.id, tenantId: req.tenantId },
      include: { payments: { select: { id: true, amount: true } } },
    });

    if (receivable) {
      const refunded = receivable.payments.reduce(
        (acc, p) => acc.add(p.amount),
        new Decimal(0),
      );

      if (receivable.payments.length > 0) {
        await tx.customerPayment.updateMany({
          where: { id: { in: receivable.payments.map((p) => p.id) } },
          data: { receivableId: null },
        });
      }

      if (refunded.gt(0)) {
        await tx.customer.update({
          where: { id: receivable.customerId },
          data: { creditBalance: { increment: refunded } },
        });
      }

      await tx.customerReceivable.delete({ where: { id: receivable.id } });
    }

    await tx.sale.update({
      where: { id: sale.id },
      data: { status: SaleStatus.CANCELLED, cancelledAt: new Date(), cancelReason: reason },
    });
  });

  // El arqueo del turno ya no incluye esta venta
  if (sale.cashShiftId) {
    await recalculateClosedShift(sale.cashShiftId);
  }

  res.json(successResponse(null, 'Venta cancelada'));
}));
