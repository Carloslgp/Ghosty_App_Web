/** Limite de uma mensagem do Telegram. */
export const TELEGRAM_MESSAGE_LIMIT = 4_096;

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracyMeters?: number | null;
}

/** Como a localização aparece no `{local}`. */
export type LocationText =
  | { kind: 'point'; point: GeoPoint }
  /** Prévia: a localização só existe na hora do pedido. */
  | { kind: 'placeholder' }
  | { kind: 'unavailable' }
  /** A pessoa desligou a localização na mensagem. */
  | { kind: 'omitted' };

export interface ComposeInput {
  template: string;
  displayName: string;
  contactNickname: string;
  location: LocationText;
  at: Date;
  timezone?: string;
}

export interface ComposedMessage {
  text: string;
  mapUrl: string | null;
}

const coordinate = (value: number) => String(Number(value.toFixed(6)));

export function mapUrl(point: GeoPoint): string {
  return `https://www.google.com/maps?q=${coordinate(point.lat)},${coordinate(point.lng)}`;
}

function locationText(location: LocationText): string {
  switch (location.kind) {
    case 'point': {
      const accuracy = location.point.accuracyMeters;
      const precision = typeof accuracy === 'number' ? ` (precisão de ${Math.round(accuracy)} m)` : '';
      return `Minha localização: ${mapUrl(location.point)}${precision}.`;
    }
    case 'placeholder':
      return 'Minha localização: [link do mapa na hora do pedido].';
    case 'unavailable':
      return 'Não foi possível obter a localização.';
    case 'omitted':
      return '';
  }
}

/** Hora no formato 19:10, no fuso informado (padrão: America/Sao_Paulo). */
export function formatTime(at: Date, timezone = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Preenche o modelo (`{apelido}`, `{nome}`, `{local}`, `{hora}`). O resultado é texto puro: no
 * Telegram ele vai sem `parse_mode`, para nenhum apelido ou nome quebrar a formatação.
 */
export function composeMessage(input: ComposeInput): ComposedMessage {
  const values: Record<string, string> = {
    apelido: input.contactNickname,
    nome: input.displayName,
    local: locationText(input.location),
    hora: formatTime(input.at, input.timezone),
  };
  const text = input.template
    .replace(/\{(apelido|nome|local|hora)\}/g, (_match, key: string) => values[key] ?? '')
    // Sem localização, o `{local}` some: tira os espaços que sobrariam.
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return { text, mapUrl: input.location.kind === 'point' ? mapUrl(input.location.point) : null };
}

export interface MessageLength {
  characters: number;
  limit: number;
  withinLimit: boolean;
}

/** Conta os caracteres (pontos de código, como o Telegram) contra o limite de 4.096. */
export function measureMessage(text: string): MessageLength {
  const characters = [...text].length;
  return { characters, limit: TELEGRAM_MESSAGE_LIMIT, withinLimit: characters <= TELEGRAM_MESSAGE_LIMIT };
}
