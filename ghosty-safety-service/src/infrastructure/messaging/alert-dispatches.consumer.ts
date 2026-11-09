import type { AlertDispatchedEvent } from '../../application/features/help-requests/record-alert-dispatch/record-alert-dispatch.handler.js';
import { validateEvent } from '../events/event-validator.js';
import type { MessagingLogger } from './outbox.dispatcher.js';
import { decodeMessage, type StorageQueues } from './storage-queue.publisher.js';

export const ALERT_DISPATCHED_TYPE = 'ghosty.functions.alert.dispatched.v1';

/** Decodifica (Base64) e confere a mensagem contra o JSON Schema do AsyncAPI (o mesmo da Function). */
export function parseAlertDispatched(text: string): AlertDispatchedEvent {
  return validateEvent<AlertDispatchedEvent>('alertDispatched', JSON.parse(decodeMessage(text)));
}

export interface ConsumerOptions {
  queueName: string;
  /** Intervalo enquanto chegam mensagens. */
  minDelayMs?: number;
  /** Espera máxima com a fila vazia (cresce aos poucos até aqui). */
  maxDelayMs?: number;
  /** Depois de tantas entregas sem sucesso, a mensagem vai para `<fila>-poison`. */
  maxDequeueCount?: number;
}

/**
 * Lê a fila `alert-dispatches` a cada 2 segundos e vai espaçando até 30 segundos quando ela está
 * vazia. Consultar a fila não acorda o banco. O processamento é idempotente (o handler descarta
 * mensagens repetidas pelo `id`).
 */
export class AlertDispatchesConsumer {
  private timer: NodeJS.Timeout | null = null;
  private stopped = true;
  private delay: number;
  private readonly minDelay: number;
  private readonly maxDelay: number;
  private readonly maxDequeue: number;

  constructor(
    private readonly queues: StorageQueues,
    private readonly handle: (event: AlertDispatchedEvent) => Promise<unknown>,
    private readonly logger: MessagingLogger,
    private readonly options: ConsumerOptions,
  ) {
    this.minDelay = options.minDelayMs ?? 2_000;
    this.maxDelay = options.maxDelayMs ?? 30_000;
    this.maxDequeue = options.maxDequeueCount ?? 5;
    this.delay = this.minDelay;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule(0);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(ms: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      void this.poll().then((count) => {
        this.delay = count > 0 ? this.minDelay : Math.min(this.maxDelay, this.delay * 2);
        this.schedule(this.delay);
      });
    }, ms);
  }

  /** Uma leitura da fila. Devolve quantas mensagens foram tratadas. */
  async poll(): Promise<number> {
    try {
      const queue = await this.queues.queue(this.options.queueName);
      const { receivedMessageItems } = await queue.receiveMessages({
        numberOfMessages: 16,
        visibilityTimeout: 30,
      });
      for (const message of receivedMessageItems) {
        await this.process(message.messageText, message.dequeueCount, async () => {
          await queue.deleteMessage(message.messageId, message.popReceipt);
        });
      }
      return receivedMessageItems.length;
    } catch (error) {
      this.logger.warn(
        `Fila ${this.options.queueName} indisponível: ${error instanceof Error ? error.message : ''}`,
      );
      return 0;
    }
  }

  private async process(text: string, dequeueCount: number, remove: () => Promise<void>): Promise<void> {
    let event: AlertDispatchedEvent;
    try {
      event = parseAlertDispatched(text);
    } catch {
      // Fora do formato: nunca vai dar certo, vai direto para a fila poison.
      await this.toPoison(text);
      await remove();
      return;
    }
    try {
      await this.handle(event);
      await remove();
    } catch (error) {
      this.logger.warn(
        `Falha ao registrar o envio ${event.id}: ${error instanceof Error ? error.message : ''}`,
      );
      if (dequeueCount >= this.maxDequeue) {
        await this.toPoison(text);
        await remove();
      }
      // Senão, a mensagem volta a ficar visível e é tentada de novo.
    }
  }

  private async toPoison(text: string): Promise<void> {
    const poison = await this.queues.queue(`${this.options.queueName}-poison`);
    await poison.sendMessage(text, { messageTimeToLive: -1 });
  }
}
