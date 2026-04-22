import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from './AppError';
import { ErrorCode } from './ErrorCodes';
import { logger } from '../utils/logger';
import { errorResponse } from '../utils/response';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Error operacional conocido
  if (err instanceof AppError) {
    res.status(err.statusCode).json(
      errorResponse(err.message, err.code, err.details),
    );
    return;
  }

  // Error de validación Zod
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    res.status(422).json(
      errorResponse('Error de validación', ErrorCode.VALIDATION_ERROR, details),
    );
    return;
  }

  // Error de constraint de Prisma (unique violation, etc.)
  if (isprismaError(err)) {
    const prismaErr = err as { code: string; meta?: { target?: string[] } };

    if (prismaErr.code === 'P2002') {
      const field = prismaErr.meta?.target?.join(', ') ?? 'campo';
      res.status(409).json(
        errorResponse(`Ya existe un registro con ese ${field}`, ErrorCode.ALREADY_EXISTS),
      );
      return;
    }

    if (prismaErr.code === 'P2025') {
      res.status(404).json(
        errorResponse('Registro no encontrado', ErrorCode.NOT_FOUND),
      );
      return;
    }
  }

  // Error desconocido — log completo, respuesta genérica
  logger.error('Unhandled error', { error: err });
  res.status(500).json(
    errorResponse('Error interno del servidor', ErrorCode.INTERNAL_ERROR),
  );
}

function isprismaError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string' &&
    (err as { code: string }).code.startsWith('P')
  );
}
