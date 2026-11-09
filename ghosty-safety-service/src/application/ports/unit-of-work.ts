import type { AccountRepository } from './account.repository.js';
import type { AlertSettingsRepository } from './alert-settings.repository.js';
import type { CheckInRepository } from './check-in.repository.js';
import type { ContactRepository } from './contact.repository.js';
import type { HelpRequestRepository } from './help-request.repository.js';
import type { IdempotencyKeyRepository } from './idempotency-key.repository.js';
import type { OutboxRepository } from './outbox.repository.js';
import type { ProcessedMessageRepository } from './processed-message.repository.js';
import type { RefreshTokenRepository } from './refresh-token.repository.js';

export const UNIT_OF_WORK = Symbol('UnitOfWork');

/** Os repositórios ligados a uma mesma transação. */
export interface Repositories {
  accounts: AccountRepository;
  refreshTokens: RefreshTokenRepository;
  contacts: ContactRepository;
  alertSettings: AlertSettingsRepository;
  checkIns: CheckInRepository;
  helpRequests: HelpRequestRepository;
  outbox: OutboxRepository;
  processedMessages: ProcessedMessageRepository;
  idempotencyKeys: IdempotencyKeyRepository;
}

/**
 * Tudo o que `work` grava entra numa única transação: se ela lançar um erro, nada é gravado.
 * Mensagens do outbox são publicadas logo depois do commit.
 */
export interface UnitOfWork {
  run<T>(work: (repos: Repositories) => Promise<T>): Promise<T>;
}
