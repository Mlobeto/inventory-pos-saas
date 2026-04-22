import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '../../../core/auth/authStore';
import { authService } from '../services/auth.service';

export function useLogin() {
  const login = useAuthStore((s) => s.login);

  return useMutation({
    mutationFn: authService.login,
    onSuccess: (data) => {
      login(data.user, data.accessToken, data.refreshToken);
    },
  });
}
