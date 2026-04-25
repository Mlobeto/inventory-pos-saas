import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Search, Edit2, Trash2 } from 'lucide-react';
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  CUSTOMER_TYPE_LABELS,
  type Customer,
  type CustomerType,
  type CreateCustomerDto,
} from '../api/customersApi';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Modal } from '@/shared/components/ui/Modal';
import { Table } from '@/shared/components/ui/Table';
import { Pagination } from '@/shared/components/ui/Pagination';
import { useAuthStore } from '@/core/auth/authStore';
import type { PaginationMeta } from '@/shared/types/api.types';

const CUSTOMER_TYPE_OPTIONS: { value: CustomerType; label: string }[] = [
  { value: 'CONSUMIDOR_FINAL', label: 'Consumidor Final' },
  { value: 'MAYORISTA', label: 'Mayorista' },
  { value: 'VENDEDOR', label: 'Vendedor' },
  { value: 'FACTURABLE', label: 'Facturable' },
];

const TYPE_BADGE_COLORS: Record<CustomerType, string> = {
  CONSUMIDOR_FINAL: 'bg-gray-100 text-gray-700',
  MAYORISTA: 'bg-blue-100 text-blue-700',
  VENDEDOR: 'bg-purple-100 text-purple-700',
  FACTURABLE: 'bg-green-100 text-green-700',
};

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const canWrite = useAuthStore((s) => s.hasPermission('customers:write'));

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [typeFilter, setTypeFilter] = useState<CustomerType | ''>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', page, search, typeFilter],
    queryFn: () =>
      getCustomers({
        page,
        limit: 20,
        search: search || undefined,
        type: typeFilter || undefined,
      }),
  });

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateCustomerDto>();

  const watchedType = watch('type');

  const createMut = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      closeModal();
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<CreateCustomerDto> }) =>
      updateCustomer(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      closeModal();
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteCustomer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setDeleteTarget(null);
    },
  });

  function openCreate() {
    setEditing(null);
    reset({ type: 'CONSUMIDOR_FINAL' });
    setModalOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    reset({
      type: c.type,
      name: c.name,
      taxId: c.taxId ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      address: c.address ?? '',
      notes: c.notes ?? '',
      creditLimit: c.creditLimit ? parseFloat(c.creditLimit) : undefined,
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    reset({});
  }

  function onSubmit(values: CreateCustomerDto) {
    const payload: CreateCustomerDto = {
      ...values,
      creditLimit: values.creditLimit ? Number(values.creditLimit) : undefined,
    };
    if (editing) {
      updateMut.mutate({ id: editing.id, dto: payload });
    } else {
      createMut.mutate(payload);
    }
  }

  const customers = data?.data ?? [];
  const meta = data?.meta;
  const mutError =
    (createMut.error as Error)?.message || (updateMut.error as Error)?.message || '';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
        {canWrite && (
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Nuevo cliente
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="flex gap-2">
          <Input
            placeholder="Buscar por nombre, CUIT o teléfono..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setSearch(searchInput);
                setPage(1);
              }
            }}
            leftAddon={<Search className="h-4 w-4" />}
            className="w-72"
          />
          <Button
            variant="secondary"
            onClick={() => {
              setSearch(searchInput);
              setPage(1);
            }}
          >
            Buscar
          </Button>
        </div>

        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value as CustomerType | '');
            setPage(1);
          }}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">Todos los tipos</option>
          {CUSTOMER_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <Table
        isLoading={isLoading}
        rowKey={(r) => r.id}
        emptyMessage="No hay clientes registrados"
        data={customers}
        columns={[
          {
            key: 'type',
            header: 'Tipo',
            render: (r) => (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TYPE_BADGE_COLORS[r.type]}`}
              >
                {CUSTOMER_TYPE_LABELS[r.type]}
              </span>
            ),
          },
          { key: 'name', header: 'Nombre' },
          { key: 'taxId', header: 'CUIT/DNI', render: (r) => r.taxId ?? '—' },
          { key: 'phone', header: 'Teléfono', render: (r) => r.phone ?? '—' },
          { key: 'email', header: 'Email', render: (r) => r.email ?? '—' },
          {
            key: 'creditLimit',
            header: 'Límite crédito',
            render: (r) =>
              r.creditLimit
                ? `$${parseFloat(r.creditLimit).toLocaleString('es-AR')}`
                : '—',
          },
          ...(canWrite
            ? [
                {
                  key: 'actions' as const,
                  header: '',
                  render: (r: Customer) => (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        leftIcon={<Edit2 className="h-3.5 w-3.5" />}
                        onClick={() => openEdit(r)}
                      >
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700"
                        leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                        onClick={() => setDeleteTarget(r)}
                      >
                        Eliminar
                      </Button>
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />

      {meta && meta.totalPages > 1 && (
        <Pagination meta={meta as PaginationMeta} onPageChange={setPage} />
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editing ? 'Editar cliente' : 'Nuevo cliente'}
        size="md"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
            <select
              className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              {...register('type', { required: 'Requerido' })}
            >
              {CUSTOMER_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {errors.type && (
              <p className="text-red-500 text-xs mt-1">{errors.type.message}</p>
            )}
          </div>

          <Input
            label="Nombre *"
            error={errors.name?.message}
            {...register('name', { required: 'Requerido' })}
          />

          <Input
            label={`CUIT / DNI${watchedType === 'FACTURABLE' ? ' *' : ''}`}
            error={errors.taxId?.message}
            {...register('taxId', {
              validate: (v) =>
                watchedType === 'FACTURABLE' && !v
                  ? 'Requerido para clientes facturables'
                  : true,
            })}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input label="Teléfono" {...register('phone')} />
            <Input label="Email" type="email" {...register('email')} />
          </div>

          <Input label="Dirección" {...register('address')} />

          {(watchedType === 'VENDEDOR' || watchedType === 'MAYORISTA') && (
            <Input
              label="Límite de crédito ($)"
              type="number"
              step="0.01"
              min="0"
              {...register('creditLimit')}
            />
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea
              className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              rows={2}
              {...register('notes')}
            />
          </div>

          {mutError && <p className="text-red-600 text-sm">{mutError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeModal}>
              Cancelar
            </Button>
            <Button
              type="submit"
              isLoading={isSubmitting || createMut.isPending || updateMut.isPending}
            >
              {editing ? 'Guardar cambios' : 'Crear cliente'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Eliminar cliente"
        size="sm"
      >
        <p className="text-sm text-gray-700 mb-4">
          ¿Eliminar al cliente <strong>{deleteTarget?.name}</strong>? Esta acción no se puede
          deshacer.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            isLoading={deleteMut.isPending}
            onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
          >
            Eliminar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
