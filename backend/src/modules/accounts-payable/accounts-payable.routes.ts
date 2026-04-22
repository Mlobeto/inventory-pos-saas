import { Router } from 'express';
import { authMiddleware, requirePermission } from '../../core/middleware/auth.middleware';
import { tenancyMiddleware } from '../../core/tenancy/tenancy.middleware';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { prisma } from '../../config/database';
import { successResponse, paginatedResponse } from '../../core/utils/response';
import { parsePagination, buildPaginationMeta } from '../../core/utils/pagination';
import { AppError } from '../../core/errors/AppError';
import { AccountsPayableStatus } from '@prisma/client';

export const accountsPayableRouter = Router();

accountsPayableRouter.use(authMiddleware, tenancyMiddleware);

accountsPayableRouter.get('/', requirePermission('accounts-payable:read'), asyncHandler(async (req, res) => {
  const pagination = parsePagination(req);
  const status = req.query.status as AccountsPayableStatus | undefined;
  const supplierId = req.query.supplierId as string | undefined;

  const where = {
    tenantId: req.tenantId,
    ...(status && { status }),
    ...(supplierId && { supplierId }),
  };

  const [records, total] = await Promise.all([
    prisma.accountsPayable.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { createdAt: 'desc' },
      include: {
        supplier: { select: { id: true, name: true } },
        purchase: { select: { id: true, invoiceNumber: true } },
        _count: { select: { supplierPayments: true } },
      },
    }),
    prisma.accountsPayable.count({ where }),
  ]);

  res.json(paginatedResponse(records, buildPaginationMeta(total, pagination)));
}));

accountsPayableRouter.get('/:id', requirePermission('accounts-payable:read'), asyncHandler(async (req, res) => {
  const record = await prisma.accountsPayable.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId },
    include: {
      supplier: true,
      purchase: { select: { id: true, invoiceNumber: true } },
      supplierPayments: { orderBy: { paidAt: 'desc' } },
    },
  });
  if (!record) throw AppError.notFound('Cuenta por pagar');
  res.json(successResponse(record));
}));
