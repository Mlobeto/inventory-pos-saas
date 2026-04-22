import bcrypt from 'bcryptjs';
import { UserStatus } from '@prisma/client';
import { AuthRepository } from './auth.repository';
import {
  LoginRequestDto,
  LoginResponseDto,
  AuthUserDto,
  RefreshTokenRequestDto,
} from './auth.dto';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../config/jwt';
import { resolveTenantBySlug } from '../../core/tenancy/tenancy.resolver';
import { AppError } from '../../core/errors/AppError';
import { ErrorCode } from '../../core/errors/ErrorCodes';
import { BCRYPT_ROUNDS } from '../../shared/constants';

export const AuthService = {
  async login(dto: LoginRequestDto): Promise<LoginResponseDto> {
    // 1. Resolver tenant por slug
    const tenancy = await resolveTenantBySlug(dto.tenantSlug);

    // 2. Buscar usuario dentro del tenant
    const user = await AuthRepository.findUserByEmailAndTenant(
      dto.email.toLowerCase().trim(),
      tenancy.tenantId,
    );

    // 3. Validar existencia y contraseña (tiempo constante)
    const dummyHash = '$2a$12$invalid.hash.for.timing.protection.only';
    const passwordHash = user?.passwordHash ?? dummyHash;
    const isPasswordValid = await bcrypt.compare(dto.password, passwordHash);

    if (!user || !isPasswordValid) {
      throw new AppError(
        'Credenciales incorrectas',
        401,
        ErrorCode.INVALID_CREDENTIALS,
      );
    }

    // 4. Verificar estado del usuario
    if (user.status !== UserStatus.ACTIVE) {
      throw new AppError(
        'Tu cuenta está inactiva. Contactá al administrador.',
        403,
        ErrorCode.FORBIDDEN,
      );
    }

    // 5. Generar tokens
    const tokenPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions,
    };

    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken({
      sub: user.id,
      tenantId: user.tenantId,
      type: 'refresh',
    });

    const userDto: AuthUserDto = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      tenantId: user.tenantId,
      tenantName: user.tenant.name,
      roles: user.roles,
      permissions: user.permissions,
    };

    return { accessToken, refreshToken, user: userDto };
  },

  async refreshToken(dto: RefreshTokenRequestDto): Promise<{ accessToken: string }> {
    let payload;
    try {
      payload = verifyRefreshToken(dto.refreshToken);
    } catch {
      throw new AppError('Refresh token inválido o expirado', 401, ErrorCode.TOKEN_INVALID);
    }

    const user = await AuthRepository.findUserById(payload.sub);

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new AppError('Usuario no encontrado o inactivo', 401, ErrorCode.UNAUTHORIZED);
    }

    const accessToken = signAccessToken({
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions,
    });

    return { accessToken };
  },

  async getMe(userId: string): Promise<AuthUserDto> {
    const user = await AuthRepository.findUserById(userId);

    if (!user) {
      throw AppError.notFound('Usuario');
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      tenantId: user.tenantId,
      tenantName: user.tenant.name,
      roles: user.roles,
      permissions: user.permissions,
    };
  },

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await AuthRepository.findUserById(userId);

    if (!user) {
      throw AppError.notFound('Usuario');
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new AppError(
        'La contraseña actual es incorrecta',
        400,
        ErrorCode.INVALID_INPUT,
      );
    }

    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await AuthRepository.updatePassword(userId, newHash);
  },
};
