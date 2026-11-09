export type ContactStatus = 'pending' | 'confirmed' | 'declined';
export type ContactChannel = 'telegram' | 'web';
export type DeliveryChannel = ContactChannel | 'none';
export type DeliveryOutcome =
  'sent' | 'published_web' | 'would_send' | 'failed' | 'skipped_unconfirmed' | 'no_contacts';
export type DeliveryMode = 'simulated' | 'telegram';
export type Mode = 'real' | 'test';

export interface PlannedContact {
  contactId: string;
  nickname: string;
  position: number;
  status: ContactStatus;
  channel: ContactChannel | null;
}

/** O que fazer com cada contato. `send_telegram` é o único passo que fala com o Telegram. */
export type PlannedAction =
  'send_telegram' | 'published_web' | 'would_send' | 'skipped_unconfirmed' | 'no_contacts';

export interface PlannedStep {
  stepOrder: number;
  contact: PlannedContact | null;
  channel: DeliveryChannel;
  action: PlannedAction;
}

/**
 * Ordena os contatos pela posição e decide o que fazer com cada um:
 * - modo `test` (Teste seguro): todo contato confirmado vira `would_send` (nada sai, nem na página web);
 * - canal web, modo real: `published_web` (o aviso aparece na página do contato);
 * - Telegram, modo real: `send_telegram`, ou `would_send` com `DELIVERY_MODE=simulated`;
 * - contato não confirmado: `skipped_unconfirmed`;
 * - nenhum confirmado: um único passo `no_contacts`.
 */
export function planDispatch(
  contacts: PlannedContact[],
  mode: Mode,
  deliveryMode: DeliveryMode,
): PlannedStep[] {
  const ordered = [...contacts].sort((a, b) => a.position - b.position);
  if (!ordered.some((contact) => contact.status === 'confirmed')) {
    return [{ stepOrder: 1, contact: null, channel: 'none', action: 'no_contacts' }];
  }
  return ordered.map((contact, index) => {
    const stepOrder = index + 1;
    if (contact.status !== 'confirmed' || contact.channel === null) {
      return { stepOrder, contact, channel: 'none', action: 'skipped_unconfirmed' };
    }
    if (mode === 'test') return { stepOrder, contact, channel: contact.channel, action: 'would_send' };
    if (contact.channel === 'web') return { stepOrder, contact, channel: 'web', action: 'published_web' };
    return {
      stepOrder,
      contact,
      channel: 'telegram',
      action: deliveryMode === 'telegram' ? 'send_telegram' : 'would_send',
    };
  });
}

/** O pedido falha quando nenhum passo alcançou alguém. */
export function dispatchStatus(outcomes: DeliveryOutcome[]): 'dispatched' | 'failed' {
  return outcomes.some(
    (outcome) => outcome === 'sent' || outcome === 'published_web' || outcome === 'would_send',
  )
    ? 'dispatched'
    : 'failed';
}
