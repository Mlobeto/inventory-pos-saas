import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Search, Edit2 } from 'lucide-react';
import {
  getSuppliers,
  createSupplier,
  updateSupplier,
  type Supplier,
  type CreateSupplierDto,
} from '../api/suppliersApi';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Modal } from '@/shared/components/ui/Modal';
import { Table } from '@/shared/components/ui/Table';
import { Pagination } from '@/shared/components/ui/Pagination';
import type { PaginationMeta } from '@/shared/types/api.types';

export default function SuppliersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', page, search],
    queryFn: () => getSuppliers({ page, limit: 20, search: search || undefined }),
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<CreateSupplierDto>();

  const createMut = useMutation({
    mutationFn: createSupplier,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['suppliers'] }); closeModal(); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<CreateSupplierDto> }) => updateSupplier(id, dto),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['suppliers'] }); closeModal(); },
  });

  function openCreate() {
    setEditing(null);
    reset({});
    setModalOpen(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    reset({ name: s.name, taxId: s.taxId, phone: s.phone, email: s.email, address: s.address, notes: s.notes });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    reset({});
  }

  function onSubmit(values: CreateSupplierDto) {
    if (editing) {
      updateMut.mutate({ id: editing.id, dto: values });
    } else {
      createMut.mutate(values);
    }
  }

  const suppliers = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Proveedores</h1>
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>
          Nuevo proveedor
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Buscar por nombre o CUIT..."
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
        emptyMessage="No hay proveedores registrados"
        data={suppliers}
        columns={[
          { key: 'name', header: 'Nombre' },
          { key: 'taxId', header: 'CUIT/DNI', render: (r) => r.taxId ?? '—' },
          { key: 'phone', header: 'Teléfono', render: (r) => r.phone ?? '—' },
          { key: 'email', header: 'Email', render: (r) => r.email ?? '—' },
          {
            key: 'actions',
            header: '',
            render: (r) =>
              r.isGeneric ? null : (
                <Button size="sm" variant="ghost" leftIcon={<Edit2 className="h-3.5 w-3.5" />} onClick={() => openEdit(r)}>
                  Editar
                </Button>
              ),
          },
        ]}
      />

      {meta && meta.totalPages > 1 && (
        <Pagination meta={meta as PaginationMeta} onPageChange={setPage} />
      )}

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editing ? 'Editar proveedor' : 'Nuevo proveedor'}
        size="md"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Nombre *" error={errors.name?.message} {...register('name', { required: 'Requerido' })} />
          <Input label="CUIT / DNI" {...register('taxId')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Teléfono" {...register('phone')} />
            <Input label="Email" type="email" {...register('email')} />
          </div>
          <Input label="Dirección" {...register('address')} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea
              className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              rows={2}
              {...register('notes')}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeModal}>Cancelar</Button>
            <Button type="submit" isLoading={isSubmitting || createMut.isPending || updateMut.isPending}>
              {editing ? 'Guardar cambios' : 'Crear proveedor'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
