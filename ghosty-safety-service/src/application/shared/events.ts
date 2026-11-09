import type { CheckIn } from '../../domain/check-ins/check-in.entity.js';
import type { Contact } from '../../domain/contacts/contact.entity.js';
import type { HelpRequest } from '../../domain/help-requests/help-request.entity.js';
import type { OutboxMessage } from '../ports/outbox.repository.js';

/** Tipos dos eventos publicados pelo outbox (o `type` do envelope define a fila). */
export const EVENT_TYPES = {
  helpRequestTriggered: 'ghosty.safety.help-request.triggered.v1',
  checkInDeadlineScheduled: 'ghosty.safety.check-in.deadline-scheduled.v1',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export const EVENT_SOURCE = 'safety-service';

interface EnvelopeParams {
  /** O `id` do envelope (UUID v7), que os consumidores usam para descartar repetições. */
  id: string;
  type: EventType;
  correlationId: string;
  now: Date;
  data: object;
  visibleAfter?: Date;
}

/** Envelope no estilo CloudEvents, pronto para a tabela `Outbox`. */
function outboxMessage(params: EnvelopeParams): OutboxMessage {
  return {
    id: params.id,
    type: params.type,
    payload: JSON.stringify({
      specversion: '1.0',
      id: params.id,
      type: params.type,
      source: EVENT_SOURCE,
      time: params.now.toISOString(),
      correlationId: params.correlationId,
      data: params.data,
    }),
    correlationId: params.correlationId,
    visibleAfter: params.visibleAfter ?? null,
    createdAt: params.now,
    publishedAt: null,
    attempts: 0,
  };
}

/**
 * `HelpRequestTriggered`: leva o que a Function precisa para montar a mensagem de cada contato, mas
 * nenhum destino de entrega (o chat do Telegram só sai pela rota interna `delivery-targets`).
 */
export function helpRequestTriggeredMessage(params: {
  eventId: string;
  correlationId: string;
  now: Date;
  request: HelpRequest;
  displayName: string;
  messageTemplate: string;
  contacts: Contact[];
  timezone: string;
}): OutboxMessage {
  const request = params.request.toSnapshot();
  return outboxMessage({
    id: params.eventId,
    type: EVENT_TYPES.helpRequestTriggered,
    correlationId: params.correlationId,
    now: params.now,
    data: {
      helpRequestId: request.id,
      accountId: request.accountId,
      mode: request.mode,
      origin: request.origin,
      checkInId: request.checkInId,
      displayName: params.displayName,
      messageTemplate: params.messageTemplate,
      location: request.location,
      contacts: params.contacts.map((contact) => ({
        contactId: contact.id,
        nickname: contact.nickname,
        position: contact.position,
        status: contact.status,
        channel: contact.channel,
      })),
      timezone: params.timezone,
      triggeredAt: request.createdAt.toISOString(),
    },
  });
}

/** `CheckInDeadlineScheduled`: fica invisível na fila até o prazo (`dueAt` + tolerância). */
export function checkInDeadlineScheduledMessage(params: {
  eventId: string;
  correlationId: string;
  now: Date;
  checkIn: CheckIn;
}): OutboxMessage {
  const checkIn = params.checkIn.toSnapshot();
  const deadlineAt = params.checkIn.deadlineAt;
  return outboxMessage({
    id: params.eventId,
    type: EVENT_TYPES.checkInDeadlineScheduled,
    correlationId: params.correlationId,
    now: params.now,
    visibleAfter: deadlineAt,
    data: {
      checkInId: checkIn.id,
      accountId: checkIn.accountId,
      version: checkIn.version,
      mode: checkIn.mode,
      dueAt: checkIn.dueAt.toISOString(),
      toleranceMinutes: checkIn.toleranceMinutes,
      deadlineAt: deadlineAt.toISOString(),
    },
  });
}
