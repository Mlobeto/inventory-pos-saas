import apiClient from '../../../core/api/apiClient';
import type { ApiResponse } from '../../../shared/types/api.types';
import type { AuthUser } from '../../../core/auth/authStore';

interface LoginPayload {
  email: string;
  password: string;
  tenantSlug: string;
}

interface LoginResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export const authService = {
  async login(payload: LoginPayload): Promise<LoginResponse> {
    const { data } = await apiClient.post<ApiResponse<LoginResponse>>('/api/auth/login', payload, {
      headers: { 'X-Tenant-Slug': payload.tenantSlug },
    });
    return data.data;
  },

  async getMe(): Promise<AuthUser> {
    const { data } = await apiClient.get<ApiResponse<AuthUser>>('/api/auth/me');
    return data.data;
  },

  async refresh(refreshToken: string) {
    const { data } = await apiClient.post<ApiResponse<{ accessToken: string; refreshToken: string }>>(
      '/api/auth/refresh',
      { refreshToken },
    );
    return data.data;
  },

  async logout() {
    await apiClient.post('/api/auth/logout').catch(() => undefined);
  },
};
