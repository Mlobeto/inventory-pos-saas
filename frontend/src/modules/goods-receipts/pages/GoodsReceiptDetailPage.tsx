import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getGoodsReceipt } from '../api/goodsReceiptsApi';
import { Badge } from '@/shared/components/ui/Badge';
import { Spinner } from '@/shared/components/ui/Spinner';
import { Button } from '@/shared/components/ui/Button';
import { ROUTES } from '@/router/routes';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function GoodsReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: receipt, isLoading } = useQuery({
    queryKey: ['goods-receipt', id],
    queryFn: () => getGoodsReceipt(id!),
    enabled: !!id,
  });

  if (isLoading) return <div className="flex items-center justify-center h-48"><Spinner size="lg" /></div>;
  if (!receipt) return <div className="text-center text-gray-500 py-16">Recepción no encontrada</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(ROUTES.PURCHASES_DETAIL.replace(':id', receipt.purchaseId))}
          className="text-gray-400 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Recepción de mercadería</h1>
          <p className="text-sm text-gray-500">
            {format(new Date(receipt.receivedAt), "dd 'de' MMMM yyyy 'a las' HH:mm", { locale: es })}
            {' · '}Recibido por {receipt.receivedBy.firstName} {receipt.receivedBy.lastName}
          </p>
        </div>
        <Badge variant={receipt.status === 'COMPLETE' ? 'green' : 'yellow'}>
          {receipt.status === 'COMPLETE' ? 'Completa' : 'Parcial'}
        </Badge>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Artículos recibidos</h2>
        </div>
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Producto</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Esperado</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Recibido</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Diferencia</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Costo unit.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {receipt.details.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="px-5 py-3">
                  <p className="font-medium text-gray-900">{d.product.name}</p>
                  <p className="text-xs text-gray-400 font-mono">{d.product.internalCode}</p>
                </td>
                <td className="px-5 py-3 text-right">{d.quantityExpected}</td>
                <td className="px-5 py-3 text-right font-semibold">{d.quantityReceived}</td>
                <td className="px-5 py-3 text-right">
                  <span className={d.difference < 0 ? 'text-red-500 font-medium' : d.difference > 0 ? 'text-green-600 font-medium' : 'text-gray-400'}>
                    {d.difference > 0 ? `+${d.difference}` : d.difference === 0 ? '—' : d.difference}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  ${parseFloat(d.unitCost).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {receipt.notes && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2">Notas</h2>
          <p className="text-sm text-gray-600">{receipt.notes}</p>
        </div>
      )}

      <div className="flex justify-start">
        <Button
          variant="secondary"
          onClick={() => navigate(ROUTES.PURCHASES_DETAIL.replace(':id', receipt.purchaseId))}
        >
          Volver a la compra
        </Button>
      </div>
    </div>
  );
}
