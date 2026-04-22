import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './config/database';
import { logger } from './core/utils/logger';

async function bootstrap(): Promise<void> {
  // Verificar conexión a la base de datos
  try {
    await prisma.$connect();
    logger.info('✅ Conectado a la base de datos');
  } catch (err) {
    logger.error('❌ No se pudo conectar a la base de datos', { error: err });
    process.exit(1);
  }

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info(`🚀 Servidor corriendo en http://localhost:${env.PORT}`);
    logger.info(`   Entorno: ${env.NODE_ENV}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} recibido, cerrando servidor...`);
    server.close(async () => {
      await prisma.$disconnect();
      logger.info('Servidor cerrado correctamente');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('UnhandledRejection', { reason });
  });

  process.on('uncaughtException', (err) => {
    logger.error('UncaughtException', { error: err });
    process.exit(1);
  });
}

bootstrap();
