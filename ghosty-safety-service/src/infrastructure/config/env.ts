import { z } from 'zod';

/** Chave de cifra só para a máquina local (está no `.env.example`). Recusada em produção. */
export const DEV_ENCRYPTION_KEY = Buffer.from('chave-local-de-desenvolvimento!!').toString('base64');

const bool = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3002),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    DB_PROVIDER: z.enum(['sqlite', 'mssql']).default('sqlite'),
    SQLITE_PATH: z.string().min(1).default('./data/safety.sqlite'),
    MSSQL_HOST: z.string().default(''),
    MSSQL_PORT: z.coerce.number().int().default(1433),
    MSSQL_DATABASE: z.string().default(''),
    MSSQL_USER: z.string().default(''),
    MSSQL_PASSWORD: z.string().default(''),
    DB_POOL_MIN: z.coerce.number().int().min(0).default(0),
    DB_POOL_IDLE_MS: z.coerce.number().int().min(1_000).default(30_000),
    /** Só com mssql: roda as migrações pendentes na subida (exige um usuário com permissão de DDL). */
    DB_RUN_MIGRATIONS: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),

    INTERNAL_API_KEY: z.string().min(8, 'precisa ter pelo menos 8 caracteres'),
    DATA_ENCRYPTION_KEY: z
      .string()
      .refine(
        (value) => Buffer.from(value, 'base64').length === 32,
        '32 bytes em Base64 (openssl rand -base64 32)',
      ),

    MESSAGING_ENABLED: bool,
    QUEUE_CONNECTION_STRING: z.string().min(1).default('UseDevelopmentStorage=true'),
    QUEUE_HELP_REQUESTS: z.string().min(3).default('help-requests'),
    QUEUE_CHECKIN_DEADLINES: z.string().min(3).default('check-in-deadlines'),
    QUEUE_ALERT_DISPATCHES: z.string().min(3).default('alert-dispatches'),

    CODE_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
    CODE_LOCK_MINUTES: z.coerce.number().int().min(1).default(15),
    INVITE_BASE_URL: z.url().default('http://localhost:5173/c'),
    INVITE_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(72),
    TELEGRAM_BOT_USERNAME: z
      .string()
      .regex(/^[A-Za-z0-9_]{5,32}$/, 'nome do bot sem @')
      .default('ghosty_dev_bot'),
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
  })
  .superRefine((env, ctx) => {
    if (env.DB_PROVIDER === 'mssql') {
      for (const key of ['MSSQL_HOST', 'MSSQL_DATABASE', 'MSSQL_USER', 'MSSQL_PASSWORD'] as const) {
        if (env[key] === '')
          ctx.addIssue({ code: 'custom', path: [key], message: 'obrigatória com DB_PROVIDER=mssql' });
      }
    }
    if (env.NODE_ENV === 'production' && env.DATA_ENCRYPTION_KEY === DEV_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATA_ENCRYPTION_KEY'],
        message: 'a chave de desenvolvimento não vale em produção',
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
  throw new Error(`Variáveis de ambiente inválidas no safety-service:\n${lines.join('\n')}`);
}
