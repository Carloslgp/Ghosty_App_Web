export const DELIVERY_CHANNELS = ['telegram', 'web', 'none'] as const;
export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];

export const DELIVERY_OUTCOMES = [
  'sent',
  'published_web',
  'would_send',
  'failed',
  'skipped_unconfirmed',
  'no_contacts',
] as const;
export type DeliveryOutcome = (typeof DELIVERY_OUTCOMES)[number];

/** Um passo da linha do tempo de um pedido de ajuda: o que aconteceu com cada contato. */
export interface DeliveryStep {
  id: string;
  helpRequestId: string;
  stepOrder: number;
  /** Nulo só no passo `no_contacts`. */
  contactId: string | null;
  channel: DeliveryChannel;
  /** O texto enviado (ou que seria enviado). Nulo quando ninguém recebeu. */
  message: string | null;
  outcome: DeliveryOutcome;
  errorCode: string | null;
  occurredAt: Date;
}

/** Um passo alcançou alguém (ou alcançaria, no ensaio). */
export function reachedSomeone(step: Pick<DeliveryStep, 'outcome'>): boolean {
  return step.outcome === 'sent' || step.outcome === 'published_web' || step.outcome === 'would_send';
}
