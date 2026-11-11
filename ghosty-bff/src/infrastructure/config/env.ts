import { z } from 'zod';

/** Converte `15m`, `10m`, `1h` ou `900s` (ou só o número, em segundos) para segundos. */
export function parseDuration(value: string): number {
  const match = /^(\d+)\s*([smh]?)$/.exec(value.trim());
  if (!match) throw new Error(`Duração inválida: ${value}`);
  const amount = Number(match[1]);
  const unit = match[2] === 'h' ? 3600 : match[2] === 'm' ? 60 : 1;
  return amount * unit;
}

const duration = (fallback: string) =>
  z
    .string()
    .default(fallback)
    .refine((value) => /^(\d+)\s*([smh]?)$/.test(value.trim()), 'use 15m, 10m, 1h ou segundos')
    .transform(parseDuration);

/** Origens separadas por vírgula. `none`: o BFF não responde CORS (na nuvem, quem responde é o APIM). */
const list = z
  .string()
  .default('http://localhost:5173')
  .transform((value) =>
    value.trim() === 'none'
      ? []
      : value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
  );

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    /** URL pública do BFF. Também é o `iss` do JWT. */
    PUBLIC_BASE_URL: z.url().default('http://localhost:3000'),
    /** Servidor mostrado no Swagger (na nuvem, o API Gateway). Vazio: o localhost do contrato. */
    OPENAPI_SERVER_URL: z.url().or(z.literal('')).default(''),
    CORS_ORIGINS: list,
    /** Vazio desliga a verificação (máquina local, sem API Management). */
    GATEWAY_SECRET: z.string().default(''),
    /** Proxies confiáveis à frente do BFF (Container Apps + API Management = 2). Define o IP do limite de taxa. */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

    /** Chave RSA privada (PKCS#8 em PEM) codificada em Base64. Vazia fora de produção: gera uma temporária. */
    JWT_PRIVATE_KEY_PEM_B64: z.string().default(''),
    JWT_KEY_ID: z.string().min(1).default('dev'),
    JWT_AUDIENCE: z.string().min(1).default('notes-web'),
    ACCESS_TOKEN_TTL: duration('15m'),
    SAFETY_TOKEN_TTL: duration('10m'),
    SAFETY_SESSION_MAX: duration('30m'),

    NOTES_SERVICE_URL: z.url().default('http://localhost:3001'),
    SAFETY_SERVICE_URL: z.url().default('http://localhost:3002'),
    INTERNAL_API_KEY: z.string().min(8, 'precisa ter pelo menos 8 caracteres'),
    FUNCTIONS_BASE_URL: z.url().default('http://localhost:7071'),
    FUNCTIONS_KEY: z.string().default(''),
    SAFETY_REMOTE_URL: z.url().default('http://localhost:5175/remoteEntry.js'),
    UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(100).default(3_000),
    /** Fuso do painel ("lembretes de hoje") e da hora na prévia da mensagem. */
    APP_TIMEZONE: z
      .string()
      .min(1)
      .max(64)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('pt-BR', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, 'fuso horário desconhecido')
      .default('America/Sao_Paulo'),

    RATE_LIMIT_LOGIN_PER_MINUTE: z.coerce.number().int().min(1).default(5),
    RATE_LIMIT_USER_PER_MINUTE: z.coerce.number().int().min(1).default(60),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (env.JWT_PRIVATE_KEY_PEM_B64 === '') {
      ctx.addIssue({ code: 'custom', path: ['JWT_PRIVATE_KEY_PEM_B64'], message: 'obrigatória em produção' });
    }
    if (env.FUNCTIONS_KEY === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['FUNCTIONS_KEY'],
        message: 'obrigatória em produção (chave da Function App)',
      });
    }
    if (env.GATEWAY_SECRET === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['GATEWAY_SECRET'],
        message: 'obrigatório em produção (entrada só pelo APIM)',
      });
    }
  });

export type Env = z.infer<typeof schema>;

/** Valida as variáveis de ambiente. A mensagem lista as variáveis com problema, sem mostrar os valores. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = schema.safeParse(source);
  if (result.success) return result.data;
  const lines = result.error.issues.map(
    (issue) => `  - ${issue.path.join('.') || '(raiz)'}: ${issue.message}`,
  );
  throw new Error(`Variáveis de ambiente inválidas no BFF:\n${lines.join('\n')}`);
}
