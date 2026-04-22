import { Request, Response, NextFunction } from 'express';

/**
 * Envuelve handlers async para que los errores sean capturados por errorHandler.
 * Evita el try/catch repetitivo en cada controlador.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
