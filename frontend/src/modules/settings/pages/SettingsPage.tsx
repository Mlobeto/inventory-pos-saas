import { Link } from 'react-router-dom';
import { ROUTES } from '@/router/routes';
import { FileText, ChevronRight } from 'lucide-react';

const sections = [
  {
    to: ROUTES.AFIP_SETTINGS,
    icon: FileText,
    title: 'Factura Electrónica — AFIP',
    description:
      'Configurá el certificado digital, CUIT y punto de venta para emitir comprobantes tipo C con validez fiscal.',
    badge: 'Facturación',
  },
];

export default function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-sm text-gray-500 mt-1">
          Administrá las opciones generales del negocio.
        </p>
      </div>

      <div className="space-y-3">
        {sections.map(({ to, icon: Icon, title, description, badge }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-4 p-5 bg-white border border-gray-200 rounded-xl hover:border-brand-400 hover:shadow-sm transition-all group"
          >
            <div className="flex-shrink-0 w-11 h-11 rounded-lg bg-brand-50 flex items-center justify-center group-hover:bg-brand-100 transition-colors">
              <Icon className="h-5 w-5 text-brand-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900 text-sm">{title}</span>
                {badge && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                    {badge}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-0.5 truncate">{description}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0 group-hover:text-brand-600 transition-colors" />
          </Link>
        ))}
      </div>
    </div>
  );
}
