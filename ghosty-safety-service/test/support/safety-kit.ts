import type { Clock } from '../../src/application/ports/clock.js';
import type { IdGenerator } from '../../src/application/ports/id-generator.js';
import type { PasswordHasher } from '../../src/application/ports/password-hasher.js';
import type { SafetyConfig } from '../../src/application/ports/safety-config.js';
import type { Repositories } from '../../src/application/ports/unit-of-work.js';
import { validateEvent, type EventName } from '../../src/infrastructure/events/event-validator.js';
import { createDataSource } from '../../src/infrastructure/persistence/data-source.js';
import { TypeOrmUnitOfWork } from '../../src/infrastructure/persistence/typeorm.unit-of-work.js';
import { AesGcmFieldCipher } from '../../src/infrastructure/security/aes-gcm.field-cipher.js';
import { RandomOpaqueTokens } from '../../src/infrastructure/security/opaque-tokens.js';

/** Chave fixa só para testes (32 bytes em Base64). */
export const TEST_KEY = Buffer.from('chave-de-teste-com-32-bytes-ok!!').toString('base64');

export class FixedClock implements Clock {
  constructor(public current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

/** UUIDs v7 válidos e previsíveis. */
export class SequentialIds implements IdGenerator {
  private next = 0;

  newId(): string {
    this.next += 1;
    return `01a1b2e9-0000-7000-8000-${this.next.toString(16).padStart(12, '0')}`;
  }
}

/** Hasher rápido para os testes de casos de uso (o Argon2id real tem teste próprio). */
export class FakeHasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    return `fake$${plain}`;
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    return hash === `fake$${plain}`;
  }
}

export const TEST_CONFIG: SafetyConfig = {
  codeLock: { maxAttempts: 5, lockMinutes: 15 },
  inviteTtlHours: 72,
  inviteBaseUrl: 'http://localhost:5173/c',
  telegramBotUsername: 'ghosty_dev_bot',
  timezone: 'America/Sao_Paulo',
};

const SCHEMA_BY_TYPE: Record<string, EventName> = {
  'ghosty.safety.help-request.triggered.v1': 'helpRequestTriggered',
  'ghosty.safety.check-in.deadline-scheduled.v1': 'checkInDeadlineScheduled',
};

/** Um evento gravado no outbox, já conferido contra o JSON Schema do AsyncAPI. */
export interface OutboxEvent {
  id: string;
  type: string;
  correlationId: string;
  visibleAfter: Date | null;
  data: Record<string, unknown>;
}

export interface SafetyKit {
  uow: TypeOrmUnitOfWork;
  clock: FixedClock;
  ids: SequentialIds;
  hasher: FakeHasher;
  tokens: RandomOpaqueTokens;
  cipher: AesGcmFieldCipher;
  config: SafetyConfig;
  /** Atalho para ler ou gravar direto nos repositórios. */
  repos<T>(work: (repos: Repositories) => Promise<T>): Promise<T>;
  /** Os eventos do outbox, do mais antigo para o mais novo. Falha se algum estiver fora do schema. */
  outboxEvents(): Promise<OutboxEvent[]>;
  /** Consulta SQL crua (para conferir o que ficou gravado, por exemplo cifrado). */
  query<T = Record<string, unknown>>(sql: string): Promise<T[]>;
  close(): Promise<void>;
}

/** SQLite em memória, o mesmo adaptador da máquina local, com o esquema sincronizado. */
export async function createSafetyKit(now = new Date('2026-11-06T22:00:00Z')): Promise<SafetyKit> {
  const { dataSource, schemas } = createDataSource({ provider: 'sqlite', sqlitePath: ':memory:' });
  await dataSource.initialize();
  const cipher = new AesGcmFieldCipher(TEST_KEY);
  const uow = new TypeOrmUnitOfWork(dataSource, schemas, cipher, true);
  return {
    uow,
    clock: new FixedClock(now),
    ids: new SequentialIds(),
    hasher: new FakeHasher(),
    tokens: new RandomOpaqueTokens(),
    cipher,
    config: TEST_CONFIG,
    repos: (work) => uow.run(work),
    outboxEvents: async () =>
      (await uow.run(({ outbox }) => outbox.listPending(1000))).map((message) => {
        const envelope = validateEvent<{ data: Record<string, unknown> }>(
          SCHEMA_BY_TYPE[message.type] as EventName,
          JSON.parse(message.payload),
        );
        return {
          id: message.id,
          type: message.type,
          correlationId: message.correlationId,
          visibleAfter: message.visibleAfter,
          data: envelope.data,
        };
      }),
    query: (sql) => dataSource.query(sql),
    close: () => dataSource.destroy(),
  };
}
