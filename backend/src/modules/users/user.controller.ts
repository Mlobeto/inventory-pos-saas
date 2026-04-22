import { Request, Response } from 'express';
import { UserService } from './user.service';
import { successResponse, paginatedResponse } from '../../core/utils/response';
import { AppError } from '../../core/errors/AppError';

export const UserController = {
  async list(req: Request, res: Response): Promise<void> {
    const { users, meta } = await UserService.list(req.tenantId, req);
    res.json(paginatedResponse(users, meta));
  },

  async getById(req: Request, res: Response): Promise<void> {
    const user = await UserService.getById(req.tenantId, req.params.id);
    if (!user) throw AppError.notFound('Usuario');
    res.json(successResponse(user));
  },

  async create(req: Request, res: Response): Promise<void> {
    const user = await UserService.create(req.tenantId, req.body);
    res.status(201).json(successResponse(user, 'Usuario creado correctamente'));
  },

  async update(req: Request, res: Response): Promise<void> {
    const user = await UserService.update(req.tenantId, req.params.id, req.body);
    res.json(successResponse(user, 'Usuario actualizado'));
  },

  async delete(req: Request, res: Response): Promise<void> {
    await UserService.delete(req.tenantId, req.params.id);
    res.json(successResponse(null, 'Usuario eliminado'));
  },
};
