import { QueueServiceClient, type QueueClient } from '@azure/storage-queue';

/** Até 7 dias de atraso: o limite da Storage Queue (o domínio limita o check-in a 24 horas). */
export const MAX_VISIBILITY_SECONDS = 7 * 24 * 60 * 60;

export function encodeMessage(body: string): string {
  return Buffer.from(body, 'utf8').toString('base64');
}

export function decodeMessage(text: string): string {
  return Buffer.from(text, 'base64').toString('utf8');
}

/**
 * Cliente das filas (Azurite na máquina local). As mensagens vão em Base64, que é o que o gatilho de
 * fila da Function espera por padrão.
 */
export class StorageQueues {
  private readonly service: QueueServiceClient;
  private readonly ready = new Map<string, Promise<QueueClient>>();

  constructor(connectionString: string) {
    this.service = QueueServiceClient.fromConnectionString(connectionString);
  }

  /** O cliente da fila, criando-a na primeira vez. */
  queue(name: string): Promise<QueueClient> {
    let pending = this.ready.get(name);
    if (!pending) {
      const client = this.service.getQueueClient(name);
      pending = client.createIfNotExists().then(() => client);
      pending.catch(() => this.ready.delete(name));
      this.ready.set(name, pending);
    }
    return pending;
  }

  /** Publica uma mensagem; `delaySeconds` a deixa invisível até o prazo. Nunca expira sozinha. */
  async publish(queueName: string, body: string, delaySeconds = 0): Promise<void> {
    const queue = await this.queue(queueName);
    await queue.sendMessage(encodeMessage(body), {
      visibilityTimeout: Math.min(Math.max(0, Math.ceil(delaySeconds)), MAX_VISIBILITY_SECONDS),
      messageTimeToLive: -1,
    });
  }
}
