import { Request } from 'express';
import { prisma } from '../../config/database';
import { TenancyContext } from './TenancyContext';
import { AppError } from '../errors/AppError';
import { TenantStatus } from '@prisma/client';

/**
 * Resuelve el tenant a partir de distintas fuentes del request.
 *
 * Orden de prioridad:
 * 1. req.user.tenantId (JWT ya validado por authMiddleware)
 * 2. X-Tenant-Slug header (para rutas públicas como login)
 * 3. Subdominio del Host header (para entornos multi-tenant web)
 */
export async function resolveTenantFromRequest(
  req: Request,
): Promise<TenancyContext> {
  // 1. Desde JWT (ruta principal para endpoints protegidos)
  if (req.user?.tenantId) {
    return resolveTenantById(req.user.tenantId);
  }

  // 2. Desde header X-Tenant-Slug (útil en login o requests de API sin JWT)
  const slugFromHeader = req.headers['x-tenant-slug'];
  if (typeof slugFromHeader === 'string' && slugFromHeader.trim()) {
    return resolveTenantBySlug(slugFromHeader.trim());
  }

  // 3. Desde subdominio del Host (ej: acme.myapp.com)
  const host = req.hostname ?? '';
  const subdomainSlug = extractSubdomain(host);
  if (subdomainSlug) {
    return resolveTenantBySlug(subdomainSlug);
  }

  throw AppError.unauthorized('No se pudo determinar el tenant de la request');
}

export async function resolveTenantById(tenantId: string): Promise<TenancyContext> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true, name: true, status: true },
  });

  if (!tenant) {
    throw AppError.tenantNotFound();
  }

  if (tenant.status !== TenantStatus.ACTIVE) {
    throw AppError.tenantInactive();
  }

  return { tenantId: tenant.id, tenantSlug: tenant.slug, tenantName: tenant.name };
}

export async function resolveTenantBySlug(slug: string): Promise<TenancyContext> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, status: true },
  });

  if (!tenant) {
    throw AppError.tenantNotFound();
  }

  if (tenant.status !== TenantStatus.ACTIVE) {
    throw AppError.tenantInactive();
  }

  return { tenantId: tenant.id, tenantSlug: tenant.slug, tenantName: tenant.name };
}

/**
 * Extrae el subdominio de un hostname.
 * "acme.myapp.com" → "acme"
 * "localhost" → null
 * "myapp.com" → null (sin subdominio)
 */
function extractSubdomain(host: string): string | null {
  // Eliminar puerto si existe
  const hostname = host.split(':')[0];
  const parts = hostname.split('.');

  // Necesitamos al menos 3 partes: sub.domain.tld
  if (parts.length < 3) return null;

  const subdomain = parts[0];

  // Ignorar subdominios comunes que no son tenants
  const reservedSubdomains = ['www', 'api', 'app', 'admin'];
  if (reservedSubdomains.includes(subdomain)) return null;

  return subdomain;
}
