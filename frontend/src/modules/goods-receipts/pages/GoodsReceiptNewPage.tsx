import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ArrowLeft, Truck } from 'lucide-react';
import { getPurchase } from '@/modules/purchases/api/purchasesApi';
import { createGoodsReceipt, type GoodsReceiptItem } from '../api/goodsReceiptsApi';
import { Button } from '@/shared/components/ui/Button';
import { Spinner } from '@/shared/components/ui/Spinner';
import { ROUTES } from '@/router/routes';

interface ReceiveRow {
  purchaseDetailId: string;
  productId: string;
  productName: string;
  productCode: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  notes: string;
}

export default function GoodsReceiptNewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const purchaseId = searchParams.get('purchaseId') ?? '';
  const [generalNotes, setGeneralNotes] = useState('');

  const { data: purchase, isLoading } = useQuery({
    queryKey: ['purchase', purchaseId],
    queryFn: () => getPurchase(purchaseId),
    enabled: !!purchaseId,
  });

  const [rows, setRows] = useState<ReceiveRow[]>([]);

  // Inicializar filas cuando llega la compra
  useEffect(() => {
    if (purchase && rows.length === 0) {
      setRows(
        purchase.details.map((d) => ({
          purchaseDetailId: d.id,
          productId: d.productId,
          productName: d.product.name,
          productCode: d.product.internalCode,
          quantityOrdered: d.quantityOrdered,
          quantityReceived: d.quantityOrdered,
          unitCost: parseFloat(d.unitCost),
          notes: '',
        })),
      );
    }
  }, [purchase]);

  function updateRow(idx: number, field: keyof ReceiveRow, value: string | number) {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }

  const createMut = useMutation({
    mutationFn: createGoodsReceipt,
    onSuccess: (receipt) => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['purchase', purchaseId] });
      queryClient.invalidateQueries({ queryKey: ['goods-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      navigate(ROUTES.GOODS_RECEIPTS_DETAIL.replace(':id', receipt.id));
    },
  });

  function handleSubmit() {
    const items: GoodsReceiptItem[] = rows.map((r) => ({
      purchaseDetailId: r.purchaseDetailId,
      productId: r.productId,
      quantityExpected: r.quantityOrdered,
      quantityReceived: r.quantityReceived,
      unitCost: r.unitCost,
      notes: r.notes || undefined,
    }));
    createMut.mutate({ purchaseId, notes: generalNotes || undefined, items });
  }

  if (!purchaseId) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p>No se especificó una compra. Accedé desde el detalle de una compra confirmada.</p>
        <Button className="mt-4" variant="secondary" onClick={() => navigate(ROUTES.PURCHASES)}>
          Ir a Compras
        </Button>
      </div>
    );
  }

  if (isLoading || rows.length === 0) {
    return <div className="flex items-center justify-center h-48"><Spinner size="lg" /></div>;
  }

  if (!purchase) {
    return <div className="text-center text-gray-500 py-16">Compra no encontrada</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(ROUTES.PURCHASES_DETAIL.replace(':id', purchaseId))}
          className="text-gray-400 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Registrar recepción de mercadería</h1>
          <p className="text-sm text-gray-500">
            Compra de <span className="font-medium">{purchase.supplier.name}</span>
            {purchase.invoiceNumber ? ` — Factura ${purchase.invoiceNumber}` : ''}
          </p>
        </div>
      </div>

      {/* Tabla de items a recibir */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Artículos a recibir</h2>
          <p className="text-xs text-gray-500 mt-0.5">Ajustá la cantidad real recibida para cada artículo</p>
        </div>
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Producto</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Esperado</th>
              <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase w-36">Recibido</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase w-32">Costo unit.</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase w-40">Notas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((row, idx) => {
              const diff = row.quantityReceived - row.quantityOrdered;
              return (
                <tr key={row.purchaseDetailId} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">{row.productName}</p>
                    <p className="text-xs text-gray-400 font-mono">{row.productCode}</p>
                  </td>
                  <td className="px-5 py-3 text-right text-gray-700">{row.quantityOrdered}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-col items-center gap-0.5">
                      <input
                        type="number"
                        min="0"
                        value={row.quantityReceived}
                        onChange={(e) => updateRow(idx, 'quantityReceived', Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-24 border border-gray-300 rounded-md px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      {diff !== 0 && (
                        <span className={`text-xs font-medium ${diff < 0 ? 'text-red-500' : 'text-green-600'}`}>
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.unitCost}
                      onChange={(e) => updateRow(idx, 'unitCost', parseFloat(e.target.value) || 0)}
                      className="w-28 border border-gray-300 rounded-md px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </td>
                  <td className="px-5 py-3">
                    <input
                      type="text"
                      placeholder="Opcional..."
                      value={row.notes}
                      onChange={(e) => updateRow(idx, 'notes', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Notas generales */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <label className="block text-sm font-medium text-gray-700 mb-1">Notas de la recepción</label>
        <textarea
          className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          rows={2}
          placeholder="Observaciones opcionales..."
          value={generalNotes}
          onChange={(e) => setGeneralNotes(e.target.value)}
        />
      </div>

      <div className="flex justify-end gap-3">
        <Button
          variant="secondary"
          onClick={() => navigate(ROUTES.PURCHASES_DETAIL.replace(':id', purchaseId))}
        >
          Cancelar
        </Button>
        <Button
          leftIcon={<Truck className="h-4 w-4" />}
          onClick={handleSubmit}
          isLoading={createMut.isPending}
          disabled={rows.every((r) => r.quantityReceived === 0)}
        >
          Confirmar recepción
        </Button>
      </div>
    </div>
  );
}
