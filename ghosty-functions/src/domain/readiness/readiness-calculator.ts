export type GeoPermission = 'granted' | 'denied' | 'prompt' | 'unknown';

export type ReadinessItemId =
  | 'network-confirmed'
  | 'network-two-confirmed'
  | 'message-reviewed'
  | 'location-permission'
  | 'recent-test'
  | 'facade-usage'
  | 'secret-code';

export interface ReadinessItem {
  id: ReadinessItemId;
  ok: boolean;
  weight: number;
  text: string;
  recommendation: string | null;
}

export type ReadinessLevel = 'ready' | 'almost' | 'attention';

export interface ReadinessInput {
  /** `null` quando o notes-service está fora do ar: o item da fachada conta como não cumprido. */
  notes: { updatedLast14Days: number } | null;
  safety: {
    totalContacts: number;
    confirmedContacts: number;
    messageReviewed: boolean;
    secretCodeSet: boolean;
    lastTestAt: Date | null;
  };
  geoPermission: GeoPermission;
  now: Date;
}

export interface ReadinessScore {
  score: number;
  level: ReadinessLevel;
  items: ReadinessItem[];
}

export const WEIGHTS: Record<ReadinessItemId, number> = {
  'network-confirmed': 30,
  'network-two-confirmed': 10,
  'message-reviewed': 15,
  'location-permission': 10,
  'recent-test': 20,
  'facade-usage': 10,
  'secret-code': 5,
};

export const RECENT_TEST_DAYS = 30;
export const FACADE_MIN_NOTES = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export function levelFor(score: number): ReadinessLevel {
  if (score >= 80) return 'ready';
  if (score >= 50) return 'almost';
  return 'attention';
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function item(id: ReadinessItemId, ok: boolean, text: string, recommendation: string): ReadinessItem {
  return { id, ok, weight: WEIGHTS[id], text, recommendation: ok ? null : recommendation };
}

function daysAgo(days: number): string {
  if (days <= 0) return 'hoje';
  return `há ${plural(days, 'dia', 'dias')}`;
}

/** Pontuação de 0 a 100 e a lista de itens, cada item reprovado com uma recomendação. */
export function calculateReadiness(input: ReadinessInput): ReadinessScore {
  const { safety, notes } = input;
  const confirmed = safety.confirmedContacts;
  const testDays =
    safety.lastTestAt === null
      ? null
      : Math.floor((input.now.getTime() - safety.lastTestAt.getTime()) / DAY_MS);
  const recentTest = testDays !== null && testDays <= RECENT_TEST_DAYS;
  const updated = notes?.updatedLast14Days ?? 0;

  const items: ReadinessItem[] = [
    item(
      'network-confirmed',
      confirmed >= 1,
      confirmed >= 1
        ? `${confirmed} de ${safety.totalContacts} ${safety.totalContacts === 1 ? 'contato confirmou' : 'contatos confirmaram'}`
        : safety.totalContacts === 0
          ? 'Sua rede de apoio ainda está vazia'
          : 'Nenhum contato confirmou o convite ainda',
      'Convide alguém de confiança e peça para aceitar o convite.',
    ),
    item(
      'network-two-confirmed',
      confirmed >= 2,
      confirmed >= 2 ? `Você tem ${confirmed} contatos confirmados` : 'Menos de 2 contatos confirmados',
      'Com 2 ou mais contatos, é mais provável que alguém veja o aviso a tempo.',
    ),
    item(
      'message-reviewed',
      safety.messageReviewed,
      safety.messageReviewed ? 'Mensagem revisada' : 'A mensagem ainda não foi revisada',
      'Revise o texto que a sua rede vai receber.',
    ),
    item(
      'location-permission',
      input.geoPermission === 'granted',
      input.geoPermission === 'granted'
        ? 'Localização permitida neste navegador'
        : input.geoPermission === 'denied'
          ? 'Localização bloqueada neste navegador'
          : 'Localização ainda não permitida neste navegador',
      input.geoPermission === 'denied'
        ? 'Libere a localização nas configurações do navegador para a sua rede saber onde você está.'
        : 'Permita a localização para a sua rede saber onde você está.',
    ),
    item(
      'recent-test',
      recentTest,
      testDays === null ? 'Nenhum Teste seguro feito ainda' : `Último Teste seguro ${daysAgo(testDays)}`,
      'Faça um Teste seguro: ele mostra o caminho do aviso sem enviar nada.',
    ),
    item(
      'facade-usage',
      notes !== null && updated >= FACADE_MIN_NOTES,
      notes === null
        ? 'Não foi possível consultar as notas agora'
        : `${plural(updated, 'nota atualizada', 'notas atualizadas')} nos últimos 14 dias`,
      'Use o app de notas no dia a dia: o disfarce fica mais crível.',
    ),
    item(
      'secret-code',
      safety.secretCodeSet,
      safety.secretCodeSet ? 'Código de bloqueio definido' : 'Código de bloqueio não definido',
      'Defina o código de bloqueio nas configurações do app.',
    ),
  ];

  const score = items.reduce((sum, current) => sum + (current.ok ? current.weight : 0), 0);
  return { score, level: levelFor(score), items };
}
