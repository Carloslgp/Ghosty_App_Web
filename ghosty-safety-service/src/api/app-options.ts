import type { Env } from '../infrastructure/config/env.js';
import type { AppOptions } from './app.module.js';

/** Converte as variáveis de ambiente validadas nas opções do módulo raiz. */
export function appOptionsFrom(env: Env): AppOptions {
  return {
    internalApiKey: env.INTERNAL_API_KEY,
    logLevel: env.LOG_LEVEL,
    encryptionKey: env.DATA_ENCRYPTION_KEY,
    database:
      env.DB_PROVIDER === 'sqlite'
        ? { provider: 'sqlite', sqlitePath: env.SQLITE_PATH }
        : {
            provider: 'mssql',
            mssql: {
              host: env.MSSQL_HOST,
              port: env.MSSQL_PORT,
              database: env.MSSQL_DATABASE,
              user: env.MSSQL_USER,
              password: env.MSSQL_PASSWORD,
            },
            poolMin: env.DB_POOL_MIN,
            poolIdleMs: env.DB_POOL_IDLE_MS,
          },
    messaging: {
      enabled: env.MESSAGING_ENABLED,
      connectionString: env.QUEUE_CONNECTION_STRING,
      helpRequestsQueue: env.QUEUE_HELP_REQUESTS,
      checkInDeadlinesQueue: env.QUEUE_CHECKIN_DEADLINES,
      alertDispatchesQueue: env.QUEUE_ALERT_DISPATCHES,
    },
    safety: {
      codeLock: { maxAttempts: env.CODE_MAX_ATTEMPTS, lockMinutes: env.CODE_LOCK_MINUTES },
      inviteTtlHours: env.INVITE_TTL_HOURS,
      inviteBaseUrl: env.INVITE_BASE_URL,
      telegramBotUsername: env.TELEGRAM_BOT_USERNAME,
    },
  };
}
