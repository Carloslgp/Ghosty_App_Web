import type { NotesServiceClient } from '../../ports/notes-service.client.js';
import type { SafetyAccount, SafetyServiceClient } from '../../ports/safety-service.client.js';
import type { SafetySessionStore } from '../../ports/safety-session.store.js';
import type { RequestMeta } from '../../ports/upstream-error.js';

export interface AccountView {
  id: string;
  email: string;
  displayName: string;
  secretCodeSet: boolean;
  createdAt: string;
}

const toView = (a: SafetyAccount): AccountView => ({
  id: a.id,
  email: a.email,
  displayName: a.displayName,
  secretCodeSet: a.secretCodeSet,
  createdAt: a.createdAt,
});

/**
 * A conta da pessoa logada (Configurações do app). O "código de bloqueio do app" que a tela mostra é,
 * por dentro, o código secreto da área de segurança.
 */
export class AccountHandler {
  constructor(
    private readonly safety: SafetyServiceClient,
    private readonly notes: NotesServiceClient,
    private readonly sessions: SafetySessionStore,
  ) {}

  async get(accountId: string, meta: RequestMeta): Promise<AccountView> {
    return toView(await this.safety.getAccount(accountId, meta));
  }

  async update(accountId: string, displayName: string, meta: RequestMeta): Promise<AccountView> {
    return toView(await this.safety.updateAccount(accountId, { displayName }, meta));
  }

  /** Senha atual errada: 400 com o erro em `currentPassword` (vem do safety-service). */
  setLockCode(
    accountId: string,
    input: { currentPassword: string; code: string },
    meta: RequestMeta,
  ): Promise<void> {
    return this.safety.setSecretCode(accountId, input, meta);
  }

  /** Apaga as notas e depois a conta (em cascata no SQL). As sessões seguras são revogadas. */
  async delete(accountId: string, meta: RequestMeta): Promise<void> {
    await this.notes.forUser(accountId, 'DELETE', '/notes', undefined, meta);
    await this.safety.deleteAccount(accountId, meta);
    this.sessions.revokeAllOf(accountId);
  }
}
