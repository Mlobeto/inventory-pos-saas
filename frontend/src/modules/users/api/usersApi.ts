import apiClient from '@/core/api/apiClient';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export interface UserListItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  roles: string[];
  createdAt: string;
}

export interface Role {
  id: string;
  name: string;
  _count?: { userRoles: number };
}

export interface CreateUserDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  roleIds: string[];
}

export interface UpdateUserDto {
  firstName?: string;
  lastName?: string;
  status?: UserStatus;
  roleIds?: string[];
}

export async function getUsers(): Promise<UserListItem[]> {
  const res = await apiClient.get('/api/users', { params: { limit: 100 } });
  return res.data.data;
}

export async function createUser(dto: CreateUserDto): Promise<UserListItem> {
  const res = await apiClient.post('/api/users', dto);
  return res.data.data;
}

export async function updateUser(id: string, dto: UpdateUserDto): Promise<UserListItem> {
  const res = await apiClient.patch(`/api/users/${id}`, dto);
  return res.data.data;
}

export async function deleteUser(id: string): Promise<void> {
  await apiClient.delete(`/api/users/${id}`);
}

export async function getRoles(): Promise<Role[]> {
  const res = await apiClient.get('/api/roles', { params: { limit: 50 } });
  return res.data.data;
}
