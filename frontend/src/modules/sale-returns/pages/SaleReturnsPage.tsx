import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Search, CheckCircle, AlertCircle, ArrowLeftRight } from 'lucide-react';
import {
  getSaleReturns,
  createSaleReturn,
  CONDITION_LABELS,
  type SaleReturn,
  type ReturnItemCondition,
  type CreateSaleReturnDto,
} from '../api/saleReturnsApi';
import { getSales, getSaleDetail, type Sale } from '@/modules/sales/api/salesApi';
import { Button } from '@/shared/components/ui/Button';
import { Table } from '@/shared/components/ui/Table';
import { Badge } from '@/shared/components/ui/Badge';
import { Modal } from '@/shared/components/ui/Modal';
import { Pagination } from '@/shared/components/ui/Pagination';
import { ROUTES } from '@/router/routes';
import type { PaginationMeta } from '@/shared/types/api.types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

function fmt(amount: string | number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(
    Number(amount),
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface ReturnLineItem {
  saleDetailId: string;
  productId: string;
  productName: string;
  productCode: string;
  originalQty: number;
  alreadyReturnedQty: number;
  unitPrice: number;
  selected: boolean;
  returnQty: number;
  condition: ReturnItemCondition;
}

// ─── Wizard modal ─────────────────────────────────────────────────────────────
function NewReturnWizard({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<'search' | 'confirm'>('search');
  const [saleNumberInput, setSaleNumberInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [lineItems, setLineItems] = useState<ReturnLineItem[]>([]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  // Search sales by partial sale number
  const { data: searchResults, isFetching: searching } = useQuery({
    queryKey: ['sales-by-number', searchQuery],
    queryFn: () => getSales({ saleNumber: searchQuery, limit: 5, page: 1 }),
    enabled: searchQuery.length >= 3,
  });

  // Load full sale detail (with return history) once user picks a sale
  const { data: saleDetail, isLoading: loadingSale } = useQuery({
    queryKey: ['sale-detail-return', selectedSale?.id],
    queryFn: () => getSaleDetail(selectedSale!.id),
    enabled: !!selectedSale?.id,
  });

  // Build line items when detail loads
  useEffect(() => {
    if (!saleDetail?.details) return;

    const alreadyReturned: Record<string, number> = {};
    for (const ret of saleDetail.returns ?? []) {
      for (const d of ret.details ?? []) {
        alreadyReturned[d.saleDetailId] =
          (alreadyReturned[d.saleDetailId] ?? 0) + d.quantityReturned;
      }
    }

    setLineItems(
      saleDetail.details.map((d) => {
        const already = alreadyReturned[d.id] ?? 0;
        const available = d.quantity - already;
        return {
          saleDetailId: d.id,
          productId: d.product.id,
          productName: d.product.name,
          productCode: d.product.internalCode,
          originalQty: d.quantity,
          alreadyReturnedQty: already,
          unitPrice: parseFloat(d.unitPrice),
          selected: available > 0,
          returnQty: available > 0 ? available : 0,
          condition: 'GOOD' as ReturnItemCondition,
        };
      }),
    );
  }, [saleDetail]);

  const createMut = useMutation({
    mutationFn: createSaleReturn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale-returns'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      resetWizard();
      onSuccess();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Error al registrar la devolución';
      setError(msg);
    },
  });

  function resetWizard() {
    setStep('search');
    setSaleNumberInput('');
    setSearchQuery('');
    setSelectedSale(null);
    setLineItems([]);
    setReason('');
    setError('');
  }

  function handleClose() {
    resetWizard();
    onClose();
  }

  function toggleLine(idx: number) {
    setLineItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, selected: !item.selected } : item)),
    );
  }

  function setLineQty(idx: number, qty: number) {
    setLineItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, returnQty: qty } : item)),
    );
  }

  function setLineCondition(idx: number, condition: ReturnItemCondition) {
    setLineItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, condition } : item)),
    );
  }

  const selectedItems = lineItems.filter(
    (item) =>
      item.selected &&
      item.returnQty > 0 &&
      item.returnQty <= item.originalQty - item.alreadyReturnedQty,
  );

  const totalReturnValue = selectedItems.reduce(
    (acc, item) => acc + item.returnQty * item.unitPrice,
    0,
  );

  function handleConfirm() {
    if (!selectedSale || selectedItems.length === 0 || !reason.trim()) return;
    const dto: CreateSaleReturnDto = {
      saleId: selectedSale.id,
      type: 'EXCHANGE',
      reason: reason.trim(),
      items: selectedItems.map((item) => ({
        saleDetailId: item.saleDetailId,
        productId: item.productId,
        quantityReturned: item.returnQty,
        unitPrice: item.unitPrice,
        condition: item.condition,
        restockable: item.condition === 'GOOD',
      })),
    };
    createMut.mutate(dto);
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Nueva devolución / cambio" size="xl">
      <div className="p-6 overflow-y-auto space-y-5">
        {/* Step indicator */}
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`px-3 py-1 rounded-full font-medium ${
              step === 'search'
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            1. Venta original
          </span>
          <span className="text-gray-300">→</span>
          <span
            className={`px-3 py-1 rounded-full font-medium ${
              step === 'confirm'
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            2. Confirmar
          </span>
        </div>

        {/* ── STEP 1: Buscar venta ──────────────────────────────────────── */}
        {step === 'search' && (
          <div className="space-y-4">
            {/* Sale number search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Número de venta
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={saleNumberInput}
                  onChange={(e) => setSaleNumberInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setSearchQuery(saleNumberInput);
                  }}
                  placeholder="VTA-000042"
                  className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <Button
                  leftIcon={<Search className="h-4 w-4" />}
                  onClick={() => setSearchQuery(saleNumberInput)}
                  isLoading={searching}
                  disabled={saleNumberInput.length < 3}
                >
                  Buscar
                </Button>
              </div>
            </div>

            {/* Search results list */}
            {searchResults && searchResults.data.length === 0 && searchQuery && !searching && (
              <p className="text-sm text-gray-500 text-center py-3">
                No se encontraron ventas con ese número.
              </p>
            )}
            {searchResults && searchResults.data.length > 0 && !selectedSale && (
              <div className="border border-gray-200 rounded-lg divide-y overflow-hidden">
                {searchResults.data.map((sale) => (
                  <button
                    key={sale.id}
                    onClick={() => setSelectedSale(sale)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-semibold text-gray-900">
                        {sale.saleNumber}
                      </span>
                      <span className="text-xs text-gray-500">
                        {format(new Date(sale.createdAt), 'dd/MM/yyyy HH:mm', { locale: es })}
                      </span>
                      {sale.customer && (
                        <span className="text-xs text-gray-400">{sale.customer.name}</span>
                      )}
                    </div>
                    <span className="font-semibold text-gray-800 text-sm">
                      {fmt(sale.totalAmount)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Selected sale items table */}
            {selectedSale && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold text-gray-900">
                      {selectedSale.saleNumber}
                    </span>
                    <span className="text-xs text-gray-500">
                      {format(new Date(selectedSale.createdAt), 'dd/MM/yyyy', { locale: es })}
                    </span>
                    {selectedSale.customer && (
                      <span className="text-xs text-gray-500">· {selectedSale.customer.name}</span>
                    )}
                  </div>
                  <button
                    className="text-xs text-gray-400 hover:text-gray-600 underline"
                    onClick={() => {
                      setSelectedSale(null);
                      setLineItems([]);
                    }}
                  >
                    Cambiar venta
                  </button>
                </div>

                {loadingSale && (
                  <p className="text-sm text-gray-500 text-center py-6">Cargando items…</p>
                )}

                {!loadingSale && lineItems.length > 0 && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                        <tr>
                          <th className="px-3 py-2 text-left w-8"></th>
                          <th className="px-3 py-2 text-left">Producto</th>
                          <th className="px-3 py-2 text-center">Vendido</th>
                          <th className="px-3 py-2 text-center">Ya devuelto</th>
                          <th className="px-3 py-2 text-center">A devolver</th>
                          <th className="px-3 py-2 text-center">Condición</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {lineItems.map((item, idx) => {
                          const available = item.originalQty - item.alreadyReturnedQty;
                          const fullyReturned = available === 0;
                          return (
                            <tr
                              key={item.saleDetailId}
                              className={fullyReturned ? 'opacity-40' : ''}
                            >
                              <td className="px-3 py-2.5">
                                <input
                                  type="checkbox"
                                  checked={item.selected}
                                  disabled={fullyReturned}
                                  onChange={() => toggleLine(idx)}
                                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                                />
                              </td>
                              <td className="px-3 py-2.5">
                                <p className="font-medium text-gray-800 leading-tight">
                                  {item.productName}
                                </p>
                                <p className="text-xs text-gray-400">{item.productCode}</p>
                              </td>
                              <td className="px-3 py-2.5 text-center text-gray-600">
                                {item.originalQty}
                              </td>
                              <td className="px-3 py-2.5 text-center text-gray-400">
                                {item.alreadyReturnedQty > 0 ? item.alreadyReturnedQty : '—'}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {item.selected && !fullyReturned ? (
                                  <input
                                    type="number"
                                    min={1}
                                    max={available}
                                    value={item.returnQty}
                                    onChange={(e) =>
                                      setLineQty(
                                        idx,
                                        Math.min(
                                          available,
                                          Math.max(1, parseInt(e.target.value) || 1),
                                        ),
                                      )
                                    }
                                    className="w-16 border border-gray-300 rounded px-2 py-1 text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
                                  />
                                ) : (
                                  <span className="text-xs text-gray-400">
                                    {fullyReturned ? 'Devuelto' : '—'}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {item.selected && !fullyReturned ? (
                                  <select
                                    value={item.condition}
                                    onChange={(e) =>
                                      setLineCondition(idx, e.target.value as ReturnItemCondition)
                                    }
                                    className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                                  >
                                    {(
                                      Object.entries(CONDITION_LABELS) as [
                                        ReturnItemCondition,
                                        string,
                                      ][]
                                    ).map(([k, v]) => (
                                      <option key={k} value={k}>
                                        {v}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="text-xs text-gray-400">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Button variant="secondary" onClick={handleClose}>
                Cancelar
              </Button>
              <Button
                disabled={selectedItems.length === 0}
                onClick={() => setStep('confirm')}
              >
                Siguiente →
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Confirmar ─────────────────────────────────────────── */}
        {step === 'confirm' && (
          <div className="space-y-4">
            {/* Summary of items being returned */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Productos que devuelve el cliente
              </p>
              {selectedItems.map((item) => (
                <div
                  key={item.saleDetailId}
                  className="flex items-center justify-between text-sm text-gray-700"
                >
                  <span>
                    {item.productName}
                    <span className="ml-1.5 text-gray-400">×{item.returnQty}</span>
                    <Badge
                      variant={item.condition === 'GOOD' ? 'green' : 'yellow'}
                      className="ml-2"
                    >
                      {CONDITION_LABELS[item.condition]}
                    </Badge>
                  </span>
                  <span className="font-medium tabular-nums">
                    {fmt(item.returnQty * item.unitPrice)}
                  </span>
                </div>
              ))}
              <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between font-semibold text-gray-900">
                <span>Crédito disponible para cambio</span>
                <span className="tabular-nums">{fmt(totalReturnValue)}</span>
              </div>
            </div>

            {/* Info box */}
            <div className="flex gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              <ArrowLeftRight className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <p>
                Los productos en <strong>buen estado</strong> se reingresarán al stock
                automáticamente. Luego registrá la nueva venta con los artículos que el cliente
                lleva.
              </p>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Motivo del cambio <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej: Producto con defecto de fábrica, talle incorrecto, no le gustó…"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="flex justify-between pt-2 border-t border-gray-100">
              <Button
                variant="secondary"
                onClick={() => {
                  setStep('search');
                  setError('');
                }}
              >
                ← Atrás
              </Button>
              <Button
                isLoading={createMut.isPending}
                disabled={!reason.trim()}
                onClick={handleConfirm}
                leftIcon={<CheckCircle className="h-4 w-4" />}
              >
                Registrar devolución
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function SaleReturnsPage() {
  const [page, setPage] = useState(1);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['sale-returns', page],
    queryFn: () => getSaleReturns({ page, limit: 20 }),
  });

  const returns = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Devoluciones</h1>
        <Button
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={() => setWizardOpen(true)}
        >
          Nueva devolución
        </Button>
      </div>

      {successMsg && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">{successMsg}</span>
          <Link
            to={ROUTES.SALES_NEW}
            className="font-semibold underline whitespace-nowrap hover:text-green-900"
          >
            Registrar nueva venta →
          </Link>
        </div>
      )}

      <Table<SaleReturn>
        isLoading={isLoading}
        rowKey={(r) => r.id}
        emptyMessage="No hay devoluciones registradas"
        data={returns}
        columns={[
          {
            key: 'createdAt',
            header: 'Fecha',
            render: (r) =>
              format(new Date(r.createdAt), 'dd/MM/yyyy HH:mm', { locale: es }),
          },
          {
            key: 'sale',
            header: 'Venta original',
            render: (r) => (
              <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
                {r.sale.saleNumber}
              </span>
            ),
          },
          {
            key: 'items',
            header: 'Productos',
            render: (r) => {
              const n = r._count?.details ?? 0;
              return `${n} ${n !== 1 ? 'items' : 'item'}`;
            },
          },
          {
            key: 'totalAmount',
            header: 'Valor devuelto',
            render: (r) => (
              <span className="font-semibold tabular-nums">{fmt(r.totalAmount)}</span>
            ),
          },
          {
            key: 'processedBy',
            header: 'Procesado por',
            render: (r) => `${r.processedBy.firstName} ${r.processedBy.lastName}`,
          },
          {
            key: 'type',
            header: 'Tipo',
            render: () => <Badge variant="blue">Cambio</Badge>,
          },
        ]}
      />

      {meta && meta.totalPages > 1 && (
        <Pagination meta={meta as PaginationMeta} onPageChange={setPage} />
      )}

      <NewReturnWizard
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSuccess={() => {
          setWizardOpen(false);
          setSuccessMsg(
            'Devolución registrada. Los productos en buen estado ya volvieron al stock. Registrá la nueva venta para completar el cambio.',
          );
          setTimeout(() => setSuccessMsg(''), 12000);
        }}
      />
    </div>
  );
}
