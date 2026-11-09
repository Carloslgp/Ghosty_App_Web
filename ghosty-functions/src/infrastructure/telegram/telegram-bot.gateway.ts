import {
  RetryableDeliveryError,
  type TelegramGateway,
  type TelegramSendResult,
} from '../../application/ports/telegram-gateway.js';

const API = 'https://api.telegram.org';
const TIMEOUT_MS = 5_000;

/**
 * Bot API do Telegram (`sendMessage`), com timeout de 5 segundos. O texto vai sem `parse_mode`.
 * Nunca registra em log o token, o chat nem o texto.
 */
export class TelegramBotGateway implements TelegramGateway {
  constructor(
    private readonly botToken: string,
    private readonly apiBase = API,
  ) {}

  async sendMessage(chatId: string, text: string): Promise<TelegramSendResult> {
    let response: Response;
    try {
      response = await fetch(`${this.apiBase}/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, link_preview_options: { is_disabled: true } }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new RetryableDeliveryError('O Telegram não respondeu.');
    }
    if (response.ok) return { ok: true };
    if (response.status === 429 || response.status >= 500) {
      const body = (await response.json().catch(() => ({}))) as { parameters?: { retry_after?: number } };
      throw new RetryableDeliveryError(
        `O Telegram respondeu ${response.status}.`,
        body.parameters?.retry_after,
      );
    }
    // 403: a pessoa bloqueou o bot. 400: chat inválido. Não adianta tentar de novo.
    return { ok: false, errorCode: `telegram_${response.status}` };
  }
}

/** Com `DELIVERY_MODE=simulated` o envio nunca é pedido; se for, é um erro de programação. */
export class DisabledTelegramGateway implements TelegramGateway {
  sendMessage(): Promise<TelegramSendResult> {
    return Promise.reject(new Error('Envio pelo Telegram desligado (DELIVERY_MODE=simulated).'));
  }
}
