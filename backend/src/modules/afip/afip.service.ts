/**
 * afip.service.ts
 * Servicio de integración con AFIP Web Services (WSAA + WSFE).
 *
 * Configuración por tenant (guardada en Tenant.settings.afip):
 *   cuit         {string}  CUIT del emisor (11 dígitos, sin guiones)
 *   cert         {string}  Certificado en formato PEM
 *   key          {string}  Clave privada en formato PEM
 *   pointOfSale  {number}  Número de punto de venta (ej: 1)
 *   production   {boolean} true = producción, false = homologación/testing
 *
 * Para obtener el certificado digital:
 *   1. Generar CSR: openssl req -new -newkey rsa:2048 -keyout key.pem -out csr.pem
 *   2. Subir el CSR en https://auth.afip.gob.ar/contribuyente/ → Administrar CUIT
 *   3. Descargar el certificado .crt y convertirlo a PEM
 *   4. Guardar cert y key en Configuración > AFIP
 */

import path from 'path';
import fs from 'fs';
import { generateKeyPair } from 'crypto';
import { promisify } from 'util';
import * as forge from 'node-forge';
import QRCode from 'qrcode';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';

const generateKeyPairAsync = promisify(generateKeyPair);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AfipSettings {
  cuit: string;
  cert?: string;
  key?: string;
  pointOfSale: number;
  production: boolean;
}

export interface AfipInvoiceResult {
  id: string;
  tenantId: string;
  saleId: string;
  invoiceType: number;
  pointOfSale: number;
  invoiceNumber: number;
  concept: number;
  invoiceDate: string;
  docType: number;
  docNumber: string;
  totalAmount: string;
  cae: string | null;
  caeExpiry: string | null;
  status: string;
  errorMessage: string | null;
  qrCode?: string; // base64 PNG del QR AFIP
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export async function getTenantAfipSettings(tenantId: string): Promise<AfipSettings> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });

  const settings = (tenant?.settings as Record<string, unknown> | null)?.afip as
    | Record<string, unknown>
    | undefined;

  if (!settings?.cuit) {
    throw AppError.validation(
      'AFIP no configurado. Ingresá el CUIT en Configuración > AFIP.',
    );
  }

  return {
    cuit: String(settings.cuit),
    cert: settings.cert ? String(settings.cert) : undefined,
    key: settings.key ? String(settings.key) : undefined,
    pointOfSale: Number(settings.pointOfSale ?? 1),
    production: Boolean(settings.production ?? false),
  };
}

// ─── CSR Generation ───────────────────────────────────────────────────────────

/**
 * Genera un par de claves RSA 2048-bit y un CSR (Certificate Signing Request)
 * para el tenant indicado. La clave privada se persiste en Tenant.settings.afip.key
 * y el CSR en .csr. El certificado anterior queda invalidado.
 */
export async function generateCsrForTenant(
  tenantId: string,
  cuit: string,
  businessName: string,
): Promise<{ csr: string }> {
  // Non-blocking key generation via Node.js native crypto (uses libuv thread pool)
  const { privateKey: privateKeyPem } = await generateKeyPairAsync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' }, // RSA PRIVATE KEY — compatible with AFIP
  });

  // Derive public key from private key and build the CSR using node-forge
  const privKey = forge.pki.privateKeyFromPem(privateKeyPem as string) as forge.pki.rsa.PrivateKey;
  const pubKey = forge.pki.rsa.setPublicKey(privKey.n, privKey.e);

  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = pubKey;
  csr.setSubject([
    { name: 'countryName', value: 'AR' },
    { name: 'organizationName', value: businessName || `CUIT ${cuit}` },
    { name: 'commonName', value: `CUIT ${cuit}` },
  ]);
  csr.sign(privKey, forge.md.sha256.create());

  const csrPem = forge.pki.certificationRequestToPem(csr);

  // Persist key + CSR (clear old cert since keys changed)
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  const currentSettings = (tenant?.settings as Record<string, unknown> | null) ?? {};
  const currentAfip = (currentSettings.afip as Record<string, unknown>) ?? {};

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      settings: {
        ...currentSettings,
        afip: {
          ...currentAfip,
          cuit,
          businessName,
          key: privateKeyPem as string,
          csr: csrPem,
          cert: null, // Old cert is invalid with new keys
        },
      },
    },
  });

  return { csr: csrPem };
}

function buildAfipClient(settings: AfipSettings) {
  // SDK uses CommonJS — import at runtime to avoid top-level errors
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Afip = require('@afipsdk/afip.js');

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

  return new Afip(config);
}

/**
 * Determina el tipo y número de documento del receptor.
 *  - 11 dígitos → CUIT (80)
 *  - 7-8 dígitos → DNI (96)
 *  - sin datos  → Consumidor Final (99, docNumber="0")
 */
function parseDocInfo(taxId?: string | null): { docType: number; docNumber: string } {
  if (!taxId) return { docType: 99, docNumber: '0' };
  const clean = taxId.replace(/[-.\s]/g, '');
  if (/^\d{11}$/.test(clean)) return { docType: 80, docNumber: clean };
  if (/^\d{7,8}$/.test(clean)) return { docType: 96, docNumber: clean };
  return { docType: 99, docNumber: '0' };
}

function toAfipDateInt(date: Date): number {
  return parseInt(date.toISOString().slice(0, 10).replace(/-/g, ''), 10);
}

/**
 * Genera el QR que exige AFIP en cada comprobante electrónico (RG 4291/2018).
 * El QR apunta a la verificación de comprobante en la página de AFIP.
 */
async function buildAfipQR(params: {
  cuit: string;
  date: Date;
  pointOfSale: number;
  invoiceType: number;
  invoiceNumber: number;
  totalAmount: number;
  docType: number;
  docNumber: string;
  cae: string;
}): Promise<string> {
  const dateStr = params.date.toISOString().slice(0, 10); // YYYY-MM-DD

  const qrPayload = {
    ver: 1,
    fecha: dateStr,
    cuit: parseInt(params.cuit, 10),
    ptoVta: params.pointOfSale,
    tipoCmp: params.invoiceType,
    nroCmp: params.invoiceNumber,
    importe: params.totalAmount,
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: params.docType,
    nroDocRec: parseInt(params.docNumber, 10) || 0,
    tipoCodAut: 'E',
    codAut: parseInt(params.cae, 10),
  };

  const encoded = Buffer.from(JSON.stringify(qrPayload)).toString('base64');
  const qrUrl = `https://www.afip.gob.ar/fe/qr/?p=${encoded}`;

  // Generate QR as base64 PNG (strip the "data:image/png;base64," prefix)
  const dataUrl = await QRCode.toDataURL(qrUrl, { width: 180, margin: 1 });
  return dataUrl.replace(/^data:image\/png;base64,/, '');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Crea un comprobante electrónico en AFIP para la venta indicada.
 * - Solo ventas COMPLETED sin comprobante previo.
 * - Monotributista → siempre Factura C (tipo 11).
 * - Guarda un registro AfipInvoice con el resultado (AUTHORIZED / ERROR).
 */
export async function createAfipInvoice(
  tenantId: string,
  saleId: string,
): Promise<AfipInvoiceResult> {
  // ── Obtener venta ──────────────────────────────────────────────────────────
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, tenantId },
    include: {
      customer: { select: { name: true, taxId: true, type: true } },
      afipInvoice: true,
    },
  });

  if (!sale) throw AppError.notFound('Venta');
  if (sale.status === 'CANCELLED')
    throw AppError.validation('No se puede facturar una venta anulada.');
  if (sale.afipInvoice)
    throw AppError.validation('Esta venta ya tiene comprobante electrónico.');

  // ── Configuración AFIP ─────────────────────────────────────────────────────
  const settings = await getTenantAfipSettings(tenantId);
  const { docType, docNumber } = parseDocInfo(sale.customer?.taxId);
  const totalAmount = parseFloat(sale.totalAmount.toString());
  const invoiceDateInt = toAfipDateInt(new Date(sale.createdAt));

  // ── Crear registro pendiente ────────────────────────────────────────────────
  const record = await prisma.afipInvoice.create({
    data: {
      tenantId,
      saleId,
      invoiceType: 11,
      pointOfSale: settings.pointOfSale,
      invoiceNumber: 0,
      concept: 1,
      invoiceDate: String(invoiceDateInt),
      docType,
      docNumber,
      totalAmount: sale.totalAmount,
      status: 'ERROR',
    },
  });

  // ── Llamar AFIP ────────────────────────────────────────────────────────────
  try {
    const afip = buildAfipClient(settings);

    const lastVoucher: number = await afip.ElectronicBilling.getLastVoucher(
      settings.pointOfSale,
      11,
    );
    const nextNumber = lastVoucher + 1;

    const voucherData = {
      CantReg: 1,
      PtoVta: settings.pointOfSale,
      CbteTipo: 11,
      Concepto: 1,
      DocTipo: docType,
      DocNro: parseInt(docNumber, 10) || 0,
      CbteDesde: nextNumber,
      CbteHasta: nextNumber,
      CbteFch: invoiceDateInt,
      ImpTotal: totalAmount,
      ImpTotConc: 0,
      ImpNeto: totalAmount,
      ImpOpEx: 0,
      ImpIVA: 0,
      ImpTrib: 0,
      MonId: 'PES',
      MonCotiz: 1,
    };

    const result = await afip.ElectronicBilling.createVoucher(voucherData);

    const updated = await prisma.afipInvoice.update({
      where: { id: record.id },
      data: {
        invoiceNumber: nextNumber,
        cae: result.CAE,
        caeExpiry: result.CAEFchVto,
        status: 'AUTHORIZED',
        observations: result.Observaciones ?? undefined,
        errorMessage: null,
      },
    });

    // Generar QR AFIP
    let qrCode: string | undefined;
    try {
      qrCode = await buildAfipQR({
        cuit: settings.cuit,
        date: new Date(sale.createdAt),
        pointOfSale: settings.pointOfSale,
        invoiceType: 11,
        invoiceNumber: nextNumber,
        totalAmount,
        docType,
        docNumber,
        cae: result.CAE,
      });
    } catch {
      // QR generation failure should not block the response
    }

    return { ...updated, totalAmount: updated.totalAmount.toString(), qrCode };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido al contactar AFIP';
    await prisma.afipInvoice.update({
      where: { id: record.id },
      data: { status: 'ERROR', errorMessage: message },
    });
    throw new Error(`Error AFIP: ${message}`);
  }
}

/**
 * Devuelve el comprobante completo de una venta, con todos los datos para imprimir.
 * También regenera el QR si el comprobante está autorizado.
 */
export async function getInvoiceWithDetails(tenantId: string, saleId: string) {
  const invoice = await prisma.afipInvoice.findFirst({
    where: { saleId, tenantId },
    include: {
      sale: {
        include: {
          seller: { select: { firstName: true, lastName: true } },
          customer: {
            select: {
              name: true,
              taxId: true,
              type: true,
              phone: true,
              email: true,
              address: true,
            },
          },
          details: {
            include: {
              product: { select: { name: true, internalCode: true } },
            },
          },
        },
      },
    },
  });

  if (!invoice) return null;

  // Regenerate QR for authorized invoices
  let qrCode: string | undefined;
  if (invoice.status === 'AUTHORIZED' && invoice.cae) {
    try {
      const settings = await getTenantAfipSettings(tenantId);
      qrCode = await buildAfipQR({
        cuit: settings.cuit,
        date: new Date(invoice.invoiceDate),
        pointOfSale: invoice.pointOfSale,
        invoiceType: invoice.invoiceType,
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: parseFloat(invoice.totalAmount.toString()),
        docType: invoice.docType,
        docNumber: invoice.docNumber,
        cae: invoice.cae,
      });
    } catch {
      // Non-fatal
    }
  }

  return { ...invoice, qrCode };
}
