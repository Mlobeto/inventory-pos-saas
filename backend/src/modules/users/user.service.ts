import { UserRepository } from './user.repository';
import { CreateUserDto, UpdateUserDto } from './user.dto';
import { parsePagination, buildPaginationMeta } from '../../core/utils/pagination';
import { Request } from 'express';

export const UserService = {
  async list(tenantId: string, req: Request) {
    const pagination = parsePagination(req);
    const search = req.query.search as string | undefined;

    const { users, total } = await UserRepository.findAll(tenantId, {
      skip: pagination.skip,
      take: pagination.limit,
      search,
    });

    return { users, meta: buildPaginationMeta(total, pagination) };
  },

  async getById(tenantId: string, userId: string) {
    const user = await UserRepository.findById(tenantId, userId);
    if (!user) throw new Error('NOT_FOUND');
    return user;
  },

  async create(tenantId: string, dto: CreateUserDto) {
    return UserRepository.create(tenantId, dto);
  },

  async update(tenantId: string, userId: string, dto: UpdateUserDto) {
    return UserRepository.update(tenantId, userId, dto);
  },

  async delete(tenantId: string, userId: string) {
    return UserRepository.softDelete(tenantId, userId);
  },
};
