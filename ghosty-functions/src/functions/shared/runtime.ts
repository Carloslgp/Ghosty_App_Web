import { v7 as uuidv7 } from 'uuid';
import { CheckCheckInDeadlineHandler } from '../../application/features/check-check-in-deadline/check-check-in-deadline.handler.js';
import { DispatchAlertHandler } from '../../application/features/dispatch-alert/dispatch-alert.handler.js';
import type { Clock, IdGenerator } from '../../application/ports/runtime.js';
import { loadEnv, type Env } from '../../infrastructure/config/env.js';
import { SafetyInternalHttpClient } from '../../infrastructure/http/safety-internal.http-client.js';
import { StorageQueuePublisher } from '../../infrastructure/messaging/storage-queue.publisher.js';
import {
  DisabledTelegramGateway,
  TelegramBotGateway,
} from '../../infrastructure/telegram/telegram-bot.gateway.js';

export const systemClock: Clock = { now: () => new Date() };
export const uuidIds: IdGenerator = { newId: () => uuidv7() };

/**
 * Raiz de composição dos gatilhos de fila. As configurações são lidas na primeira execução (e não ao
 * carregar o módulo), para as funções HTTP subirem mesmo sem o que só a fila precisa.
 */
let env: Env | undefined;
let dispatch: DispatchAlertHandler | undefined;
let deadline: CheckCheckInDeadlineHandler | undefined;
let publisher: StorageQueuePublisher | undefined;

function settings(): Env {
  env ??= loadEnv();
  return env;
}

function safetyClient() {
  const s = settings();
  return new SafetyInternalHttpClient({
    baseUrl: s.SAFETY_SERVICE_URL,
    internalKey: s.INTERNAL_API_KEY,
    timeoutMs: s.SAFETY_TIMEOUT_MS,
  });
}

export function eventPublisher(): StorageQueuePublisher {
  publisher ??= new StorageQueuePublisher(settings().QueueConnection);
  return publisher;
}

export function dispatchAlertHandler(): DispatchAlertHandler {
  if (!dispatch) {
    const s = settings();
    const telegram =
      s.DELIVERY_MODE === 'telegram'
        ? new TelegramBotGateway(s.TELEGRAM_BOT_TOKEN)
        : new DisabledTelegramGateway();
    dispatch = new DispatchAlertHandler(safetyClient(), telegram, eventPublisher(), systemClock, uuidIds, {
      deliveryMode: s.DELIVERY_MODE,
      timezone: s.APP_TIMEZONE,
      alertDispatchesQueue: s.QUEUE_ALERT_DISPATCHES,
    });
  }
  return dispatch;
}

export function checkInDeadlineHandler(): CheckCheckInDeadlineHandler {
  deadline ??= new CheckCheckInDeadlineHandler(safetyClient());
  return deadline;
}
