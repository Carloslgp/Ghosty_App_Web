import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { AccountsModule } from './features/accounts/accounts.module.js';
import { CheckInsModule } from './features/check-ins/check-ins.module.js';
import { ContactsModule } from './features/contacts/contacts.module.js';
import { HelpRequestsModule } from './features/help-requests/help-requests.module.js';
import { SettingsModule } from './features/settings/settings.module.js';
import { InfrastructureModule, type InfrastructureOptions } from './infrastructure.module.js';
import { INTERNAL_API_KEY, InternalKeyGuard } from './platform/internal-key.guard.js';
import { PlatformModule } from './platform/platform.module.js';

export const SERVICE = 'safety-service';

export interface AppOptions extends InfrastructureOptions {
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
        InfrastructureModule.forRoot(options),
        AccountsModule,
        ContactsModule,
        SettingsModule,
        CheckInsModule,
        HelpRequestsModule,
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
