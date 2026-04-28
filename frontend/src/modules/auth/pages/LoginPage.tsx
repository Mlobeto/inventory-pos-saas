import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useAuthStore } from '../../../core/auth/authStore';
import { LoginForm } from '../components/LoginForm';
import { Card } from '../../../shared/components/ui/Card';
import { ROUTES } from '../../../router/routes';

export default function LoginPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const sessionExpired = useAuthStore((s) => s.sessionExpired);
  const clearSessionExpired = useAuthStore((s) => s.clearSessionExpired);
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) navigate(ROUTES.DASHBOARD, { replace: true });
  }, [isAuthenticated, navigate]);

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Dale Vir!</h1>
          <p className="text-gray-500 mt-1 text-sm">Gestión de inventario y punto de venta</p>
        </div>
        {sessionExpired && (
          <div className="flex items-start gap-3 mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-amber-800">Tu sesión expiró</p>
              <p className="text-amber-700 mt-0.5">Por seguridad tu sesión fue cerrada. Ingresá de nuevo para continuar.</p>
            </div>
            <button onClick={clearSessionExpired} className="text-amber-400 hover:text-amber-600">
              ✕
            </button>
          </div>
        )}
        <Card title="Iniciar sesión">
          <LoginForm onSuccess={() => navigate(ROUTES.DASHBOARD, { replace: true })} />
        </Card>
      </div>
    </div>
  );
}
