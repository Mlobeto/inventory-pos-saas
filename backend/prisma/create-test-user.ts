/// <reference types="node" />
/**
 * Crea usuarios de prueba en la base LOCAL.
 * Uso: npm run db:test-user
 *
 * No afecta producción: solo corre contra DATABASE_URL de tu .env local.
 */
import { PrismaClient, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const TENANT_SLUG = process.env.TEST_TENANT_SLUG ?? 'demo';

const TEST_USERS = [
  {
    email: 'cajero@test.local',
    password: 'Cajero1234!',
    firstName: 'Cajero',
    lastName: 'Prueba',
    roleName: 'Cajero',
  },
  {
    email: 'admin@test.local',
    password: 'Admin1234!',
    firstName: 'Admin',
    lastName: 'Prueba',
    roleName: 'Administrador',
  },
] as const;

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) {
    throw new Error(`No existe el tenant "${TENANT_SLUG}". Corré primero: npm run db:seed`);
  }

  console.log(`📦 Tenant: ${tenant.name} (${tenant.slug})\n`);

  for (const spec of TEST_USERS) {
    const role = await prisma.role.findFirst({
      where: { tenantId: tenant.id, name: spec.roleName },
    });
    if (!role) {
      throw new Error(`Rol "${spec.roleName}" no encontrado. Corré: npm run db:seed`);
    }

    const passwordHash = await bcrypt.hash(spec.password, 12);

    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: spec.email } },
      update: {
        passwordHash,
        firstName: spec.firstName,
        lastName: spec.lastName,
        status: UserStatus.ACTIVE,
      },
      create: {
        tenantId: tenant.id,
        email: spec.email,
        passwordHash,
        firstName: spec.firstName,
        lastName: spec.lastName,
        status: UserStatus.ACTIVE,
      },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });

    console.log(`✅ ${spec.roleName}: ${spec.email} / ${spec.password}`);
  }

  console.log('\n🔐 Login en local (frontend http://localhost:5173):');
  console.log('   Tenant slug (hardcoded en dev): demo');
  console.log('\n   Para gastos y devoluciones usá el Cajero:');
  console.log('   cajero@test.local / Cajero1234!');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
