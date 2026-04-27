import { Router } from 'express';
import { authMiddleware, requirePermission } from '../../core/middleware/auth.middleware';
import { tenancyMiddleware } from '../../core/tenancy/tenancy.middleware';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { prisma } from '../../config/database';
import { successResponse } from '../../core/utils/response';
import { AppError } from '../../core/errors/AppError';
import {
  createAfipInvoice,
  getInvoiceWithDetails,
  getTenantAfipSettings,
  generateCsrForTenant,
} from './afip.service';

// ─── Sales invoice routes — mounted under /api/sales ─────────────────────────
export const invoiceRouter = Router();
invoiceRouter.use(authMiddleware, tenancyMiddleware);

/**
 * POST /api/sales/:id/invoice
 * Emite el comprobante electrónico a AFIP para una venta completada.
 */
invoiceRouter.post(
  '/:id/invoice',
  requirePermission('sales:create'),
  asyncHandler(async (req, res) => {
    const invoice = await createAfipInvoice(req.tenantId, req.params.id);
    res.status(201).json(successResponse(invoice));
  }),
);

/**
 * GET /api/sales/:id/invoice
 * Devuelve el comprobante de una venta (con datos completos para imprimir).
 */
invoiceRouter.get(
  '/:id/invoice',
  requirePermission('sales:read'),
  asyncHandler(async (req, res) => {
    const invoice = await getInvoiceWithDetails(req.tenantId, req.params.id);
    if (!invoice) throw AppError.notFound('Comprobante');
    res.json(successResponse(invoice));
  }),
);

// ─── AFIP settings routes — mounted under /api/afip ──────────────────────────
export const afipSettingsRouter = Router();
afipSettingsRouter.use(authMiddleware, tenancyMiddleware);

/**
 * GET /api/afip/settings
 * Devuelve la configuración AFIP del tenant (sin exponer cert/key completos).
 */
afipSettingsRouter.get(
  '/settings',
  requirePermission('sales:read'),
  asyncHandler(async (req, res) => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId },
      select: { settings: true },
    });

    const afip = ((tenant?.settings as Record<string, unknown> | null)?.afip ??
      {}) as Record<string, unknown>;

    res.json(
      successResponse({
        cuit: (afip.cuit as string) ?? '',
        businessName: (afip.businessName as string) ?? '',
        address: (afip.address as string) ?? '',
        city: (afip.city as string) ?? '',
        pointOfSale: Number(afip.pointOfSale ?? 1),
        production: Boolean(afip.production ?? false),
        hasCert: Boolean(afip.cert),
        hasKey: Boolean(afip.key),
        csr: (afip.csr as string) ?? null,
      }),
    );
  }),
);

/**
 * PUT /api/afip/settings
 * Actualiza la configuración AFIP del tenant.
 * Sólo los campos enviados se actualizan; los no enviados se conservan.
 */
afipSettingsRouter.put(
  '/settings',
  requirePermission('sales:create'),
  asyncHandler(async (req, res) => {
    const { cuit, cert, key, pointOfSale, production, businessName, address, city } =
      req.body as {
        cuit?: string;
        cert?: string;
        key?: string;
        pointOfSale?: number;
        production?: boolean;
        businessName?: string;
        address?: string;
        city?: string;
      };

    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId },
      select: { settings: true },
    });

    const currentSettings = (tenant?.settings as Record<string, unknown> | null) ?? {};
    const currentAfip = (currentSettings.afip as Record<string, unknown>) ?? {};

    const updatedAfip: Record<string, unknown> = {
      ...currentAfip, // Keep all existing fields (key, csr, etc.)
      cuit: cuit !== undefined ? String(cuit) : currentAfip.cuit,
      businessName: businessName !== undefined ? String(businessName) : currentAfip.businessName,
      address: address !== undefined ? String(address) : currentAfip.address,
      city: city !== undefined ? String(city) : currentAfip.city,
      pointOfSale:
        pointOfSale !== undefined ? Number(pointOfSale) : Number(currentAfip.pointOfSale ?? 1),
      production: production !== undefined ? Boolean(production) : Boolean(currentAfip.production ?? false),
      // Only overwrite cert/key if explicitly provided
      cert: cert !== undefined ? (cert || null) : currentAfip.cert,
      key: key !== undefined ? (key || null) : currentAfip.key,
    };

    await prisma.tenant.update({
      where: { id: req.tenantId },
      data: {
        settings: { ...currentSettings, afip: updatedAfip } as import('@prisma/client').Prisma.InputJsonValue,
      },
    });

    res.json(
      successResponse({
        cuit: (updatedAfip.cuit as string) ?? '',
        businessName: (updatedAfip.businessName as string) ?? '',
        address: (updatedAfip.address as string) ?? '',
        city: (updatedAfip.city as string) ?? '',
        pointOfSale: Number(updatedAfip.pointOfSale),
        production: Boolean(updatedAfip.production),
        hasCert: Boolean(updatedAfip.cert),
        hasKey: Boolean(updatedAfip.key),
        message: 'Configuración AFIP guardada.',
      }),
    );
  }),
);

/**
 * POST /api/afip/generate-csr
 * Genera un par de claves RSA 2048-bit y un CSR para el tenant.
 * La clave privada queda guardada en la base de datos.
 * Se devuelve el CSR en PEM para que el usuario lo suba a AFIP.
 */
afipSettingsRouter.post(
  '/generate-csr',
  requirePermission('sales:create'),
  asyncHandler(async (req, res) => {
    const { cuit, businessName } = req.body as { cuit: string; businessName?: string };

    if (!cuit || !/^\d{11}$/.test(cuit.trim())) {
      throw AppError.validation('El CUIT debe tener exactamente 11 dígitos.');
    }

    const { csr } = await generateCsrForTenant(
      req.tenantId,
      cuit.trim(),
      (businessName ?? '').trim(),
    );

    res.json(successResponse({ csr, message: 'CSR generado. Guardá el contenido y subilo a AFIP.' }));
  }),
);

/**
 * GET /api/afip/status
 * Verifica la conexión con los servidores de AFIP (útil para diagnosticar problemas).
 */
afipSettingsRouter.get(
  '/status',
  requirePermission('sales:read'),
  asyncHandler(async (req, res) => {
    const settings = await getTenantAfipSettings(req.tenantId);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Afip = require('@afipsdk/afip.js');
    const path = require('path');
    const fs = require('fs');

    const storageDir = path.join(process.cwd(), 'storage', 'afip', settings.cuit);
    fs.mkdirSync(storageDir, { recursive: true });

    const config: Record<string, unknown> = {
      CUIT: parseInt(settings.cuit, 10),
      production: settings.production,
      res_folder: storageDir,
      ta_folder: storageDir,
    };
    if (settings.cert) config.cert = settings.cert;
    if (settings.key) config.key = settings.key;

    const afip = new Afip(config);
    const serverStatus = await afip.ElectronicBilling.getServerStatus();

    res.json(
      successResponse({
        mode: settings.production ? 'producción' : 'homologación',
        cuit: settings.cuit,
        pointOfSale: settings.pointOfSale,
        server: serverStatus,
      }),
    );
  }),
);
