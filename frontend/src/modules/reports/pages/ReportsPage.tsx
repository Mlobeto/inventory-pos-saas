import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  BarChart2,
  ShoppingCart,
  Truck,
  Receipt,
  ArrowLeftRight,
  CreditCard,
  Search,
  Clock,
  List,
} from 'lucide-react';
import { getReportsSummary, type ReportMovementType } from '../api/reportsApi';
import { useAuthStore } from '@/core/auth/authStore';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Table } from '@/shared/components/ui/Table';
import { Badge } from '@/shared/components/ui/Badge';

function fmt(amount: string | number | null | undefined): string {
  if (amount == null) return '$0,00';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(
    Number(amount),
  );
}

function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function monthStartIso(): string {
  return format(startOfMonth(new Date()), 'yyyy-MM-dd');
}

function userName(user?: { firstName: string; lastName: string } | null): string {
  if (!user) return '—';
  return `${user.firstName} ${user.lastName}`;
}

function fmtShift(openedAt: string, cashier?: { firstName: string; lastName: string } | null): string {
  const when = format(new Date(openedAt), 'dd/MM/yyyy HH:mm', { locale: es });
  return cashier ? `${when} · ${userName(cashier)}` : when;
}

const MOVEMENT_TYPE_LABELS: Record<ReportMovementType, string> = {
  SALE: 'Venta',
  EXPENSE: 'Gasto',
  RETURN: 'Devolución',
  PURCHASE: 'Compra',
};

const MOVEMENT_TYPE_VARIANT: Record<ReportMovementType, 'green' | 'red' | 'amber' | 'blue'> = {
  SALE: 'green',
  EXPENSE: 'red',
  RETURN: 'amber',
  PURCHASE: 'blue',
};

function SummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
  tone = 'default',
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  tone?: 'default' | 'green' | 'red' | 'blue' | 'amber';
}) {
  const tones = {
    default: 'text-gray-900',
    green: 'text-green-600',
    red: 'text-red-600',
    blue: 'text-blue-600',
    amber: 'text-amber-700',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-gray-400" />
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</span>
      </div>
      <p className={`text-xl font-bold tabular-nums ${tones[tone]}`}>{value}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );
}

export default function ReportsPage() {
  const canView = useAuthStore((s) => s.hasPermission('reports:view'));
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(todayIso());
  const [appliedFrom, setAppliedFrom] = useState(monthStartIso());
  const [appliedTo, setAppliedTo] = useState(todayIso());
  const [shiftFilter, setShiftFilter] = useState<string>('all');

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['reports-summary', appliedFrom, appliedTo],
    queryFn: () => getReportsSummary({ from: appliedFrom, to: appliedTo }),
    enabled: canView,
  });

  function applyFilter() {
    setAppliedFrom(from);
    setAppliedTo(to);
    setShiftFilter('all');
  }

  if (!canView) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-800">
        No tenés permiso para ver reportes. Esta sección es solo para administradores.
      </div>
    );
  }

  const periodLabel =
    appliedFrom && appliedTo
      ? `${format(new Date(`${appliedFrom}T12:00:00`), 'dd MMM yyyy', { locale: es })} — ${format(new Date(`${appliedTo}T12:00:00`), 'dd MMM yyyy', { locale: es })}`
      : 'Todo el período';

  const exchangeCredit = data?.salesByPaymentMethod.find((m) => m.code === 'EXCHANGE_CREDIT');
  const realPaymentMethods = data?.salesByPaymentMethod.filter((m) => m.code !== 'EXCHANGE_CREDIT') ?? [];
  const realPaymentsTotal = realPaymentMethods.reduce(
    (acc, m) => acc + Number(m.totalAmount ?? 0),
    0,
  );

  const filteredMovements =
    shiftFilter === 'all'
      ? (data?.movements ?? [])
      : (data?.movements ?? []).filter((m) => m.shift?.id === shiftFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart2 className="h-6 w-6 text-brand-600" />
            Reportes
          </h1>
          <p className="text-sm text-gray-500 mt-1">Resumen de movimientos · {periodLabel}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Input
            label="Desde"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-44"
          />
          <Input
            label="Hasta"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-44"
          />
          <Button
            leftIcon={<Search className="h-4 w-4" />}
            onClick={applyFilter}
            isLoading={isFetching}
          >
            Consultar
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400 text-center py-16">Cargando reporte...</p>
      ) : !data ? (
        <p className="text-sm text-gray-400 text-center py-16">Sin datos para el período seleccionado.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard
              title="Ventas"
              value={fmt(data.sales.totalAmount)}
              subtitle={`${data.sales.count} operaciones`}
              icon={ShoppingCart}
              tone="green"
            />
            <SummaryCard
              title="Compras"
              value={fmt(data.purchases.totalAmount)}
              subtitle={`${data.purchases.count} órdenes confirmadas`}
              icon={Truck}
              tone="blue"
            />
            <SummaryCard
              title="Gastos de caja"
              value={fmt(data.expenses.totalAmount)}
              subtitle={`${data.expenses.count} registros`}
              icon={Receipt}
              tone="red"
            />
            <SummaryCard
              title="Devoluciones"
              value={fmt(data.returns.totalAmount)}
              subtitle={`${data.returns.count} operaciones`}
              icon={ArrowLeftRight}
              tone="amber"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-gray-500" />
                <h2 className="font-semibold text-gray-900">Ventas por método de pago</h2>
              </div>
              <Table
                rowKey={(r) => r.paymentMethodId}
                emptyMessage="No hay cobros en el período"
                data={data.salesByPaymentMethod}
                columns={[
                  {
                    key: 'name',
                    header: 'Método',
                    render: (r) => (
                      <span className="flex items-center gap-2">
                        {r.name}
                        {r.code === 'EXCHANGE_CREDIT' && (
                          <Badge variant="yellow">Virtual</Badge>
                        )}
                      </span>
                    ),
                  },
                  { key: 'count', header: 'Ops.', className: 'text-center' },
                  {
                    key: 'totalAmount',
                    header: 'Total',
                    className: 'text-right font-semibold tabular-nums',
                    render: (r) => fmt(r.totalAmount),
                  },
                ]}
              />
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-600">Cobros reales (sin crédito cambio)</span>
                  <span className="font-semibold tabular-nums">{fmt(realPaymentsTotal)}</span>
                </div>
                {exchangeCredit && Number(exchangeCredit.totalAmount) > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <span>Crédito por cambio (no es ingreso)</span>
                    <span className="font-medium tabular-nums">{fmt(exchangeCredit.totalAmount)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Detalle de devoluciones</h2>
              </div>
              {data.returns.count === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">Sin devoluciones en el período</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {data.returns.byType.map((row) => (
                    <div key={row.type} className="flex items-center justify-between px-5 py-4">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {row.type === 'EXCHANGE' ? 'Cambios' : 'Reintegros'}
                        </p>
                        <p className="text-xs text-gray-400">{row.count} operaciones</p>
                      </div>
                      <span className="font-semibold text-gray-800 tabular-nums">
                        {fmt(row.totalAmount)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-5 py-4 bg-gray-50">
                    <span className="text-sm font-semibold text-gray-700">Total devuelto</span>
                    <span className="font-bold text-amber-800 tabular-nums">{fmt(data.returns.totalAmount)}</span>
                  </div>
                </div>
              )}

              <div className="px-5 py-4 border-t border-gray-100 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Descuentos en ventas</span>
                  <span className="font-medium tabular-nums">{fmt(data.sales.discountAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total facturado (ventas)</span>
                  <span className="font-semibold text-green-700 tabular-nums">{fmt(data.sales.totalAmount)}</span>
                </div>
              </div>
            </div>
          </div>

          {data.byShift.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-500" />
                <h2 className="font-semibold text-gray-900">Por turno de caja</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {data.byShift.map((shift) => (
                  <div key={shift.shiftId} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {fmtShift(shift.openedAt, shift.cashier)}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Cajero del turno: {userName(shift.cashier)}
                          {shift.closedAt
                            ? ` · Cerrado ${format(new Date(shift.closedAt), 'dd/MM HH:mm', { locale: es })}`
                            : ' · Turno abierto'}
                        </p>
                      </div>
                      <Badge variant={shift.status === 'OPEN' ? 'green' : 'gray'}>
                        {shift.status === 'OPEN' ? 'Abierto' : 'Cerrado'}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
                      <div className="bg-green-50 rounded-lg px-3 py-2">
                        <p className="text-xs text-green-700">Ventas ({shift.sales.count})</p>
                        <p className="font-semibold text-green-800 tabular-nums">{fmt(shift.sales.totalAmount)}</p>
                      </div>
                      <div className="bg-red-50 rounded-lg px-3 py-2">
                        <p className="text-xs text-red-700">Gastos ({shift.expenses.count})</p>
                        <p className="font-semibold text-red-800 tabular-nums">{fmt(shift.expenses.totalAmount)}</p>
                      </div>
                      <div className="bg-amber-50 rounded-lg px-3 py-2">
                        <p className="text-xs text-amber-700">Devoluciones ({shift.returns.count})</p>
                        <p className="font-semibold text-amber-800 tabular-nums">{fmt(shift.returns.totalAmount)}</p>
                      </div>
                    </div>
                    {shift.salesByPaymentMethod.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {shift.salesByPaymentMethod.map((pm) => (
                          <span
                            key={pm.paymentMethodId}
                            className="text-xs bg-gray-100 text-gray-700 rounded-full px-2.5 py-1 tabular-nums"
                          >
                            {pm.name}: {fmt(pm.totalAmount)}
                            {pm.code === 'EXCHANGE_CREDIT' && ' (virtual)'}
                          </span>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setShiftFilter(shift.shiftId)}
                      className="mt-3 text-xs text-brand-600 hover:text-brand-700 font-medium"
                    >
                      Ver movimientos de este turno →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <List className="h-4 w-4 text-gray-500" />
                <h2 className="font-semibold text-gray-900">Detalle de movimientos</h2>
              </div>
              {data.byShift.length > 0 && (
                <select
                  value={shiftFilter}
                  onChange={(e) => setShiftFilter(e.target.value)}
                  className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="all">Todos los turnos</option>
                  {data.byShift.map((shift) => (
                    <option key={shift.shiftId} value={shift.shiftId}>
                      {fmtShift(shift.openedAt, shift.cashier)}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <Table
              rowKey={(r) => `${r.type}-${r.id}`}
              emptyMessage="No hay movimientos en el período"
              data={filteredMovements}
              columns={[
                {
                  key: 'date',
                  header: 'Fecha',
                  render: (r) =>
                    format(new Date(r.date), 'dd/MM/yyyy HH:mm', { locale: es }),
                },
                {
                  key: 'type',
                  header: 'Tipo',
                  render: (r) => (
                    <Badge variant={MOVEMENT_TYPE_VARIANT[r.type]}>
                      {MOVEMENT_TYPE_LABELS[r.type]}
                    </Badge>
                  ),
                },
                {
                  key: 'reference',
                  header: 'Referencia',
                  render: (r) => (
                    <div>
                      <p className="font-medium text-gray-900">{r.reference}</p>
                      <p className="text-xs text-gray-400">{r.description}</p>
                    </div>
                  ),
                },
                {
                  key: 'shift',
                  header: 'Turno de caja',
                  render: (r) =>
                    r.shift ? (
                      <span className="text-xs text-gray-600">
                        {fmtShift(r.shift.openedAt, r.shift.cashier)}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Sin turno</span>
                    ),
                },
                {
                  key: 'cashier',
                  header: 'Operador',
                  render: (r) => (
                    <span className="text-sm text-gray-700">{userName(r.cashier)}</span>
                  ),
                },
                {
                  key: 'amount',
                  header: 'Monto',
                  className: 'text-right font-semibold tabular-nums',
                  render: (r) => (
                    <span
                      className={
                        r.type === 'EXPENSE' || r.type === 'RETURN'
                          ? 'text-red-600'
                          : 'text-gray-900'
                      }
                    >
                      {r.type === 'EXPENSE' || r.type === 'RETURN' ? '−' : ''}
                      {fmt(r.amount)}
                    </span>
                  ),
                },
              ]}
            />
          </div>
        </>
      )}
    </div>
  );
}
