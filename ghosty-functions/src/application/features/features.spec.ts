import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  FakePublisher,
  FakeSafety,
  FakeTelegram,
  FixedClock,
  SequentialIds,
} from '../../../test/support/fakes.js';
import { RetryableDeliveryError } from '../ports/telegram-gateway.js';
import {
  CalculateReadinessHandler,
  NICKNAME_PLACEHOLDER,
} from './calculate-readiness/calculate-readiness.handler.js';
import { CheckCheckInDeadlineHandler } from './check-check-in-deadline/check-check-in-deadline.handler.js';
import { DispatchAlertHandler, type HelpRequestTriggered } from './dispatch-alert/dispatch-alert.handler.js';
import { PreviewMessageHandler } from './preview-message/preview-message.handler.js';

const example = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../../../../ghosty-docs/asyncapi/examples/${name}.json`, import.meta.url), 'utf8'),
  ) as unknown;

const ANA = '01a1596a-4860-7d3c-971c-a474b56c7ce7';
const BETO = '01a1596b-32c0-78b2-b54a-d7fa1a1e7fa2';

describe('CalculateReadinessHandler', () => {
  it('devolve a pontuação e a prévia com o marcador do mapa (exemplo do contrato: 150 caracteres)', () => {
    const result = new CalculateReadinessHandler(new FixedClock()).execute({
      notes: { updatedLast14Days: 5 },
      safety: {
        displayName: 'Maria',
        totalContacts: 3,
        confirmedContacts: 2,
        firstConfirmedNickname: 'Ana',
        messageTemplate:
          'Oi, {apelido}. Aqui é {nome}. Posso estar em uma situação de risco e preciso de ajuda. {local} Enviado às {hora}.',
        messageReviewed: true,
        includeLocation: true,
        secretCodeSet: true,
        lastTestAt: '2026-11-03T22:02:00Z',
      },
      geoPermission: 'prompt',
      now: '2026-11-06T22:10:00Z',
      timezone: 'America/Sao_Paulo',
    });
    expect(result).toMatchObject({ score: 90, level: 'ready' });
    expect(result.messagePreview).toEqual({
      text: 'Oi, Ana. Aqui é Maria. Posso estar em uma situação de risco e preciso de ajuda. Minha localização: [link do mapa na hora do pedido]. Enviado às 19:10.',
      characters: 150,
      limit: 4096,
      withinLimit: true,
      mapUrl: null,
    });
  });

  it('sem contato confirmado usa um marcador no apelido; sem localização tira o trecho', () => {
    const result = new CalculateReadinessHandler(new FixedClock()).execute({
      notes: null,
      safety: {
        displayName: 'Maria',
        totalContacts: 0,
        confirmedContacts: 0,
        firstConfirmedNickname: null,
        messageTemplate: 'Oi, {apelido}. {local} Às {hora}.',
        messageReviewed: false,
        includeLocation: false,
        secretCodeSet: true,
        lastTestAt: null,
      },
      geoPermission: 'unknown',
    });
    expect(result.messagePreview.text).toBe(`Oi, ${NICKNAME_PLACEHOLDER}. Às 19:10.`);
    expect(result.score).toBe(5);
  });
});

describe('PreviewMessageHandler', () => {
  it('mostra o texto exato e a contagem; acima do limite responde withinLimit false', () => {
    const handler = new PreviewMessageHandler(new FixedClock());
    const preview = handler.execute({
      template: '{nome} para {apelido}: {local}',
      displayName: 'Maria',
      contactNickname: 'Ana',
      location: { lat: -23.5505, lng: -46.6333, accuracyMeters: 20 },
    });
    expect(preview.mapUrl).toBe('https://www.google.com/maps?q=-23.5505,-46.6333');
    expect(preview.text).toBe(
      'Maria para Ana: Minha localização: https://www.google.com/maps?q=-23.5505,-46.6333 (precisão de 20 m).',
    );
    const long = handler.execute({
      template: 'x'.repeat(4096) + ' {nome}',
      displayName: 'Maria',
      contactNickname: 'Ana',
    });
    expect(long).toMatchObject({ withinLimit: false, limit: 4096 });
  });
});

describe('DispatchAlertHandler', () => {
  let safety: FakeSafety;
  let telegram: FakeTelegram;
  let publisher: FakePublisher;
  const event = example('help-request-triggered.real') as HelpRequestTriggered;
  const handler = (deliveryMode: 'simulated' | 'telegram') =>
    new DispatchAlertHandler(safety, telegram, publisher, new FixedClock(), new SequentialIds(), {
      deliveryMode,
      timezone: 'America/Sao_Paulo',
      alertDispatchesQueue: 'alert-dispatches',
    });

  beforeEach(() => {
    safety = new FakeSafety();
    telegram = new FakeTelegram();
    publisher = new FakePublisher();
    safety.targets = {
      helpRequestId: event.data.helpRequestId,
      accountId: event.data.accountId,
      mode: 'real',
      targets: [
        { contactId: ANA, nickname: 'Ana', position: 1, channel: 'telegram', telegramChatId: '5123456789' },
        { contactId: BETO, nickname: 'Beto', position: 2, channel: 'web', telegramChatId: null },
      ],
      recordedSteps: [],
    };
  });

  it('modo real com Telegram: envia para a Ana, publica para o Beto, pula a Carla e publica o resultado', async () => {
    const result = await handler('telegram').execute(event);
    expect(result.status).toBe('dispatched');
    expect(result.steps.map((s) => [s.stepOrder, s.channel, s.outcome])).toEqual([
      [1, 'telegram', 'sent'],
      [2, 'web', 'published_web'],
      [3, 'none', 'skipped_unconfirmed'],
    ]);
    expect(telegram.sent).toHaveLength(1);
    expect(telegram.sent[0]?.chatId).toBe('5123456789');
    expect(telegram.sent[0]?.text).toContain('Oi, Ana. Aqui é Maria.');
    expect(result.steps[2]?.message).toBeNull();
    expect(publisher.published[0]).toMatchObject({
      queueName: 'alert-dispatches',
      envelope: {
        type: 'ghosty.functions.alert.dispatched.v1',
        source: 'ghosty-functions',
        correlationId: event.correlationId,
      },
    });
  });

  it('DELIVERY_MODE=simulated e o modo teste nunca chamam o Telegram', async () => {
    const simulated = await handler('simulated').execute(event);
    expect(simulated.steps.map((s) => s.outcome)).toEqual([
      'would_send',
      'published_web',
      'skipped_unconfirmed',
    ]);
    const test = await handler('telegram').execute({ ...event, data: { ...event.data, mode: 'test' } });
    expect(test.steps.map((s) => s.outcome)).toEqual(['would_send', 'would_send', 'skipped_unconfirmed']);
    expect(telegram.sent).toHaveLength(0);
  });

  it('403 do Telegram vira failed (sem repetir); 429 lança para a fila tentar de novo', async () => {
    telegram.next = { ok: false, errorCode: 'telegram_403' };
    const result = await handler('telegram').execute(event);
    expect(result.steps[0]).toMatchObject({ outcome: 'failed', errorCode: 'telegram_403' });
    expect(result.status).toBe('dispatched');

    telegram.next = 'retry';
    await expect(handler('telegram').execute(event)).rejects.toBeInstanceOf(RetryableDeliveryError);
  });

  it('reprocessar a mesma mensagem não envia o aviso duas vezes', async () => {
    safety.targets!.recordedSteps = [{ contactId: ANA, outcome: 'sent' }];
    const result = await handler('telegram').execute(event);
    expect(telegram.sent).toHaveLength(0);
    expect(result.steps[0]?.outcome).toBe('sent');
  });

  it('sem nenhum contato confirmado: um passo no_contacts e status failed', async () => {
    safety.targets!.targets = [];
    const result = await handler('telegram').execute(event);
    expect(result.steps).toEqual([
      {
        stepOrder: 1,
        contactId: null,
        channel: 'none',
        outcome: 'no_contacts',
        message: null,
        errorCode: null,
        occurredAt: '2026-11-06T22:10:05.000Z',
      },
    ]);
    expect(result.status).toBe('failed');
  });

  it('contato que saiu da rede entre o pedido e o envio não recebe nada', async () => {
    safety.targets!.targets = safety.targets!.targets.filter((t) => t.contactId !== ANA);
    const result = await handler('telegram').execute(event);
    expect(result.steps[0]).toMatchObject({ contactId: ANA, outcome: 'skipped_unconfirmed' });
    expect(telegram.sent).toHaveLength(0);
  });

  it('safety-service fora do ar: lança (a fila tenta de novo) e não publica nada', async () => {
    safety.targets = undefined;
    await expect(handler('telegram').execute(event)).rejects.toThrow();
    expect(publisher.published).toHaveLength(0);
  });
});

describe('CheckCheckInDeadlineHandler', () => {
  it('pede para vencer o check-in na versão da mensagem', async () => {
    const safety = new FakeSafety();
    const handler = new CheckCheckInDeadlineHandler(safety);
    const event = example('check-in-deadline-scheduled') as Parameters<
      CheckCheckInDeadlineHandler['execute']
    >[0];
    expect(await handler.execute(event)).toEqual({ result: 'expired', helpRequestId: null });
    expect(await handler.execute({ ...event, data: { ...event.data, version: 2 } })).toMatchObject({
      result: 'ignored',
    });
    expect(safety.expired).toEqual([
      { checkInId: event.data.checkInId, version: 1 },
      { checkInId: event.data.checkInId, version: 2 },
    ]);
  });
});
