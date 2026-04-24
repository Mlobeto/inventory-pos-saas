import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Eye } from 'lucide-react';
import { getPurchases, type PurchaseStatus } from '../api/purchasesApi';
import { Button } from '@/shared/components/ui/Button';
import { Select } from '@/shared/components/ui/Select';
import { Table } from '@/shared/components/ui/Table';
import { Badge } from '@/shared/components/ui/Badge';
import { Pagination } from '@/shared/components/ui/Pagination';
import { ROUTES } from '@/router/routes';
import type { PaginationMeta } from '@/shared/types/api.types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

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

export default function PurchasesListPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<PurchaseStatus | ''>('');

  const { data, isLoading } = useQuery({
    queryKey: ['purchases', page, status],
    queryFn: () => getPurchases({ page, limit: 20, status: status || undefined }),
  });

  const purchases = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Compras</h1>
        <Link to={ROUTES.PURCHASES_NEW}>
          <Button leftIcon={<Plus className="h-4 w-4" />}>Nueva factura de compra</Button>
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <Select
          placeholder="Todos los estados"
          value={status}
          onChange={(e) => { setStatus(e.target.value as PurchaseStatus | ''); setPage(1); }}
          options={Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
          className="w-48"
        />
      </div>

      <Table
        isLoading={isLoading}
        rowKey={(r) => r.id}
        emptyMessage="No hay compras registradas"
        data={purchases}
        columns={[
          {
            key: 'invoiceNumber',
            header: 'Factura',
            render: (r) => (
              <span className="font-mono text-sm">{r.invoiceNumber ?? <span className="text-gray-400">Sin Nro.</span>}</span>
            ),
          },
          { key: 'supplier', header: 'Proveedor', render: (r) => r.supplier.name },
          {
            key: 'status',
            header: 'Estado',
            render: (r) => <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABELS[r.status]}</Badge>,
          },
          {
            key: 'totalAmount',
            header: 'Total',
            render: (r) => (
              <span className="font-semibold">${parseFloat(r.totalAmount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
            ),
          },
          {
            key: 'createdAt',
            header: 'Fecha',
            render: (r) => format(new Date(r.createdAt), 'dd/MM/yyyy', { locale: es }),
          },
          {
            key: 'actions',
            header: '',
            render: (r) => (
              <Link to={ROUTES.PURCHASES_DETAIL.replace(':id', r.id)}>
                <Button size="sm" variant="ghost" leftIcon={<Eye className="h-3.5 w-3.5" />}>
                  Ver
                </Button>
              </Link>
            ),
          },
        ]}
      />

      {meta && meta.totalPages > 1 && (
        <Pagination meta={meta as PaginationMeta} onPageChange={setPage} />
      )}
    </div>
  );
}
