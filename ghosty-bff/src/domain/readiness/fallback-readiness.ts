/**
 * Prontidão de reserva: quando a Function não responde, o painel não fica sem pontuação. Usa só o que
 * o resumo da área de segurança já traz (rede, mensagem e código), com os mesmos pesos da Function, e
 * não traz prévia da mensagem.
 */
export interface FallbackInput {
  totalContacts: number;
  confirmedContacts: number;
  messageReviewed: boolean;
  secretCodeSet: boolean;
}

export interface FallbackItem {
  id: 'network-confirmed' | 'message-reviewed' | 'secret-code';
  ok: boolean;
  weight: number;
  text: string;
  recommendation: string | null;
}

export interface FallbackReadiness {
  score: number;
  level: 'ready' | 'almost' | 'attention';
  items: FallbackItem[];
  messagePreview: null;
}

export function readinessLevel(score: number): FallbackReadiness['level'] {
  if (score >= 80) return 'ready';
  if (score >= 50) return 'almost';
  return 'attention';
}

/** Sem o resumo da área de segurança (`null`), a pontuação é 0 e não há itens. */
export function fallbackReadiness(input: FallbackInput | null): FallbackReadiness {
  if (input === null) return { score: 0, level: 'attention', items: [], messagePreview: null };
  const { totalContacts: total, confirmedContacts: confirmed } = input;
  const item = (
    id: FallbackItem['id'],
    weight: number,
    ok: boolean,
    text: string,
    recommendation: string,
  ): FallbackItem => ({ id, ok, weight, text, recommendation: ok ? null : recommendation });

  const items = [
    item(
      'network-confirmed',
      30,
      confirmed >= 1,
      confirmed >= 1
        ? `${confirmed} de ${total} ${total === 1 ? 'contato confirmou' : 'contatos confirmaram'}`
        : total === 0
          ? 'Sua rede de apoio ainda está vazia'
          : 'Nenhum contato confirmou o convite ainda',
      'Convide alguém de confiança e peça para aceitar o convite.',
    ),
    item(
      'message-reviewed',
      15,
      input.messageReviewed,
      input.messageReviewed ? 'Mensagem revisada' : 'Mensagem ainda não revisada',
      'Revise a mensagem e veja a prévia.',
    ),
    item(
      'secret-code',
      5,
      input.secretCodeSet,
      input.secretCodeSet ? 'Código de bloqueio definido' : 'Código de bloqueio não definido',
      'Defina o código de bloqueio nas configurações do app.',
    ),
  ];
  const score = items.reduce((sum, current) => sum + (current.ok ? current.weight : 0), 0);
  return { score, level: readinessLevel(score), items, messagePreview: null };
}
