export type TelegramCommand = { kind: 'start'; token: string } | { kind: 'leave' } | { kind: 'ignore' };

const START = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{43})\s*$/;
const LEAVE = /^\/(?:parar|stop)(?:@\w+)?\s*$/i;

/**
 * Interpreta o texto recebido pelo bot: `/start <token do convite>` (o link `t.me/<bot>?start=<token>`)
 * ou `/parar`. Qualquer outra coisa é ignorada, inclusive `/start` sem token ou com token malformado.
 */
export function parseTelegramCommand(text: string | undefined): TelegramCommand {
  if (!text) return { kind: 'ignore' };
  const trimmed = text.trim();
  const start = START.exec(trimmed);
  if (start?.[1]) return { kind: 'start', token: start[1] };
  if (LEAVE.test(trimmed)) return { kind: 'leave' };
  return { kind: 'ignore' };
}
