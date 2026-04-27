import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CreditCard, Receipt, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import {
  getCustomerStatement,
  createCustomerPayment,
  CUSTOMER_TYPE_LABELS,
  type CustomerReceivable,
  type CreatePaymentDto,
} from '../api/customersApi';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import { Input } from '@/shared/components/ui/Input';
import { Spinner } from '@/shared/components/ui/Spinner';
import { useAuthStore } from '@/core/auth/authStore';
import { ROUTES } from '@/router/routes';

const STATUS_CONFIG = {
  PENDING: { label: 'Pendiente', icon: Clock, className: 'text-yellow-600 bg-yellow-50' },
  PARTIAL: { label: 'Parcial', icon: AlertCircle, className: 'text-orange-600 bg-orange-50' },
  PAID: { label: 'Saldado', icon: CheckCircle, className: 'text-green-600 bg-green-50' },
};

const PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Tarjeta', 'Cheque', 'Otro'];

function fmt(amount: string | number) {
  return `$${parseFloat(String(amount)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
}

function ProductTooltip({ details }: { details: CustomerReceivable['sale']['details'] }) {
  const [show, setShow] = useState(false);
  if (!details || details.length === 0) return null;
  return (
    <div className="relative inline-block">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="text-brand-600 underline text-xs cursor-pointer"
      >
        ver productos
      </button>
      {show && (
        <div className="absolute z-50 bottom-full left-0 mb-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-3">
          <p className="text-xs font-semibold text-gray-700 mb-2">Productos incluidos</p>
          <ul className="space-y-1">
            {details.map((d, i) => (
              <li key={i} className="flex justify-between text-xs text-gray-600">
                <span className="truncate max-w-[160px]">
                  {d.quantity}x {d.product.name}
                </span>
                <span className="font-medium ml-2">{fmt(d.subtotal)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface PayModalProps {
  customerId: string;
  receivable: CustomerReceivable;
  onClose: () => void;
}

function PayModal({ customerId, receivable, onClose }: PayModalProps) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(receivable.remainingAmount);
  const [method, setMethod] = useState('Efectivo');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const mut = useMutation({
    mutationFn: (dto: CreatePaymentDto) => createCustomerPayment(customerId, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-statement', customerId] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      setError('Ingresá un monto válido');
      return;
    }
    if (num > parseFloat(receivable.remainingAmount)) {
      setError(`El monto no puede superar el saldo pendiente (${fmt(receivable.remainingAmount)})`);
      return;
    }
    setError('');
    mut.mutate({ receivableId: receivable.id, amount: num, paymentMethod: method, reference, notes });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-gray-50 rounded-md p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Venta</span>
          <span className="font-medium">{receivable.sale.saleNumber}</span>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-gray-600">Deuda original</span>
          <span>{fmt(receivable.originalAmount)}</span>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-gray-600">Ya pagado</span>
          <span>{fmt(receivable.paidAmount)}</span>
        </div>
        <div className="flex justify-between mt-1 font-semibold text-red-700">
          <span>Saldo pendiente</span>
          <span>{fmt(receivable.remainingAmount)}</span>
        </div>
      </div>

      <Input
        label="Monto a cobrar *"
        type="number"
        step="0.01"
        min="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        leftAddon={<span className="text-gray-500 text-sm">$</span>}
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Forma de pago *</label>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      <Input
        label="Referencia / comprobante"
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        placeholder="Nro. de transferencia, cheque, etc."
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
        <textarea
          className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" isLoading={mut.isPending}>Registrar cobro</Button>
      </div>
    </form>
  );
}

export default function CustomerStatementPage() {
  const { id } = useParams<{ id: string }>();
  const canWrite = useAuthStore((s) => s.hasPermission('customers:write'));
  const [payTarget, setPayTarget] = useState<CustomerReceivable | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['customer-statement', id],
    queryFn: () => getCustomerStatement(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12 text-red-600">
        Error al cargar el estado de cuenta.
      </div>
    );
  }

  const { customer, receivables, summary } = data;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to={ROUTES.CUSTOMERS}>
          <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Volver
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
          <p className="text-sm text-gray-500">
            {CUSTOMER_TYPE_LABELS[customer.type]}
            {customer.phone && <> · {customer.phone}</>}
            {customer.email && <> · {customer.email}</>}
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Deuda total</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(summary.totalDebt)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total cobrado</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{fmt(summary.totalPaid)}</p>
        </div>
        <div className="bg-white border border-red-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Saldo pendiente</p>
          <p
            className={`text-2xl font-bold mt-1 ${
              parseFloat(summary.balance) > 0 ? 'text-red-700' : 'text-green-700'
            }`}
          >
            {fmt(summary.balance)}
          </p>
          {summary.pendingCount > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">{summary.pendingCount} cuenta(s) pendiente(s)</p>
          )}
        </div>
      </div>

      {/* Receivables list */}
      {receivables.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Receipt className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>Sin movimientos en cuenta corriente</p>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">Movimientos</h2>
          {receivables.map((r) => {
            const statusCfg = STATUS_CONFIG[r.status];
            const StatusIcon = statusCfg.icon;
            return (
              <div key={r.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                {/* Receivable header */}
                <div className="flex items-start justify-between p-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-full ${statusCfg.className}`}>
                      <StatusIcon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900">
                          Venta #{r.sale.saleNumber}
                        </p>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCfg.className}`}
                        >
                          {statusCfg.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {new Date(r.sale.createdAt).toLocaleDateString('es-AR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                        {r.sale.details && r.sale.details.length > 0 && (
                          <> · <ProductTooltip details={r.sale.details} /></>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Importe</p>
                    <p className="font-semibold text-gray-900">{fmt(r.originalAmount)}</p>
                  </div>
                </div>

                {/* Progress bar */}
                {r.status !== 'PAID' && (
                  <div className="px-4 pb-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Cobrado: {fmt(r.paidAmount)}</span>
                      <span className="text-red-600 font-medium">
                        Pendiente: {fmt(r.remainingAmount)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="bg-brand-600 h-1.5 rounded-full"
                        style={{
                          width: `${Math.min(
                            100,
                            (parseFloat(r.paidAmount) / parseFloat(r.originalAmount)) * 100,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Payments */}
                {r.payments && r.payments.length > 0 && (
                  <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                    <p className="text-xs font-medium text-gray-600 mb-2">Cobros registrados</p>
                    <ul className="space-y-1">
                      {r.payments.map((p) => (
                        <li key={p.id} className="flex justify-between text-xs text-gray-600">
                          <span>
                            {new Date(p.paidAt).toLocaleDateString('es-AR')} · {p.paymentMethod}
                            {p.reference && <> · ref: {p.reference}</>}
                            {p.createdBy && (
                              <> · por {p.createdBy.firstName} {p.createdBy.lastName}</>
                            )}
                          </span>
                          <span className="font-medium text-green-700">{fmt(p.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Actions */}
                {canWrite && r.status !== 'PAID' && (
                  <div className="border-t border-gray-100 px-4 py-2 flex justify-end">
                    <Button
                      size="sm"
                      leftIcon={<CreditCard className="h-3.5 w-3.5" />}
                      onClick={() => setPayTarget(r)}
                    >
                      Registrar cobro
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pay modal */}
      <Modal
        isOpen={!!payTarget}
        onClose={() => setPayTarget(null)}
        title="Registrar cobro"
        size="sm"
      >
        {payTarget && (
          <PayModal
            customerId={id!}
            receivable={payTarget}
            onClose={() => setPayTarget(null)}
          />
        )}
      </Modal>
    </div>
  );
}
