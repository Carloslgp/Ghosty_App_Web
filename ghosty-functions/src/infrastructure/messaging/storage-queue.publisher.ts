import { QueueServiceClient, type QueueClient } from '@azure/storage-queue';
import type { EventPublisher } from '../../application/ports/event-publisher.js';

/** Publica em Base64, que é o que os gatilhos de fila (e o consumidor do safety-service) esperam. */
export class StorageQueuePublisher implements EventPublisher {
  private readonly service: QueueServiceClient;
  private readonly queues = new Map<string, Promise<QueueClient>>();

  constructor(connectionString: string) {
    this.service = QueueServiceClient.fromConnectionString(connectionString);
  }

  private queue(name: string): Promise<QueueClient> {
    let pending = this.queues.get(name);
    if (!pending) {
      const client = this.service.getQueueClient(name);
      pending = client.createIfNotExists().then(() => client);
      pending.catch(() => this.queues.delete(name));
      this.queues.set(name, pending);
    }
    return pending;
  }

  async publish(queueName: string, envelope: object): Promise<void> {
    const queue = await this.queue(queueName);
    await queue.sendMessage(Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64'), {
      messageTimeToLive: -1,
    });
  }
}
