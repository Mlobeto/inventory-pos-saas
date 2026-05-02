import { Router } from 'express';
import { UserController } from './user.controller';
import { authMiddleware, requirePermission } from '../../core/middleware/auth.middleware';
import { tenancyMiddleware } from '../../core/tenancy/tenancy.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { createUserSchema, updateUserSchema, changePasswordSchema } from './user.schema';

export const userRouter = Router();

// Todas las rutas de usuarios requieren auth + tenancy
userRouter.use(authMiddleware, tenancyMiddleware);

// GET /api/users
userRouter.get(
  '/',
  requirePermission('users:read'),
  asyncHandler(UserController.list),
);

// GET /api/users/:id
userRouter.get(
  '/:id',
  requirePermission('users:read'),
  asyncHandler(UserController.getById),
);

// POST /api/users
userRouter.post(
  '/',
  requirePermission('users:write'),
  validate(createUserSchema),
  asyncHandler(UserController.create),
);

// PATCH /api/users/:id
userRouter.patch(
  '/:id',
  requirePermission('users:write'),
  validate(updateUserSchema),
  asyncHandler(UserController.update),
);

// DELETE /api/users/:id
userRouter.delete(
  '/:id',
  requirePermission('users:delete'),
  asyncHandler(UserController.delete),
);

// PATCH /api/users/:id/password
userRouter.patch(
  '/:id/password',
  requirePermission('users:write'),
  validate(changePasswordSchema),
  asyncHandler(UserController.changePassword),
);
