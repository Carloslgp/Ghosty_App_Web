import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    /** URI do Atlas. Vazia (só fora de produção) usa o `mongodb-memory-server`. */
    MONGODB_URI: z.string().trim().default(''),
    MONGODB_DB: z.string().trim().min(1).default('notes_dev'),
    INTERNAL_API_KEY: z.string().min(8, 'precisa ter pelo menos 8 caracteres'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    /** Servidor mostrado no Swagger (na nuvem, o endereço do Container App). Vazio: o localhost do contrato. */
    OPENAPI_SERVER_URL: z.url().or(z.literal('')).default(''),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.MONGODB_URI === '') {
      ctx.addIssue({ code: 'custom', path: ['MONGODB_URI'], message: 'obrigatória em produção' });
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
  throw new Error(`Variáveis de ambiente inválidas no notes-service:\n${lines.join('\n')}`);
}
