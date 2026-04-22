import { Router } from 'express';
import { authMiddleware, requirePermission } from '../../core/middleware/auth.middleware';
import { tenancyMiddleware } from '../../core/tenancy/tenancy.middleware';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { prisma } from '../../config/database';
import { successResponse, paginatedResponse } from '../../core/utils/response';
import { parsePagination, buildPaginationMeta } from '../../core/utils/pagination';
import { AppError } from '../../core/errors/AppError';
import { AccountsPayableStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export const supplierPaymentRouter = Router();

supplierPaymentRouter.use(authMiddleware, tenancyMiddleware);

supplierPaymentRouter.get('/', requirePermission('accounts-payable:read'), asyncHandler(async (req, res) => {
  const pagination = parsePagination(req);
  const where = { tenantId: req.tenantId };
  const [payments, total] = await Promise.all([
    prisma.supplierPayment.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { paidAt: 'desc' },
      include: { supplier: { select: { id: true, name: true } } },
    }),
    prisma.supplierPayment.count({ where }),
  ]);
  res.json(paginatedResponse(payments, buildPaginationMeta(total, pagination)));
}));

supplierPaymentRouter.post('/', requirePermission('supplier-payments:write'), asyncHandler(async (req, res) => {
  const { accountsPayableId, amount, paymentMethodDesc, reference, notes } = req.body as {
    accountsPayableId: string;
    amount: number;
    paymentMethodDesc: string;
    reference?: string;
    notes?: string;
  };

  const ap = await prisma.accountsPayable.findFirst({
    where: { id: accountsPayableId, tenantId: req.tenantId },
  });
  if (!ap) throw AppError.notFound('Cuenta por pagar');
  if (ap.status === AccountsPayableStatus.PAID) {
    throw AppError.conflict('Esta cuenta ya está completamente pagada');
  }

  const paymentAmount = new Decimal(amount);
  if (paymentAmount.gt(ap.remainingAmount)) {
    throw AppError.validation(`El monto no puede superar el saldo pendiente de ${ap.remainingAmount}`);
  }

  const payment = await prisma.$transaction(async (tx) => {
    const newPayment = await tx.supplierPayment.create({
      data: {
        tenantId: req.tenantId,
        supplierId: ap.supplierId,
        accountsPayableId,
        amount: paymentAmount,
        paymentMethodDesc,
        reference,
        notes,
        createdById: req.user!.sub,
      },
    });

    const newPaid = new Decimal(ap.paidAmount).add(paymentAmount);
    const newRemaining = new Decimal(ap.remainingAmount).sub(paymentAmount);
    const newStatus = newRemaining.isZero()
      ? AccountsPayableStatus.PAID
      : AccountsPayableStatus.PARTIAL;

    await tx.accountsPayable.update({
      where: { id: accountsPayableId },
      data: { paidAmount: newPaid, remainingAmount: newRemaining, status: newStatus },
    });

    return newPayment;
  });

  res.status(201).json(successResponse(payment, 'Pago registrado'));
}));
