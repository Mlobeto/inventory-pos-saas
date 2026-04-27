/**
 * InvoicePrintPage.tsx
 * Comprobante electrónico para impresión — Factura C (monotributista AFIP).
 * Ruta: /ventas/:id/comprobante
 *
 * Incluye el QR obligatorio según RG 4291/2018 de AFIP.
 */

import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getInvoice } from '../api/salesApi';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';

function fmt(amount: string | number): string {
  return `$${parseFloat(String(amount)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
}

function parseAfipDate(yyyymmdd: string): Date {
  return new Date(`${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`);
}

const DOC_TYPE_LABELS: Record<number, string> = {
  80: 'CUIT',
  96: 'DNI',
  99: 'Consumidor Final',
};

export default function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: invoice, isLoading, isError } = useQuery({
    queryKey: ['sale-invoice', id],
    queryFn: () => getInvoice(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-gray-400">
        Cargando comprobante...
      </div>
    );
  }

  if (isError || !invoice) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-sm text-gray-500">No se encontró el comprobante.</p>
        <Button variant="secondary" onClick={() => navigate(-1)}>
          Volver
        </Button>
      </div>
    );
  }

  const sale = invoice.sale!;
  const invoiceNumFormatted = `${String(invoice.pointOfSale).padStart(4, '0')}-${String(invoice.invoiceNumber).padStart(8, '0')}`;
  const docTypeLabel = DOC_TYPE_LABELS[invoice.docType] ?? 'Doc.';
  const hasCustomer = !!sale.customer;
  const saleDate = new Date(sale.createdAt);

  return (
    <div>
      {/* ── Toolbar (oculto al imprimir) ──────────────────────────────────── */}
      <div className="print:hidden flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          leftIcon={<ArrowLeft className="h-4 w-4" />}
          onClick={() => navigate(-1)}
        >
          Volver
        </Button>
        <Button leftIcon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
          Imprimir
        </Button>
      </div>

      {/* ── Comprobante ───────────────────────────────────────────────────── */}
      <div
        id="invoice-print"
        className="max-w-2xl mx-auto bg-white border border-gray-200 rounded-xl p-8 font-sans text-sm print:border-none print:rounded-none print:p-6 print:max-w-none"
        style={{ fontFamily: 'Arial, sans-serif' }}
      >
        {/* ── Encabezado ─────────────────────────────────────────────────── */}
        <div className="flex justify-between items-start mb-6 pb-4 border-b-2 border-gray-800">
          {/* Datos del emisor */}
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-900 uppercase">
              {/* Business name — pulled from tenant in future; placeholder for now */}
              Mi Negocio
            </h2>
            <p className="text-xs text-gray-500 mt-1">Monotributista</p>
          </div>

          {/* Código de tipo de comprobante */}
          <div className="mx-6 flex flex-col items-center justify-center border-2 border-gray-800 w-16 h-16 rounded">
            <span className="text-3xl font-bold leading-none">C</span>
            <span className="text-[10px] text-gray-600 mt-0.5">Factura</span>
          </div>

          {/* Número */}
          <div className="flex-1 text-right">
            <p className="text-xs text-gray-500">ORIGINAL</p>
            <p className="text-base font-bold font-mono mt-1">{invoiceNumFormatted}</p>
            <p className="text-xs text-gray-500 mt-1">
              Fecha: {format(saleDate, 'dd/MM/yyyy', { locale: es })}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Venta N°: <span className="font-semibold">{sale.saleNumber}</span>
            </p>
          </div>
        </div>

        {/* ── Receptor ───────────────────────────────────────────────────── */}
        <div className="mb-5 p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-semibold">
            Receptor
          </p>
          {invoice.docType === 99 || !hasCustomer ? (
            <p className="font-medium">Consumidor Final</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div>
                <span className="text-gray-500">{docTypeLabel}:</span>{' '}
                <span className="font-medium">{invoice.docNumber}</span>
              </div>
              <div>
                <span className="text-gray-500">Razón social:</span>{' '}
                <span className="font-medium">{sale.customer?.name}</span>
              </div>
              {sale.customer?.address && (
                <div className="col-span-2">
                  <span className="text-gray-500">Domicilio:</span>{' '}
                  <span>{sale.customer.address}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Detalle de productos ────────────────────────────────────────── */}
        <table className="w-full text-sm mb-5">
          <thead>
            <tr className="border-b border-gray-300 text-xs text-gray-500 uppercase">
              <th className="text-left pb-2">Descripción</th>
              <th className="text-center pb-2 w-16">Cant.</th>
              <th className="text-right pb-2 w-24">P. Unit.</th>
              <th className="text-right pb-2 w-24">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sale.details?.map((d, i) => (
              <tr key={i}>
                <td className="py-1.5">
                  <span className="font-medium">{d.product.name}</span>
                  <span className="text-gray-400 text-xs ml-1">({d.product.internalCode})</span>
                </td>
                <td className="py-1.5 text-center">{d.quantity}</td>
                <td className="py-1.5 text-right">{fmt(d.unitPrice)}</td>
                <td className="py-1.5 text-right font-medium">{fmt(d.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── Totales ─────────────────────────────────────────────────────── */}
        <div className="flex justify-end mb-6">
          <div className="w-56 space-y-1 text-sm">
            <div className="flex justify-between border-t-2 border-gray-800 pt-2">
              <span className="font-bold text-base">TOTAL</span>
              <span className="font-bold text-base">{fmt(invoice.totalAmount)}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>IVA incluido (monotributista)</span>
              <span>—</span>
            </div>
          </div>
        </div>

        {/* ── CAE + QR ────────────────────────────────────────────────────── */}
        <div className="border-t border-gray-300 pt-4 flex items-end justify-between gap-4">
          <div className="text-xs text-gray-600 space-y-1">
            <div>
              <span className="font-semibold">CAE:</span>{' '}
              <span className="font-mono">{invoice.cae}</span>
            </div>
            <div>
              <span className="font-semibold">Vencimiento CAE:</span>{' '}
              {invoice.caeExpiry
                ? format(parseAfipDate(invoice.caeExpiry), 'dd/MM/yyyy', { locale: es })
                : '—'}
            </div>
            <div className="pt-1 text-gray-400 text-[10px]">
              Comprobante emitido en los términos de la RG 2485/2008 AFIP.
              <br />
              Este documento es válido para sus registros contables.
            </div>
          </div>

          {/* QR AFIP */}
          {invoice.qrCode && (
            <div className="flex-shrink-0 flex flex-col items-center gap-1">
              <img
                src={`data:image/png;base64,${invoice.qrCode}`}
                alt="QR AFIP"
                width={90}
                height={90}
                className="border border-gray-200 rounded"
              />
              <span className="text-[9px] text-gray-400">AFIP QR</span>
            </div>
          )}
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body > *:not(#invoice-print) { display: none !important; }
          #invoice-print { display: block !important; }
        }
      `}</style>
    </div>
  );
}
