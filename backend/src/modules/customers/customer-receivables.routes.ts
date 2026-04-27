import { Router } from 'express';
import { authMiddleware, requirePermission } from '../../core/middleware/auth.middleware';
import { tenancyMiddleware } from '../../core/tenancy/tenancy.middleware';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { prisma } from '../../config/database';
import { successResponse } from '../../core/utils/response';
import { AppError } from '../../core/errors/AppError';
import { Decimal } from '@prisma/client/runtime/library';
import { CustomerReceivableStatus } from '@prisma/client';

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
      select: { id: true, name: true, type: true, phone: true, email: true },
    });
    if (!customer) throw AppError.notFound('Cliente');

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

    res.json(
      successResponse({
        customer,
        receivables,
        summary: {
          totalDebt,
          totalPaid,
          balance,
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
// Registrar un cobro sobre una o varias cuentas pendientes
customerReceivablesRouter.post(
  '/:id/payments',
  requirePermission('customers:write'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { receivableId, amount, paymentMethod, reference, notes } = req.body as {
      receivableId: string;
      amount: number;
      paymentMethod: string;
      reference?: string;
      notes?: string;
    };

    if (!receivableId || !amount || !paymentMethod) {
      throw AppError.validation('receivableId, amount y paymentMethod son requeridos');
    }

    const customer = await prisma.customer.findFirst({
      where: { id, tenantId: req.tenantId, deletedAt: null },
    });
    if (!customer) throw AppError.notFound('Cliente');

    const receivable = await prisma.customerReceivable.findFirst({
      where: { id: receivableId, tenantId: req.tenantId, customerId: id },
    });
    if (!receivable) throw AppError.notFound('Cuenta por cobrar');
    if (receivable.status === CustomerReceivableStatus.PAID) {
      throw AppError.conflict('Esta cuenta ya fue saldada');
    }

    const payAmount = new Decimal(amount);
    if (payAmount.lte(0)) throw AppError.validation('El monto debe ser mayor a 0');
    if (payAmount.gt(receivable.remainingAmount)) {
      throw AppError.validation(
        `El monto no puede superar el saldo pendiente (${receivable.remainingAmount})`,
      );
    }

    const payment = await prisma.$transaction(async (tx) => {
      const newPaidAmount = receivable.paidAmount.add(payAmount);
      const newRemaining = receivable.remainingAmount.sub(payAmount);
      const newStatus =
        newRemaining.lte(0)
          ? CustomerReceivableStatus.PAID
          : CustomerReceivableStatus.PARTIAL;

      await tx.customerReceivable.update({
        where: { id: receivableId },
        data: {
          paidAmount: newPaidAmount,
          remainingAmount: newRemaining,
          status: newStatus,
        },
      });

      return tx.customerPayment.create({
        data: {
          tenantId: req.tenantId,
          customerId: id,
          receivableId,
          amount: payAmount,
          paymentMethod,
          reference,
          notes,
          createdById: req.user!.sub,
        },
      });
    });

    res.status(201).json(successResponse(payment, 'Cobro registrado'));
  }),
);
