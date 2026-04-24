import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Eye } from 'lucide-react';
import { getSales, getSaleDetail, cancelSale, type Sale, type SaleStatus } from '../api/salesApi';
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
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['sales', page],
    queryFn: () => getSales({ page, limit: 20 }),
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
              <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABELS[r.status]}</Badge>
            ),
          },
          {
            key: 'actions',
            header: '',
            render: (r) => (
              <Button
                size="sm"
                variant="ghost"
                leftIcon={<Eye className="h-3.5 w-3.5" />}
                onClick={() => setSelectedSaleId(r.id)}
              >
                Ver
              </Button>
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
    </div>
  );
}
