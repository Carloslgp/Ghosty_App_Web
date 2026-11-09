import type { CheckIn } from '../../domain/check-ins/check-in.entity.js';

export interface CheckInRepository {
  findById(accountId: string, id: string): Promise<CheckIn | null>;
  /** O check-in ativo mais recente da conta (no modo pedido, ou em qualquer um). */
  findActive(accountId: string, mode?: 'real' | 'test'): Promise<CheckIn | null>;
  insert(checkIn: CheckIn): Promise<void>;
  update(checkIn: CheckIn): Promise<void>;
}
