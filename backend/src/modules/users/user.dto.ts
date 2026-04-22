import { UserStatus } from '@prisma/client';

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

export interface UserListItemDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  roles: string[];
  createdAt: Date;
}

export interface UserDetailDto extends UserListItemDto {
  tenantId: string;
}
