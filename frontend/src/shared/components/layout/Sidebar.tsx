import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Truck,
  BarChart2,
  Settings,
  DollarSign,
  Layers,
  ArrowLeftRight,
  Users,
  X,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { useAuthStore } from '@/core/auth/authStore';
import { ROUTES } from '@/router/routes';

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  permission?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: 'General',
    items: [{ to: ROUTES.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Caja & Ventas',
    items: [
      { to: ROUTES.CASH_SHIFTS,  label: 'Turnos de Caja', icon: DollarSign,      permission: 'cash-shifts:read' },
      { to: ROUTES.SALES,        label: 'Ventas',          icon: ShoppingCart,    permission: 'sales:read' },
      { to: ROUTES.SALE_RETURNS, label: 'Devoluciones',    icon: ArrowLeftRight,  permission: 'sale-returns:write' },
    ],
  },
  {
    label: 'Compras',
    items: [
      { to: ROUTES.PURCHASES,       label: 'Órdenes de Compra', icon: Truck,    permission: 'purchases:read' },
      { to: ROUTES.ACCOUNTS_PAYABLE,label: 'Cuentas por Pagar', icon: DollarSign, permission: 'accounts-payable:read' },
    ],
  },
  {
    label: 'Inventario',
    items: [
      { to: ROUTES.PRODUCTS,  label: 'Productos', icon: Layers,  permission: 'products:read' },
      { to: ROUTES.INVENTORY, label: 'Stock',     icon: Package, permission: 'inventory:read' },
    ],
  },
  {
    label: 'Administración',
    items: [
      { to: ROUTES.SUPPLIERS,  label: 'Proveedores',   icon: Truck,     permission: 'suppliers:read' },
      { to: ROUTES.CUSTOMERS,  label: 'Clientes',      icon: Users,     permission: 'customers:read' },
      { to: ROUTES.REPORTS,    label: 'Reportes',      icon: BarChart2, permission: 'reports:view' },
      { to: ROUTES.SETTINGS,   label: 'Configuración', icon: Settings,  permission: 'tenant:settings' },
    ],
  },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const user = useAuthStore((s) => s.user);
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.permission || hasPermission(item.permission)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 text-white flex flex-col transition-transform duration-200',
          'lg:translate-x-0 lg:static lg:z-auto',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div>
            <p className="font-bold text-base leading-tight">Dale Vir!</p>
            <p className="text-xs text-gray-400 mt-0.5">{user?.tenantSlug ?? ''}</p>
          </div>
          <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {visibleGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map(({ to, label, icon: Icon }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={to === ROUTES.DASHBOARD}
                      onClick={onClose}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-brand-600 text-white'
                            : 'text-gray-300 hover:bg-gray-800 hover:text-white',
                        )
                      }
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      {label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
