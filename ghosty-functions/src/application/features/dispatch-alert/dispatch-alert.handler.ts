import {
  dispatchStatus,
  planDispatch,
  type ContactChannel,
  type ContactStatus,
  type DeliveryChannel,
  type DeliveryOutcome,
  type Mode,
  type PlannedContact,
} from '../../../domain/dispatch/dispatch-planner.js';
import { composeMessage, DEFAULT_TIMEZONE } from '../../../domain/message/message-composer.js';
import type { EventPublisher } from '../../ports/event-publisher.js';
import type { SafetyInternalClient } from '../../ports/safety-internal.client.js';
import type { Clock, FunctionsConfig, IdGenerator } from '../../ports/runtime.js';
import type { TelegramGateway } from '../../ports/telegram-gateway.js';

/** O evento `HelpRequestTriggered` (fila `help-requests`), já validado contra o JSON Schema. */
export interface HelpRequestTriggered {
  id: string;
  correlationId: string;
  data: {
    helpRequestId: string;
    accountId: string;
    mode: Mode;
    displayName: string;
    messageTemplate: string;
    location: { lat: number; lng: number; accuracyMeters?: number | null } | null;
    contacts: {
      contactId: string;
      nickname: string;
      position: number;
      status: ContactStatus;
      channel: ContactChannel | null;
    }[];
    timezone: string;
    triggeredAt: string;
  };
}

export interface DispatchStep {
  stepOrder: number;
  contactId: string | null;
  channel: DeliveryChannel;
  outcome: DeliveryOutcome;
  message: string | null;
  errorCode: string | null;
  occurredAt: string;
}

export const ALERT_DISPATCHED_TYPE = 'ghosty.functions.alert.dispatched.v1';

/** Passos que já alcançaram alguém e não podem se repetir num reprocessamento. */
const DONE: DeliveryOutcome[] = ['sent', 'published_web', 'would_send'];

/**
 * Envia os avisos de um pedido de ajuda e publica o `AlertDispatched` com um passo por contato.
 * - Busca os destinos na hora (o evento não leva o chat do Telegram).
 * - Modo `test` e `DELIVERY_MODE=simulated` nunca chamam o Telegram.
 * - 403 e 400 do Telegram viram `failed`; 429 e 5xx lançam erro, e a fila tenta de novo.
 * - Reprocessando a mesma mensagem, o que já foi entregue não é enviado de novo.
 */
export class DispatchAlertHandler {
  constructor(
    private readonly safety: SafetyInternalClient,
    private readonly telegram: TelegramGateway,
    private readonly publisher: EventPublisher,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly config: FunctionsConfig,
  ) {}

  async execute(
    event: HelpRequestTriggered,
  ): Promise<{ status: 'dispatched' | 'failed'; steps: DispatchStep[] }> {
    const { data } = event;
    const targets = await this.safety.getDeliveryTargets(data.helpRequestId, event.correlationId);
    const byId = new Map(targets.targets.map((target) => [target.contactId, target]));
    const done = new Map(
      targets.recordedSteps
        .filter((step) => step.contactId !== null && DONE.includes(step.outcome))
        .map((step) => [step.contactId as string, step.outcome]),
    );

    // O status vale o que o safety-service diz agora: só quem está em `targets` está confirmado.
    const contacts: PlannedContact[] = data.contacts.map((contact) => {
      const target = byId.get(contact.contactId);
      return target
        ? { ...contact, status: 'confirmed', channel: target.channel }
        : { ...contact, status: contact.status === 'confirmed' ? 'pending' : contact.status, channel: null };
    });

    const steps: DispatchStep[] = [];
    for (const planned of planDispatch(contacts, data.mode, this.config.deliveryMode)) {
      const contact = planned.contact;
      const message =
        contact && planned.action !== 'skipped_unconfirmed'
          ? composeMessage({
              template: data.messageTemplate,
              displayName: data.displayName,
              contactNickname: contact.nickname,
              location: data.location ? { kind: 'point', point: data.location } : { kind: 'unavailable' },
              at: new Date(data.triggeredAt),
              timezone: data.timezone || this.config.timezone || DEFAULT_TIMEZONE,
            }).text
          : null;

      let outcome: DeliveryOutcome;
      let errorCode: string | null = null;
      const already = contact ? done.get(contact.contactId) : undefined;
      if (already) {
        outcome = already;
      } else if (planned.action === 'send_telegram') {
        const chatId = contact ? byId.get(contact.contactId)?.telegramChatId : null;
        if (!chatId || message === null) {
          outcome = 'failed';
          errorCode = 'telegram_chat_missing';
        } else {
          const result = await this.telegram.sendMessage(chatId, message);
          outcome = result.ok ? 'sent' : 'failed';
          errorCode = result.ok ? null : result.errorCode;
        }
      } else {
        outcome = planned.action;
      }

      steps.push({
        stepOrder: planned.stepOrder,
        contactId: contact?.contactId ?? null,
        channel: planned.channel,
        outcome,
        message: outcome === 'skipped_unconfirmed' || outcome === 'no_contacts' ? null : message,
        errorCode,
        occurredAt: this.clock.now().toISOString(),
      });
    }

    const status = dispatchStatus(steps.map((step) => step.outcome));
    const now = this.clock.now().toISOString();
    await this.publisher.publish(this.config.alertDispatchesQueue, {
      specversion: '1.0',
      id: this.ids.newId(),
      type: ALERT_DISPATCHED_TYPE,
      source: 'ghosty-functions',
      time: now,
      correlationId: event.correlationId,
      data: {
        helpRequestId: data.helpRequestId,
        accountId: data.accountId,
        mode: data.mode,
        deliveryMode: this.config.deliveryMode,
        status,
        dispatchedAt: now,
        steps,
      },
    });
    return { status, steps };
  }
}
