import apiClient from '@/core/api/apiClient';

export interface ReportsUserRef {
  firstName: string;
  lastName: string;
}

export interface ReportsShiftRef {
  id: string;
  openedAt: string;
  cashier: ReportsUserRef;
}

export interface ReportsPaymentMethodRow {
  paymentMethodId: string;
  code: string;
  name: string;
  count: number;
  totalAmount: string | number | null;
}

export interface ReportsShiftSummary {
  shiftId: string;
  openedAt: string;
  closedAt: string | null;
  status: 'OPEN' | 'CLOSED';
  cashier: ReportsUserRef;
  sales: { count: number; totalAmount: number };
  expenses: { count: number; totalAmount: number };
  returns: { count: number; totalAmount: number };
  salesByPaymentMethod: ReportsPaymentMethodRow[];
}

export type ReportMovementType = 'SALE' | 'EXPENSE' | 'RETURN' | 'PURCHASE';

export interface ReportsMovement {
  id: string;
  type: ReportMovementType;
  date: string;
  reference: string;
  description: string;
  amount: number;
  cashier: ReportsUserRef | null;
  shift: ReportsShiftRef | null;
}

export interface ReportsSummary {
  period: { from: string | null; to: string | null };
  sales: {
    count: number;
    totalAmount: string | null;
    discountAmount: string | null;
  };
  salesByPaymentMethod: ReportsPaymentMethodRow[];
  purchases: {
    count: number;
    totalAmount: string | null;
  };
  expenses: {
    count: number;
    totalAmount: string | null;
  };
  returns: {
    count: number;
    totalAmount: string | null;
    byType: Array<{
      type: 'REFUND' | 'EXCHANGE';
      count: number;
      totalAmount: string | null;
    }>;
  };
  byShift: ReportsShiftSummary[];
  movements: ReportsMovement[];
}

export async function getReportsSummary(params: {
  from?: string;
  to?: string;
}): Promise<ReportsSummary> {
  const res = await apiClient.get('/api/reports/summary', { params });
  return res.data.data;
}
