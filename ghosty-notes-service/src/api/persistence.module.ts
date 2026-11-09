import {
  Global,
  Inject,
  Injectable,
  Module,
  type DynamicModule,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { CLOCK } from '../application/ports/clock.js';
import { ID_GENERATOR } from '../application/ports/id-generator.js';
import { NOTE_REPOSITORY } from '../application/ports/note.repository.js';
import { MongoConnection } from '../infrastructure/persistence/mongo-connection.js';
import { MongoNoteRepository } from '../infrastructure/persistence/mongo-note.repository.js';
import { SystemClock } from '../infrastructure/system/system-clock.js';
import { UuidV7Generator } from '../infrastructure/system/uuid-id-generator.js';

export interface PersistenceOptions {
  mongoUri: string;
  mongoDb: string;
}

/** Cria os índices quando a aplicação sobe e fecha a conexão quando ela para. */
@Injectable()
class MongoLifecycle implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(
    @Inject(MongoConnection) private readonly connection: MongoConnection,
    @Inject(NOTE_REPOSITORY) private readonly notes: MongoNoteRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.notes.ensureIndexes();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.connection.close();
  }
}

/** Raiz de composição das portas: MongoDB, relógio e gerador de ids. */
@Global()
@Module({})
export class PersistenceModule {
  static forRoot(options: PersistenceOptions): DynamicModule {
    return {
      module: PersistenceModule,
      providers: [
        {
          provide: MongoConnection,
          useFactory: () => MongoConnection.create(options.mongoUri, options.mongoDb),
        },
        {
          provide: NOTE_REPOSITORY,
          useFactory: (connection: MongoConnection) => new MongoNoteRepository(connection.db),
          inject: [MongoConnection],
        },
        { provide: CLOCK, useClass: SystemClock },
        { provide: ID_GENERATOR, useClass: UuidV7Generator },
        MongoLifecycle,
      ],
      exports: [NOTE_REPOSITORY, CLOCK, ID_GENERATOR],
    };
  }
}
