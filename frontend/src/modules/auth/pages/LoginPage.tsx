import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../core/auth/authStore';
import { LoginForm } from '../components/LoginForm';
import { Card } from '../../../shared/components/ui/Card';
import { ROUTES } from '../../../router/routes';

export default function LoginPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
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
        <Card title="Iniciar sesión">
          <LoginForm onSuccess={() => navigate(ROUTES.DASHBOARD, { replace: true })} />
        </Card>
      </div>
    </div>
  );
}
