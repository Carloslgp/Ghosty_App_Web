import { describe, expect, it } from 'vitest';
import { looksLikeUnlockCode, SafetySession } from './safety-session.js';

const POLICY = { idleMs: 10 * 60_000, maxMs: 30 * 60_000 };
const T0 = new Date('2026-11-06T22:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

describe('SafetySession', () => {
  it('vale 10 minutos sem uso', () => {
    const session = SafetySession.start('j1', 'a1', T0);
    expect(session.isActive(at(9.9), POLICY)).toBe(true);
    expect(session.isActive(at(10), POLICY)).toBe(false);
  });

  it('cada uso renova a janela, mas nunca passa de 30 minutos', () => {
    const session = SafetySession.start('j1', 'a1', T0);
    for (const minute of [8, 16, 24]) {
      expect(session.isActive(at(minute), POLICY)).toBe(true);
      session.touch(at(minute));
    }
    expect(session.expiresAt(POLICY)).toEqual(at(30));
    expect(session.isActive(at(29.9), POLICY)).toBe(true);
    expect(session.isActive(at(30), POLICY)).toBe(false);
    expect(session.jti).toBe('j1');
    expect(session.accountId).toBe('a1');
  });

  it('revogada (saída rápida) deixa de valer na hora', () => {
    const session = SafetySession.start('j1', 'a1', T0);
    session.revoke();
    expect(session.isActive(T0, POLICY)).toBe(false);
  });

  it('a busca só vira tentativa de desbloqueio com 6 a 8 dígitos', () => {
    expect(['123456', '12345678'].every(looksLikeUnlockCode)).toBe(true);
    expect(['12345', '123456789', 'mercado', '12 3456'].some(looksLikeUnlockCode)).toBe(false);
  });
});
