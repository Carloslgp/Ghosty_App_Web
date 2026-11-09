import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { HandleTelegramUpdateHandler } from '../application/features/handle-telegram-update/handle-telegram-update.handler.js';
import { correlationIdOf, ok, problem } from './shared/http.js';
import { settings, telegramUpdateHandler } from './shared/runtime.js';
import { telegramUpdateSchema } from './shared/schemas.js';

export const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token';

/** Comparação em tempo constante. Sem segredo configurado, nada confere (falha fechada). */
export function secretMatches(received: string | null, expected: string): boolean {
  if (!received || expected === '') return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(received), digest(expected));
}

interface Dependencies {
  webhookSecret: () => string;
  handler: () => HandleTelegramUpdateHandler;
}

/**
 * `POST /api/telegram/webhook`: o Telegram chama direto (sem passar pelo APIM), com a function key em
 * `?code=` e o `secret_token` do `setWebhook` no cabeçalho. Responde 200 mesmo quando ignora a mensagem,
 * para o Telegram não reenviar. O log leva só o resultado: nunca o texto, o chat nem o token.
 */
export function createTelegramWebhook(deps: Dependencies) {
  return async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const correlationId = correlationIdOf(request);
    const instance = new URL(request.url).pathname;
    if (!secretMatches(request.headers.get(TELEGRAM_SECRET_HEADER), deps.webhookSecret())) {
      return problem('UNAUTHENTICATED', instance, correlationId);
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      raw = undefined;
    }
    const update = telegramUpdateSchema.safeParse(raw);
    // Corpo que não é um `Update` não melhora com reenvio.
    if (!update.success) return ok({ result: 'ignored' }, correlationId);

    const message = update.data.message;
    try {
      const result = await deps
        .handler()
        .execute(
          message
            ? { text: message.text, chatId: String(message.chat.id), chatType: message.chat.type }
            : undefined,
          correlationId,
        );
      context.log(`telegram-webhook: ${result}`);
      return ok({ result }, correlationId);
    } catch (error) {
      // safety-service fora do ar: 500 faz o Telegram tentar de novo mais tarde.
      context.error(`telegram-webhook: falha (${error instanceof Error ? error.name : 'erro'})`);
      return problem('INTERNAL_ERROR', instance, correlationId);
    }
  };
}

export const telegramWebhook = createTelegramWebhook({
  webhookSecret: () => settings().TELEGRAM_WEBHOOK_SECRET,
  handler: telegramUpdateHandler,
});

app.http('telegram-webhook', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'telegram/webhook',
  handler: telegramWebhook,
});
