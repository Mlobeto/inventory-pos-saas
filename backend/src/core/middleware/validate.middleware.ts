import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodEffects, ZodTypeAny, ZodError } from 'zod';
import { AppError } from '../errors/AppError';

type ValidationTarget = 'body' | 'query' | 'params';

/**
 * Middleware de validación con Zod.
 * Valida el body, query o params de la request contra un schema dado.
 * Si la validación pasa, reemplaza el campo con los datos parseados (coerced).
 */
export function validate(schema: AnyZodObject | ZodEffects<ZodTypeAny>, target: ValidationTarget = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[target]);
      req[target] = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }));
        next(AppError.validation('Datos de entrada inválidos', details));
      } else {
        next(err);
      }
    }
  };
}
