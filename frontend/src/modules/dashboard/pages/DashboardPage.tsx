import { useAuthStore } from '../../../core/auth/authStore';
import { Card } from '../../../shared/components/ui/Card';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../router/routes';
import { Button } from '../../../shared/components/ui/Button';
import { ShoppingCart, DollarSign, Package } from 'lucide-react';

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Bienvenido, {user?.firstName}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <ShoppingCart className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Ventas hoy</p>
              <p className="text-xl font-bold text-gray-900">—</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Caja</p>
              <p className="text-xl font-bold text-gray-900">—</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-yellow-100 rounded-lg">
              <Package className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Stock bajo</p>
              <p className="text-xl font-bold text-gray-900">—</p>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Acciones rápidas">
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => navigate(ROUTES.SALES)} leftIcon={<ShoppingCart className="h-4 w-4" />}>
            Nueva Venta
          </Button>
          <Button variant="secondary" onClick={() => navigate(ROUTES.CASH_SHIFTS)} leftIcon={<DollarSign className="h-4 w-4" />}>
            Abrir Caja
          </Button>
          <Button variant="secondary" onClick={() => navigate(ROUTES.PRODUCTS)} leftIcon={<Package className="h-4 w-4" />}>
            Ver Productos
          </Button>
        </div>
      </Card>
    </div>
  );
}
