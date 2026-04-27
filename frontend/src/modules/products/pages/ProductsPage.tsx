import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Search, Edit2, Package, AlertTriangle } from 'lucide-react';
import {
  getProducts,
  getProduct,
  searchProducts,
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
  const [publicMarkup, setPublicMarkup] = useState<string>('');
  // Detección de duplicado al crear
  const [newProductName, setNewProductName] = useState('');
  const [debouncedNewName, setDebouncedNewName] = useState('');

  useEffect(() => {
    if (editing) return; // solo en modo creación
    const t = setTimeout(() => setDebouncedNewName(newProductName.trim()), 400);
    return () => clearTimeout(t);
  }, [newProductName, editing]);

  const { data: duplicateCandidates = [] } = useQuery<Product[]>({
    queryKey: ['products-search-dup', debouncedNewName],
    queryFn: () => searchProducts(debouncedNewName),
    enabled: debouncedNewName.length >= 3 && !editing,
  });

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
    setPublicMarkup('');
    setNewProductName('');
    setDebouncedNewName('');
    reset({ unit: 'UN', minStock: 0 });
    setModalOpen(true);
  }

  async function openEdit(p: Product) {
    // Cargar detalle completo (incluye purchaseDetails con supplier)
    const full = await getProduct(p.id).catch(() => p);
    setEditing(full);
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
    setPublicMarkup('');
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setPriceInputs({});
    setPublicMarkup('');
    setNewProductName('');
    setDebouncedNewName('');
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
          {/* Proveedor (solo edición, basado en última compra) */}
          {editing && editing.purchaseDetails && editing.purchaseDetails.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-md border border-gray-200">
              <span className="text-xs text-gray-500">Proveedor:</span>
              <span className="text-xs font-semibold text-gray-700">
                {editing.purchaseDetails[0].purchase.supplier.name}
              </span>
            </div>
          )}
          <Input
            label="Nombre *"
            error={errors.name?.message}
            {...register('name', { required: 'Requerido', onChange: (e) => setNewProductName(e.target.value) })}
          />
          {/* Aviso de producto duplicado (solo en creación) */}
          {!editing && duplicateCandidates.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-amber-700 text-xs font-semibold">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                Ya existe{duplicateCandidates.length === 1 ? ' un producto' : 'n productos'} con ese nombre:
              </div>
              {duplicateCandidates.slice(0, 3).map((p) => (
                <div key={p.id} className="flex items-center justify-between">
                  <span className="text-xs text-amber-800">{p.name} <span className="font-mono text-amber-500">({p.internalCode})</span></span>
                  <button
                    type="button"
                    onClick={() => { closeModal(); openEdit(p); }}
                    className="text-xs text-brand-600 hover:text-brand-700 font-medium hover:underline"
                  >
                    Editar ese producto
                  </button>
                </div>
              ))}
            </div>
          )}
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
                {priceTierMethods.map((m) => {
                  const isCash = m.code === 'CASH';
                  const isPublic = m.code === 'PUBLIC';
                  const cashMethod = priceTierMethods.find((x) => x.code === 'CASH');
                  return (
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
                          onChange={(e) => {
                            const val = e.target.value;
                            setPriceInputs((prev) => {
                              const next = { ...prev, [m.id]: val };
                              // Si se edita CASH y hay markup, recalcular PUBLIC
                              if (isCash && publicMarkup && parseFloat(publicMarkup) > 0) {
                                const publicM = priceTierMethods.find((x) => x.code === 'PUBLIC');
                                if (publicM) {
                                  const cashVal = parseFloat(val) || 0;
                                  next[publicM.id] = parseFloat((cashVal * (1 + parseFloat(publicMarkup) / 100)).toFixed(2)).toString();
                                }
                              }
                              return next;
                            });
                          }}
                          className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                      {/* Input de porcentaje para PUBLIC */}
                      {isPublic && cashMethod && (
                        <div className="mt-1 flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            placeholder="%"
                            value={publicMarkup}
                            onChange={(e) => {
                              const markup = e.target.value;
                              setPublicMarkup(markup);
                              const markupVal = parseFloat(markup);
                              if (!isNaN(markupVal) && markupVal > 0) {
                                const cashVal = parseFloat(priceInputs[cashMethod.id] ?? '') || 0;
                                if (cashVal > 0) {
                                  setPriceInputs((prev) => ({
                                    ...prev,
                                    [m.id]: parseFloat((cashVal * (1 + markupVal / 100)).toFixed(2)).toString(),
                                  }));
                                }
                              }
                            }}
                            className="w-16 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                          <span className="text-xs text-gray-400">% sobre Efectivo</span>
                        </div>
                      )}
                    </div>
                  );
                })}
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

