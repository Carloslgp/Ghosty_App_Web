/** Resultado de um `sendMessage`. 429 e 5xx não voltam aqui: lançam `RetryableDeliveryError`. */
export type TelegramSendResult = { ok: true } | { ok: false; errorCode: string };

/** Erro passageiro (429, 5xx, timeout): a fila tenta de novo. */
export class RetryableDeliveryError extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'RetryableDeliveryError';
  }
}

/** Bot API do Telegram. Os testes usam uma versão falsa e nunca falam com o Telegram. */
export interface TelegramGateway {
  /** Texto puro (sem `parse_mode`). 403 (bloqueou o bot) e 400 viram `ok: false`, sem nova tentativa. */
  sendMessage(chatId: string, text: string): Promise<TelegramSendResult>;
}
