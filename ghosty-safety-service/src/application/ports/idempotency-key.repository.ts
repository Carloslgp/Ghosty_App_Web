/** Chaves de idempotência (`Idempotency-Key`): a mesma chave, da mesma conta, devolve o mesmo recurso. */
export interface IdempotencyKeyRepository {
  /** O id do recurso criado com essa chave, se ela foi usada a partir de `notBefore`. */
  find(accountId: string, keyHash: string, notBefore: Date): Promise<string | null>;
  /** Grava a chave (ou substitui uma que já venceu). */
  save(accountId: string, keyHash: string, resourceId: string, now: Date): Promise<void>;
}
