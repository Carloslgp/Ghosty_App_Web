import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type DynamicModule,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { RecordAlertDispatchHandler } from '../application/features/help-requests/record-alert-dispatch/record-alert-dispatch.handler.js';
import { CLOCK } from '../application/ports/clock.js';
import { FIELD_CIPHER } from '../application/ports/field-cipher.js';
import { ID_GENERATOR } from '../application/ports/id-generator.js';
import { OPAQUE_TOKENS } from '../application/ports/opaque-tokens.js';
import { PASSWORD_HASHER } from '../application/ports/password-hasher.js';
import { SAFETY_CONFIG, type SafetyConfig } from '../application/ports/safety-config.js';
import { UNIT_OF_WORK } from '../application/ports/unit-of-work.js';
import { EVENT_TYPES } from '../application/shared/events.js';
import { validateEvent, type EventName } from '../infrastructure/events/event-validator.js';
import { AlertDispatchesConsumer } from '../infrastructure/messaging/alert-dispatches.consumer.js';
import { OutboxDispatcher } from '../infrastructure/messaging/outbox.dispatcher.js';
import { StorageQueues } from '../infrastructure/messaging/storage-queue.publisher.js';
import { createDataSource, type DatabaseOptions } from '../infrastructure/persistence/data-source.js';
import { TypeOrmUnitOfWork } from '../infrastructure/persistence/typeorm.unit-of-work.js';
import { AesGcmFieldCipher } from '../infrastructure/security/aes-gcm.field-cipher.js';
import { Argon2PasswordHasher } from '../infrastructure/security/argon2.password-hasher.js';
import { RandomOpaqueTokens } from '../infrastructure/security/opaque-tokens.js';
import { SystemClock } from '../infrastructure/system/system-clock.js';
import { UuidV7Generator } from '../infrastructure/system/uuid-id-generator.js';

export interface MessagingOptions {
  enabled: boolean;
  connectionString: string;
  helpRequestsQueue: string;
  checkInDeadlinesQueue: string;
  alertDispatchesQueue: string;
}

export interface InfrastructureOptions {
  database: DatabaseOptions;
  encryptionKey: string;
  messaging: MessagingOptions;
  safety: SafetyConfig;
}

/** O JSON Schema (AsyncAPI) de cada evento que o serviço publica. */
const SCHEMA_BY_TYPE: Record<string, EventName> = {
  [EVENT_TYPES.helpRequestTriggered]: 'helpRequestTriggered',
  [EVENT_TYPES.checkInDeadlineScheduled]: 'checkInDeadlineScheduled',
};

const DATA_SOURCE = Symbol('DataSource');
const MESSAGING = Symbol('Messaging');

interface Messaging {
  dispatcher: OutboxDispatcher;
  consumer: AlertDispatchesConsumer;
}

/** Abre o banco na subida, liga o outbox e o consumidor da fila, e fecha tudo na parada. */
@Injectable()
class InfrastructureLifecycle implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Messaging');

  constructor(
    @Inject(DATA_SOURCE) private readonly dataSource: DataSource,
    @Inject(MESSAGING) private readonly messaging: Messaging | null,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.dataSource.isInitialized) await this.dataSource.initialize();
    if (!this.messaging) {
      this.logger.warn(
        'MESSAGING_ENABLED=false: o outbox fica pendente e a fila alert-dispatches não é lida.',
      );
      return;
    }
    // Varredura do que ficou pendente enquanto o serviço estava parado.
    void this.messaging.dispatcher.trigger();
    this.messaging.consumer.start();
  }

  async onApplicationShutdown(): Promise<void> {
    this.messaging?.consumer.stop();
    if (this.dataSource.isInitialized) await this.dataSource.destroy();
  }
}

/** Raiz de composição das portas: banco (TypeORM), segurança, relógio, ids e filas. */
@Global()
@Module({})
export class InfrastructureModule {
  static forRoot(options: InfrastructureOptions): DynamicModule {
    const { dataSource, schemas } = createDataSource(options.database);
    const cipher = new AesGcmFieldCipher(options.encryptionKey);
    // O serviço valida o que publica: evento fora do schema desfaz a transação em vez de ir para a fila.
    const uow = new TypeOrmUnitOfWork(
      dataSource,
      schemas,
      cipher,
      options.database.provider === 'sqlite',
      (message) => {
        const schema = SCHEMA_BY_TYPE[message.type];
        if (!schema) throw new Error(`Evento sem schema: ${message.type}.`);
        validateEvent(schema, JSON.parse(message.payload));
      },
    );
    const clock = new SystemClock();
    const ids = new UuidV7Generator();
    const logger = new Logger('Messaging');

    let messaging: Messaging | null = null;
    if (options.messaging.enabled) {
      const m = options.messaging;
      const queues = new StorageQueues(m.connectionString);
      const queueByType: Record<string, string> = {
        [EVENT_TYPES.helpRequestTriggered]: m.helpRequestsQueue,
        [EVENT_TYPES.checkInDeadlineScheduled]: m.checkInDeadlinesQueue,
      };
      const dispatcher = new OutboxDispatcher(uow, queues, (type) => queueByType[type], clock, logger);
      uow.onOutboxWritten(() => void dispatcher.trigger());
      const record = new RecordAlertDispatchHandler(uow, clock, ids);
      const consumer = new AlertDispatchesConsumer(queues, (event) => record.execute(event), logger, {
        queueName: m.alertDispatchesQueue,
      });
      messaging = { dispatcher, consumer };
    }

    return {
      module: InfrastructureModule,
      providers: [
        { provide: DATA_SOURCE, useValue: dataSource },
        { provide: MESSAGING, useValue: messaging },
        { provide: UNIT_OF_WORK, useValue: uow },
        { provide: FIELD_CIPHER, useValue: cipher },
        { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
        { provide: OPAQUE_TOKENS, useClass: RandomOpaqueTokens },
        { provide: CLOCK, useValue: clock },
        { provide: ID_GENERATOR, useValue: ids },
        { provide: SAFETY_CONFIG, useValue: options.safety },
        InfrastructureLifecycle,
      ],
      exports: [
        UNIT_OF_WORK,
        FIELD_CIPHER,
        PASSWORD_HASHER,
        OPAQUE_TOKENS,
        CLOCK,
        ID_GENERATOR,
        SAFETY_CONFIG,
      ],
    };
  }
}
