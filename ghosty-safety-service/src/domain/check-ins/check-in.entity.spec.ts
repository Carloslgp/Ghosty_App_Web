import { describe, expect, it } from 'vitest';
import { AlertSettings, DEFAULT_MESSAGE_TEMPLATE } from '../alert-settings/alert-settings.entity.js';
import { reachedSomeone } from '../help-requests/delivery-step.js';
import { HelpRequest } from '../help-requests/help-request.entity.js';
import { DomainError, isMode } from '../shared/domain-error.js';
import { CheckIn } from './check-in.entity.js';

const NOW = new Date('2026-11-06T22:00:00Z');
const inMinutes = (m: number) => new Date(NOW.getTime() + m * 60_000);

const start = (dueAt = inMinutes(30)) =>
  CheckIn.start({
    id: 'k1',
    accountId: 'a1',
    destination: ' Casa ',
    dueAt,
    toleranceMinutes: 10,
    mode: 'real',
    now: NOW,
  });

describe('CheckIn', () => {
  it('nasce ativo, na versão 1, com o prazo final somando a tolerância', () => {
    const checkIn = start();
    expect(checkIn.toSnapshot()).toMatchObject({ destination: 'Casa', status: 'active', version: 1 });
    expect(checkIn.deadlineAt).toEqual(inMinutes(40));
  });

  it('o prazo fica entre 1 minuto e 24 horas, e o destino não pode ser vazio', () => {
    expect(() => start(inMinutes(0.5))).toThrow(DomainError);
    expect(() => start(inMinutes(24 * 60 + 1))).toThrow(DomainError);
    expect(() =>
      CheckIn.start({
        id: 'k',
        accountId: 'a',
        destination: ' ',
        dueAt: inMinutes(30),
        toleranceMinutes: 0,
        mode: 'test',
        now: NOW,
      }),
    ).toThrow(DomainError);
  });

  it('estender sobe a versão, e a mensagem de prazo com versão antiga é ignorada', () => {
    const checkIn = start();
    checkIn.extend(inMinutes(60), NOW);
    expect(checkIn.version).toBe(2);
    expect(checkIn.expire(1, inMinutes(41))).toBe('ignored');
    expect(checkIn.status).toBe('active');
    expect(checkIn.expire(2, inMinutes(71))).toBe('expired');
    expect(checkIn.status).toBe('expired');
    expect(checkIn.expire(2, inMinutes(72))).toBe('ignored');
  });

  it('confirmar ou cancelar depois de vencido é erro de domínio', () => {
    const checkIn = start();
    checkIn.expire(1, inMinutes(41));
    expect(() => checkIn.confirm(NOW)).toThrow(DomainError);
    expect(() => checkIn.cancel()).toThrow(DomainError);
    expect(() => checkIn.extend(inMinutes(90), NOW)).toThrow(DomainError);
  });

  it('confirmar e cancelar encerram o check-in', () => {
    const confirmed = start();
    confirmed.confirm(inMinutes(20));
    expect(confirmed.toSnapshot()).toMatchObject({ status: 'confirmed', confirmedAt: inMinutes(20) });
    const cancelled = start();
    cancelled.cancel();
    expect(CheckIn.restore(cancelled.toSnapshot()).status).toBe('cancelled');
    expect(cancelled.id).toBe('k1');
  });
});

describe('HelpRequest', () => {
  const trigger = (extra: Partial<Parameters<typeof HelpRequest.trigger>[0]> = {}) =>
    HelpRequest.trigger({
      id: 'h1',
      accountId: 'a1',
      origin: 'button',
      mode: 'test',
      location: { lat: -23.55, lng: -46.63, accuracyMeters: 20 },
      checkInId: null,
      now: NOW,
      ...extra,
    });

  it('triggered → dispatched, e repetir o mesmo resultado não muda nada', () => {
    const request = trigger();
    request.recordDispatch('dispatched', inMinutes(1));
    request.recordDispatch('dispatched', inMinutes(2));
    expect(request.toSnapshot()).toMatchObject({ status: 'dispatched', dispatchedAt: inMinutes(1) });
    expect(() => request.recordDispatch('failed', inMinutes(3))).toThrow(DomainError);
  });

  it('"foi engano" cancela triggered ou dispatched, mas não failed nem cancelled', () => {
    const request = trigger();
    request.cancel();
    expect(request.status).toBe('cancelled');
    request.recordDispatch('dispatched', NOW);
    expect(request.status).toBe('cancelled');
    expect(() => request.cancel()).toThrow(DomainError);

    const failed = trigger();
    failed.recordDispatch('failed', NOW);
    expect(() => failed.cancel()).toThrow(DomainError);
  });

  it('valida a localização e exige o check-in quando a origem é o check-in', () => {
    expect(() => trigger({ location: { lat: 91, lng: 0, accuracyMeters: null } })).toThrow(DomainError);
    expect(() => trigger({ location: { lat: 0, lng: 181, accuracyMeters: null } })).toThrow(DomainError);
    expect(() => trigger({ location: { lat: 0, lng: 0, accuracyMeters: -1 } })).toThrow(DomainError);
    expect(() => trigger({ origin: 'check_in' })).toThrow(DomainError);
    const fromCheckIn = trigger({ origin: 'check_in', checkInId: 'k1', location: null });
    expect(HelpRequest.restore(fromCheckIn.toSnapshot()).toSnapshot()).toMatchObject({
      origin: 'check_in',
      location: null,
    });
    expect(fromCheckIn.mode).toBe('test');
    expect(fromCheckIn.accountId).toBe('a1');
    expect(fromCheckIn.id).toBe('h1');
  });

  it('um passo "alcançou alguém" quando foi enviado, publicado ou seria enviado', () => {
    expect(
      ['sent', 'published_web', 'would_send'].every((outcome) =>
        reachedSomeone({ outcome: outcome as never }),
      ),
    ).toBe(true);
    expect(
      ['failed', 'skipped_unconfirmed', 'no_contacts'].some((outcome) =>
        reachedSomeone({ outcome: outcome as never }),
      ),
    ).toBe(false);
    expect(isMode('test')).toBe(true);
    expect(isMode('demo')).toBe(false);
  });
});

describe('AlertSettings', () => {
  it('nasce com os valores padrão, não revisada, e salvar marca como revisada', () => {
    const settings = AlertSettings.createDefault('a1');
    expect(settings.toSnapshot()).toEqual({
      accountId: 'a1',
      messageTemplate: DEFAULT_MESSAGE_TEMPLATE,
      includeLocation: true,
      countdownSeconds: 10,
      checkInToleranceMinutes: 10,
      reviewedAt: null,
    });
    settings.update(
      {
        messageTemplate: ' Oi {apelido} ',
        includeLocation: false,
        countdownSeconds: 5,
        checkInToleranceMinutes: 0,
      },
      NOW,
    );
    expect(settings.reviewed).toBe(true);
    expect(AlertSettings.restore(settings.toSnapshot()).toSnapshot()).toMatchObject({
      messageTemplate: 'Oi {apelido}',
    });
    expect(settings.accountId).toBe('a1');
  });

  it('recusa valores fora dos limites', () => {
    const base = {
      messageTemplate: 'x',
      includeLocation: true,
      countdownSeconds: 10,
      checkInToleranceMinutes: 10,
    };
    const settings = AlertSettings.createDefault('a1');
    for (const bad of [
      { ...base, messageTemplate: ' ' },
      { ...base, messageTemplate: 'x'.repeat(3801) },
      { ...base, countdownSeconds: 4 },
      { ...base, countdownSeconds: 61 },
      { ...base, checkInToleranceMinutes: -1 },
      { ...base, checkInToleranceMinutes: 61 },
    ]) {
      expect(() => settings.update(bad, NOW)).toThrow(DomainError);
    }
    expect(settings.reviewed).toBe(false);
  });
});
