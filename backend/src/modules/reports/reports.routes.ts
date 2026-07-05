import { Router } from 'express';
import { authMiddleware, requirePermission } from '../../core/middleware/auth.middleware';
import { tenancyMiddleware } from '../../core/tenancy/tenancy.middleware';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { prisma } from '../../config/database';
import { successResponse } from '../../core/utils/response';
import { PurchaseStatus, SaleStatus } from '@prisma/client';

export const reportsRouter = Router();

reportsRouter.use(authMiddleware, tenancyMiddleware, requirePermission('reports:view'));

function getPeriodFilter(req: { query: Record<string, unknown> }) {
  const fromStr = req.query.from as string | undefined;
  const toStr = req.query.to as string | undefined;

  if (!fromStr && !toStr) {
    return {};
  }

  const from = fromStr ? new Date(`${fromStr}T00:00:00.000`) : undefined;
  const to = toStr ? new Date(`${toStr}T23:59:59.999`) : undefined;

  return {
    createdAt: {
      ...(from && { gte: from }),
      ...(to && { lte: to }),
    },
  };
}

function getShiftPeriodFilter(req: { query: Record<string, unknown> }) {
  const fromStr = req.query.from as string | undefined;
  const toStr = req.query.to as string | undefined;

  if (!fromStr && !toStr) {
    return {};
  }

  const from = fromStr ? new Date(`${fromStr}T00:00:00.000`) : undefined;
  const to = toStr ? new Date(`${toStr}T23:59:59.999`) : undefined;

  return {
    openedAt: {
      ...(from && { gte: from }),
      ...(to && { lte: to }),
    },
  };
}

const userSelect = { select: { firstName: true, lastName: true } } as const;

const shiftSelect = {
  select: {
    id: true,
    openedAt: true,
    closedAt: true,
    status: true,
    openedBy: userSelect,
  },
} as const;

// GET /api/reports/summary — resumen de movimientos por período
reportsRouter.get('/summary', asyncHandler(async (req, res) => {
  const period = getPeriodFilter(req);
  const shiftPeriod = getShiftPeriodFilter(req);
  const tenantId = req.tenantId;

  const saleWhere = {
    tenantId,
    status: { not: SaleStatus.CANCELLED },
    ...period,
  };

  const purchaseWhere = {
    tenantId,
    deletedAt: null,
    status: { notIn: [PurchaseStatus.DRAFT, PurchaseStatus.CANCELLED] },
    ...period,
  };

  const [
    salesAgg,
    purchasesAgg,
    expensesAgg,
    returnsAgg,
    returnsByType,
    paymentsByMethod,
    paymentMethods,
  ] = await Promise.all([
    prisma.sale.aggregate({
      where: saleWhere,
      _sum: { totalAmount: true, discountAmount: true },
      _count: { id: true },
    }),
    prisma.purchase.aggregate({
      where: purchaseWhere,
      _sum: { totalAmount: true },
      _count: { id: true },
    }),
    prisma.cashExpense.aggregate({
      where: { tenantId, ...period },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.saleReturn.aggregate({
      where: { tenantId, ...period },
      _sum: { totalAmount: true },
      _count: { id: true },
    }),
    prisma.saleReturn.groupBy({
      by: ['type'],
      where: { tenantId, ...period },
      _sum: { totalAmount: true },
      _count: { id: true },
    }),
    prisma.salePayment.groupBy({
      by: ['paymentMethodId'],
      where: {
        tenantId,
        sale: saleWhere,
      },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.paymentMethod.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, code: true, name: true },
    }),
  ]);

  const methodMap = new Map(paymentMethods.map((m) => [m.id, m]));

  const salesByPaymentMethod = paymentsByMethod
    .map((row) => {
      const method = methodMap.get(row.paymentMethodId);
      return {
        paymentMethodId: row.paymentMethodId,
        code: method?.code ?? '',
        name: method?.name ?? 'Desconocido',
        count: row._count.id,
        totalAmount: row._sum.amount,
      };
    })
    .sort((a, b) => Number(b.totalAmount ?? 0) - Number(a.totalAmount ?? 0));

  const [
    shiftsInPeriod,
    salesDetail,
    expensesDetail,
    returnsDetail,
    purchasesDetail,
    shiftPayments,
  ] = await Promise.all([
    prisma.cashShift.findMany({
      where: { tenantId, ...shiftPeriod },
      ...shiftSelect,
      orderBy: { openedAt: 'desc' },
    }),
    prisma.sale.findMany({
      where: saleWhere,
      select: {
        id: true,
        saleNumber: true,
        totalAmount: true,
        createdAt: true,
        cashShift: shiftSelect,
        seller: userSelect,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.cashExpense.findMany({
      where: { tenantId, ...period },
      select: {
        id: true,
        description: true,
        amount: true,
        createdAt: true,
        cashShift: shiftSelect,
        createdBy: userSelect,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.saleReturn.findMany({
      where: { tenantId, ...period },
      select: {
        id: true,
        type: true,
        totalAmount: true,
        createdAt: true,
        cashShift: shiftSelect,
        processedBy: userSelect,
        sale: { select: { saleNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.purchase.findMany({
      where: purchaseWhere,
      select: {
        id: true,
        invoiceNumber: true,
        totalAmount: true,
        createdAt: true,
        supplier: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.salePayment.findMany({
      where: { tenantId, sale: saleWhere },
      select: {
        amount: true,
        cashShiftId: true,
        paymentMethodId: true,
      },
    }),
  ]);

  type ShiftBucket = {
    shiftId: string;
    openedAt: Date;
    closedAt: Date | null;
    status: string;
    openedBy: { firstName: string; lastName: string };
    salesCount: number;
    salesTotal: number;
    expensesCount: number;
    expensesTotal: number;
    returnsCount: number;
    returnsTotal: number;
    paymentsByMethod: Map<string, { count: number; total: number }>;
  };

  const shiftBuckets = new Map<string, ShiftBucket>();

  function ensureShiftBucket(shift: NonNullable<typeof salesDetail[0]['cashShift']>) {
    let bucket = shiftBuckets.get(shift.id);
    if (!bucket) {
      bucket = {
        shiftId: shift.id,
        openedAt: shift.openedAt,
        closedAt: shift.closedAt,
        status: shift.status,
        openedBy: shift.openedBy,
        salesCount: 0,
        salesTotal: 0,
        expensesCount: 0,
        expensesTotal: 0,
        returnsCount: 0,
        returnsTotal: 0,
        paymentsByMethod: new Map(),
      };
      shiftBuckets.set(shift.id, bucket);
    }
    return bucket;
  }

  for (const shift of shiftsInPeriod) {
    ensureShiftBucket(shift);
  }

  for (const sale of salesDetail) {
    if (!sale.cashShift) continue;
    const bucket = ensureShiftBucket(sale.cashShift);
    bucket.salesCount += 1;
    bucket.salesTotal += Number(sale.totalAmount);
  }

  for (const expense of expensesDetail) {
    if (!expense.cashShift) continue;
    const bucket = ensureShiftBucket(expense.cashShift);
    bucket.expensesCount += 1;
    bucket.expensesTotal += Number(expense.amount);
  }

  for (const ret of returnsDetail) {
    if (!ret.cashShift) continue;
    const bucket = ensureShiftBucket(ret.cashShift);
    bucket.returnsCount += 1;
    bucket.returnsTotal += Number(ret.totalAmount);
  }

  for (const payment of shiftPayments) {
    const bucket = shiftBuckets.get(payment.cashShiftId);
    if (!bucket) continue;
    const methodId = payment.paymentMethodId;
    const current = bucket.paymentsByMethod.get(methodId) ?? { count: 0, total: 0 };
    current.count += 1;
    current.total += Number(payment.amount);
    bucket.paymentsByMethod.set(methodId, current);
  }

  const byShift = [...shiftBuckets.values()]
    .sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime())
    .map((bucket) => ({
      shiftId: bucket.shiftId,
      openedAt: bucket.openedAt,
      closedAt: bucket.closedAt,
      status: bucket.status,
      cashier: bucket.openedBy,
      sales: {
        count: bucket.salesCount,
        totalAmount: bucket.salesTotal,
      },
      expenses: {
        count: bucket.expensesCount,
        totalAmount: bucket.expensesTotal,
      },
      returns: {
        count: bucket.returnsCount,
        totalAmount: bucket.returnsTotal,
      },
      salesByPaymentMethod: [...bucket.paymentsByMethod.entries()]
        .map(([paymentMethodId, stats]) => {
          const method = methodMap.get(paymentMethodId);
          return {
            paymentMethodId,
            code: method?.code ?? '',
            name: method?.name ?? 'Desconocido',
            count: stats.count,
            totalAmount: stats.total,
          };
        })
        .sort((a, b) => b.totalAmount - a.totalAmount),
    }));

  type MovementRow = {
    id: string;
    type: 'SALE' | 'EXPENSE' | 'RETURN' | 'PURCHASE';
    date: Date;
    reference: string;
    description: string;
    amount: number;
    cashier: { firstName: string; lastName: string } | null;
    shift: {
      id: string;
      openedAt: Date;
      cashier: { firstName: string; lastName: string };
    } | null;
  };

  const movements: MovementRow[] = [
    ...salesDetail.map((sale) => ({
      id: sale.id,
      type: 'SALE' as const,
      date: sale.createdAt,
      reference: sale.saleNumber,
      description: 'Venta',
      amount: Number(sale.totalAmount),
      cashier: sale.seller,
      shift: sale.cashShift
        ? {
            id: sale.cashShift.id,
            openedAt: sale.cashShift.openedAt,
            cashier: sale.cashShift.openedBy,
          }
        : null,
    })),
    ...expensesDetail.map((expense) => ({
      id: expense.id,
      type: 'EXPENSE' as const,
      date: expense.createdAt,
      reference: expense.description,
      description: 'Gasto de caja',
      amount: Number(expense.amount),
      cashier: expense.createdBy,
      shift: expense.cashShift
        ? {
            id: expense.cashShift.id,
            openedAt: expense.cashShift.openedAt,
            cashier: expense.cashShift.openedBy,
          }
        : null,
    })),
    ...returnsDetail.map((ret) => ({
      id: ret.id,
      type: 'RETURN' as const,
      date: ret.createdAt,
      reference: ret.sale.saleNumber,
      description: ret.type === 'EXCHANGE' ? 'Devolución (cambio)' : 'Devolución (reintegro)',
      amount: Number(ret.totalAmount),
      cashier: ret.processedBy,
      shift: ret.cashShift
        ? {
            id: ret.cashShift.id,
            openedAt: ret.cashShift.openedAt,
            cashier: ret.cashShift.openedBy,
          }
        : null,
    })),
    ...purchasesDetail.map((purchase) => ({
      id: purchase.id,
      type: 'PURCHASE' as const,
      date: purchase.createdAt,
      reference: purchase.invoiceNumber ?? `Compra ${purchase.id.slice(-6)}`,
      description: `Compra · ${purchase.supplier.name}`,
      amount: Number(purchase.totalAmount),
      cashier: null,
      shift: null,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  res.json(successResponse({
    period: {
      from: (req.query.from as string) ?? null,
      to: (req.query.to as string) ?? null,
    },
    sales: {
      count: salesAgg._count.id,
      totalAmount: salesAgg._sum.totalAmount,
      discountAmount: salesAgg._sum.discountAmount,
    },
    salesByPaymentMethod,
    purchases: {
      count: purchasesAgg._count.id,
      totalAmount: purchasesAgg._sum.totalAmount,
    },
    expenses: {
      count: expensesAgg._count.id,
      totalAmount: expensesAgg._sum.amount,
    },
    returns: {
      count: returnsAgg._count.id,
      totalAmount: returnsAgg._sum.totalAmount,
      byType: returnsByType.map((row) => ({
        type: row.type,
        count: row._count.id,
        totalAmount: row._sum.totalAmount,
      })),
    },
    byShift,
    movements,
  }));
}));

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
      type: true,
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
