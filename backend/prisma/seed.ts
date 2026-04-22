import { PrismaClient, TenantStatus, UserStatus, ProductCodeType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed...');

  // --- Tenant piloto ---
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Mi Negocio Demo',
      slug: 'demo',
      status: TenantStatus.ACTIVE,
      settings: {},
    },
  });
  console.log(`✅ Tenant: ${tenant.name} (${tenant.slug})`);

  // --- Permisos del sistema ---
  const permissionDefs = [
    { code: 'users:read',              module: 'users',             description: 'Ver usuarios' },
    { code: 'users:write',             module: 'users',             description: 'Crear y editar usuarios' },
    { code: 'users:delete',            module: 'users',             description: 'Eliminar usuarios' },
    { code: 'roles:read',              module: 'roles',             description: 'Ver roles' },
    { code: 'roles:write',             module: 'roles',             description: 'Crear y editar roles' },
    { code: 'suppliers:read',          module: 'suppliers',         description: 'Ver proveedores' },
    { code: 'suppliers:write',         module: 'suppliers',         description: 'Crear y editar proveedores' },
    { code: 'products:read',           module: 'products',          description: 'Ver productos' },
    { code: 'products:write',          module: 'products',          description: 'Crear y editar productos' },
    { code: 'purchases:read',          module: 'purchases',         description: 'Ver compras' },
    { code: 'purchases:write',         module: 'purchases',         description: 'Crear y editar compras' },
    { code: 'inventory:read',          module: 'inventory',         description: 'Ver inventario' },
    { code: 'inventory:adjust',        module: 'inventory',         description: 'Ajustar stock manualmente' },
    { code: 'cash-shifts:open',        module: 'cash-shifts',       description: 'Abrir turno de caja' },
    { code: 'cash-shifts:close',       module: 'cash-shifts',       description: 'Cerrar turno de caja' },
    { code: 'cash-shifts:read',        module: 'cash-shifts',       description: 'Ver turnos de caja' },
    { code: 'sales:create',            module: 'sales',             description: 'Crear ventas' },
    { code: 'sales:read',              module: 'sales',             description: 'Ver ventas' },
    { code: 'sales:cancel',            module: 'sales',             description: 'Cancelar ventas' },
    { code: 'cash-expenses:write',     module: 'cash-expenses',     description: 'Registrar gastos de caja' },
    { code: 'accounts-payable:read',   module: 'accounts-payable',  description: 'Ver cuentas por pagar' },
    { code: 'supplier-payments:write', module: 'supplier-payments', description: 'Registrar pagos a proveedores' },
    { code: 'sale-returns:write',      module: 'sale-returns',      description: 'Registrar devoluciones' },
    { code: 'reports:view',            module: 'reports',           description: 'Ver reportes' },
    { code: 'tenant:settings',         module: 'tenant',            description: 'Configurar el negocio' },
  ];

  for (const perm of permissionDefs) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: { description: perm.description, module: perm.module },
      create: perm,
    });
  }
  console.log(`✅ ${permissionDefs.length} permisos del sistema`);

  const allPermissions = await prisma.permission.findMany();

  // --- Rol ADMIN (sistema, no editable) ---
  const adminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Administrador' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Administrador',
      description: 'Acceso completo al sistema',
      isSystem: true,
    },
  });

  // Asignar todos los permisos al rol admin
  for (const perm of allPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: perm.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: perm.id },
    });
  }
  console.log(`✅ Rol: ${adminRole.name}`);

  // --- Rol CAJERO ---
  const cashierRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Cajero' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Cajero',
      description: 'Operación de caja y ventas',
      isSystem: true,
    },
  });

  const cashierPermCodes = [
    'products:read',
    'cash-shifts:open',
    'cash-shifts:close',
    'cash-shifts:read',
    'sales:create',
    'sales:read',
    'cash-expenses:write',
    'sale-returns:write',
  ];

  for (const code of cashierPermCodes) {
    const perm = allPermissions.find((p) => p.code === code);
    if (!perm) continue;
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: cashierRole.id, permissionId: perm.id } },
      update: {},
      create: { roleId: cashierRole.id, permissionId: perm.id },
    });
  }
  console.log(`✅ Rol: ${cashierRole.name}`);

  // --- Usuario administrador ---
  const adminPasswordHash = await bcrypt.hash('Admin1234!', 12);

  const adminUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@demo.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@demo.com',
      passwordHash: adminPasswordHash,
      firstName: 'Admin',
      lastName: 'Demo',
      status: UserStatus.ACTIVE,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: adminRole.id } },
    update: {},
    create: { userId: adminUser.id, roleId: adminRole.id },
  });
  console.log(`✅ Usuario admin: ${adminUser.email} / Admin1234!`);

  // --- Métodos de pago por defecto ---
  const paymentMethods = [
    { code: 'CASH',      name: 'Contado',    sortOrder: 1 },
    { code: 'CARD',      name: 'Tarjeta',    sortOrder: 2 },
    { code: 'WHOLESALE', name: 'Mayorista',  sortOrder: 3 },
    { code: 'TRANSFER',  name: 'Transferencia', sortOrder: 4 },
  ];

  for (const pm of paymentMethods) {
    await prisma.paymentMethod.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: pm.code } },
      update: {},
      create: { tenantId: tenant.id, ...pm },
    });
  }
  console.log(`✅ ${paymentMethods.length} métodos de pago`);

  // --- Proveedor genérico ---
  await prisma.supplier.upsert({
    where: {
      id: `generic-supplier-${tenant.id}`,
    },
    update: {},
    create: {
      id: `generic-supplier-${tenant.id}`,
      tenantId: tenant.id,
      name: 'Proveedor Genérico',
      isGeneric: true,
      notes: 'Proveedor por defecto para compras sin proveedor identificado',
    },
  });
  console.log(`✅ Proveedor genérico`);

  // --- Secuencias correlativos ---
  await prisma.tenantSequence.upsert({
    where: { tenantId_entity: { tenantId: tenant.id, entity: 'PRODUCT_CODE' } },
    update: {},
    create: { tenantId: tenant.id, entity: 'PRODUCT_CODE', lastValue: 0 },
  });

  await prisma.tenantSequence.upsert({
    where: { tenantId_entity: { tenantId: tenant.id, entity: 'SALE_NUMBER' } },
    update: {},
    create: { tenantId: tenant.id, entity: 'SALE_NUMBER', lastValue: 0 },
  });
  console.log(`✅ Secuencias inicializadas`);

  console.log('\n🎉 Seed completado exitosamente.');
  console.log('   Tenant slug: demo');
  console.log('   Login: admin@demo.com / Admin1234!');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
