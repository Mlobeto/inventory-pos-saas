/// <reference types="node" />
/**
 * Resetea la contraseña de un usuario por email o nombre.
 *
 * Uso (producción — apuntar DATABASE_URL al entorno correcto):
 *   set USER_EMAIL=luciana@ejemplo.com
 *   set NEW_PASSWORD=Temporal1234!
 *   npm run db:reset-password
 *
 * O por nombre:
 *   set USER_QUERY=Luciana
 *   set NEW_PASSWORD=Temporal1234!
 *   npm run db:reset-password
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;

async function main() {
  const email = process.env.USER_EMAIL?.trim().toLowerCase();
  const query = process.env.USER_QUERY?.trim();
  const newPassword = process.env.NEW_PASSWORD?.trim();

  if (!newPassword || newPassword.length < 8) {
    throw new Error('Definí NEW_PASSWORD (mínimo 8 caracteres).');
  }

  if (!email && !query) {
    throw new Error('Definí USER_EMAIL o USER_QUERY (nombre/email a buscar).');
  }

  const users = email
    ? await prisma.user.findMany({
        where: { email },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          status: true,
          tenant: { select: { slug: true, name: true } },
        },
      })
    : await prisma.user.findMany({
        where: {
          OR: [
            { firstName: { contains: query!, mode: 'insensitive' } },
            { lastName: { contains: query!, mode: 'insensitive' } },
            { email: { contains: query!, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          status: true,
          tenant: { select: { slug: true, name: true } },
        },
      });

  if (users.length === 0) {
    throw new Error('No se encontró ningún usuario con esos criterios.');
  }

  if (users.length > 1) {
    console.log('Varios usuarios encontrados:');
    for (const u of users) {
      console.log(`  - ${u.firstName} ${u.lastName} <${u.email}> (${u.tenant.slug})`);
    }
    throw new Error('Especificá USER_EMAIL para desambiguar.');
  }

  const user = users[0];
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, status: 'ACTIVE' },
  });

  console.log('✅ Contraseña actualizada');
  console.log(`   Usuario: ${user.firstName} ${user.lastName}`);
  console.log(`   Email:   ${user.email}`);
  console.log(`   Tenant:  ${user.tenant.name} (slug: ${user.tenant.slug})`);
  console.log(`   Nueva contraseña: ${newPassword}`);
  console.log('\n   Pedile que cambie la contraseña después de ingresar.');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
