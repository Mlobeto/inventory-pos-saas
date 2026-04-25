import { Router } from 'express';
import { authMiddleware, requirePermission } from '../../core/middleware/auth.middleware';
import { tenancyMiddleware } from '../../core/tenancy/tenancy.middleware';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { prisma } from '../../config/database';
import { successResponse, paginatedResponse } from '../../core/utils/response';
import { parsePagination, buildPaginationMeta } from '../../core/utils/pagination';
import { AppError } from '../../core/errors/AppError';
import { CustomerType } from '@prisma/client';

export const customerRouter = Router();

customerRouter.use(authMiddleware, tenancyMiddleware);

// GET /api/customers
customerRouter.get(
  '/',
  requirePermission('customers:read'),
  asyncHandler(async (req, res) => {
    const pagination = parsePagination(req);
    const search = req.query.search as string | undefined;
    const type = req.query.type as CustomerType | undefined;

    const where = {
      tenantId: req.tenantId,
      deletedAt: null,
      ...(type && { type }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { taxId: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          type: true,
          name: true,
          taxId: true,
          email: true,
          phone: true,
          address: true,
          notes: true,
          creditLimit: true,
          isActive: true,
          createdAt: true,
        },
      }),
      prisma.customer.count({ where }),
    ]);

    res.json(paginatedResponse(customers, buildPaginationMeta(total, pagination)));
  }),
);

// GET /api/customers/:id
customerRouter.get(
  '/:id',
  requirePermission('customers:read'),
  asyncHandler(async (req, res) => {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId, deletedAt: null },
      include: {
        _count: { select: { sales: true } },
      },
    });
    if (!customer) throw AppError.notFound('Cliente');
    res.json(successResponse(customer));
  }),
);

// POST /api/customers
customerRouter.post(
  '/',
  requirePermission('customers:write'),
  asyncHandler(async (req, res) => {
    const { type, name, taxId, email, phone, address, notes, creditLimit } = req.body as {
      type: CustomerType;
      name: string;
      taxId?: string;
      email?: string;
      phone?: string;
      address?: string;
      notes?: string;
      creditLimit?: number;
    };

    if (!name) throw AppError.validation('El nombre es requerido');
    if (!type || !Object.values(CustomerType).includes(type)) {
      throw AppError.validation('Tipo de cliente inválido');
    }
    if (type === CustomerType.FACTURABLE && !taxId) {
      throw AppError.validation('El CUIT/DNI es requerido para clientes facturables');
    }

    const customer = await prisma.customer.create({
      data: {
        tenantId: req.tenantId,
        type,
        name,
        taxId,
        email,
        phone,
        address,
        notes,
        creditLimit: creditLimit != null ? creditLimit : undefined,
      },
    });

    res.status(201).json(successResponse(customer, 'Cliente creado'));
  }),
);

// PATCH /api/customers/:id
customerRouter.patch(
  '/:id',
  requirePermission('customers:write'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.customer.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Cliente');

    const { type, name, taxId, email, phone, address, notes, creditLimit, isActive } = req.body as {
      type?: CustomerType;
      name?: string;
      taxId?: string;
      email?: string;
      phone?: string;
      address?: string;
      notes?: string;
      creditLimit?: number | null;
      isActive?: boolean;
    };

    const resolvedType = type ?? existing.type;
    if (resolvedType === CustomerType.FACTURABLE && taxId === '') {
      throw AppError.validation('El CUIT/DNI es requerido para clientes facturables');
    }

    const updated = await prisma.customer.update({
      where: { id: req.params.id },
      data: {
        ...(type !== undefined && { type }),
        ...(name !== undefined && { name }),
        ...(taxId !== undefined && { taxId }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
        ...(address !== undefined && { address }),
        ...(notes !== undefined && { notes }),
        ...(creditLimit !== undefined && { creditLimit: creditLimit }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    res.json(successResponse(updated, 'Cliente actualizado'));
  }),
);

// DELETE /api/customers/:id (soft delete)
customerRouter.delete(
  '/:id',
  requirePermission('customers:write'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.customer.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Cliente');

    await prisma.customer.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });

    res.json(successResponse(null, 'Cliente eliminado'));
  }),
);
