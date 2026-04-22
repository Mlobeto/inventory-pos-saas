import { ErrorCode } from './ErrorCodes';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number,
    code: ErrorCode,
    details?: unknown,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;

    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  static unauthorized(message = 'No autenticado'): AppError {
    return new AppError(message, 401, ErrorCode.UNAUTHORIZED);
  }

  static forbidden(message = 'Acceso denegado'): AppError {
    return new AppError(message, 403, ErrorCode.FORBIDDEN);
  }

  static notFound(resource: string): AppError {
    return new AppError(`${resource} no encontrado`, 404, ErrorCode.NOT_FOUND);
  }

  static conflict(message: string): AppError {
    return new AppError(message, 409, ErrorCode.CONFLICT);
  }

  static alreadyExists(resource: string): AppError {
    return new AppError(`${resource} ya existe`, 409, ErrorCode.ALREADY_EXISTS);
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError(message, 422, ErrorCode.VALIDATION_ERROR, details);
  }

  static tenantNotFound(): AppError {
    return new AppError('Tenant no encontrado', 404, ErrorCode.TENANT_NOT_FOUND);
  }

  static tenantInactive(): AppError {
    return new AppError('Tenant inactivo o suspendido', 403, ErrorCode.TENANT_INACTIVE);
  }

  static insufficientStock(productCode: string): AppError {
    return new AppError(
      `Stock insuficiente para el producto ${productCode}`,
      409,
      ErrorCode.INSUFFICIENT_STOCK,
    );
  }

  static shiftAlreadyOpen(): AppError {
    return new AppError(
      'Ya existe un turno de caja abierto para este usuario',
      409,
      ErrorCode.SHIFT_ALREADY_OPEN,
    );
  }

  static shiftNotOpen(): AppError {
    return new AppError(
      'No hay turno de caja abierto',
      409,
      ErrorCode.SHIFT_NOT_OPEN,
    );
  }
}
