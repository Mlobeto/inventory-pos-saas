import { Menu, LogOut, User } from 'lucide-react';
import { useAuthStore } from '../../../../core/auth/authStore';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { cn } from '../../utils/cn';
import { ROUTES } from '../../../../router/routes';

interface TopbarProps {
  onMenuClick: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate(ROUTES.LOGIN);
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 sticky top-0 z-30">
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100"
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="ml-auto relative">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 px-2 py-1 rounded-md hover:bg-gray-100 transition-colors"
        >
          <User className="h-4 w-4" />
          <span>{user ? `${user.firstName} ${user.lastName}` : 'Usuario'}</span>
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div
              className={cn(
                'absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-20 py-1',
              )}
            >
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Cerrar sesión
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
