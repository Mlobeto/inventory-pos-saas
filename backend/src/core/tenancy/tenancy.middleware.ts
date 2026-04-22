import { Request, Response, NextFunction } from 'express';
import { resolveTenantFromRequest } from './tenancy.resolver';

/**
 * tenancyMiddleware
 *
 * Resuelve el tenant actual para cada request y lo adjunta a req.tenantId.
 *
 * DEBE ejecutarse después de authMiddleware en rutas protegidas,
 * para que req.user esté disponible con el tenantId del JWT.
 *
 * Para rutas públicas (ej: login), puede ejecutarse sin authMiddleware
 * resolviendo el tenant desde el header X-Tenant-Slug o subdominio.
 *
 * Garantías:
 * - Si el tenant no existe → 404 TENANT_NOT_FOUND
 * - Si el tenant está inactivo → 403 TENANT_INACTIVE
 * - Si no se puede determinar el tenant → 401 UNAUTHORIZED
 * - Si pasa correctamente → req.tenantId está disponible garantizadamente
 */
export function tenancyMiddleware(req: Request, _res: Response, next: NextFunction): void {
  resolveTenantFromRequest(req)
    .then((ctx) => {
      req.tenantId = ctx.tenantId;
      next();
    })
    .catch(next);
}

/**
 * Versión del middleware para rutas que PUEDEN tener o no tenant.
 * Si no puede resolverse, simplemente no adjunta tenantId (no lanza error).
 * Usar solo en rutas de health check o públicas absolutas.
 */
export function optionalTenancyMiddleware(req: Request, _res: Response, next: NextFunction): void {
  resolveTenantFromRequest(req)
    .then((ctx) => {
      req.tenantId = ctx.tenantId;
      next();
    })
    .catch(() => {
      // En rutas opcionales, continuamos sin tenantId
      next();
    });
}
