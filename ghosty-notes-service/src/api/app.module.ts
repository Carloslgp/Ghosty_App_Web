import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { NotesModule } from './features/notes/notes.module.js';
import { PersistenceModule } from './persistence.module.js';
import { INTERNAL_API_KEY, InternalKeyGuard } from './platform/internal-key.guard.js';
import { PlatformModule } from './platform/platform.module.js';

export const SERVICE = 'notes-service';

export interface AppOptions {
  mongoUri: string;
  mongoDb: string;
  internalApiKey: string;
  logLevel: string;
}

/** Raiz de composição do serviço. */
@Module({})
export class AppModule {
  static forRoot(options: AppOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [
        PlatformModule.forRoot({ service: SERVICE, logLevel: options.logLevel }),
        PersistenceModule.forRoot({ mongoUri: options.mongoUri, mongoDb: options.mongoDb }),
        NotesModule,
      ],
      providers: [
        { provide: INTERNAL_API_KEY, useValue: options.internalApiKey },
        {
          provide: APP_GUARD,
          useFactory: (key: string, reflector: Reflector) => new InternalKeyGuard(key, reflector),
          inject: [INTERNAL_API_KEY, Reflector],
        },
      ],
    };
  }
}
