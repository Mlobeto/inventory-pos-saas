import { Router } from 'express';
import { AuthController } from './auth.controller';
import { authMiddleware } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { loginSchema, refreshTokenSchema, changePasswordSchema } from './auth.schema';

export const authRouter = Router();

// POST /api/auth/login
authRouter.post(
  '/login',
  validate(loginSchema),
  asyncHandler(AuthController.login),
);

// POST /api/auth/refresh
authRouter.post(
  '/refresh',
  validate(refreshTokenSchema),
  asyncHandler(AuthController.refreshToken),
);

// GET /api/auth/me  — requiere auth
authRouter.get(
  '/me',
  authMiddleware,
  asyncHandler(AuthController.getMe),
);

// PATCH /api/auth/change-password  — requiere auth
authRouter.patch(
  '/change-password',
  authMiddleware,
  validate(changePasswordSchema),
  asyncHandler(AuthController.changePassword),
);

// POST /api/auth/logout  — requiere auth
authRouter.post(
  '/logout',
  authMiddleware,
  asyncHandler(AuthController.logout),
);
