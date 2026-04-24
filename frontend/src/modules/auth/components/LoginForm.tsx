import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '../../../shared/components/ui/Input';
import { Button } from '../../../shared/components/ui/Button';
import { useLogin } from '../hooks/useLogin';

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Requerido'),
});

type FormValues = z.infer<typeof schema>;

/** Extrae el slug del dominio del email: admin@demo.com → "demo" */
function slugFromEmail(email: string): string {
  return email.split('@')[1]?.split('.')[0] ?? '';
}

interface LoginFormProps {
  onSuccess: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const { mutate, isPending, error } = useLogin();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  function onSubmit(values: FormValues) {
    mutate({ ...values, tenantSlug: slugFromEmail(values.email) }, { onSuccess });
  }

  const apiError =
    error && 'response' in error
      ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
      : undefined;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        label="Email"
        type="email"
        placeholder="admin@empresa.com"
        error={errors.email?.message}
        {...register('email')}
      />
      <Input
        label="Contraseña"
        type="password"
        error={errors.password?.message}
        {...register('password')}
      />
      {apiError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {apiError}
        </p>
      )}
      <Button type="submit" isLoading={isPending} className="w-full">
        Ingresar
      </Button>
    </form>
  );
}
