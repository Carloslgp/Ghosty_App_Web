import type { Env } from '../infrastructure/config/env.js';
import type { AppOptions } from './app.module.js';

/** Converte as variáveis de ambiente validadas nas opções do módulo raiz. */
export function appOptionsFrom(env: Env): AppOptions {
  return {
    gatewaySecret: env.GATEWAY_SECRET,
    logLevel: env.LOG_LEVEL,
    rateLimit: {
      loginPerMinute: env.RATE_LIMIT_LOGIN_PER_MINUTE,
      userPerMinute: env.RATE_LIMIT_USER_PER_MINUTE,
    },
    tokens: {
      privateKeyPem: env.JWT_PRIVATE_KEY_PEM_B64
        ? Buffer.from(env.JWT_PRIVATE_KEY_PEM_B64, 'base64').toString('utf8')
        : undefined,
      keyId: env.JWT_KEY_ID,
      issuer: env.PUBLIC_BASE_URL,
      audience: env.JWT_AUDIENCE,
      accessTtlSeconds: env.ACCESS_TOKEN_TTL,
      safetyMaxSeconds: env.SAFETY_SESSION_MAX,
    },
    services: {
      notesUrl: env.NOTES_SERVICE_URL,
      safetyUrl: env.SAFETY_SERVICE_URL,
      internalApiKey: env.INTERNAL_API_KEY,
      functionsUrl: env.FUNCTIONS_BASE_URL,
      functionsKey: env.FUNCTIONS_KEY,
      timeoutMs: env.UPSTREAM_TIMEOUT_MS,
    },
    config: {
      safetyRemoteUrl: env.SAFETY_REMOTE_URL,
      safetySession: { idleMs: env.SAFETY_TOKEN_TTL * 1000, maxMs: env.SAFETY_SESSION_MAX * 1000 },
      timezone: env.APP_TIMEZONE,
    },
  };
}
