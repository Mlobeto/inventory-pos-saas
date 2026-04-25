import apiClient from '@/core/api/apiClient';
import type { PaginatedResponse } from '@/shared/types/api.types';

export interface PaymentBreakdownItem {
  paymentMethodId: string;
  paymentMethodCode: string;
  paymentMethodName: string;
  _sum: { amount: string };
}

export interface ShiftSummary {
  totalSales: string;
  totalExpenses: string;
  calculatedFinal: string;
  calculatedCash: string;
  paymentBreakdown: Array<{
    paymentMethodId: string;
    paymentMethodCode: string;
    paymentMethodName: string;
    _sum: { amount: string };
  }>;
}

export interface CashExpense {
  id: string;
  description: string;
  amount: string;
  category: string | null;
  createdAt: string;
  createdBy: { firstName: string; lastName: string };
}

export interface CashShift {
  id: string;
  status: 'OPEN' | 'CLOSED';
  initialAmount: string;
  finalAmountDeclared: string | null;
  finalAmountCalculated: string | null;
  difference: string | null;
  notes: string | null;
  openedAt: string;
  closedAt: string | null;
  openedBy: { firstName: string; lastName: string };
  closedBy: { firstName: string; lastName: string } | null;
  _count?: { sales: number; cashExpenses: number };
  summary?: ShiftSummary;
}

export interface ShiftDetail extends CashShift {
  sales: Array<{
    id: string;
    saleNumber: string;
    totalAmount: string;
    status: string;
    createdAt: string;
  }>;
  cashExpenses: CashExpense[];
  salePayments: Array<{
    id: string;
    amount: string;
    paymentMethod: { code: string; name: string };
  }>;
}

export type CashShiftsPage = PaginatedResponse<CashShift>;

export async function openShift(initialAmount: number): Promise<CashShift> {
  const res = await apiClient.post('/api/cash-shifts/open', { initialAmount });
  return res.data.data;
}

export async function closeShift(finalAmountDeclared: number, notes?: string): Promise<CashShift> {
  const res = await apiClient.post('/api/cash-shifts/close', { finalAmountDeclared, notes });
  return res.data.data;
}

export async function getCurrentShift(): Promise<CashShift | null> {
  const res = await apiClient.get('/api/cash-shifts/current');
  return res.data.data;
}

export async function getCashShifts(params?: { page?: number; limit?: number }): Promise<CashShiftsPage> {
  const res = await apiClient.get('/api/cash-shifts', { params });
  return res.data;
}

export async function getShiftDetail(id: string): Promise<ShiftDetail> {
  const res = await apiClient.get(`/api/cash-shifts/${id}`);
  return res.data.data;
}
