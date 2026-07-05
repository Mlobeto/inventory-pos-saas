import apiClient from '@/core/api/apiClient';

export interface CashExpenseRecord {
  id: string;
  cashShiftId: string;
  description: string;
  amount: string;
  category: string | null;
  createdAt: string;
  createdBy?: { firstName: string; lastName: string };
}

export interface CreateCashExpenseDto {
  description: string;
  amount: number;
  category?: string;
}

export async function getCashExpenses(shiftId: string): Promise<CashExpenseRecord[]> {
  const res = await apiClient.get('/api/cash-expenses', { params: { shiftId } });
  return res.data.data;
}

export async function createCashExpense(dto: CreateCashExpenseDto): Promise<CashExpenseRecord> {
  const res = await apiClient.post('/api/cash-expenses', dto);
  return res.data.data;
}

export async function deleteCashExpense(id: string): Promise<void> {
  await apiClient.delete(`/api/cash-expenses/${id}`);
}
