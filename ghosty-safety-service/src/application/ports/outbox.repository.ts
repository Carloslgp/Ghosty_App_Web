/** Uma mensagem a publicar numa fila, gravada na mesma transação da mudança de domínio. */
export interface OutboxMessage {
  /** O `id` do envelope (UUID v7). */
  id: string;
  /** O `type` do envelope, que define a fila. */
  type: string;
  /** O envelope inteiro, em JSON. */
  payload: string;
  correlationId: string;
  /** A mensagem só fica visível na fila a partir deste instante (prazo do check-in). */
  visibleAfter: Date | null;
  createdAt: Date;
  publishedAt: Date | null;
  attempts: number;
}

export interface OutboxRepository {
  add(message: OutboxMessage): Promise<void>;
  /** As mais antigas primeiro. */
  listPending(limit: number): Promise<OutboxMessage[]>;
  markPublished(id: string, at: Date): Promise<void>;
  registerFailure(id: string): Promise<void>;
}
