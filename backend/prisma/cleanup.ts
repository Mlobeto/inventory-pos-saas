/**
 * cleanup.ts — Borra todos los datos de prueba de producción.
 * Mantiene: Tenant, Permission, Role, RolePermission, PaymentMethod, TenantSequence.
 * Elimina: usuarios demo, clientes, productos, ventas, compras, proveedores (no genérico), etc.
 *
 * Uso: npx ts-node prisma/cleanup.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Iniciando limpieza de datos de prueba...\n');

  // 1. AFIP
  const afip = await prisma.afipInvoice.deleteMany({});
  console.log(`🗑  AfipInvoice:          ${afip.count}`);

  // 2. Pagos de clientes (CustomerPayment)
  const custPay = await prisma.customerPayment.deleteMany({});
  console.log(`🗑  CustomerPayment:       ${custPay.count}`);

  // 3. Cuentas corrientes clientes (CustomerReceivable)
  const custRec = await prisma.customerReceivable.deleteMany({});
  console.log(`🗑  CustomerReceivable:    ${custRec.count}`);

  // 4. Items de devoluciones
  const retItems = await prisma.saleReturnDetail.deleteMany({});
  console.log(`🗑  SaleReturnDetail:      ${retItems.count}`);

  // 5. Devoluciones
  const returns = await prisma.saleReturn.deleteMany({});
  console.log(`🗑  SaleReturn:            ${returns.count}`);

  // 6. Gastos de caja
  const expenses = await prisma.cashExpense.deleteMany({});
  console.log(`🗑  CashExpense:           ${expenses.count}`);

  // 7. Pagos a proveedores
  const supPay = await prisma.supplierPayment.deleteMany({});
  console.log(`🗑  SupplierPayment:       ${supPay.count}`);

  // 8. Cuentas por pagar
  const ap = await prisma.accountsPayable.deleteMany({});
  console.log(`🗑  AccountsPayable:       ${ap.count}`);

  // 9. Items de ventas
  const saleItems = await prisma.saleDetail.deleteMany({});
  console.log(`🗑  SaleDetail:            ${saleItems.count}`);

  // 10. Pagos de ventas (SalePayment)
  const salePayments = await prisma.salePayment.deleteMany({});
  console.log(`🗑  SalePayment:           ${salePayments.count}`);

  // 11. Ventas
  const sales = await prisma.sale.deleteMany({});
  console.log(`🗑  Sale:                  ${sales.count}`);

  // 12. Turnos de caja
  const shifts = await prisma.cashShift.deleteMany({});
  console.log(`🗑  CashShift:             ${shifts.count}`);

  // 13. Movimientos de stock
  const movements = await prisma.stockMovement.deleteMany({});
  console.log(`🗑  StockMovement:         ${movements.count}`);

  // 14. Items de remitos
  const grItems = await prisma.goodsReceiptDetail.deleteMany({});
  console.log(`🗑  GoodsReceiptDetail:    ${grItems.count}`);

  // 15. Remitos
  const receipts = await prisma.goodsReceipt.deleteMany({});
  console.log(`🗑  GoodsReceipt:          ${receipts.count}`);

  // 16. Items de compras
  const purchItems = await prisma.purchaseDetail.deleteMany({});
  console.log(`🗑  PurchaseDetail:        ${purchItems.count}`);

  // 17. Compras
  const purchases = await prisma.purchase.deleteMany({});
  console.log(`🗑  Purchase:              ${purchases.count}`);

  // 18. Clientes
  const customers = await prisma.customer.deleteMany({});
  console.log(`🗑  Customer:              ${customers.count}`);

  // 19. Precios de productos
  const prices = await prisma.productPrice.deleteMany({});
  console.log(`🗑  ProductPrice:          ${prices.count}`);

  // 20. Códigos de productos
  const codes = await prisma.productCode.deleteMany({});
  console.log(`🗑  ProductCode:           ${codes.count}`);

  // 21. Productos
  const products = await prisma.product.deleteMany({});
  console.log(`🗑  Product:               ${products.count}`);

  // 22. Proveedores (excepto el genérico)
  const suppliers = await prisma.supplier.deleteMany({
    where: { isGeneric: false },
  });
  console.log(`🗑  Supplier (no genérico): ${suppliers.count}`);

  // 23. Usuarios demo (admin@demo.com, cajero@demo.com) si existen
  const demoUsers = await prisma.user.findMany({
    where: { email: { in: ['admin@demo.com', 'cajero@demo.com'] } },
  });
  for (const u of demoUsers) {
    await prisma.userRole.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
  }
  console.log(`🗑  Usuarios demo:         ${demoUsers.length}`);

  // 24. Resetear secuencias a 0
  await prisma.tenantSequence.updateMany({
    data: { lastValue: 0 },
  });
  console.log(`🔄  TenantSequence reseteadas a 0`);

  console.log('\n✅ Limpieza completada. La base quedó con estructura base lista para seed.');
}

main()
  .catch((e) => {
    console.error('❌ Error en cleanup:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
