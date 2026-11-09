import type { Clock } from '../../application/ports/clock.js';
import type { OutboxMessage } from '../../application/ports/outbox.repository.js';
import type { UnitOfWork } from '../../application/ports/unit-of-work.js';
import type { StorageQueues } from './storage-queue.publisher.js';

export interface MessagingLogger {
  warn(message: string): void;
}

/**
 * Publica as mensagens pendentes do outbox. Não fica consultando o banco em intervalos: roda logo
 * depois de cada commit que gravou no outbox e uma vez na subida do serviço (para o que ficou
 * pendente). Assim o Azure SQL serverless consegue pausar.
 *
 * Se a publicação falhar, a mensagem continua pendente (com `Attempts` + 1) e sai na próxima rodada.
 */
export class OutboxDispatcher {
  private running: Promise<void> | null = null;
  private again = false;

  constructor(
    private readonly uow: UnitOfWork,
    private readonly queues: StorageQueues,
    private readonly queueFor: (type: string) => string | undefined,
    private readonly clock: Clock,
    private readonly logger: MessagingLogger,
    private readonly batchSize = 50,
  ) {}

  /** Pede uma rodada. Se já houver uma rodando, ela repete ao terminar. */
  trigger(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.loop().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async loop(): Promise<void> {
    do {
      this.again = false;
      await this.dispatchPending();
    } while (this.again);
  }

  /** Devolve quantas mensagens saíram. Para na primeira falha (a fila provavelmente está fora do ar). */
  async dispatchPending(): Promise<number> {
    const pending = await this.uow.run(({ outbox }) => outbox.listPending(this.batchSize));
    let published = 0;
    for (const message of pending) {
      try {
        await this.publish(message);
      } catch (error) {
        await this.uow.run(({ outbox }) => outbox.registerFailure(message.id));
        this.logger.warn(
          `Outbox: falha ao publicar ${message.type} (${message.id}); fica pendente. ${error instanceof Error ? error.message : ''}`,
        );
        break;
      }
      await this.uow.run(({ outbox }) => outbox.markPublished(message.id, this.clock.now()));
      published += 1;
    }
    return published;
  }

  private async publish(message: OutboxMessage): Promise<void> {
    const queue = this.queueFor(message.type);
    if (!queue) throw new Error(`Sem fila para o tipo ${message.type}.`);
    const delay = message.visibleAfter
      ? (message.visibleAfter.getTime() - this.clock.now().getTime()) / 1000
      : 0;
    await this.queues.publish(queue, message.payload, delay);
  }
}
