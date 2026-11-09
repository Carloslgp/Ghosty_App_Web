import { app, type InvocationContext } from '@azure/functions';
import type { CheckInDeadlineScheduled } from '../application/features/check-check-in-deadline/check-check-in-deadline.handler.js';
import type { HelpRequestTriggered } from '../application/features/dispatch-alert/dispatch-alert.handler.js';
import {
  InvalidEventError,
  parseQueueMessage,
  validateEvent,
} from '../infrastructure/events/event-validator.js';
import { checkInDeadlineHandler, dispatchAlertHandler, eventPublisher } from './shared/runtime.js';

/**
 * Gatilhos de fila. Erro passageiro (safety-service ou Telegram fora do ar): a função lança, e o host
 * tenta de novo até `maxDequeueCount` (host.json) antes de mover para `<fila>-poison`. Mensagem fora do
 * JSON Schema não melhora com novas tentativas: vai direto para a `<fila>-poison`.
 */
export async function dispatchAlert(message: unknown, context: InvocationContext): Promise<void> {
  const event = validateEvent<HelpRequestTriggered>('helpRequestTriggered', parseQueueMessage(message));
  const result = await dispatchAlertHandler().execute(event);
  // Só ids e resultados: nunca o texto, o chat nem o apelido.
  context.log(
    `dispatch-alert ${event.data.helpRequestId}: ${result.status} (${result.steps.map((s) => s.outcome).join(', ')})`,
  );
}

export async function checkInDeadline(message: unknown, context: InvocationContext): Promise<void> {
  const event = validateEvent<CheckInDeadlineScheduled>(
    'checkInDeadlineScheduled',
    parseQueueMessage(message),
  );
  const result = await checkInDeadlineHandler().execute(event);
  context.log(`check-in-deadline ${event.data.checkInId} v${event.data.version}: ${result.result}`);
}

function attempt(context: InvocationContext): string {
  const count = context.triggerMetadata?.dequeueCount;
  return typeof count === 'number' || typeof count === 'string' ? String(count) : '?';
}

export function guard(
  name: string,
  queueName: string,
  run: (message: unknown, context: InvocationContext) => Promise<void>,
) {
  return async (message: unknown, context: InvocationContext): Promise<void> => {
    try {
      await run(message, context);
    } catch (error) {
      if (error instanceof InvalidEventError || error instanceof SyntaxError) {
        context.error(`${name}: mensagem fora do schema, movida para ${queueName}-poison`);
        const body = typeof message === 'object' && message !== null ? message : { raw: String(message) };
        await eventPublisher().publish(`${queueName}-poison`, body);
        return;
      }
      context.error(`${name}: falha na tentativa ${attempt(context)}`);
      throw error;
    }
  };
}

app.storageQueue('dispatch-alert', {
  queueName: 'help-requests',
  connection: 'QueueConnection',
  handler: guard('dispatch-alert', 'help-requests', dispatchAlert),
});

app.storageQueue('check-in-deadline', {
  queueName: 'check-in-deadlines',
  connection: 'QueueConnection',
  handler: guard('check-in-deadline', 'check-in-deadlines', checkInDeadline),
});
