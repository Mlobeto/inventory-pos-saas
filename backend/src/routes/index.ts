import { Application } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { tenantRouter } from '../modules/tenants/tenant.routes';
import { userRouter } from '../modules/users/user.routes';
import { roleRouter } from '../modules/roles/role.routes';
import { supplierRouter } from '../modules/suppliers/supplier.routes';
import { productRouter } from '../modules/products/product.routes';
import { productCodeRouter } from '../modules/product-codes/product-code.routes';
import { paymentMethodRouter } from '../modules/payment-methods/payment-method.routes';
import { productPriceRouter } from '../modules/product-prices/product-price.routes';
import { purchaseRouter } from '../modules/purchases/purchase.routes';
import { goodsReceiptRouter } from '../modules/goods-receipts/goods-receipt.routes';
import { inventoryRouter } from '../modules/inventory/inventory.routes';
import { cashShiftRouter } from '../modules/cash-shifts/cash-shift.routes';
import { saleRouter } from '../modules/sales/sale.routes';
import { cashExpenseRouter } from '../modules/cash-expenses/cash-expense.routes';
import { accountsPayableRouter } from '../modules/accounts-payable/accounts-payable.routes';
import { supplierPaymentRouter } from '../modules/supplier-payments/supplier-payment.routes';
import { saleReturnRouter } from '../modules/sale-returns/sale-return.routes';
import { reportsRouter } from '../modules/reports/reports.routes';
import { customerRouter } from '../modules/customers/customer.routes';
import { customerReceivablesRouter } from '../modules/customers/customer-receivables.routes';
import { invoiceRouter, afipSettingsRouter } from '../modules/afip/invoice.routes';

const API_PREFIX = '/api';

export function registerRoutes(app: Application): void {
  // Público
  app.use(`${API_PREFIX}/auth`, authRouter);

  // Tenant (requiere superadmin futuro; por ahora admin del tenant)
  app.use(`${API_PREFIX}/tenants`, tenantRouter);

  // Configuración del negocio
  app.use(`${API_PREFIX}/users`, userRouter);
  app.use(`${API_PREFIX}/roles`, roleRouter);
  app.use(`${API_PREFIX}/payment-methods`, paymentMethodRouter);

  // Maestros
  app.use(`${API_PREFIX}/suppliers`, supplierRouter);
  app.use(`${API_PREFIX}/customers`, customerRouter);
  app.use(`${API_PREFIX}/customers`, customerReceivablesRouter);
  app.use(`${API_PREFIX}/products`, productRouter);
  app.use(`${API_PREFIX}/product-codes`, productCodeRouter);
  app.use(`${API_PREFIX}/product-prices`, productPriceRouter);

  // Compras y stock
  app.use(`${API_PREFIX}/purchases`, purchaseRouter);
  app.use(`${API_PREFIX}/goods-receipts`, goodsReceiptRouter);
  app.use(`${API_PREFIX}/inventory`, inventoryRouter);

  // Caja y ventas
  app.use(`${API_PREFIX}/cash-shifts`, cashShiftRouter);
  app.use(`${API_PREFIX}/sales`, saleRouter);
  app.use(`${API_PREFIX}/sales`, invoiceRouter);
  app.use(`${API_PREFIX}/cash-expenses`, cashExpenseRouter);
  app.use(`${API_PREFIX}/sale-returns`, saleReturnRouter);

  // AFIP
  app.use(`${API_PREFIX}/afip`, afipSettingsRouter);

  // Proveedores — finanzas
  app.use(`${API_PREFIX}/accounts-payable`, accountsPayableRouter);
  app.use(`${API_PREFIX}/supplier-payments`, supplierPaymentRouter);

  // Reportes
  app.use(`${API_PREFIX}/reports`, reportsRouter);
}
