import { z } from 'zod';

const schema = z
  .object({
    SAFETY_SERVICE_URL: z.url().default('http://localhost:3002'),
    INTERNAL_API_KEY: z.string().min(8, 'precisa ter pelo menos 8 caracteres'),
    SAFETY_TIMEOUT_MS: z.coerce.number().int().min(100).default(5_000),
    APP_TIMEZONE: z.string().min(1).default('America/Sao_Paulo'),
    /** `simulated` (padrão): nada sai pelo Telegram. `telegram`: envio real. */
    DELIVERY_MODE: z.enum(['simulated', 'telegram']).default('simulated'),
    TELEGRAM_BOT_TOKEN: z.string().default(''),
    TELEGRAM_WEBHOOK_SECRET: z.string().default(''),
    TELEGRAM_BOT_USERNAME: z.string().default('ghosty_dev_bot'),
    /** A mesma conexão usada pelos gatilhos de fila (`connection: 'QueueConnection'`). */
    QueueConnection: z.string().min(1).default('UseDevelopmentStorage=true'),
    QUEUE_ALERT_DISPATCHES: z.string().min(3).default('alert-dispatches'),
  })
  .superRefine((env, ctx) => {
    if (env.DELIVERY_MODE === 'telegram' && env.TELEGRAM_BOT_TOKEN === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['TELEGRAM_BOT_TOKEN'],
        message: 'obrigatório com DELIVERY_MODE=telegram',
      });
    }
  });

export type Env = z.infer<typeof schema>;

/** Valida as configurações da Function App. A mensagem lista o que está errado, sem mostrar valores. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = schema.safeParse(source);
  if (result.success) return result.data;
  const lines = result.error.issues.map(
    (issue) => `  - ${issue.path.join('.') || '(raiz)'}: ${issue.message}`,
  );
  throw new Error(`Configurações inválidas na Function App:\n${lines.join('\n')}`);
}
