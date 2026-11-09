import type { ContactChannel, DeliveryOutcome, Mode } from '../../domain/dispatch/dispatch-planner.js';

export interface DeliveryTargets {
  helpRequestId: string;
  accountId: string;
  mode: Mode;
  /** Só os confirmados, na ordem de aviso. O chat do Telegram vem decifrado, só por esta rota. */
  targets: {
    contactId: string;
    nickname: string;
    position: number;
    channel: ContactChannel;
    telegramChatId: string | null;
  }[];
  /** Passos já gravados (reprocessamento da fila): não enviar de novo. */
  recordedSteps: { contactId: string | null; outcome: DeliveryOutcome }[];
}

/** Rotas internas do safety-service chamadas pela Function (com `X-Internal-Key`). */
export interface SafetyInternalClient {
  getDeliveryTargets(helpRequestId: string, correlationId: string): Promise<DeliveryTargets>;
  expireCheckIn(
    checkInId: string,
    version: number,
    correlationId: string,
  ): Promise<{ result: 'expired' | 'ignored'; helpRequestId: string | null }>;
}
