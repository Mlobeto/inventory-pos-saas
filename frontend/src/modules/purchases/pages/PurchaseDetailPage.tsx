import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Truck } from 'lucide-react';
import { getPurchase, confirmPurchase, type PurchaseStatus } from '../api/purchasesApi';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { ConfirmDialog } from '@/shared/components/ui/ConfirmDialog';
import { Spinner } from '@/shared/components/ui/Spinner';
import { ROUTES } from '@/router/routes';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useState } from 'react';

const STATUS_LABELS: Record<PurchaseStatus, string> = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmada',
  PARTIALLY_RECEIVED: 'Recep. parcial',
  FULLY_RECEIVED: 'Recibida',
  CANCELLED: 'Cancelada',
};

const STATUS_VARIANT: Record<PurchaseStatus, 'gray' | 'yellow' | 'blue' | 'green' | 'red'> = {
  DRAFT: 'gray',
  CONFIRMED: 'yellow',
  PARTIALLY_RECEIVED: 'blue',
  FULLY_RECEIVED: 'green',
  CANCELLED: 'red',
};

export default function PurchaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: purchase, isLoading } = useQuery({
    queryKey: ['purchase', id],
    queryFn: () => getPurchase(id!),
    enabled: !!id,
  });

  const confirmMut = useMutation({
    mutationFn: () => confirmPurchase(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase', id] });
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      setConfirmOpen(false);
    },
  });

  if (isLoading) return <div className="flex items-center justify-center h-48"><Spinner size="lg" /></div>;
  if (!purchase) return <div className="text-center text-gray-500 py-16">Compra no encontrada</div>;

  const canConfirm = purchase.status === 'DRAFT';
  const canReceive = purchase.status === 'CONFIRMED' || purchase.status === 'PARTIALLY_RECEIVED';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(ROUTES.PURCHASES)} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            Compra{purchase.invoiceNumber ? ` — Factura ${purchase.invoiceNumber}` : ''}
          </h1>
          <p className="text-sm text-gray-500">
            {format(new Date(purchase.createdAt), "dd 'de' MMMM yyyy", { locale: es })}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[purchase.status]}>{STATUS_LABELS[purchase.status]}</Badge>
      </div>

      {/* Acciones */}
      {(canConfirm || canReceive) && (
        <div className="flex gap-3">
          {canConfirm && (
            <Button leftIcon={<CheckCircle className="h-4 w-4" />} onClick={() => setConfirmOpen(true)}>
              Confirmar compra
            </Button>
          )}
          {canReceive && (
            <Link to={`${ROUTES.GOODS_RECEIPTS_NEW}?purchaseId=${purchase.id}`}>
              <Button variant="secondary" leftIcon={<Truck className="h-4 w-4" />}>
                Registrar recepción de mercadería
              </Button>
            </Link>
          )}
        </div>
      )}

      {/* Info general */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Información</h2>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">Proveedor</dt>
            <dd className="font-medium text-gray-900 mt-0.5">{purchase.supplier.name}</dd>
          </div>
          <div>
            <dt className="text-gray-500">N° Factura</dt>
            <dd className="font-medium text-gray-900 mt-0.5 font-mono">{purchase.invoiceNumber ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Fecha factura</dt>
            <dd className="font-medium text-gray-900 mt-0.5">
              {purchase.invoiceDate ? format(new Date(purchase.invoiceDate), 'dd/MM/yyyy') : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Notas</dt>
            <dd className="font-medium text-gray-900 mt-0.5">{purchase.notes ?? '—'}</dd>
          </div>
        </dl>
      </div>

      {/* Detalles */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Artículos</h2>
        </div>
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Producto</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Cant.</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Costo unit.</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {purchase.details.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="px-5 py-3">
                  <p className="font-medium text-gray-900">{d.product.name}</p>
                  <p className="text-xs text-gray-400 font-mono">{d.product.internalCode}</p>
                </td>
                <td className="px-5 py-3 text-right">{d.quantityOrdered}</td>
                <td className="px-5 py-3 text-right">
                  ${parseFloat(d.unitCost).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-5 py-3 text-right font-semibold">
                  ${parseFloat(d.subtotal).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50">
              <td colSpan={3} className="px-5 py-4 text-right font-semibold text-gray-700">Total</td>
              <td className="px-5 py-4 text-right text-lg font-bold text-gray-900">
                ${parseFloat(purchase.totalAmount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Recepciones */}
      {purchase.goodsReceipts && purchase.goodsReceipts.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Recepciones</h2>
          <div className="space-y-2">
            {purchase.goodsReceipts.map((gr) => (
              <div key={gr.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-md">
                <div className="flex items-center gap-3">
                  <Truck className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-700">
                    Recepción — {format(new Date(gr.receivedAt), 'dd/MM/yyyy HH:mm')}
                  </span>
                  <Badge variant={gr.status === 'COMPLETE' ? 'green' : 'yellow'}>
                    {gr.status === 'COMPLETE' ? 'Completa' : 'Parcial'}
                  </Badge>
                </div>
                <Link to={ROUTES.GOODS_RECEIPTS_DETAIL.replace(':id', gr.id)}>
                  <Button size="sm" variant="ghost">Ver</Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Confirmar compra"
        message="Al confirmar, se generará una cuenta por pagar con el proveedor. Esta acción no se puede deshacer."
        confirmLabel="Confirmar"
        onConfirm={() => confirmMut.mutate()}
        onClose={() => setConfirmOpen(false)}
        isLoading={confirmMut.isPending}
      />
    </div>
  );
}
