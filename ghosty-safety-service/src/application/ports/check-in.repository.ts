import type { CheckIn, CheckInStatus } from '../../domain/check-ins/check-in.entity.js';
import type { Page, PageRequest } from '../shared/pagination.js';

export interface CheckInFilter extends PageRequest {
  status?: CheckInStatus;
  mode?: 'real' | 'test';
}

export interface CheckInRepository {
  findById(accountId: string, id: string): Promise<CheckIn | null>;
  /** Em qualquer conta (uso interno: a mensagem de prazo só traz o id do check-in). */
  findByIdInAnyAccount(id: string): Promise<CheckIn | null>;
  /** Do mais novo para o mais antigo. */
  list(accountId: string, filter: CheckInFilter): Promise<Page<CheckIn>>;
  /** O check-in ativo mais recente da conta (no modo pedido, ou em qualquer um). */
  findActive(accountId: string, mode?: 'real' | 'test'): Promise<CheckIn | null>;
  insert(checkIn: CheckIn): Promise<void>;
  update(checkIn: CheckIn): Promise<void>;
}
