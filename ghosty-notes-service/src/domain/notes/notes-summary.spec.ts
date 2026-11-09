import { describe, expect, it } from 'vitest';
import { DomainError } from '../shared/domain-error.js';
import { isValidTimeZone, summaryWindow } from './notes-summary.js';

describe('summaryWindow', () => {
  it('"hoje" em São Paulo vai da meia-noite local (03:00 UTC) até a meia-noite seguinte', () => {
    const window = summaryWindow(new Date('2026-11-06T22:10:00Z'), 'America/Sao_Paulo');
    expect(window.todayStart.toISOString()).toBe('2026-11-06T03:00:00.000Z');
    expect(window.tomorrowStart.toISOString()).toBe('2026-11-07T03:00:00.000Z');
  });

  it('perto da meia-noite UTC, o dia local ainda é o anterior', () => {
    const window = summaryWindow(new Date('2026-11-07T01:30:00Z'), 'America/Sao_Paulo');
    expect(window.todayStart.toISOString()).toBe('2026-11-06T03:00:00.000Z');
  });

  it('respeita a troca de horário de verão (dia de 23 horas)', () => {
    const window = summaryWindow(new Date('2026-03-08T15:00:00Z'), 'America/New_York');
    expect(window.todayStart.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(window.tomorrowStart.toISOString()).toBe('2026-03-09T04:00:00.000Z');
  });

  it('vira o mês e o ano corretamente', () => {
    const window = summaryWindow(new Date('2026-12-31T12:00:00Z'), 'UTC');
    expect(window.tomorrowStart.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('"últimos 14 dias" conta a partir de agora', () => {
    const window = summaryWindow(new Date('2026-11-15T12:00:00Z'), 'UTC');
    expect(window.recentSince.toISOString()).toBe('2026-11-01T12:00:00.000Z');
  });

  it('recusa fuso desconhecido', () => {
    expect(isValidTimeZone('America/Sao_Paulo')).toBe(true);
    expect(isValidTimeZone('Marte/Base')).toBe(false);
    expect(() => summaryWindow(new Date(), 'Marte/Base')).toThrow(DomainError);
  });
});
