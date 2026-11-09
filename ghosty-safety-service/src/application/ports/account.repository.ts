import type { Account } from '../../domain/accounts/account.entity.js';

export interface AccountRepository {
  findById(id: string): Promise<Account | null>;
  /** O e-mail já normalizado. */
  findByEmail(email: string): Promise<Account | null>;
  insert(account: Account): Promise<void>;
  update(account: Account): Promise<void>;
  /** Exclusão em cascata: tokens, contatos, mensagem, check-ins, pedidos de ajuda e linhas do tempo. */
  delete(id: string): Promise<void>;
}
