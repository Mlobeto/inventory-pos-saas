import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { successResponse } from '../../core/utils/response';

export const AuthController = {
  async login(req: Request, res: Response): Promise<void> {
    const result = await AuthService.login(req.body);
    res.status(200).json(successResponse(result, 'Sesión iniciada'));
  },

  async refreshToken(req: Request, res: Response): Promise<void> {
    const result = await AuthService.refreshToken(req.body);
    res.status(200).json(successResponse(result));
  },

  async getMe(req: Request, res: Response): Promise<void> {
    const result = await AuthService.getMe(req.user!.sub);
    res.status(200).json(successResponse(result));
  },

  async changePassword(req: Request, res: Response): Promise<void> {
    const { currentPassword, newPassword } = req.body;
    await AuthService.changePassword(req.user!.sub, currentPassword, newPassword);
    res.status(200).json(successResponse(null, 'Contraseña actualizada correctamente'));
  },

  async logout(_req: Request, res: Response): Promise<void> {
    // Con JWT stateless, el logout es responsabilidad del cliente (borrar el token).
    // Aquí podemos dejar el hook para una futura implementación con token blacklist.
    res.status(200).json(successResponse(null, 'Sesión cerrada'));
  },
};
