import { Router } from 'express';
import { authMiddleware, requirePermission } from '../../core/middleware/auth.middleware';
import { tenancyMiddleware } from '../../core/tenancy/tenancy.middleware';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { prisma } from '../../config/database';
import { successResponse } from '../../core/utils/response';

export const reportsRouter = Router();

reportsRouter.use(authMiddleware, tenancyMiddleware, requirePermission('reports:view'));

function getPeriodFilter(req: any) {
  const from = req.query.from ? new Date(req.query.from as string) : undefined;
  const to = req.query.to ? new Date(req.query.to as string) : undefined;
  return from || to ? { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } } : {};
}

// GET /api/reports/sales — resumen de ventas por período
reportsRouter.get('/sales', asyncHandler(async (req, res) => {
  const period = getPeriodFilter(req);
  const [totals, count] = await Promise.all([
    prisma.sale.aggregate({
      where: { tenantId: req.tenantId, ...period },
      _sum: { totalAmount: true, discountAmount: true },
      _count: { id: true },
    }),
    prisma.sale.groupBy({
      by: ['status'],
      where: { tenantId: req.tenantId, ...period },
      _count: { id: true },
    }),
  ]);
  res.json(successResponse({ totals, byStatus: count }));
}));

// GET /api/reports/sales-by-payment-method
reportsRouter.get('/sales-by-payment-method', asyncHandler(async (req, res) => {
  const period = getPeriodFilter(req);
  const data = await prisma.salePayment.groupBy({
    by: ['paymentMethodId'],
    where: { tenantId: req.tenantId, ...(period.createdAt && { createdAt: period.createdAt }) },
    _sum: { amount: true },
    _count: { id: true },
  });
  res.json(successResponse(data));
}));

// GET /api/reports/top-products
reportsRouter.get('/top-products', asyncHandler(async (req, res) => {
  const period = getPeriodFilter(req);
  const limit = Math.min(Number(req.query.limit ?? 10), 50);
  const data = await prisma.saleDetail.groupBy({
    by: ['productId'],
    where: { sale: { tenantId: req.tenantId, ...period } },
    _sum: { quantity: true, subtotal: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: limit,
  });
  res.json(successResponse(data));
}));

// GET /api/reports/stock — productos con stock actual
reportsRouter.get('/stock', asyncHandler(async (req, res) => {
  const lowStock = req.query.lowStock === 'true';
  const products = await prisma.product.findMany({
    where: {
      tenantId: req.tenantId,
      deletedAt: null,
      ...(lowStock && { currentStock: { lte: 5 } }),
    },
    select: {
      id: true,
      name: true,
      internalCode: true,
      currentStock: true,
      minStock: true,
      productType: true,
    },
    orderBy: { currentStock: 'asc' },
  });
  res.json(successResponse(products));
}));

// GET /api/reports/stock-movements
reportsRouter.get('/stock-movements', asyncHandler(async (req, res) => {
  const period = getPeriodFilter(req);
  const data = await prisma.stockMovement.groupBy({
    by: ['type'],
    where: { tenantId: req.tenantId, ...(period.createdAt && { createdAt: period.createdAt }) },
    _sum: { quantity: true },
    _count: { id: true },
  });
  res.json(successResponse(data));
}));

// GET /api/reports/purchases
reportsRouter.get('/purchases', asyncHandler(async (req, res) => {
  const period = getPeriodFilter(req);
  const data = await prisma.purchase.aggregate({
    where: { tenantId: req.tenantId, ...period },
    _sum: { totalAmount: true },
    _count: { id: true },
  });
  res.json(successResponse(data));
}));

// GET /api/reports/accounts-payable
reportsRouter.get('/accounts-payable', asyncHandler(async (req, res) => {
  const data = await prisma.accountsPayable.groupBy({
    by: ['status'],
    where: { tenantId: req.tenantId },
    _sum: { totalAmount: true, remainingAmount: true },
    _count: { id: true },
  });
  res.json(successResponse(data));
}));

// GET /api/reports/cash-shifts
reportsRouter.get('/cash-shifts', asyncHandler(async (req, res) => {
  const period = getPeriodFilter(req);
  const shifts = await prisma.cashShift.findMany({
    where: { tenantId: req.tenantId, ...(period.createdAt && { openedAt: period.createdAt }) },
    select: {
      id: true,
      openedAt: true,
      closedAt: true,
      status: true,
      initialAmount: true,
      finalAmountCalculated: true,
      finalAmountDeclared: true,
      difference: true,
      openedBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: { openedAt: 'desc' },
  });
  res.json(successResponse(shifts));
}));

// GET /api/reports/cash-differences
reportsRouter.get('/cash-differences', asyncHandler(async (req, res) => {
  const period = getPeriodFilter(req);
  const data = await prisma.cashShift.aggregate({
    where: {
      tenantId: req.tenantId,
      status: 'CLOSED',
      ...(period.createdAt && { openedAt: period.createdAt }),
    },
    _sum: { difference: true },
    _avg: { difference: true },
    _count: { id: true },
  });
  res.json(successResponse(data));
}));

// GET /api/reports/returns
reportsRouter.get('/returns', asyncHandler(async (req, res) => {
  const period = getPeriodFilter(req);
  const data = await prisma.saleReturn.aggregate({
    where: { tenantId: req.tenantId, ...period },
    _sum: { totalAmount: true },
    _count: { id: true },
  });
  const byType = await prisma.saleReturn.groupBy({
    by: ['type'],
    where: { tenantId: req.tenantId, ...period },
    _sum: { totalAmount: true },
    _count: { id: true },
  });
  res.json(successResponse({ totals: data, byType }));
}));
