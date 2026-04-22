import { prisma } from '../../config/database';
import { UserStatus } from '@prisma/client';
import { BCRYPT_ROUNDS } from '../../shared/constants';
import bcrypt from 'bcryptjs';
import { CreateUserDto, UpdateUserDto, UserDetailDto, UserListItemDto } from './user.dto';
import { AppError } from '../../core/errors/AppError';

export const UserRepository = {
  async findAll(
    tenantId: string,
    opts: { skip: number; take: number; search?: string },
  ): Promise<{ users: UserListItemDto[]; total: number }> {
    const where = {
      tenantId,
      deletedAt: null,
      ...(opts.search
        ? {
            OR: [
              { firstName: { contains: opts.search, mode: 'insensitive' as const } },
              { lastName: { contains: opts.search, mode: 'insensitive' as const } },
              { email: { contains: opts.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: opts.skip,
        take: opts.take,
        orderBy: { firstName: 'asc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          status: true,
          createdAt: true,
          userRoles: {
            select: { role: { select: { name: true } } },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      total,
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        status: u.status,
        roles: u.userRoles.map((ur) => ur.role.name),
        createdAt: u.createdAt,
      })),
    };
  },

  async findById(tenantId: string, userId: string): Promise<UserDetailDto | null> {
    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        tenantId: true,
        createdAt: true,
        userRoles: {
          select: { role: { select: { name: true } } },
        },
      },
    });

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      tenantId: user.tenantId,
      roles: user.userRoles.map((ur) => ur.role.name),
      createdAt: user.createdAt,
    };
  },

  async create(tenantId: string, dto: CreateUserDto): Promise<UserDetailDto> {
    // Verificar que no exista otro usuario con el mismo email en este tenant
    const existing = await prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email: dto.email.toLowerCase() } },
    });
    if (existing) {
      throw AppError.alreadyExists('Un usuario con ese email');
    }

    // Verificar que los roles pertenezcan al tenant
    const roles = await prisma.role.findMany({
      where: { id: { in: dto.roleIds }, tenantId },
    });
    if (roles.length !== dto.roleIds.length) {
      throw AppError.validation('Uno o más roles no son válidos para este tenant');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        tenantId,
        email: dto.email.toLowerCase().trim(),
        passwordHash,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        status: UserStatus.ACTIVE,
        userRoles: {
          create: dto.roleIds.map((roleId) => ({ roleId })),
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        tenantId: true,
        createdAt: true,
        userRoles: { select: { role: { select: { name: true } } } },
      },
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      tenantId: user.tenantId,
      roles: user.userRoles.map((ur) => ur.role.name),
      createdAt: user.createdAt,
    };
  },

  async update(tenantId: string, userId: string, dto: UpdateUserDto): Promise<UserDetailDto> {
    const existing = await prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Usuario');

    // Si se actualizan roles, validarlos primero
    if (dto.roleIds !== undefined) {
      const roles = await prisma.role.findMany({
        where: { id: { in: dto.roleIds }, tenantId },
      });
      if (roles.length !== dto.roleIds.length) {
        throw AppError.validation('Uno o más roles no son válidos para este tenant');
      }
    }

    const user = await prisma.$transaction(async (tx) => {
      if (dto.roleIds !== undefined) {
        await tx.userRole.deleteMany({ where: { userId } });
        if (dto.roleIds.length > 0) {
          await tx.userRole.createMany({
            data: dto.roleIds.map((roleId) => ({ userId, roleId })),
          });
        }
      }

      return tx.user.update({
        where: { id: userId },
        data: {
          ...(dto.firstName && { firstName: dto.firstName.trim() }),
          ...(dto.lastName && { lastName: dto.lastName.trim() }),
          ...(dto.status && { status: dto.status }),
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          status: true,
          tenantId: true,
          createdAt: true,
          userRoles: { select: { role: { select: { name: true } } } },
        },
      });
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      tenantId: user.tenantId,
      roles: user.userRoles.map((ur) => ur.role.name),
      createdAt: user.createdAt,
    };
  },

  async softDelete(tenantId: string, userId: string): Promise<void> {
    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
    });
    if (!user) throw AppError.notFound('Usuario');

    await prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date(), status: UserStatus.INACTIVE },
    });
  },
};
