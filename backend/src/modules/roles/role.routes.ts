import { Router } from 'express';
import { authMiddleware, requirePermission } from '../../core/middleware/auth.middleware';
import { tenancyMiddleware } from '../../core/tenancy/tenancy.middleware';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { prisma } from '../../config/database';
import { successResponse, paginatedResponse } from '../../core/utils/response';
import { parsePagination, buildPaginationMeta } from '../../core/utils/pagination';
import { AppError } from '../../core/errors/AppError';

export const roleRouter = Router();

roleRouter.use(authMiddleware, tenancyMiddleware);

roleRouter.get(
  '/',
  requirePermission('roles:read'),
  asyncHandler(async (req, res) => {
    const pagination = parsePagination(req);
    const where = { tenantId: req.tenantId };
    const [roles, total] = await Promise.all([
      prisma.role.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        include: {
          rolePermissions: { include: { permission: { select: { code: true, module: true } } } },
          _count: { select: { userRoles: true } },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.role.count({ where }),
    ]);
    res.json(paginatedResponse(roles, buildPaginationMeta(total, pagination)));
  }),
);

roleRouter.get(
  '/:id',
  requirePermission('roles:read'),
  asyncHandler(async (req, res) => {
    const role = await prisma.role.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
      include: {
        rolePermissions: { include: { permission: true } },
        _count: { select: { userRoles: true } },
      },
    });
    if (!role) throw AppError.notFound('Rol');
    res.json(successResponse(role));
  }),
);

roleRouter.post(
  '/',
  requirePermission('roles:write'),
  asyncHandler(async (req, res) => {
    const { name, description, permissionCodes } = req.body as {
      name: string;
      description?: string;
      permissionCodes?: string[];
    };

    const existing = await prisma.role.findUnique({
      where: { tenantId_name: { tenantId: req.tenantId, name } },
    });
    if (existing) throw AppError.alreadyExists('Rol con ese nombre');

    let permissions: { id: string }[] = [];
    if (permissionCodes?.length) {
      permissions = await prisma.permission.findMany({
        where: { code: { in: permissionCodes } },
        select: { id: true },
      });
    }

    const role = await prisma.role.create({
      data: {
        tenantId: req.tenantId,
        name,
        description,
        rolePermissions: {
          create: permissions.map((p) => ({ permissionId: p.id })),
        },
      },
      include: { rolePermissions: { include: { permission: true } } },
    });

    res.status(201).json(successResponse(role, 'Rol creado'));
  }),
);

roleRouter.patch(
  '/:id',
  requirePermission('roles:write'),
  asyncHandler(async (req, res) => {
    const role = await prisma.role.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
    });
    if (!role) throw AppError.notFound('Rol');

    const { name, description, permissionCodes } = req.body as {
      name?: string;
      description?: string;
      permissionCodes?: string[];
    };

    const updated = await prisma.$transaction(async (tx) => {
      if (permissionCodes !== undefined) {
        await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
        if (permissionCodes.length > 0) {
          const perms = await tx.permission.findMany({
            where: { code: { in: permissionCodes } },
            select: { id: true },
          });
          await tx.rolePermission.createMany({
            data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
          });
        }
      }
      return tx.role.update({
        where: { id: role.id },
        data: { ...(name && { name }), ...(description !== undefined && { description }) },
        include: { rolePermissions: { include: { permission: true } } },
      });
    });

    res.json(successResponse(updated, 'Rol actualizado'));
  }),
);

// GET /api/permissions  (accesible desde roleRouter como /roles/permissions)
roleRouter.get('/permissions/all', asyncHandler(async (_req, res) => {
  const permissions = await prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { code: 'asc' }] });
  res.json(successResponse(permissions));
}));
