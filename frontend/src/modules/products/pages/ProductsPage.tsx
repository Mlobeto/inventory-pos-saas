import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Search, Edit2, Package } from 'lucide-react';
import {
  getProducts,
  createProduct,
  updateProduct,
  upsertProductPrice,
  type Product,
  type CreateProductDto,
} from '../api/productsApi';
import {
  getPriceTierMethods,
  getPriceTierLabel,
  type PaymentMethod,
} from '@/modules/payment-methods/api/paymentMethodsApi';
import { useAuthStore } from '@/core/auth/authStore';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Modal } from '@/shared/components/ui/Modal';
import { Table } from '@/shared/components/ui/Table';
import { Badge } from '@/shared/components/ui/Badge';
import { Pagination } from '@/shared/components/ui/Pagination';
import type { PaginationMeta } from '@/shared/types/api.types';

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const canEdit = useAuthStore((s) => s.hasPermission('products:write'));
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  // Precios editables: map de paymentMethodId → valor string
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['products', page, search],
    queryFn: () => getProducts({ page, limit: 20, search: search || undefined }),
  });

  const { data: priceTierMethods = [] } = useQuery<PaymentMethod[]>({
    queryKey: ['price-tier-methods'],
    queryFn: getPriceTierMethods,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateProductDto>({ defaultValues: { unit: 'UN', minStock: 0 } });

  const createMut = useMutation({
    mutationFn: createProduct,
    onSuccess: async (newProduct) => {
      await savePrices(newProduct.id);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      closeModal();
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<CreateProductDto> }) => updateProduct(id, dto),
    onSuccess: async (updatedProduct) => {
      await savePrices(updatedProduct.id);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      closeModal();
    },
  });

  async function savePrices(productId: string) {
    const tasks = priceTierMethods
      .filter((m) => {
        const val = parseFloat(priceInputs[m.id] ?? '');
        return !isNaN(val) && val >= 0;
      })
      .map((m) => upsertProductPrice(productId, m.id, parseFloat(priceInputs[m.id])));
    await Promise.all(tasks);
  }

  function openCreate() {
    setEditing(null);
    setPriceInputs({});
    reset({ unit: 'UN', minStock: 0 });
    setModalOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    const primaryBarcode =
      p.productCodes.find((c) => c.isPrimary && (c as any).type === 'BARCODE') ??
      p.productCodes.find((c) => (c as any).type === 'BARCODE');
    reset({
      name: p.name,
      description: p.description,
      unit: p.unit,
      minStock: p.minStock,
      barcode: primaryBarcode?.code ?? '',
    });
    // Pre-cargar precios existentes
    const initial: Record<string, string> = {};
    for (const pp of p.productPrices) {
      initial[pp.paymentMethod.id] = parseFloat(pp.price).toString();
    }
    setPriceInputs(initial);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setPriceInputs({});
  }

  function onSubmit(values: CreateProductDto) {
    if (editing) {
      updateMut.mutate({ id: editing.id, dto: values });
    } else {
      createMut.mutate(values);
    }
  }

  const products = data?.data ?? [];
  const meta = data?.meta;
  const isSaving = isSubmitting || createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Productos</h1>
        {canEdit && (
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Nuevo producto
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Buscar por nombre o código..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { setSearch(searchInput); setPage(1); } }}
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
        emptyMessage="No hay productos registrados"
        data={products}
        columns={[
          { key: 'internalCode', header: 'Código', className: 'font-mono text-xs' },
          {
            key: 'name',
            header: 'Nombre',
            render: (r) => (
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <span className="font-medium text-gray-900">{r.name}</span>
              </div>
            ),
          },
          { key: 'type', header: 'Tipo', render: (r) => r.type === 'REVENTA' ? 'Reventa' : 'Personalizado' },
          { key: 'unit', header: 'Unidad' },
          {
            key: 'currentStock',
            header: 'Stock',
            render: (r) => (
              <span className={r.currentStock <= r.minStock ? 'text-red-600 font-semibold' : ''}>
                {r.currentStock}
              </span>
            ),
          },
          {
            key: 'isActive',
            header: 'Estado',
            render: (r) => (
              <Badge variant={r.isActive ? 'green' : 'gray'}>{r.isActive ? 'Activo' : 'Inactivo'}</Badge>
            ),
          },
          ...(canEdit ? [{
            key: 'actions' as const,
            header: '',
            render: (r: Product) => (
              <Button size="sm" variant="ghost" leftIcon={<Edit2 className="h-3.5 w-3.5" />} onClick={() => openEdit(r)}>
                Editar
              </Button>
            ),
          }] : []),
        ]}
      />

      {meta && meta.totalPages > 1 && (
        <Pagination meta={meta as PaginationMeta} onPageChange={setPage} />
      )}

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editing ? 'Editar producto' : 'Nuevo producto'}
        size="md"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Nombre *"
            error={errors.name?.message}
            {...register('name', { required: 'Requerido' })}
          />
          <Input
            label="Código de barras"
            placeholder="Escaneá con el lector o escribí manualmente"
            {...register('barcode')}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
            <textarea
              className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              rows={2}
              {...register('description')}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Unidad" {...register('unit')} />
            <Input
              label="Stock mínimo"
              type="number"
              min="0"
              {...register('minStock', { valueAsNumber: true })}
            />
          </div>

          {/* ─── Precios por lista ─── */}
          {priceTierMethods.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Precios por lista</p>
              <div className="grid grid-cols-2 gap-3">
                {priceTierMethods.map((m) => (
                  <div key={m.id} className="relative">
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      {getPriceTierLabel(m)}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
                        $
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0,00"
                        value={priceInputs[m.id] ?? ''}
                        onChange={(e) =>
                          setPriceInputs((prev) => ({ ...prev, [m.id]: e.target.value }))
                        }
                        className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeModal}>
              Cancelar
            </Button>
            <Button type="submit" isLoading={isSaving}>
              {editing ? 'Guardar cambios' : 'Crear producto'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

