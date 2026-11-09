import { describe, expect, it } from 'vitest';
import { loadEnv, parseDuration } from './env.js';

const base = { INTERNAL_API_KEY: 'chave-interna-1' };

describe('Configuração do BFF', () => {
  it('na máquina local, os padrões bastam', () => {
    const env = loadEnv(base);
    expect(env).toMatchObject({
      PORT: 3000,
      CORS_ORIGINS: ['http://localhost:5173'],
      APP_TIMEZONE: 'America/Sao_Paulo',
      UPSTREAM_TIMEOUT_MS: 3000,
    });
  });

  it('CORS: lista separada por vírgula, ou "none" quando o API Management responde o CORS', () => {
    expect(loadEnv({ ...base, CORS_ORIGINS: 'https://a.example, https://b.example' }).CORS_ORIGINS).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
    expect(loadEnv({ ...base, CORS_ORIGINS: 'none' }).CORS_ORIGINS).toEqual([]);
  });

  it('em produção exige a chave do JWT, o segredo do gateway e a chave da Function, sem mostrar valores', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production' })).toThrow(
      /JWT_PRIVATE_KEY_PEM_B64[\s\S]*FUNCTIONS_KEY[\s\S]*GATEWAY_SECRET/,
    );
    expect(() =>
      loadEnv({
        ...base,
        NODE_ENV: 'production',
        JWT_PRIVATE_KEY_PEM_B64: 'chave',
        GATEWAY_SECRET: 'segredo',
        FUNCTIONS_KEY: 'fn',
      }),
    ).not.toThrow();
  });

  it('recusa fuso horário desconhecido e duração fora do formato', () => {
    expect(() => loadEnv({ ...base, APP_TIMEZONE: 'Marte/Base' })).toThrow(/APP_TIMEZONE/);
    expect(() => loadEnv({ ...base, ACCESS_TOKEN_TTL: 'meia hora' })).toThrow(/ACCESS_TOKEN_TTL/);
    expect([parseDuration('15m'), parseDuration('1h'), parseDuration('90')]).toEqual([900, 3600, 90]);
  });
});
