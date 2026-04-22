import { AccessTokenPayload } from '../../config/jwt';

declare global {
  namespace Express {
    interface Request {
      /**
       * ID del tenant resuelto por el middleware de tenancy.
       * Disponible en todos los handlers que usen authMiddleware + tenancyMiddleware.
       */
      tenantId: string;

      /**
       * Payload del JWT de acceso, adjuntado por authMiddleware.
       */
      user?: AccessTokenPayload;
    }
  }
}

export {};
