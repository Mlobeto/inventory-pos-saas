import { Router } from 'express';
import { authMiddleware, requirePermission } from '../../core/middleware/auth.middleware';
import { tenancyMiddleware } from '../../core/tenancy/tenancy.middleware';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { prisma } from '../../config/database';
import { successResponse } from '../../core/utils/response';
import { AppError } from '../../core/errors/AppError';
import { Decimal } from '@prisma/client/runtime/library';
import { CashShiftStatus, CustomerReceivableStatus } from '@prisma/client';

export const customerReceivablesRouter = Router();

customerReceivablesRouter.use(authMiddleware, tenancyMiddleware);

// GET /api/customers/:id/statement
// Estado de cuenta completo: receivables (con pagos y detalle de venta) + resumen
customerReceivablesRouter.get(
  '/:id/statement',
  requirePermission('customers:read'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const customer = await prisma.customer.findFirst({
      where: { id, tenantId: req.tenantId, deletedAt: null },
      select: { id: true, name: true, type: true, phone: true, email: true, creditBalance: true },
    });
    if (!customer) throw AppError.notFound('Cliente');

    // Ingresos a cuenta: dinero recibido sin imputar a una venta
    const accountPayments = await prisma.customerPayment.findMany({
      where: { tenantId: req.tenantId, customerId: id, receivableId: null },
      orderBy: { paidAt: 'desc' },
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        reference: true,
        notes: true,
        paidAt: true,
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });

    const receivables = await prisma.customerReceivable.findMany({
      where: { tenantId: req.tenantId, customerId: id },
      orderBy: { createdAt: 'asc' },
      include: {
        payments: {
          orderBy: { paidAt: 'asc' },
          select: {
            id: true,
            amount: true,
            paymentMethod: true,
            reference: true,
            notes: true,
            paidAt: true,
            createdBy: { select: { firstName: true, lastName: true } },
          },
        },
        sale: {
          select: {
            id: true,
            saleNumber: true,
            totalAmount: true,
            createdAt: true,
            details: {
              select: {
                quantity: true,
                unitPrice: true,
                discountAmount: true,
                subtotal: true,
                appliedPriceListCode: true,
                product: { select: { id: true, name: true, internalCode: true } },
              },
            },
          },
        },
      },
    });

    const totalDebt = receivables.reduce(
      (acc, r) => acc.add(r.originalAmount),
      new Decimal(0),
    );
    const totalPaid = receivables.reduce(
      (acc, r) => acc.add(r.paidAmount),
      new Decimal(0),
    );
    const balance = totalDebt.sub(totalPaid);
    const creditBalance = new Decimal(customer.creditBalance);

    res.json(
      successResponse({
        customer,
        receivables,
        accountPayments,
        summary: {
          totalDebt,
          totalPaid,
          balance,
          creditBalance,
          // Lo que el cliente debe realmente, ya descontado el saldo a favor
          netBalance: balance.sub(creditBalance),
          pendingCount: receivables.filter((r) => r.status !== CustomerReceivableStatus.PAID).length,
        },
      }),
    );
  }),
);

// GET /api/customers/:id/receivables
// Lista simplificada de cuentas pendientes (para el modal de cobro)
customerReceivablesRouter.get(
  '/:id/receivables',
  requirePermission('customers:read'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const customer = await prisma.customer.findFirst({
      where: { id, tenantId: req.tenantId, deletedAt: null },
    });
    if (!customer) throw AppError.notFound('Cliente');

    const receivables = await prisma.customerReceivable.findMany({
      where: {
        tenantId: req.tenantId,
        customerId: id,
        status: { not: CustomerReceivableStatus.PAID },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        sale: { select: { saleNumber: true, totalAmount: true, createdAt: true } },
      },
    });

    res.json(successResponse(receivables));
  }),
);

// POST /api/customers/:id/payments
// Registra un cobro. Sin receivableId se aplica a las deudas más viejas
// y el excedente queda como saldo a favor del cliente.
customerReceivablesRouter.post(
  '/:id/payments',
  requirePermission('customers:write', 'customers:collect'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { receivableId, amount, paymentMethod, paymentMethodId, reference, notes } = req.body as {
      receivableId?: string;
      amount: number;
      paymentMethod?: string;
      paymentMethodId?: string;
      reference?: string;
      notes?: string;
    };

    if (!amount) throw AppError.validation('El monto es requerido');

    const payAmount = new Decimal(amount);
    if (payAmount.lte(0)) throw AppError.validation('El monto debe ser mayor a 0');

    const customer = await prisma.customer.findFirst({
      where: { id, tenantId: req.tenantId, deletedAt: null },
    });
    if (!customer) throw AppError.notFound('Cliente');

    // Método de pago: se guarda el id para que la caja sepa si el dinero entra al cajón
    const method = paymentMethodId
      ? await prisma.paymentMethod.findFirst({
          where: { id: paymentMethodId, tenantId: req.tenantId },
          select: { id: true, code: true, name: true },
        })
      : null;
    if (paymentMethodId && !method) throw AppError.notFound('Método de pago');

    const methodLabel = method?.name ?? paymentMethod;
    if (!methodLabel) throw AppError.validation('Indicá la forma de pago');

    // El efectivo entra a la caja, así que necesita un turno abierto
    const openShift = await prisma.cashShift.findFirst({
      where: { tenantId: req.tenantId, openedById: req.user!.sub, status: CashShiftStatus.OPEN },
      select: { id: true },
    });
    const isCash = method ? method.code === 'CASH' : methodLabel.toLowerCase() === 'efectivo';
    if (isCash && !openShift) {
      throw AppError.validation('Abrí un turno de caja para registrar un cobro en efectivo');
    }

    // Deudas a las que se aplica el cobro
    const targets = receivableId
      ? await prisma.customerReceivable.findMany({
          where: { id: receivableId, tenantId: req.tenantId, customerId: id },
        })
      : await prisma.customerReceivable.findMany({
          where: {
            tenantId: req.tenantId,
            customerId: id,
            status: { not: CustomerReceivableStatus.PAID },
          },
          orderBy: { createdAt: 'asc' },
        });

    if (receivableId) {
      if (targets.length === 0) throw AppError.notFound('Cuenta por cobrar');
      if (targets[0].status === CustomerReceivableStatus.PAID) {
        throw AppError.conflict('Esta cuenta ya fue saldada');
      }
      if (payAmount.gt(targets[0].remainingAmount)) {
        throw AppError.validation(
          `El monto no puede superar el saldo pendiente (${targets[0].remainingAmount})`,
        );
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const created = [];
      let left = payAmount;

      for (const receivable of targets) {
        if (left.lte(0)) break;
        const applied = Decimal.min(left, receivable.remainingAmount);
        if (applied.lte(0)) continue;

        const newPaid = receivable.paidAmount.add(applied);
        const newRemaining = receivable.remainingAmount.sub(applied);

        await tx.customerReceivable.update({
          where: { id: receivable.id },
          data: {
            paidAmount: newPaid,
            remainingAmount: newRemaining,
            status: newRemaining.lte(0)
              ? CustomerReceivableStatus.PAID
              : CustomerReceivableStatus.PARTIAL,
          },
        });

        created.push(
          await tx.customerPayment.create({
            data: {
              tenantId: req.tenantId,
              customerId: id,
              receivableId: receivable.id,
              cashShiftId: openShift?.id,
              paymentMethodId: method?.id,
              amount: applied,
              paymentMethod: methodLabel,
              reference,
              notes,
              createdById: req.user!.sub,
            },
          }),
        );

        left = left.sub(applied);
      }

      // Lo que no se imputó a ninguna venta queda como saldo a favor
      if (left.gt(0)) {
        created.push(
          await tx.customerPayment.create({
            data: {
              tenantId: req.tenantId,
              customerId: id,
              cashShiftId: openShift?.id,
              paymentMethodId: method?.id,
              amount: left,
              paymentMethod: methodLabel,
              reference,
              notes,
              createdById: req.user!.sub,
            },
          }),
        );

        await tx.customer.update({
          where: { id },
          data: { creditBalance: { increment: left } },
        });
      }

      return { payments: created, creditAdded: left };
    });

    const message = result.creditAdded.gt(0)
      ? `Cobro registrado. Saldo a favor: $${result.creditAdded.toFixed(2)}`
      : 'Cobro registrado';

    res.status(201).json(successResponse(result.payments, message));
  }),
);
