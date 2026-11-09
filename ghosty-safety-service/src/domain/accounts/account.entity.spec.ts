import { describe, expect, it } from 'vitest';
import { DomainError } from '../shared/domain-error.js';
import { Account, assertSecretCodeFormat, normalizeEmail } from './account.entity.js';
import { RefreshToken } from './refresh-token.entity.js';

const NOW = new Date('2026-11-06T22:00:00Z');
const POLICY = { maxAttempts: 5, lockMinutes: 15 };

const create = () =>
  Account.create({
    id: 'a1',
    email: '  Maria@Example.COM ',
    displayName: ' Maria ',
    passwordHash: 'h',
    now: NOW,
  });

describe('Account', () => {
  it('normaliza e-mail e nome e nasce sem código secreto', () => {
    const account = create();
    expect(account.toSnapshot()).toMatchObject({
      email: 'maria@example.com',
      displayName: 'Maria',
      secretCodeHash: null,
      failedCodeAttempts: 0,
      codeLockedUntil: null,
    });
    expect(account.secretCodeSet).toBe(false);
  });

  it('recusa e-mail e nome inválidos', () => {
    expect(() => normalizeEmail('sem-arroba')).toThrow(DomainError);
    expect(() => normalizeEmail(`${'a'.repeat(250)}@x.com`)).toThrow(DomainError);
    expect(() =>
      Account.create({ id: 'a', email: 'a@b.co', displayName: ' ', passwordHash: 'h', now: NOW }),
    ).toThrow(DomainError);
    expect(() => create().rename('x'.repeat(81), NOW)).toThrow(DomainError);
  });

  it('o código tem de 6 a 8 dígitos', () => {
    expect(() => assertSecretCodeFormat('123456')).not.toThrow();
    expect(() => assertSecretCodeFormat('12345678')).not.toThrow();
    for (const bad of ['12345', '123456789', '12a456', ''])
      expect(() => assertSecretCodeFormat(bad)).toThrow(DomainError);
  });

  it('5 erros bloqueiam por 15 minutos; depois o bloqueio passa sozinho', () => {
    const account = create();
    account.setSecretCodeHash('code-hash', NOW);
    for (let i = 0; i < 4; i += 1) account.registerFailedCodeAttempt(NOW, POLICY);
    expect(account.isCodeLocked(NOW)).toBe(false);
    expect(account.toSnapshot().failedCodeAttempts).toBe(4);

    account.registerFailedCodeAttempt(NOW, POLICY);
    expect(account.isCodeLocked(NOW)).toBe(true);
    expect(account.isCodeLocked(new Date(NOW.getTime() + 14 * 60_000))).toBe(true);
    expect(account.isCodeLocked(new Date(NOW.getTime() + 15 * 60_000))).toBe(false);
    expect(account.toSnapshot().failedCodeAttempts).toBe(0);
  });

  it('acertar o código zera as tentativas; definir o código zera também o bloqueio', () => {
    const account = create();
    account.registerFailedCodeAttempt(NOW, POLICY);
    account.registerCorrectCode(NOW);
    expect(account.toSnapshot().failedCodeAttempts).toBe(0);
    account.registerCorrectCode(NOW);

    for (let i = 0; i < 5; i += 1) account.registerFailedCodeAttempt(NOW, POLICY);
    account.setSecretCodeHash('novo', NOW);
    expect(account.isCodeLocked(NOW)).toBe(false);
    expect(account.secretCodeSet).toBe(true);
  });

  it('renomeia e restaura sem compartilhar estado', () => {
    const account = create();
    account.rename('Maria Exemplo', NOW);
    const restored = Account.restore(account.toSnapshot());
    expect(restored.displayName).toBe('Maria Exemplo');
    expect(restored.id).toBe('a1');
    expect(restored.email).toBe('maria@example.com');
    expect(restored.passwordHash).toBe('h');
    expect(restored.secretCodeHash).toBeNull();
  });
});

describe('RefreshToken', () => {
  it('vale 7 dias e deixa de valer ao ser revogado', () => {
    const token = RefreshToken.issue({ id: 't1', accountId: 'a1', tokenHash: 'x', now: NOW });
    expect(token.expiresAt.toISOString()).toBe('2026-11-13T22:00:00.000Z');
    expect(token.isUsable(NOW)).toBe(true);
    expect(token.isUsable(token.expiresAt)).toBe(false);
    token.revoke(NOW);
    token.revoke(new Date());
    expect(token.isUsable(NOW)).toBe(false);
    expect(RefreshToken.restore(token.toSnapshot()).toSnapshot().revokedAt).toEqual(NOW);
    expect(token.id).toBe('t1');
    expect(token.accountId).toBe('a1');
  });
});
