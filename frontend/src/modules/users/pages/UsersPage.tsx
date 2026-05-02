import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserPlus, Pencil, Trash2, ShieldCheck, X } from 'lucide-react';
import {
  getUsers,
  getRoles,
  createUser,
  updateUser,
  deleteUser,
  type UserListItem,
  type UserStatus,
} from '../api/usersApi';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';

// ─── Schemas ───────────────────────────────────────────────────────────────────
const createSchema = z.object({
  firstName: z.string().min(1, 'Requerido'),
  lastName: z.string().min(1, 'Requerido'),
  email: z.string().email('Email inválido'),
  password: z
    .string()
    .min(8, 'Mínimo 8 caracteres')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Debe tener mayúsculas, minúsculas y números'),
  roleIds: z.array(z.string()).min(1, 'Seleccioná al menos un rol'),
});

const editSchema = z.object({
  firstName: z.string().min(1, 'Requerido'),
  lastName: z.string().min(1, 'Requerido'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
  roleIds: z.array(z.string()).min(1, 'Seleccioná al menos un rol'),
});

type CreateForm = z.infer<typeof createSchema>;
type EditForm = z.infer<typeof editSchema>;

// ─── Labels ────────────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
  SUSPENDED: 'Suspendido',
};

const STATUS_COLORS: Record<UserStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  INACTIVE: 'bg-gray-100 text-gray-500',
  SUSPENDED: 'bg-red-100 text-red-600',
};

// ─── Modal Crear ───────────────────────────────────────────────────────────────
function CreateUserModal({
  onClose,
  roles,
}: {
  onClose: () => void;
  roles: { id: string; name: string }[];
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { roleIds: [] },
  });

  const selectedRoleIds = watch('roleIds');

  const mut = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
  });

  function toggleRole(id: string) {
    const current = selectedRoleIds ?? [];
    setValue(
      'roleIds',
      current.includes(id) ? current.filter((r) => r !== id) : [...current, id],
      { shouldValidate: true },
    );
  }

  const apiError =
    mut.error && 'response' in mut.error
      ? (mut.error as { response?: { data?: { message?: string } } }).response?.data?.message
      : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">Nuevo usuario</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit((data) => mut.mutate(data))}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Nombre"
              error={errors.firstName?.message}
              {...register('firstName')}
            />
            <Input
              label="Apellido"
              error={errors.lastName?.message}
              {...register('lastName')}
            />
          </div>

          <Input
            label="Email"
            type="email"
            error={errors.email?.message}
            {...register('email')}
          />

          <Input
            label="Contraseña"
            type="password"
            placeholder="Mín. 8 caracteres, mayúsc., minúsc. y números"
            error={errors.password?.message}
            {...register('password')}
          />

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Roles</p>
            <div className="flex flex-wrap gap-2">
              {roles.map((role) => {
                const active = selectedRoleIds?.includes(role.id);
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => toggleRole(role.id)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                      active
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-brand-400'
                    }`}
                  >
                    {role.name}
                  </button>
                );
              })}
            </div>
            {errors.roleIds && (
              <p className="text-xs text-red-500 mt-1">{errors.roleIds.message}</p>
            )}
          </div>

          {apiError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {apiError}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" isLoading={mut.isPending} className="flex-1">
              Crear usuario
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal Editar ──────────────────────────────────────────────────────────────
function EditUserModal({
  user,
  onClose,
  roles,
}: {
  user: UserListItem;
  onClose: () => void;
  roles: { id: string; name: string }[];
}) {
  const queryClient = useQueryClient();

  // Mapear nombres de roles actuales a IDs
  const initialRoleIds = roles
    .filter((r) => user.roles.includes(r.name))
    .map((r) => r.id);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      roleIds: initialRoleIds,
    },
  });

  const selectedRoleIds = watch('roleIds');

  const mut = useMutation({
    mutationFn: (data: EditForm) => updateUser(user.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
  });

  function toggleRole(id: string) {
    const current = selectedRoleIds ?? [];
    setValue(
      'roleIds',
      current.includes(id) ? current.filter((r) => r !== id) : [...current, id],
      { shouldValidate: true },
    );
  }

  const apiError =
    mut.error && 'response' in mut.error
      ? (mut.error as { response?: { data?: { message?: string } } }).response?.data?.message
      : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">
            Editar — {user.firstName} {user.lastName}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit((data) => mut.mutate(data))}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Nombre"
              error={errors.firstName?.message}
              {...register('firstName')}
            />
            <Input
              label="Apellido"
              error={errors.lastName?.message}
              {...register('lastName')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
            <select
              {...register('status')}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="ACTIVE">Activo</option>
              <option value="INACTIVE">Inactivo</option>
              <option value="SUSPENDED">Suspendido</option>
            </select>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Roles</p>
            <div className="flex flex-wrap gap-2">
              {roles.map((role) => {
                const active = selectedRoleIds?.includes(role.id);
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => toggleRole(role.id)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                      active
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-brand-400'
                    }`}
                  >
                    {role.name}
                  </button>
                );
              })}
            </div>
            {errors.roleIds && (
              <p className="text-xs text-red-500 mt-1">{errors.roleIds.message}</p>
            )}
          </div>

          {apiError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {apiError}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" isLoading={mut.isPending} className="flex-1">
              Guardar cambios
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────
export default function UsersPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: getRoles,
  });

  const deleteMut = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDeletingId(null);
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Usuarios</h1>
          <p className="text-sm text-gray-500 mt-0.5">Administradores y cajeros del sistema</p>
        </div>
        <Button
          leftIcon={<UserPlus className="h-4 w-4" />}
          onClick={() => setCreateOpen(true)}
        >
          Nuevo usuario
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-400 text-center py-20">Cargando...</div>
      ) : users.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 py-20 text-center">
          <ShieldCheck className="h-12 w-12 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No hay usuarios registrados</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Nombre</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Roles</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {user.firstName} {user.lastName}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{user.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((r) => (
                        <span
                          key={r}
                          className="px-2 py-0.5 bg-brand-50 text-brand-700 text-xs rounded-full font-medium"
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_COLORS[user.status]}`}
                    >
                      {STATUS_LABELS[user.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => setEditingUser(user)}
                        className="text-gray-400 hover:text-brand-600 transition-colors"
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {deletingId === user.id ? (
                        <div className="flex items-center gap-1 text-xs">
                          <button
                            onClick={() => deleteMut.mutate(user.id)}
                            disabled={deleteMut.isPending}
                            className="text-red-600 font-semibold hover:underline"
                          >
                            Confirmar
                          </button>
                          <span className="text-gray-300">|</span>
                          <button
                            onClick={() => setDeletingId(null)}
                            className="text-gray-500 hover:underline"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeletingId(user.id)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <CreateUserModal roles={roles} onClose={() => setCreateOpen(false)} />
      )}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          roles={roles}
          onClose={() => setEditingUser(null)}
        />
      )}
    </div>
  );
}
