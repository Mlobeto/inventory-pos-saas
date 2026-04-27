/**
 * AfipSettingsPage.tsx
 * Configuración completa de facturación electrónica AFIP.
 * Ruta: /configuracion/afip
 *
 * Secciones:
 *  1. Datos del negocio  — razón social, CUIT, punto de venta, domicilio, modo
 *  2. Certificado digital — wizard 3 pasos: generar CSR → registrar AFIP → pegar cert
 *  3. Estado de conexión — test + result (solo cuando está configurado)
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAfipSettings,
  saveAfipSettings,
  generateCsr,
  testAfipConnection,
  type AfipConfig,
} from '@/modules/sales/api/salesApi';
import { Button } from '@/shared/components/ui/Button';
import {
  CheckCircle,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  Key,
  FileText,
  Wifi,
} from 'lucide-react';

// ─── Small helpers ────────────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-gray-200 rounded-xl p-6 ${className}`}>{children}</div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold text-gray-900 mb-4">{children}</h2>;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function inputCls() {
  return 'w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-800 font-medium"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copiado' : 'Copiar'}
    </button>
  );
}

function StepCircle({ n, done, active }: { n: number; done: boolean; active: boolean }) {
  if (done)
    return (
      <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center flex-shrink-0">
        <Check className="h-4 w-4" />
      </div>
    );
  if (active)
    return (
      <div className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center flex-shrink-0 text-sm font-bold">
        {n}
      </div>
    );
  return (
    <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-400 flex items-center justify-center flex-shrink-0 text-sm font-bold">
      {n}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AfipSettingsPage() {
  const qc = useQueryClient();

  // ── Server state ──
  const { data: cfg, isLoading } = useQuery<AfipConfig>({
    queryKey: ['afip-settings'],
    queryFn: getAfipSettings,
  });

  // ── Local form state: business data ──
  const [businessName, setBusinessName] = useState('');
  const [cuit, setCuit] = useState('');
  const [pointOfSale, setPointOfSale] = useState('1');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [production, setProduction] = useState(false);

  // ── Local form state: certificate ──
  const [certInput, setCertInput] = useState('');
  const [csrDisplay, setCsrDisplay] = useState<string | null>(null);

  // ── UI state ──
  const [bizSavedMsg, setBizSavedMsg] = useState('');
  const [certSavedMsg, setCertSavedMsg] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Populate form when settings load
  useEffect(() => {
    if (cfg) {
      setBusinessName(cfg.businessName ?? '');
      setCuit(cfg.cuit ?? '');
      setPointOfSale(String(cfg.pointOfSale ?? 1));
      setAddress(cfg.address ?? '');
      setCity(cfg.city ?? '');
      setProduction(Boolean(cfg.production));
      if (cfg.csr) setCsrDisplay(cfg.csr);
    }
  }, [cfg]);

  // ── Mutations ──
  const saveBizMut = useMutation({
    mutationFn: () =>
      saveAfipSettings({
        businessName: businessName.trim(),
        cuit: cuit.trim(),
        pointOfSale: Number(pointOfSale),
        address: address.trim(),
        city: city.trim(),
        production,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['afip-settings'] });
      setBizSavedMsg('Datos guardados.');
      setTimeout(() => setBizSavedMsg(''), 3000);
    },
  });

  const generateCsrMut = useMutation({
    mutationFn: () => generateCsr({ cuit: cuit.trim(), businessName: businessName.trim() }),
    onSuccess: (data) => {
      setCsrDisplay(data.csr);
      qc.invalidateQueries({ queryKey: ['afip-settings'] });
    },
  });

  const saveCertMut = useMutation({
    mutationFn: () => saveAfipSettings({ cert: certInput.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['afip-settings'] });
      setCertInput('');
      setCertSavedMsg('Certificado guardado.');
      setTimeout(() => setCertSavedMsg(''), 3000);
    },
  });

  const testMut = useMutation({
    mutationFn: testAfipConnection,
    onSuccess: (data) => {
      setTestResult(JSON.stringify(data, null, 2));
      setTestError(null);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err as Error).message ??
        'Error de conexión';
      setTestError(msg);
      setTestResult(null);
    },
  });

  const hasKey = Boolean(cfg?.hasKey);
  const hasCert = Boolean(cfg?.hasCert);
  const step1Done = hasKey;
  const step3Done = hasCert;
  const step1Active = !step1Done;
  const step2Active = step1Done && !step3Done;
  const step3Active = step1Done && !step3Done;

  if (isLoading) {
    return <div className="text-sm text-gray-500">Cargando configuración...</div>;
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Factura Electrónica — AFIP</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configurá tu negocio para emitir comprobantes tipo C (monotributista) con validez fiscal.
        </p>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECCIÓN 1 — Datos del negocio
      ══════════════════════════════════════════════════════════════════════ */}
      <Card>
        <SectionTitle>1. Datos del negocio</SectionTitle>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Razón social / Nombre del negocio" hint="Tal como aparece en AFIP">
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Mi Negocio S.A."
                className={inputCls()}
              />
            </Field>
            <Field label="CUIT" hint="11 dígitos sin guiones">
              <input
                type="text"
                value={cuit}
                onChange={(e) => setCuit(e.target.value.replace(/\D/g, '').slice(0, 11))}
                placeholder="20123456789"
                className={inputCls()}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Domicilio fiscal" hint="Opcional — aparece en el comprobante">
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Av. Corrientes 1234"
                className={inputCls()}
              />
            </Field>
            <Field label="Localidad">
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Buenos Aires"
                className={inputCls()}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Número de punto de venta" hint="Debe existir en AFIP (Servicios → Puntos de Venta)">
              <input
                type="number"
                min="1"
                max="9999"
                value={pointOfSale}
                onChange={(e) => setPointOfSale(e.target.value)}
                className={inputCls()}
              />
            </Field>
            <Field label="Modo de operación">
              <div className="flex gap-4 mt-1.5">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    checked={!production}
                    onChange={() => setProduction(false)}
                  />
                  <span>Homologación <span className="text-gray-400">(pruebas)</span></span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    checked={production}
                    onChange={() => setProduction(true)}
                  />
                  <span className="font-semibold text-amber-700">Producción (real)</span>
                </label>
              </div>
            </Field>
          </div>

          {bizSavedMsg && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-lg">
              <CheckCircle className="h-4 w-4" /> {bizSavedMsg}
            </div>
          )}
          {saveBizMut.isError && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
              <AlertCircle className="h-4 w-4" />
              {(saveBizMut.error as Error)?.message ?? 'Error al guardar'}
            </div>
          )}

          <div className="pt-1">
            <Button
              isLoading={saveBizMut.isPending}
              disabled={!cuit.trim()}
              onClick={() => saveBizMut.mutate()}
            >
              Guardar datos del negocio
            </Button>
          </div>
        </div>
      </Card>

      {/* ══════════════════════════════════════════════════════════════════════
          SECCIÓN 2 — Certificado digital (wizard 3 pasos)
      ══════════════════════════════════════════════════════════════════════ */}
      <Card>
        <SectionTitle>2. Certificado digital</SectionTitle>
        <p className="text-sm text-gray-500 mb-6">
          El certificado digital es lo que le permite a esta aplicación comunicarse con AFIP en tu
          nombre. Seguí estos 3 pasos para obtenerlo.
        </p>

        <div className="space-y-0">
          {/* ── PASO 1 ── */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <StepCircle n={1} done={step1Done} active={step1Active} />
              <div className="w-px flex-1 bg-gray-200 mt-2 mb-2" />
            </div>
            <div className="pb-6 flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Key className="h-4 w-4 text-gray-500" />
                <span className="font-semibold text-gray-900 text-sm">
                  Generar claves criptográficas
                </span>
                {step1Done && (
                  <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full">
                    Generadas
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mb-3">
                Genera un par de claves RSA 2048-bit y un CSR (Certificate Signing Request). La
                clave privada queda guardada de forma segura en el servidor. El CSR lo tenés que
                subir a AFIP en el paso siguiente.
              </p>

              {generateCsrMut.isError && (
                <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg mb-3">
                  <AlertCircle className="h-4 w-4" />
                  {(generateCsrMut.error as Error)?.message ?? 'Error al generar'}
                </div>
              )}

              <Button
                variant={step1Done ? 'secondary' : 'primary'}
                isLoading={generateCsrMut.isPending}
                disabled={!cuit.trim() || generateCsrMut.isPending}
                onClick={() => generateCsrMut.mutate()}
              >
                <Key className="h-4 w-4 mr-1.5" />
                {step1Done ? 'Regenerar claves (nuevo CSR)' : 'Generar claves y CSR'}
              </Button>

              {step1Done && !generateCsrMut.isPending && (
                <p className="text-xs text-amber-700 mt-2">
                  ⚠ Regenerar claves invalidará el certificado actual. Solo hacelo si el anterior
                  fue comprometido o expiró.
                </p>
              )}

              {/* CSR display */}
              {csrDisplay && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-gray-700">
                      CSR generado — subilo a AFIP:
                    </span>
                    <CopyButton text={csrDisplay} />
                  </div>
                  <textarea
                    readOnly
                    rows={8}
                    value={csrDisplay}
                    className="w-full border border-gray-200 bg-gray-50 rounded-md px-3 py-2 text-xs font-mono focus:outline-none resize-none"
                  />
                </div>
              )}
            </div>
          </div>

          {/* ── PASO 2 ── */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <StepCircle n={2} done={step3Done} active={step2Active} />
              <div className="w-px flex-1 bg-gray-200 mt-2 mb-2" />
            </div>
            <div className="pb-6 flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <ExternalLink className="h-4 w-4 text-gray-500" />
                <span className="font-semibold text-gray-900 text-sm">
                  Registrar en AFIP y vincular el servicio
                </span>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                Con el CSR del paso 1 en mano, seguí estos pasos en el portal de AFIP:
              </p>

              <ol className="space-y-3 text-sm">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                    a
                  </span>
                  <div>
                    Ingresá a{' '}
                    <a
                      href="https://auth.afip.gob.ar/contribuyente/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-600 underline font-medium inline-flex items-center gap-0.5"
                    >
                      auth.afip.gob.ar <ExternalLink className="h-3 w-3" />
                    </a>{' '}
                    con tu CUIT <strong>{cuit || '(configurá el CUIT primero)'}</strong> y clave
                    fiscal nivel 3.
                  </div>
                </li>

                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                    b
                  </span>
                  <div>
                    Buscá el servicio{' '}
                    <strong>"Administración de Certificados Digitales"</strong> en el menú de
                    servicios habilitados. Si no aparece, agregalo desde{' '}
                    <em>Mis Servicios → Agregar servicio</em>.
                  </div>
                </li>

                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                    c
                  </span>
                  <div>
                    Hacé clic en <strong>"Agregar alias"</strong> o{' '}
                    <strong>"Nuevo certificado"</strong>. Ponele cualquier nombre (ej:{' '}
                    <code className="bg-gray-100 px-1 rounded text-xs">facturacion-negocio</code>
                    ).
                  </div>
                </li>

                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                    d
                  </span>
                  <div>
                    En el campo <strong>"Certificado (CSR)"</strong>, pegá el contenido completo
                    del CSR del paso 1 (desde <code className="bg-gray-100 px-1 rounded text-xs">-----BEGIN CERTIFICATE REQUEST-----</code> hasta{' '}
                    <code className="bg-gray-100 px-1 rounded text-xs">-----END CERTIFICATE REQUEST-----</code>
                    ). Confirmá.
                    {csrDisplay && (
                      <div className="mt-2">
                        <CopyButton text={csrDisplay} />
                      </div>
                    )}
                  </div>
                </li>

                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                    e
                  </span>
                  <div>
                    <strong>Descargá el certificado</strong> generado (archivo{' '}
                    <code className="bg-gray-100 px-1 rounded text-xs">.crt</code> o{' '}
                    <code className="bg-gray-100 px-1 rounded text-xs">.pem</code>). Lo necesitás
                    en el paso 3.
                  </div>
                </li>

                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                    f
                  </span>
                  <div>
                    Andá a <strong>"Administración de Relaciones de Clave Fiscal"</strong>. Agregá
                    una relación:{' '}
                    <ul className="list-disc ml-4 mt-1 space-y-0.5 text-gray-600">
                      <li>
                        <strong>Servicio:</strong> Factura Electrónica — WSFE
                      </li>
                      <li>
                        <strong>Representado:</strong> CUIT {cuit || '—'}
                      </li>
                      <li>
                        <strong>Computadora:</strong> el alias que creaste en el paso c
                      </li>
                    </ul>
                  </div>
                </li>
              </ol>
            </div>
          </div>

          {/* ── PASO 3 ── */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <StepCircle n={3} done={step3Done} active={step3Active} />
            </div>
            <div className="pb-2 flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="h-4 w-4 text-gray-500" />
                <span className="font-semibold text-gray-900 text-sm">
                  Ingresar el certificado recibido de AFIP
                </span>
                {step3Done && (
                  <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full">
                    Configurado ✓
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mb-3">
                Abrí el archivo <code className="bg-gray-100 px-1 rounded text-xs">.crt</code>{' '}
                descargado de AFIP con un editor de texto y pegá su contenido completo acá abajo.
              </p>

              <textarea
                rows={8}
                value={certInput}
                onChange={(e) => setCertInput(e.target.value)}
                placeholder="-----BEGIN CERTIFICATE-----&#10;MIIFxTCCA62gAwIBAgIU...&#10;-----END CERTIFICATE-----"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              />

              {certSavedMsg && (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-lg mt-2">
                  <CheckCircle className="h-4 w-4" /> {certSavedMsg}
                </div>
              )}
              {saveCertMut.isError && (
                <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg mt-2">
                  <AlertCircle className="h-4 w-4" />
                  {(saveCertMut.error as Error)?.message ?? 'Error al guardar'}
                </div>
              )}

              <div className="mt-3">
                <Button
                  isLoading={saveCertMut.isPending}
                  disabled={!certInput.trim()}
                  onClick={() => saveCertMut.mutate()}
                >
                  Guardar certificado
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ══════════════════════════════════════════════════════════════════════
          SECCIÓN 3 — Test de conexión
      ══════════════════════════════════════════════════════════════════════ */}
      <Card>
        <SectionTitle>3. Verificar conexión con AFIP</SectionTitle>

        {!hasCert && !hasKey ? (
          <p className="text-sm text-gray-500">
            Completá la configuración del negocio y el certificado para poder probar la conexión.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                  hasCert && hasKey
                    ? 'bg-green-100 text-green-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {hasCert && hasKey ? (
                  <>
                    <CheckCircle className="h-4 w-4" /> Configurado — listo para facturar
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4" /> Incompleto — falta el{' '}
                    {!hasKey ? 'par de claves' : 'certificado'}
                  </>
                )}
              </div>
              <span className="text-xs text-gray-400">
                Modo: {production ? '🔴 Producción' : '🟡 Homologación'}
              </span>
            </div>

            <Button
              variant="secondary"
              isLoading={testMut.isPending}
              onClick={() => testMut.mutate()}
            >
              <Wifi className="h-4 w-4 mr-1.5" />
              Probar conexión con AFIP
            </Button>

            {(testResult || testError) && (
              <div
                className={`mt-4 rounded-lg p-4 text-xs font-mono whitespace-pre-wrap border ${
                  testError
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : 'bg-green-50 border-green-200 text-green-800'
                }`}
              >
                {testError ?? testResult}
              </div>
            )}
          </>
        )}
      </Card>

      {/* ══════════════════════════════════════════════════════════════════════
          SECCIÓN 4 — Homologación (sin certificado)
      ══════════════════════════════════════════════════════════════════════ */}
      <Card className="border-amber-200 bg-amber-50">
        <div className="flex gap-3">
          <RefreshCw className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 space-y-1">
            <p className="font-semibold">¿Querés probar sin tramitar el certificado?</p>
            <p>
              Usá el modo <strong>Homologación</strong> con el CUIT de prueba{' '}
              <code
                className="bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded text-xs font-mono cursor-pointer"
                onClick={() => {
                  setCuit('20409378472');
                  setProduction(false);
                }}
                title="Hacer clic para autocompletar"
              >
                20409378472
              </code>{' '}
              <span className="text-amber-600 text-xs">(hacé clic para autocompletar)</span>. Los
              comprobantes generados en homologación{' '}
              <strong>no tienen validez fiscal</strong>.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
