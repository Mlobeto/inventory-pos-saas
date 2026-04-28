import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  sub: string;
  tenantId: string;
  tenantSlug: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  permissions: string[];
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  sessionExpired: boolean;
  login: (user: AuthUser, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  logoutExpired: () => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  clearSessionExpired: () => void;
  hasPermission: (permission: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      sessionExpired: false,

      login: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken, isAuthenticated: true, sessionExpired: false }),

      logout: () =>
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false, sessionExpired: false }),

      logoutExpired: () =>
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false, sessionExpired: true }),

      clearSessionExpired: () => set({ sessionExpired: false }),

      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),

      hasPermission: (permission) => {
        const { user } = get();
        if (!user) return false;
        return user.permissions.includes(permission);
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
