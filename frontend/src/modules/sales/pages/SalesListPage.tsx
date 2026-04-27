import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Eye, FileText, Receipt, CheckCircle, AlertCircle } from 'lucide-react';
import {
  getSales,
  getSaleDetail,
  cancelSale,
  createInvoice,
  type Sale,
  type SaleStatus,
  type AfipInvoiceFull,
} from '../api/salesApi';
import { Button } from '@/shared/components/ui/Button';
import { Table } from '@/shared/components/ui/Table';
import { Badge } from '@/shared/components/ui/Badge';
import { Pagination } from '@/shared/components/ui/Pagination';
import { Modal } from '@/shared/components/ui/Modal';
import { ROUTES } from '@/router/routes';
import type { PaginationMeta } from '@/shared/types/api.types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const STATUS_LABELS: Record<SaleStatus, string> = {
  COMPLETED: 'Completada',
  CANCELLED: 'Anulada',
  PARTIALLY_RETURNED: 'Dev. parcial',
  FULLY_RETURNED: 'Devuelta',
};

const STATUS_VARIANT: Record<SaleStatus, 'green' | 'red' | 'yellow' | 'gray'> = {
  COMPLETED: 'green',
  CANCELLED: 'red',
  PARTIALLY_RETURNED: 'yellow',
  FULLY_RETURNED: 'gray',
};

function fmt(amount: string | number): string {
  return `$${parseFloat(String(amount)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
}

// ─── Modal de facturación AFIP ────────────────────────────────────────────────
function InvoiceModal({
  sale,
  isOpen,
  onClose,
  onSuccess,
}: {
  sale: Sale | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (invoice: AfipInvoiceFull) => void;
}) {
  const [result, setResult] = useState<AfipInvoiceFull | null>(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: () => createInvoice(sale!.id),
    onSuccess: (data) => {
      setResult(data);
      onSuccess(data);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err as Error).message ??
        'Error al facturar';
      setError(msg);
    },
  });

  function handleClose() {
    setResult(null);
    setError('');
    onClose();
  }

  if (!sale) return null;

  const docLabel =
    sale.customer?.type === 'FACTURABLE'
      ? `CUIT ${sale.customer?.name}`
      : (sale.customer?.name ?? 'Consumidor Final');

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={result ? 'Comprobante emitido' : `Emitir Factura C — Venta #${sale.saleNumber}`}
      size="sm"
    >
      {result ? (
        // ── Éxito ─────────────────────────────────────────────────────────────
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
            <CheckCircle className="h-8 w-8 text-green-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-800">Comprobante autorizado</p>
              <p className="text-xs text-green-700 mt-0.5">
                Factura C Nro. {String(result.pointOfSale).padStart(4, '0')}-
                {String(result.invoiceNumber).padStart(8, '0')}
              </p>
            </div>
          </div>

          <div className="text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-500">CAE:</span>
              <span className="font-mono font-semibold">{result.cae}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Vencimiento CAE:</span>
              <span>
                {result.caeExpiry
                  ? format(
                      new Date(
                        `${result.caeExpiry.slice(0, 4)}-${result.caeExpiry.slice(4, 6)}-${result.caeExpiry.slice(6, 8)}`,
                      ),
                      'dd/MM/yyyy',
                    )
                  : '—'}
              </span>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="secondary" onClick={handleClose} className="flex-1">
              Cerrar
            </Button>
            <Button
              className="flex-1"
              leftIcon={<FileText className="h-4 w-4" />}
              onClick={() => {
                handleClose();
                navigate(ROUTES.SALE_INVOICE.replace(':id', sale.id));
              }}
            >
              Ver comprobante
            </Button>
          </div>
        </div>
      ) : (
        // ── Confirmación ──────────────────────────────────────────────────────
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Se va a emitir una <strong>Factura C</strong> a AFIP por esta venta.
          </p>

          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Receptor:</span>
              <span className="font-medium">{docLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Importe:</span>
              <span className="font-semibold">{fmt(sale.totalAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Concepto:</span>
              <span>Productos</span>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="secondary" onClick={handleClose} disabled={mutation.isPending}>
              Cancelar
            </Button>
            <Button
              isLoading={mutation.isPending}
              leftIcon={<Receipt className="h-4 w-4" />}
              onClick={() => {
                setError('');
                mutation.mutate();
              }}
            >
              {mutation.isPending ? 'Enviando a AFIP...' : 'Emitir comprobante'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Modal detalle de venta ───────────────────────────────────────────────────
function SaleDetailModal({
  saleId,
  isOpen,
  onClose,
  onCancel,
}: {
  saleId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onCancel: (sale: Sale) => void;
}) {
  const { data: sale } = useQuery({
    queryKey: ['sale-detail', saleId],
    queryFn: () => getSaleDetail(saleId!),
    enabled: isOpen && !!saleId,
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={sale ? `Venta #${sale.saleNumber}` : 'Detalle de venta'}
      size="lg"
    >
      {!sale ? (
        <div className="py-10 text-center text-sm text-gray-400">Cargando...</div>
      ) : (
        <div className="space-y-4">
          {/* Encabezado */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-500">Vendedor:</span>{' '}
              <strong>{sale.seller.firstName} {sale.seller.lastName}</strong>
            </div>
            {sale.customer && (
              <div>
                <span className="text-gray-500">Cliente:</span>{' '}
                <strong>{sale.customer.name}</strong>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Estado:</span>
              <Badge variant={STATUS_VARIANT[sale.status]}>{STATUS_LABELS[sale.status]}</Badge>
            </div>
            <div>
              <span className="text-gray-500">Fecha:</span>{' '}
              {format(new Date(sale.createdAt), "dd/MM/yyyy 'a las' HH:mm", { locale: es })}
            </div>
            {sale.cancelledAt && (
              <div>
                <span className="text-gray-500">Anulada:</span>{' '}
                {format(new Date(sale.cancelledAt), 'dd/MM/yyyy HH:mm', { locale: es })}
              </div>
            )}
          </div>

          {/* Productos */}
          {sale.details && sale.details.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Productos</h4>
              <div className="border border-gray-200 rounded-lg overflow-hidden text-sm">
                <table className="w-full">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="text-left px-4 py-2">Producto</th>
                      <th className="text-center px-4 py-2">Cant.</th>
                      <th className="text-right px-4 py-2">P. Unit.</th>
                      <th className="text-right px-4 py-2">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sale.details.map((d) => (
                      <tr key={d.id}>
                        <td className="px-4 py-2">
                          <div className="font-medium">{d.product.name}</div>
                          <div className="text-xs text-gray-400">
                            {d.product.internalCode} · {d.appliedPriceListCode}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-center">{d.quantity}</td>
                        <td className="px-4 py-2 text-right">{fmt(d.unitPrice)}</td>
                        <td className="px-4 py-2 text-right font-medium">{fmt(d.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pagos */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Cobros</h4>
            <div className="space-y-1.5">
              {sale.payments.map((p) => (
                <div key={p.id} className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    {p.paymentMethod.name}
                    {p.reference ? ` · ${p.reference}` : ''}
                  </span>
                  <span className="font-medium">{fmt(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Totales */}
          <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal</span>
              <span>{fmt(sale.subtotal)}</span>
            </div>
            {parseFloat(sale.discountAmount) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Descuento</span>
                <span className="text-red-600">-{fmt(sale.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-200 pt-2 mt-2">
              <span className="font-bold">Total</span>
              <span className="text-lg font-bold">{fmt(sale.totalAmount)}</span>
            </div>
          </div>

          {sale.cancelReason && (
            <p className="text-sm text-gray-500 italic">
              Motivo de anulación: {sale.cancelReason}
            </p>
          )}

          <div className="flex justify-between pt-1">
            {sale.status === 'COMPLETED' && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => { onClose(); onCancel(sale); }}
              >
                Anular venta
              </Button>
            )}
            <Button variant="secondary" onClick={onClose} className="ml-auto">
              Cerrar
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Modal confirmar anulación ────────────────────────────────────────────────
function CancelSaleModal({
  sale,
  onClose,
  onConfirm,
  isLoading,
}: {
  sale: Sale | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isLoading: boolean;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  function handleConfirm() {
    if (!reason.trim()) { setError('Ingresá el motivo de anulación'); return; }
    onConfirm(reason.trim());
  }

  if (!sale) return null;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Anular venta #${sale.saleNumber}`}
      size="sm"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Esta acción reintegra el stock de todos los productos y{' '}
          <strong>no se puede deshacer</strong>.
        </p>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Motivo de anulación *
          </label>
          <textarea
            rows={2}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            value={reason}
            onChange={(e) => { setReason(e.target.value); setError(''); }}
            placeholder="Ej: Error en el registro, cliente canceló el pedido..."
            autoFocus
          />
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={handleConfirm} isLoading={isLoading}>
            Confirmar anulación
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function SalesListPage() {
  const [page, setPage] = useState(1);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Sale | null>(null);
  const [invoiceTarget, setInvoiceTarget] = useState<Sale | null>(null);
  const queryClient = useQueryClient();

  // ── Filters ────────────────────────────────────────────────────────────────
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [sellerSearch, setSellerSearch] = useState('');
  const [pendingInvoice, setPendingInvoice] = useState(false);

  const filters = { dateFrom, dateTo, customerName, sellerSearch, pendingInvoice: pendingInvoice || undefined };

  const { data, isLoading } = useQuery({
    queryKey: ['sales', page, filters],
    queryFn: () => getSales({ page, limit: 20, ...filters }),
  });

  const cancelMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelSale(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['cash-shift-current'] });
      setCancelTarget(null);
    },
  });

  const sales = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Ventas</h1>
        <Link to={ROUTES.SALES_NEW}>
          <Button leftIcon={<Plus className="h-4 w-4" />}>Nueva venta</Button>
        </Link>
      </div>

      {/* ── Filtros ──────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Desde</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Hasta</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Cliente</label>
          <input
            type="text"
            placeholder="Nombre del cliente"
            value={customerName}
            onChange={(e) => { setCustomerName(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Vendedor</label>
          <input
            type="text"
            placeholder="Nombre del vendedor"
            value={sellerSearch}
            onChange={(e) => { setSellerSearch(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer pb-1">
          <input
            type="checkbox"
            checked={pendingInvoice}
            onChange={(e) => { setPendingInvoice(e.target.checked); setPage(1); }}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-gray-700">Pendiente de facturar</span>
        </label>
        {(dateFrom || dateTo || customerName || sellerSearch || pendingInvoice) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
              setCustomerName('');
              setSellerSearch('');
              setPendingInvoice(false);
              setPage(1);
            }}
          >
            Limpiar filtros
          </Button>
        )}
      </div>

      <Table
        isLoading={isLoading}
        rowKey={(r) => r.id}
        emptyMessage="No hay ventas registradas"
        data={sales}
        columns={[
          {
            key: 'saleNumber',
            header: 'Nro.',
            render: (r) => (
              <span className="font-mono text-sm font-semibold">{r.saleNumber}</span>
            ),
          },
          {
            key: 'createdAt',
            header: 'Fecha',
            render: (r) =>
              format(new Date(r.createdAt), 'dd/MM/yy HH:mm', { locale: es }),
          },
          {
            key: 'seller',
            header: 'Vendedor',
            render: (r) => `${r.seller.firstName} ${r.seller.lastName}`,
          },
          {
            key: 'customer',
            header: 'Cliente',
            render: (r) => r.customer?.name ?? <span className="text-gray-400 text-xs">—</span>,
          },
          {
            key: 'items',
            header: 'Items',
            render: (r) => r._count?.details ?? r.details?.length ?? '—',
          },
          {
            key: 'payments',
            header: 'Cobros',
            render: (r) => (
              <div className="flex flex-wrap gap-1">
                {r.payments.map((p) => (
                  <span
                    key={p.id}
                    className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"
                  >
                    {p.paymentMethod.name}
                  </span>
                ))}
              </div>
            ),
          },
          {
            key: 'totalAmount',
            header: 'Total',
            render: (r) => <span className="font-semibold">{fmt(r.totalAmount)}</span>,
          },
          {
            key: 'status',
            header: 'Estado',
            render: (r) => (
              <div className="flex flex-col gap-1">
                <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABELS[r.status]}</Badge>
                {r.afipInvoice?.status === 'AUTHORIZED' && (
                  <span className="text-xs text-brand-600 font-mono">
                    FC {String(r.afipInvoice.pointOfSale).padStart(4, '0')}-
                    {String(r.afipInvoice.invoiceNumber).padStart(8, '0')}
                  </span>
                )}
              </div>
            ),
          },
          {
            key: 'actions',
            header: '',
            render: (r) => (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<Eye className="h-3.5 w-3.5" />}
                  onClick={() => setSelectedSaleId(r.id)}
                >
                  Ver
                </Button>
                {r.status === 'COMPLETED' && !r.afipInvoice && (
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon={<Receipt className="h-3.5 w-3.5" />}
                    onClick={() => setInvoiceTarget(r)}
                  >
                    Facturar
                  </Button>
                )}
                {r.afipInvoice?.status === 'AUTHORIZED' && (
                  <Link to={ROUTES.SALE_INVOICE.replace(':id', r.id)}>
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon={<FileText className="h-3.5 w-3.5" />}
                    >
                      Ver FC
                    </Button>
                  </Link>
                )}
              </div>
            ),
          },
        ]}
      />

      {meta && meta.totalPages > 1 && (
        <Pagination meta={meta as PaginationMeta} onPageChange={setPage} />
      )}

      <SaleDetailModal
        saleId={selectedSaleId}
        isOpen={!!selectedSaleId}
        onClose={() => setSelectedSaleId(null)}
        onCancel={(sale) => setCancelTarget(sale)}
      />

      <CancelSaleModal
        sale={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={(reason) =>
          cancelMut.mutate({ id: cancelTarget!.id, reason })
        }
        isLoading={cancelMut.isPending}
      />

      <InvoiceModal
        sale={invoiceTarget}
        isOpen={!!invoiceTarget}
        onClose={() => setInvoiceTarget(null)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['sales'] })}
      />
    </div>
  );
}
