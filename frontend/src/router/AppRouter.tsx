import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { AppLayout } from '../shared/components/layout/AppLayout';
import { ROUTES } from './routes';
import { Spinner } from '../shared/components/ui/Spinner';

const LoginPage = lazy(() => import('../modules/auth/pages/LoginPage'));
const DashboardPage = lazy(() => import('../modules/dashboard/pages/DashboardPage'));
const StubPage = lazy(() => import('../modules/stub/StubPage'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-48">
      <Spinner size="lg" />
    </div>
  );
}

export default function AppRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path={ROUTES.LOGIN} element={<LoginPage />} />

        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path={ROUTES.CASH_SHIFTS} element={<StubPage title="Turnos de Caja" />} />
          <Route path={ROUTES.SALES} element={<StubPage title="Ventas" />} />
          <Route path={ROUTES.SALE_RETURNS} element={<StubPage title="Devoluciones" />} />
          <Route path={ROUTES.PURCHASES} element={<StubPage title="Compras" />} />
          <Route path={ROUTES.GOODS_RECEIPTS} element={<StubPage title="Recepciones" />} />
          <Route path={ROUTES.ACCOUNTS_PAYABLE} element={<StubPage title="Cuentas por Pagar" />} />
          <Route path={ROUTES.PRODUCTS} element={<StubPage title="Productos" />} />
          <Route path={ROUTES.INVENTORY} element={<StubPage title="Inventario" />} />
          <Route path={ROUTES.SUPPLIERS} element={<StubPage title="Proveedores" />} />
          <Route path={ROUTES.REPORTS} element={<StubPage title="Reportes" />} />
          <Route path={ROUTES.SETTINGS} element={<StubPage title="Configuración" />} />
        </Route>

        <Route path="*" element={<Navigate to={ROUTES.DASHBOARD} replace />} />
      </Routes>
    </Suspense>
  );
}
