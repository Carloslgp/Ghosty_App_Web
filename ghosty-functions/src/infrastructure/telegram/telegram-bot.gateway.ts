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

export interface TelegramUpdate {
  update_id: number;
  message?: { text?: string; chat: { id: number | string; type: string } };
}

/** Erro da Bot API numa chamada administrativa. A mensagem nunca leva o token. */
export class TelegramApiError extends Error {
  constructor(
    readonly method: string,
    readonly status: number,
    description?: string,
  ) {
    super(`Telegram ${method}: ${status}${description ? ` (${description})` : ''}`);
    this.name = 'TelegramApiError';
  }
}

/**
 * Chamadas administrativas da Bot API: registrar o webhook (na Azure) e ler as mensagens por polling
 * (na máquina local, onde não há URL pública).
 */
export class TelegramBotAdmin {
  constructor(
    private readonly botToken: string,
    private readonly apiBase = API,
  ) {}

  private async call<T>(method: string, body: object, timeoutMs = TIMEOUT_MS): Promise<T> {
    const response = await fetch(`${this.apiBase}/bot${this.botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      result?: T;
      description?: string;
    };
    if (!response.ok || !payload.ok) throw new TelegramApiError(method, response.status, payload.description);
    return payload.result as T;
  }

  /** O Telegram passa a chamar `url` a cada mensagem, com `secretToken` no cabeçalho. */
  setWebhook(url: string, secretToken: string): Promise<boolean> {
    return this.call('setWebhook', {
      url,
      secret_token: secretToken,
      allowed_updates: ['message'],
      drop_pending_updates: true,
    });
  }

  deleteWebhook(): Promise<boolean> {
    return this.call('deleteWebhook', { drop_pending_updates: false });
  }

  getWebhookInfo(): Promise<{ url: string; pending_update_count: number; last_error_message?: string }> {
    return this.call('getWebhookInfo', {});
  }

  getMe(): Promise<{ username: string }> {
    return this.call('getMe', {});
  }

  /** Long polling: espera até `timeoutSeconds` por mensagens novas a partir de `offset`. */
  getUpdates(offset: number, timeoutSeconds: number): Promise<TelegramUpdate[]> {
    return this.call(
      'getUpdates',
      { offset, timeout: timeoutSeconds, allowed_updates: ['message'] },
      (timeoutSeconds + 10) * 1000,
    );
  }
}

/** Com `DELIVERY_MODE=simulated` o envio nunca é pedido; se for, é um erro de programação. */
export class DisabledTelegramGateway implements TelegramGateway {
  sendMessage(): Promise<TelegramSendResult> {
    return Promise.reject(new Error('Envio pelo Telegram desligado (DELIVERY_MODE=simulated).'));
  }
}
