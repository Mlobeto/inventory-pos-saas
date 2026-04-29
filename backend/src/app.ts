import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { errorHandler } from './core/errors/errorHandler';
import { logger } from './core/utils/logger';
import { registerRoutes } from './routes';

export function createApp(): express.Application {
  const app = express();

  // Confiar en el proxy de Render/Railway/Vercel (necesario para rate-limit y IPs reales)
  app.set('trust proxy', 1);

  // ── Seguridad ──────────────────────────────────────────────────────────────
  app.use(helmet());

  const corsOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim());
  app.use(
    cors({
      origin: (origin, cb) => {
        // Permitir requests sin origin (ej: Postman, mobile apps)
        if (!origin || corsOrigins.includes(origin)) {
          cb(null, true);
        } else {
          logger.warn(`CORS: origin ${origin} no permitido`);
          cb(null, false);
        }
      },
      credentials: true,
    }),
  );

  // Rate limiting global — evita abuso de la API
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMIT', message: 'Demasiadas solicitudes' } },
  });
  app.use('/api', limiter);

  // Rate limiting más estricto para auth
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/auth/login', authLimiter);

  // ── Parsing ────────────────────────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // ── Logging ────────────────────────────────────────────────────────────────
  if (env.NODE_ENV !== 'test') {
    app.use(
      morgan('combined', {
        stream: { write: (msg) => logger.http(msg.trim()) },
      }),
    );
  }

  // ── Health check (sin auth, sin tenant) ───────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ── Rutas de la API ────────────────────────────────────────────────────────
  registerRoutes(app);

  // ── Error handler global (debe ir al final) ───────────────────────────────
  app.use(errorHandler);

  return app;
}
