import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { AppLayout } from '../shared/components/layout/AppLayout';
import { ROUTES } from './routes';
import { Spinner } from '../shared/components/ui/Spinner';

const LoginPage = lazy(() => import('../modules/auth/pages/LoginPage'));
const DashboardPage = lazy(() => import('../modules/dashboard/pages/DashboardPage'));
const StubPage = lazy(() => import('../modules/stub/StubPage'));
const SuppliersPage = lazy(() => import('../modules/suppliers/pages/SuppliersPage'));
const ProductsPage = lazy(() => import('../modules/products/pages/ProductsPage'));
const PurchasesListPage = lazy(() => import('../modules/purchases/pages/PurchasesListPage'));
const PurchaseNewPage = lazy(() => import('../modules/purchases/pages/PurchaseNewPage'));
const PurchaseDetailPage = lazy(() => import('../modules/purchases/pages/PurchaseDetailPage'));
const GoodsReceiptNewPage = lazy(() => import('../modules/goods-receipts/pages/GoodsReceiptNewPage'));
const GoodsReceiptDetailPage = lazy(() => import('../modules/goods-receipts/pages/GoodsReceiptDetailPage'));
const CashShiftPage = lazy(() => import('../modules/cash-shifts/pages/CashShiftPage'));
const SalesListPage = lazy(() => import('../modules/sales/pages/SalesListPage'));
const SaleNewPage = lazy(() => import('../modules/sales/pages/SaleNewPage'));
const InvoicePrintPage = lazy(() => import('../modules/sales/pages/InvoicePrintPage'));
const CustomersPage = lazy(() => import('../modules/customers/pages/CustomersPage'));
const CustomerStatementPage = lazy(() => import('../modules/customers/pages/CustomerStatementPage'));
const AfipSettingsPage = lazy(() => import('../modules/settings/pages/AfipSettingsPage'));
const SettingsPage = lazy(() => import('../modules/settings/pages/SettingsPage'));
const SaleReturnsPage = lazy(() => import('../modules/sale-returns/pages/SaleReturnsPage'));
const UsersPage = lazy(() => import('../modules/users/pages/UsersPage'));

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
          <Route path={ROUTES.CASH_SHIFTS} element={<CashShiftPage />} />
          <Route path={ROUTES.SALES_NEW} element={<SaleNewPage />} />
          <Route path={ROUTES.SALES} element={<SalesListPage />} />
          <Route path={ROUTES.SALE_INVOICE} element={<InvoicePrintPage />} />
          <Route path={ROUTES.SALE_RETURNS} element={<SaleReturnsPage />} />
          <Route path={ROUTES.PURCHASES} element={<PurchasesListPage />} />
          <Route path={ROUTES.PURCHASES_NEW} element={<PurchaseNewPage />} />
          <Route path={ROUTES.PURCHASES_DETAIL} element={<PurchaseDetailPage />} />
          <Route path={ROUTES.GOODS_RECEIPTS_NEW} element={<GoodsReceiptNewPage />} />
          <Route path={ROUTES.GOODS_RECEIPTS_DETAIL} element={<GoodsReceiptDetailPage />} />
          <Route path={ROUTES.GOODS_RECEIPTS} element={<StubPage title="Recepciones" />} />
          <Route path={ROUTES.ACCOUNTS_PAYABLE} element={<StubPage title="Cuentas por Pagar" />} />
          <Route path={ROUTES.PRODUCTS} element={<ProductsPage />} />
          <Route path={ROUTES.INVENTORY} element={<StubPage title="Inventario" />} />
          <Route path={ROUTES.SUPPLIERS} element={<SuppliersPage />} />
          <Route path={ROUTES.CUSTOMERS} element={<CustomersPage />} />
          <Route path={ROUTES.CUSTOMER_STATEMENT} element={<CustomerStatementPage />} />
          <Route path={ROUTES.REPORTS} element={<StubPage title="Reportes" />} />
          <Route path={ROUTES.SETTINGS} element={<SettingsPage />} />
          <Route path={ROUTES.AFIP_SETTINGS} element={<AfipSettingsPage />} />
          <Route path={ROUTES.USERS} element={<UsersPage />} />
        </Route>

        <Route path="*" element={<Navigate to={ROUTES.DASHBOARD} replace />} />
      </Routes>
    </Suspense>
  );
}
