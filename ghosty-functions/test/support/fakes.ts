import type { EventPublisher } from '../../src/application/ports/event-publisher.js';
import type {
  DeliveryTargets,
  SafetyInternalClient,
} from '../../src/application/ports/safety-internal.client.js';
import type { Clock, IdGenerator } from '../../src/application/ports/runtime.js';
import {
  RetryableDeliveryError,
  type TelegramGateway,
  type TelegramSendResult,
} from '../../src/application/ports/telegram-gateway.js';

export class FixedClock implements Clock {
  constructor(public current = new Date('2026-11-06T22:10:05Z')) {}

  now(): Date {
    return new Date(this.current);
  }
}

export class SequentialIds implements IdGenerator {
  private n = 0;

  newId(): string {
    this.n += 1;
    return `01a1b2e9-7230-7198-bab2-${this.n.toString(16).padStart(12, '0')}`;
  }
}

/** Telegram falso: registra o que seria enviado e responde o que o teste mandar. Nunca sai da máquina. */
export class FakeTelegram implements TelegramGateway {
  readonly sent: { chatId: string; text: string }[] = [];
  next: TelegramSendResult | 'retry' = { ok: true };

  sendMessage(chatId: string, text: string): Promise<TelegramSendResult> {
    if (this.next === 'retry') return Promise.reject(new RetryableDeliveryError('429', 3));
    this.sent.push({ chatId, text });
    return Promise.resolve(this.next);
  }
}

export class FakeSafety implements SafetyInternalClient {
  targets: DeliveryTargets | undefined;
  readonly expired: { checkInId: string; version: number }[] = [];

  getDeliveryTargets(): Promise<DeliveryTargets> {
    if (!this.targets) return Promise.reject(new Error('safety-service fora do ar'));
    return Promise.resolve(this.targets);
  }

  expireCheckIn(checkInId: string, version: number) {
    this.expired.push({ checkInId, version });
    return Promise.resolve({
      result: version === 1 ? ('expired' as const) : ('ignored' as const),
      helpRequestId: null,
    });
  }

  linkTelegramContact(
    _token: string,
    _chatId: string,
    _correlationId: string,
  ): Promise<{ result: 'linked' | 'ignored'; inviterDisplayName: string | null }> {
    return Promise.resolve({ result: 'ignored', inviterDisplayName: null });
  }

  leaveTelegramContact(_chatId: string): Promise<{ result: 'left' | 'ignored'; contactsAffected: number }> {
    return Promise.resolve({ result: 'ignored', contactsAffected: 0 });
  }
}

/** As rotas internas do Telegram no safety-service, com as respostas que o teste escolher. */
export class FakeTelegramLinks extends FakeSafety {
  readonly links: { token: string; chatId: string; correlationId: string }[] = [];
  readonly leaves: string[] = [];
  linkResult: { result: 'linked' | 'ignored'; inviterDisplayName: string | null } = {
    result: 'linked',
    inviterDisplayName: 'Maria',
  };
  leaveResult: { result: 'left' | 'ignored'; contactsAffected: number } = {
    result: 'left',
    contactsAffected: 1,
  };
  down = false;

  override linkTelegramContact(token: string, chatId: string, correlationId: string) {
    if (this.down) return Promise.reject(new Error('safety-service fora do ar'));
    this.links.push({ token, chatId, correlationId });
    return Promise.resolve(this.linkResult);
  }

  override leaveTelegramContact(chatId: string) {
    if (this.down) return Promise.reject(new Error('safety-service fora do ar'));
    this.leaves.push(chatId);
    return Promise.resolve(this.leaveResult);
  }
}

export class FakePublisher implements EventPublisher {
  readonly published: { queueName: string; envelope: Record<string, unknown> }[] = [];

  publish(queueName: string, envelope: object): Promise<void> {
    this.published.push({ queueName, envelope: envelope as Record<string, unknown> });
    return Promise.resolve();
  }
}
