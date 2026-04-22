import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../../config/jwt';
import { AppError } from '../errors/AppError';

/**
 * Valida el JWT de acceso y adjunta `req.user` a la request.
 * El tenantId queda disponible en req.user.tenantId y se propaga
 * al middleware de tenancy que corre después.
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw AppError.unauthorized('Token de autenticación requerido');
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (err) {
    const error = err as Error;
    if (error.name === 'TokenExpiredError') {
      throw AppError.unauthorized('El token ha expirado');
    }
    throw AppError.unauthorized('Token inválido');
  }
}

/**
 * Verifica que el usuario tenga al menos uno de los permisos requeridos.
 * Debe usarse después de authMiddleware.
 */
export function requirePermission(...permissionCodes: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw AppError.unauthorized();
    }

    const hasPermission = permissionCodes.some((code) =>
      req.user!.permissions.includes(code),
    );

    if (!hasPermission) {
      throw AppError.forbidden(
        `Permiso requerido: ${permissionCodes.join(' o ')}`,
      );
    }

    next();
  };
}
