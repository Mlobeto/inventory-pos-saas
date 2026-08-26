import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Clock, DollarSign, TrendingUp, TrendingDown, CreditCard,
  ChevronRight, Printer, X, AlertTriangle, ShoppingCart, ArrowLeftRight, Plus, Trash2, Receipt,
} from 'lucide-react';
import {
  openShift, closeShift, getCurrentShift, getCashShifts,
  type CashShift,
} from '../api/cashShiftsApi';
import { getShiftDetail } from '../api/cashShiftsApi';
import {
  getCashExpenses,
  createCashExpense,
  deleteCashExpense,
  type CashExpenseRecord,
} from '@/modules/cash-expenses/api/cashExpensesApi';
import { getPaymentMethods, type PaymentMethod } from '@/modules/payment-methods/api/paymentMethodsApi';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Modal } from '@/shared/components/ui/Modal';
import { ROUTES } from '@/router/routes';

function fmt(amount: string | number | null | undefined): string {
  if (amount == null) return '$0,00';
  return `$${parseFloat(String(amount)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
}

function fmtDate(date: string): string {
  return new Date(date).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const EXPENSE_CATEGORIES = [
  'Suministros',
  'Delivery / envíos',
  'Limpieza',
  'Mantenimiento',
  'Viáticos',
  'Varios',
] as const;

// ─── Modal: registrar gasto ───────────────────────────────────────────────────
function AddExpenseModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { description: string; amount: number; category?: string }) => void;
  isLoading: boolean;
}) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [error, setError] = useState('');

  function reset() {
    setDescription('');
    setAmount('');
    setCategory('');
    setError('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  useEffect(() => {
    if (!isOpen) reset();
  }, [isOpen]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      setError('Ingresá el concepto del gasto');
      return;
    }
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      setError('Ingresá un monto válido mayor a cero');
      return;
    }
    onSubmit({
      description: description.trim(),
      amount: val,
      category: category || undefined,
    });
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Registrar gasto de caja" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Concepto *"
          placeholder="Ej: Compra de bolsas, delivery, limpieza..."
          value={description}
          onChange={(e) => { setDescription(e.target.value); setError(''); }}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Categoría (opcional)</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Sin categoría</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <Input
          label="Monto *"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="0,00"
          value={amount}
          onChange={(e) => { setAmount(e.target.value); setError(''); }}
        />

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={isLoading}>
            Registrar gasto
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Gastos del turno activo ──────────────────────────────────────────────────
function ShiftExpensesPanel({ shiftId }: { shiftId: string }) {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['cash-expenses', shiftId],
    queryFn: () => getCashExpenses(shiftId),
  });

  const createMut = useMutation({
    mutationFn: createCashExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-expenses', shiftId] });
      queryClient.invalidateQueries({ queryKey: ['cash-shift-current'] });
      setModalOpen(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteCashExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-expenses', shiftId] });
      queryClient.invalidateQueries({ queryKey: ['cash-shift-current'] });
    },
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-gray-500" />
          <h3 className="font-semibold text-gray-900">Gastos del turno</h3>
        </div>
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={() => setModalOpen(true)}
        >
          Registrar gasto
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400 text-center py-8">Cargando gastos...</p>
      ) : expenses.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">
          No hay gastos registrados en este turno.
        </p>
      ) : (
        <div className="divide-y divide-gray-100">
          {expenses.map((expense: CashExpenseRecord) => (
            <div key={expense.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{expense.description}</p>
                <p className="text-xs text-gray-400">
                  {fmtDate(expense.createdAt)}
                  {expense.category ? ` · ${expense.category}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-sm font-semibold text-red-600 tabular-nums">
                  -{fmt(expense.amount)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('¿Eliminar este gasto?')) {
                      deleteMut.mutate(expense.id);
                    }
                  }}
                  disabled={deleteMut.isPending}
                  className="text-gray-300 hover:text-red-500 transition-colors p-1"
                  title="Eliminar gasto"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddExpenseModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        isLoading={createMut.isPending}
        onSubmit={(data) => createMut.mutate(data)}
      />
    </div>
  );
}

// ─── Sub-componente: turno sin abrir ─────────────────────────────────────────
function OpenShiftPanel({ onOpen }: { onOpen: (amount: number) => void }) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(amount);
    if (isNaN(val) || val < 0) { setError('Ingresá un monto válido (puede ser 0)'); return; }
    onOpen(val);
  }

  return (
    <div className="max-w-sm mx-auto mt-20">
      <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm text-center">
        <div className="w-14 h-14 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-4">
          <Clock className="h-7 w-7 text-brand-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-1">No hay turno abierto</h2>
        <p className="text-sm text-gray-500 mb-6">Ingresá el efectivo inicial en caja para comenzar el turno</p>
        <form onSubmit={handleSubmit} className="text-left space-y-4">
          <Input
            label="Efectivo en caja *"
            type="number"
            min="0"
            step="0.01"
            placeholder="0,00"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setError(''); }}
            error={error}
          />
          <Button type="submit" className="w-full" size="lg">
            Abrir turno
          </Button>
        </form>
      </div>
    </div>
  );
}

// ─── Sub-componente: tarjeta de método de pago ───────────────────────────────
function PaymentCard({ name, amount, icon }: { name: string; amount: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon ?? <CreditCard className="h-4 w-4 text-gray-400" />}
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{name}</span>
      </div>
      <p className="text-lg font-bold text-gray-900">{fmt(amount)}</p>
    </div>
  );
}

// ─── Sub-componente: turno abierto ───────────────────────────────────────────
function ActiveShiftPanel({
  shift,
  paymentMethods,
  onClose,
}: {
  shift: CashShift;
  paymentMethods: PaymentMethod[];
  onClose: () => void;
}) {
  const summary = shift.summary;

  return (
    <div className="space-y-6">
      {/* Header del turno */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Turno activo
              </span>
            </div>
            <p className="text-sm text-gray-500">
              Abierto por <strong>{shift.openedBy.firstName} {shift.openedBy.lastName}</strong> · {fmtDate(shift.openedAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to={ROUTES.SALES_NEW}>
              <Button leftIcon={<ShoppingCart className="h-4 w-4" />}>
                Nueva venta
              </Button>
            </Link>
            <Button variant="danger" size="sm" onClick={onClose}>
              Cerrar turno
            </Button>
          </div>
        </div>
      </div>

      {/* Resumen financiero */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-gray-400" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Apertura</span>
          </div>
          <p className="text-lg font-bold text-gray-900">{fmt(shift.initialAmount)}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ventas</span>
          </div>
          <p className="text-lg font-bold text-green-600">{fmt(summary?.totalSales)}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="h-4 w-4 text-red-400" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Gastos</span>
          </div>
          <p className="text-lg font-bold text-red-500">{fmt(summary?.totalExpenses)}</p>
        </div>
        <div className="bg-brand-50 rounded-lg border border-brand-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-brand-600" />
            <span className="text-xs font-medium text-brand-700 uppercase tracking-wide">Efectivo en caja</span>
          </div>
          <p className="text-lg font-bold text-brand-700">{fmt(summary?.calculatedCash)}</p>
        </div>
      </div>

      {/* Desglose por método de pago */}
      {(summary?.paymentBreakdown?.length ?? 0) > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Cobros por método de pago</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {paymentMethods
              .filter((pm) => !pm.isPriceTier && pm.code !== 'EXCHANGE_CREDIT')
              .map((pm) => {
                const found = summary!.paymentBreakdown.find(
                  (pb) => (pb as any).paymentMethodCode === pm.code,
                );
                if (!found || parseFloat(found._sum.amount) === 0) return null;
                return (
                  <PaymentCard
                    key={pm.id}
                    name={pm.name}
                    amount={found?._sum?.amount ?? '0'}
                  />
                );
              })}
          </div>
        </div>
      )}

      {summary?.exchangeCreditTotal && parseFloat(summary.exchangeCreditTotal) > 0 && (
        <div className="bg-amber-50 rounded-lg border border-amber-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <ArrowLeftRight className="h-4 w-4 text-amber-600" />
            <span className="text-xs font-medium text-amber-800 uppercase tracking-wide">Créditos por cambio</span>
          </div>
          <p className="text-lg font-bold text-amber-900">{fmt(summary.exchangeCreditTotal)}</p>
          <p className="text-xs text-amber-700 mt-1">No suma efectivo en caja</p>
        </div>
      )}

      {/* Estadísticas */}
      <div className="flex gap-3 text-sm text-gray-500">
        <span className="bg-gray-100 rounded px-3 py-1">
          {shift._count?.sales ?? 0} ventas
        </span>
        <span className="bg-gray-100 rounded px-3 py-1">
          {shift._count?.cashExpenses ?? 0} gastos
        </span>
      </div>

      <ShiftExpensesPanel shiftId={shift.id} />
    </div>
  );
}

// ─── Sub-componente: modal cierre de turno ───────────────────────────────────
function CloseShiftModal({
  isOpen,
  shift,
  onClose,
  onConfirm,
  isLoading,
}: {
  isOpen: boolean;
  shift: CashShift | null;
  onClose: () => void;
  onConfirm: (declared: number, notes: string) => void;
  isLoading: boolean;
}) {
  const [declared, setDeclared] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  if (!shift) return null;

  // Efectivo calculado = apertura + ventas en CASH - gastos
  const calculatedCash = parseFloat(shift.summary?.calculatedCash ?? shift.summary?.calculatedFinal ?? '0');
  const diff = parseFloat(declared || '0') - calculatedCash;

  // Métodos de pago no-priceTier con movimientos en este turno
  const breakdown = shift.summary?.paymentBreakdown ?? [];
  const nonCashBreakdown = breakdown.filter(
    (b) => b.paymentMethodCode !== 'CASH' && b.paymentMethodCode !== 'EXCHANGE_CREDIT',
  );
  const exchangeCreditBreakdown = breakdown.find((b) => b.paymentMethodCode === 'EXCHANGE_CREDIT');
  const cashBreakdown = breakdown.find((b) => b.paymentMethodCode === 'CASH');
  const accountCollectionsOther =
    parseFloat(shift.summary?.accountCollections ?? '0') -
    parseFloat(shift.summary?.accountCollectionsCash ?? '0');

  function handleConfirm() {
    const val = parseFloat(declared);
    if (isNaN(val) || val < 0) { setError('Ingresá el monto declarado'); return; }
    onConfirm(val, notes);
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cerrar turno de caja" size="md">
      <div className="space-y-4">
        {/* Resumen */}
        <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-500">Efectivo de apertura</span>
            <span className="font-medium">{fmt(shift.initialAmount)}</span>
          </div>

          {/* Ventas en efectivo */}
          <div className="flex justify-between">
            <span className="text-gray-500">Ventas en efectivo</span>
            <span className="font-medium text-green-600">{fmt(cashBreakdown?._sum.amount ?? '0')}</span>
          </div>

          {/* Cobros de cuenta corriente en efectivo */}
          {parseFloat(shift.summary?.accountCollectionsCash ?? '0') > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Cobros de cuenta corriente (efectivo)</span>
              <span className="font-medium text-green-600">
                {fmt(shift.summary?.accountCollectionsCash)}
              </span>
            </div>
          )}

          {/* Otros métodos de pago (no suman al saldo físico) */}
          {nonCashBreakdown.length > 0 && (
            <>
              <div className="border-t border-gray-200 pt-2 pb-0.5">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Otros cobros (no ingresan a caja)</span>
              </div>
              {nonCashBreakdown.map((b) => (
                <div key={b.paymentMethodId} className="flex justify-between pl-2">
                  <span className="text-gray-500">{b.paymentMethodName}</span>
                  <span className="font-medium text-gray-700">{fmt(b._sum.amount)}</span>
                </div>
              ))}
            </>
          )}

          {exchangeCreditBreakdown && parseFloat(exchangeCreditBreakdown._sum.amount) > 0 && (
            <div className="flex justify-between pl-2 mt-1">
              <span className="text-amber-700">Crédito por cambio (virtual)</span>
              <span className="font-medium text-amber-800">{fmt(exchangeCreditBreakdown._sum.amount)}</span>
            </div>
          )}

          {accountCollectionsOther > 0 && (
            <div className="flex justify-between pl-2">
              <span className="text-gray-500">Cobros de cuenta corriente (otros medios)</span>
              <span className="font-medium text-gray-700">{fmt(accountCollectionsOther)}</span>
            </div>
          )}

          <div className="flex justify-between border-t border-gray-200 pt-2">
            <span className="text-gray-500">Total gastos</span>
            <span className="font-medium text-red-500">-{fmt(shift.summary?.totalExpenses)}</span>
          </div>

          {parseFloat(shift.summary?.totalRefunds ?? '0') > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Reintegros por devolución</span>
              <span className="font-medium text-red-500">-{fmt(shift.summary?.totalRefunds)}</span>
            </div>
          )}

          <div className="flex justify-between border-t border-gray-200 pt-2">
            <span className="font-semibold text-gray-700">Efectivo calculado en caja</span>
            <span className="font-bold text-gray-900">{fmt(calculatedCash)}</span>
          </div>
        </div>

        <Input
          label="Efectivo declarado en caja *"
          type="number"
          min="0"
          step="0.01"
          placeholder="0,00"
          value={declared}
          onChange={(e) => { setDeclared(e.target.value); setError(''); }}
          error={error}
        />

        {declared !== '' && !isNaN(diff) && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${Math.abs(diff) < 0.01 ? 'bg-green-50 text-green-700' : diff < 0 ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'}`}>
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {Math.abs(diff) < 0.01
              ? 'Sin diferencia — caja cuadra perfectamente'
              : diff < 0
              ? `Faltante de ${fmt(Math.abs(diff))}`
              : `Sobrante de ${fmt(diff)}`}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
          <textarea
            rows={2}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            placeholder="Observaciones del cierre..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>Cancelar</Button>
          <Button variant="danger" onClick={handleConfirm} isLoading={isLoading}>
            Confirmar cierre
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Sub-componente: historial de turnos (vista dueño) ───────────────────────
function ShiftHistoryPanel({ onSelectShift }: { onSelectShift: (id: string) => void }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['cash-shifts', page],
    queryFn: () => getCashShifts({ page, limit: 15 }),
  });

  if (isLoading) return <div className="text-center py-10 text-sm text-gray-400">Cargando...</div>;

  const shifts = data?.data ?? [];

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">Historial de turnos</h3>
      </div>
      {shifts.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">No hay turnos registrados</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {shifts.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelectShift(s.id)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
            >
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`inline-block w-2 h-2 rounded-full ${s.status === 'OPEN' ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span className="text-sm font-medium text-gray-900">
                    {s.openedBy.firstName} {s.openedBy.lastName}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${s.status === 'OPEN' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {s.status === 'OPEN' ? 'Abierto' : 'Cerrado'}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  {fmtDate(s.openedAt)}
                  {s.closedAt ? ` → ${fmtDate(s.closedAt)}` : ''}
                </p>
              </div>
              <div className="text-right flex items-center gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{fmt(s.finalAmountCalculated ?? s.initialAmount)}</p>
                  <p className="text-xs text-gray-400">{s._count?.sales ?? 0} ventas</p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </div>
            </button>
          ))}
        </div>
      )}
      {/* Paginación simple */}
      {(data?.meta?.totalPages ?? 1) > 1 && (
        <div className="flex justify-center gap-2 px-5 py-3 border-t border-gray-100">
          <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
          <span className="text-sm text-gray-500 self-center">Pág. {page} / {data?.meta?.totalPages}</span>
          <Button variant="secondary" size="sm" disabled={page === data?.meta?.totalPages} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
        </div>
      )}
    </div>
  );
}

// ─── Sub-componente: detalle de turno + PDF ───────────────────────────────────
function ShiftDetailModal({
  shiftId,
  isOpen,
  onClose,
}: {
  shiftId: string | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { data: shift } = useQuery({
    queryKey: ['cash-shift-detail', shiftId],
    queryFn: () => getShiftDetail(shiftId!),
    enabled: isOpen && !!shiftId,
  });

  function handlePrint() {
    window.print();
  }

  if (!shift) return (
    <Modal isOpen={isOpen} onClose={onClose} title="Detalle del turno" size="lg">
      <div className="py-10 text-center text-sm text-gray-400">Cargando...</div>
    </Modal>
  );

  const summary = shift.summary;
  const cashSales = parseFloat(summary?.cashSales ?? '0');
  const totalExpenses = parseFloat(summary?.totalExpenses ?? '0');
  const totalRefunds = parseFloat(summary?.totalRefunds ?? '0');
  const exchangeCreditTotal = parseFloat(summary?.exchangeCreditTotal ?? '0');
  const expectedCash = parseFloat(summary?.calculatedCash ?? shift.initialAmount);
  const accountCollectionsCash = parseFloat(summary?.accountCollectionsCash ?? '0');
  const accountCollectionsOther =
    parseFloat(summary?.accountCollections ?? '0') - accountCollectionsCash;

  const nonCashBreakdown = (summary?.paymentBreakdown ?? []).filter(
    (b) =>
      b.paymentMethodCode !== 'CASH' &&
      b.paymentMethodCode !== 'EXCHANGE_CREDIT' &&
      parseFloat(b._sum.amount) !== 0,
  );

  const declaredAmount = shift.finalAmountDeclared ? parseFloat(shift.finalAmountDeclared) : null;
  const difference = declaredAmount === null ? null : declaredAmount - expectedCash;
  const refunds = shift.saleReturns?.filter((r) => r.type === 'REFUND') ?? [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Detalle del turno" size="lg">
      <div className="space-y-5 print:space-y-4" id="shift-detail-print">
        {/* Encabezado */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-500">Cajero:</span>{' '}
            <strong>{shift.openedBy.firstName} {shift.openedBy.lastName}</strong>
          </div>
          <div>
            <span className="text-gray-500">Estado:</span>{' '}
            <span className={`font-medium ${shift.status === 'OPEN' ? 'text-green-600' : 'text-gray-700'}`}>
              {shift.status === 'OPEN' ? 'Abierto' : 'Cerrado'}
            </span>
          </div>
          <div><span className="text-gray-500">Apertura:</span> {fmtDate(shift.openedAt)}</div>
          {shift.closedAt && <div><span className="text-gray-500">Cierre:</span> {fmtDate(shift.closedAt)}</div>}
        </div>

        {/* Resumen */}
        <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-500">Apertura</span>
            <span>{fmt(shift.initialAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Ventas en efectivo</span>
            <span className="font-medium text-green-700">{fmt(cashSales)}</span>
          </div>
          {accountCollectionsCash > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Cobros de cuenta corriente (efectivo)</span>
              <span className="font-medium text-green-700">{fmt(accountCollectionsCash)}</span>
            </div>
          )}
          {totalExpenses > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Gastos</span>
              <span className="font-medium text-red-600">-{fmt(totalExpenses)}</span>
            </div>
          )}
          {totalRefunds > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Reintegros por devolución</span>
              <span className="font-medium text-red-600">-{fmt(totalRefunds)}</span>
            </div>
          )}

          <div className="flex justify-between border-t border-gray-200 pt-2">
            <span className="font-semibold">Efectivo esperado en caja</span>
            <span className="font-bold">{fmt(expectedCash)}</span>
          </div>

          {declaredAmount !== null && (
            <>
              <div className="flex justify-between">
                <span className="text-gray-500">Declarado</span>
                <span>{fmt(declaredAmount)}</span>
              </div>
              {difference !== null && Math.abs(difference) > 0.01 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Diferencia</span>
                  <span className={difference < 0 ? 'text-red-600 font-medium' : 'text-yellow-600 font-medium'}>
                    {fmt(difference)}
                  </span>
                </div>
              )}
            </>
          )}

          {(nonCashBreakdown.length > 0 || exchangeCreditTotal > 0 || accountCollectionsOther > 0.005) && (
            <div className="border-t border-gray-200 pt-2 space-y-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Otros cobros (no ingresan a caja)
              </span>
              {nonCashBreakdown.map((b) => (
                <div key={b.paymentMethodId} className="flex justify-between pl-2">
                  <span className="text-gray-500">{b.paymentMethodName}</span>
                  <span className="font-medium text-gray-700">{fmt(b._sum.amount)}</span>
                </div>
              ))}
              {exchangeCreditTotal > 0 && (
                <div className="flex justify-between pl-2">
                  <span className="text-amber-700">Crédito por cambio (virtual)</span>
                  <span className="font-medium text-amber-800">{fmt(exchangeCreditTotal)}</span>
                </div>
              )}
              {accountCollectionsOther > 0.005 && (
                <div className="flex justify-between pl-2">
                  <span className="text-gray-500">Cobros de cuenta corriente (otros medios)</span>
                  <span className="font-medium text-gray-700">{fmt(accountCollectionsOther)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Ventas */}
        {shift.sales.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Ventas ({shift.sales.length})</h4>
            <div className="border border-gray-200 rounded-lg overflow-hidden text-sm">
              <table className="w-full">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="text-left px-4 py-2">Nro.</th>
                    <th className="text-left px-4 py-2">Hora</th>
                    <th className="text-right px-4 py-2">Total</th>
                    <th className="text-left px-4 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {shift.sales.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-2 font-mono text-gray-700">{s.saleNumber}</td>
                      <td className="px-4 py-2 text-gray-500">{new Date(s.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-4 py-2 text-right font-medium">{fmt(s.totalAmount)}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${s.status === 'CANCELLED' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
                          {s.status === 'CANCELLED' ? 'Anulada' : 'OK'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Gastos */}
        {shift.cashExpenses.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Gastos ({shift.cashExpenses.length})</h4>
            <div className="border border-gray-200 rounded-lg overflow-hidden text-sm">
              <table className="w-full">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="text-left px-4 py-2">Descripción</th>
                    <th className="text-left px-4 py-2">Categoría</th>
                    <th className="text-right px-4 py-2">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {shift.cashExpenses.map((e) => (
                    <tr key={e.id}>
                      <td className="px-4 py-2 text-gray-700">{e.description}</td>
                      <td className="px-4 py-2 text-gray-400">{e.category ?? '—'}</td>
                      <td className="px-4 py-2 text-right text-red-600 font-medium">{fmt(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Reintegros por devolución */}
        {refunds.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Reintegros por devolución ({refunds.length})</h4>
            <div className="border border-gray-200 rounded-lg overflow-hidden text-sm">
              <table className="w-full">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="text-left px-4 py-2">Venta</th>
                    <th className="text-left px-4 py-2">Motivo</th>
                    <th className="text-right px-4 py-2">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {refunds.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2 font-mono text-gray-700">{r.sale.saleNumber}</td>
                      <td className="px-4 py-2 text-gray-500">{r.reason}</td>
                      <td className="px-4 py-2 text-right text-red-600 font-medium">-{fmt(r.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Cobros de cuenta corriente */}
        {shift.customerPayments && shift.customerPayments.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">
              Cobros de cuenta corriente ({shift.customerPayments.length})
            </h4>
            <div className="border border-gray-200 rounded-lg overflow-hidden text-sm">
              <table className="w-full">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="text-left px-4 py-2">Cliente</th>
                    <th className="text-left px-4 py-2">Forma de pago</th>
                    <th className="text-left px-4 py-2">Aplicado a</th>
                    <th className="text-right px-4 py-2">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {shift.customerPayments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-2 text-gray-700">{p.customer.name}</td>
                      <td className="px-4 py-2 text-gray-500">{p.paymentMethod}</td>
                      <td className="px-4 py-2 text-gray-400">
                        {p.receivableId ? 'Venta a cuenta' : 'A cuenta / saldo a favor'}
                      </td>
                      <td className="px-4 py-2 text-right text-green-700 font-medium">{fmt(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {shift.notes && (
          <p className="text-sm text-gray-500 italic">Notas: {shift.notes}</p>
        )}

        <div className="flex justify-end gap-2 pt-2 print:hidden">
          <Button variant="secondary" onClick={onClose} leftIcon={<X className="h-4 w-4" />}>Cerrar</Button>
          <Button onClick={handlePrint} leftIcon={<Printer className="h-4 w-4" />}>Imprimir / PDF</Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── PÁGINA PRINCIPAL ────────────────────────────────────────────────────────
export default function CashShiftPage() {
  const queryClient = useQueryClient();
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);

  const { data: currentShift, isLoading } = useQuery({
    queryKey: ['cash-shift-current'],
    queryFn: getCurrentShift,
    refetchInterval: 30_000, // refresca cada 30 seg
  });

  const { data: paymentMethods = [] } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: getPaymentMethods,
  });

  const openMut = useMutation({
    mutationFn: openShift,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cash-shift-current'] }),
  });

  const closeMut = useMutation({
    mutationFn: ({ declared, notes }: { declared: number; notes: string }) =>
      closeShift(declared, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-shift-current'] });
      queryClient.invalidateQueries({ queryKey: ['cash-shifts'] });
      setShowCloseModal(false);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-sm text-gray-400">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Caja</h1>
      </div>

      {/* Turno activo o apertura */}
      {!currentShift ? (
        <OpenShiftPanel onOpen={(amount) => openMut.mutate(amount)} />
      ) : (
        <ActiveShiftPanel
          shift={currentShift}
          paymentMethods={paymentMethods}
          onClose={() => setShowCloseModal(true)}
        />
      )}

      {/* Historial de turnos (siempre visible) */}
      <ShiftHistoryPanel onSelectShift={(id) => setSelectedShiftId(id)} />

      {/* Modal cierre */}
      <CloseShiftModal
        isOpen={showCloseModal}
        shift={currentShift ?? null}
        onClose={() => setShowCloseModal(false)}
        onConfirm={(declared, notes) => closeMut.mutate({ declared, notes })}
        isLoading={closeMut.isPending}
      />

      {/* Modal detalle */}
      <ShiftDetailModal
        shiftId={selectedShiftId}
        isOpen={!!selectedShiftId}
        onClose={() => setSelectedShiftId(null)}
      />
    </div>
  );
}
