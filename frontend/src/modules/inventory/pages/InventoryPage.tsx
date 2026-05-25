import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Search, AlertTriangle, Plus, Minus } from 'lucide-react';
import {
  getStock,
  adjustStock,
  type StockItem,
} from '../api/inventoryApi';
import { useAuthStore } from '@/core/auth/authStore';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Modal } from '@/shared/components/ui/Modal';
import { Table } from '@/shared/components/ui/Table';
import { Badge } from '@/shared/components/ui/Badge';
import { Pagination } from '@/shared/components/ui/Pagination';
import type { PaginationMeta } from '@/shared/types/api.types';

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [adjustType, setAdjustType] = useState<'AJUSTE_POSITIVO' | 'AJUSTE_NEGATIVO'>('AJUSTE_POSITIVO');

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-stock', page, search],
    queryFn: () => getStock({ page, limit: 20, search: search || undefined }),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<{ quantity: number; notes?: string }>({
    defaultValues: { quantity: 1, notes: '' },
  });

  const adjustMut = useMutation({
    mutationFn: (values: { quantity: number; notes?: string }) =>
      adjustStock({
        productId: selectedItem!.id,
        type: adjustType,
        quantity: values.quantity,
        notes: values.notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
      closeModal();
    },
  });

  function openAdjustModal(item: StockItem, type: 'AJUSTE_POSITIVO' | 'AJUSTE_NEGATIVO') {
    setSelectedItem(item);
    setAdjustType(type);
    reset({ quantity: 1, notes: '' });
    setAdjustModalOpen(true);
  }

  function closeModal() {
    setAdjustModalOpen(false);
    setSelectedItem(null);
    setAdjustType('AJUSTE_POSITIVO');
  }

  function onSubmit(values: { quantity: number; notes?: string }) {
    adjustMut.mutate(values);
  }

  const products = data?.data ?? [];
  const meta = data?.meta;
  const isSaving = isSubmitting || adjustMut.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Inventario</h1>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Buscar por nombre o código..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setSearch(searchInput);
              setPage(1);
            }
          }}
          leftAddon={<Search className="h-4 w-4" />}
          className="max-w-xs"
        />
        <Button variant="secondary" onClick={() => { setSearch(searchInput); setPage(1); }}>
          Buscar
        </Button>
      </div>

      <Table
        isLoading={isLoading}
        rowKey={(r) => r.id}
        emptyMessage="No hay productos en el inventario"
        data={products}
        columns={[
          { key: 'internalCode', header: 'Código', className: 'font-mono text-xs' },
          { key: 'name', header: 'Nombre' },
          { key: 'type', header: 'Tipo', render: (r) => r.type === 'REVENTA' ? 'Reventa' : 'Personalizado' },
          { key: 'unit', header: 'Unidad' },
          {
            key: 'currentStock',
            header: 'Stock Actual',
            render: (r) => (
              <span className={r.currentStock <= r.minStock ? 'text-red-600 font-semibold' : ''}>
                {r.currentStock}
              </span>
            ),
          },
          {
            key: 'minStock',
            header: 'Stock Mínimo',
            render: (r) => (
              <Badge variant={r.currentStock <= r.minStock ? 'red' : 'gray'}>
                {r.minStock}
              </Badge>
            ),
          },
          ...(isAdmin ? [{
            key: 'actions' as const,
            header: '',
            render: (r: StockItem) => (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => openAdjustModal(r, 'AJUSTE_POSITIVO')}
                  title="Aumentar stock"
                >
                  +
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<Minus className="h-3.5 w-3.5" />}
                  onClick={() => openAdjustModal(r, 'AJUSTE_NEGATIVO')}
                  title="Disminuir stock"
                >
                  −
                </Button>
              </div>
            ),
          }] : []),
        ]}
      />

      {meta && meta.totalPages > 1 && (
        <Pagination meta={meta as PaginationMeta} onPageChange={setPage} />
      )}

      <Modal
        isOpen={adjustModalOpen}
        onClose={closeModal}
        title={`${adjustType === 'AJUSTE_POSITIVO' ? 'Aumentar' : 'Disminuir'} stock: ${selectedItem?.name}`}
        size="sm"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="px-4 py-2 bg-blue-50 rounded-md border border-blue-200">
            <p className="text-xs text-blue-700">
              <strong>Producto:</strong> {selectedItem?.internalCode} - {selectedItem?.name}
              <br />
              <strong>Stock actual:</strong> {selectedItem?.currentStock} {selectedItem?.unit}
            </p>
          </div>

          <Input
            label="Cantidad"
            type="number"
            min="1"
            error={errors.quantity?.message}
            {...register('quantity', {
              required: 'Requerido',
              valueAsNumber: true,
              min: { value: 1, message: 'Mínimo 1' },
            })}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Ej: Carga inicial de stock"
              {...register('notes')}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={closeModal}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
              loading={isSaving}
            >
              {adjustType === 'AJUSTE_POSITIVO' ? 'Aumentar' : 'Disminuir'} Stock
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
