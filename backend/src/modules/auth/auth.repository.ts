import { prisma } from '../../config/database';
import { UserStatus } from '@prisma/client';

export interface UserWithRolesAndPermissions {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  status: UserStatus;
  tenantId: string;
  tenant: { id: string; name: string; slug: string };
  roles: string[];
  permissions: string[];
}

/**
 * Repositorio de Auth — solo consultas relacionadas con autenticación.
 * Mantenido separado del UserRepository para single responsibility.
 */
export const AuthRepository = {
  async findUserByEmailAndTenant(
    email: string,
    tenantId: string,
  ): Promise<UserWithRolesAndPermissions | null> {
    const user = await prisma.user.findUnique({
      where: {
        tenantId_email: { tenantId, email },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        passwordHash: true,
        status: true,
        tenantId: true,
        tenant: {
          select: { id: true, name: true, slug: true },
        },
        userRoles: {
          select: {
            role: {
              select: {
                name: true,
                rolePermissions: {
                  select: {
                    permission: { select: { code: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) return null;

    const roles = user.userRoles.map((ur) => ur.role.name);
    const permissions = [
      ...new Set(
        user.userRoles.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) => rp.permission.code),
        ),
      ),
    ];

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      passwordHash: user.passwordHash,
      status: user.status,
      tenantId: user.tenantId,
      tenant: user.tenant,
      roles,
      permissions,
    };
  },

  async findUserById(userId: string): Promise<UserWithRolesAndPermissions | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        passwordHash: true,
        status: true,
        tenantId: true,
        tenant: {
          select: { id: true, name: true, slug: true },
        },
        userRoles: {
          select: {
            role: {
              select: {
                name: true,
                rolePermissions: {
                  select: {
                    permission: { select: { code: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) return null;

    const roles = user.userRoles.map((ur) => ur.role.name);
    const permissions = [
      ...new Set(
        user.userRoles.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) => rp.permission.code),
        ),
      ),
    ];

    return { ...user, roles, permissions };
  },

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  },
};
