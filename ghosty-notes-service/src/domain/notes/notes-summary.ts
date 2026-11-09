import { DomainError } from '../shared/domain-error.js';

/** Totais do resumo das notas, usados no painel. */
export interface NotesSummary {
  /** Notas não arquivadas. */
  total: number;
  /** Fixadas entre as não arquivadas. */
  pinned: number;
  archived: number;
  updatedLast14Days: number;
  /** Lembretes de hoje (no fuso informado) entre as não arquivadas. */
  remindersToday: number;
}

export const RECENT_DAYS = 14;

/** Os instantes que delimitam "hoje" e "últimos 14 dias" para o resumo. */
export interface SummaryWindow {
  todayStart: Date;
  tomorrowStart: Date;
  recentSince: Date;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function summaryWindow(now: Date, timeZone: string): SummaryWindow {
  if (!isValidTimeZone(timeZone)) throw DomainError.invalidField('timezone', 'fuso horário desconhecido');
  const today = localDate(now, timeZone);
  const tomorrow = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  return {
    todayStart: startOfLocalDay(today.year, today.month, today.day, timeZone),
    tomorrowStart: startOfLocalDay(
      tomorrow.getUTCFullYear(),
      tomorrow.getUTCMonth() + 1,
      tomorrow.getUTCDate(),
      timeZone,
    ),
    recentSince: new Date(now.getTime() - RECENT_DAYS * 24 * 60 * 60 * 1000),
  };
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function localParts(instant: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

function localDate(instant: Date, timeZone: string) {
  const { year, month, day } = localParts(instant, timeZone);
  return { year, month, day };
}

/** Diferença entre o relógio local e o UTC naquele instante, em milissegundos. */
function offsetMs(instant: Date, timeZone: string): number {
  const p = localParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** O instante UTC da meia-noite local daquele dia (duas iterações acertam a troca de horário de verão). */
function startOfLocalDay(year: number, month: number, day: number, timeZone: string): Date {
  const midnightAsUtc = Date.UTC(year, month - 1, day);
  let guess = midnightAsUtc;
  for (let i = 0; i < 2; i += 1) guess = midnightAsUtc - offsetMs(new Date(guess), timeZone);
  return new Date(guess);
}
