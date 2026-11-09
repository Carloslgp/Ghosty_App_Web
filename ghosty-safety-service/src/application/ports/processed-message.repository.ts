/** Mensagens de fila já processadas (consumidor idempotente pelo `id` do envelope). */
export interface ProcessedMessageRepository {
  has(messageId: string): Promise<boolean>;
  add(messageId: string, at: Date): Promise<void>;
}
