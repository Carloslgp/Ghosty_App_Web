import { describe, expect, it } from 'vitest';
import { dispatchStatus, planDispatch, type PlannedContact } from './dispatch/dispatch-planner.js';
import {
  composeMessage,
  formatTime,
  isValidTimezone,
  measureMessage,
  TELEGRAM_MESSAGE_LIMIT,
} from './message/message-composer.js';
import { calculateReadiness, levelFor, type ReadinessInput } from './readiness/readiness-calculator.js';
import { parseTelegramCommand } from './telegram/telegram-command-parser.js';

const TEMPLATE =
  'Oi, {apelido}. Aqui é {nome}. Posso estar em uma situação de risco e preciso de ajuda. {local} Enviado às {hora}.';
const AT = new Date('2026-11-06T22:10:00Z');

describe('MessageComposer e MessageLengthCalculator', () => {
  it('com localização: link do mapa por extenso e precisão (exemplo do contrato, 184 caracteres)', () => {
    const message = composeMessage({
      template: TEMPLATE,
      displayName: 'Maria',
      contactNickname: 'Ana',
      location: { kind: 'point', point: { lat: -23.5505, lng: -46.6333, accuracyMeters: 20 } },
      at: AT,
      timezone: 'America/Sao_Paulo',
    });
    expect(message).toEqual({
      text: 'Oi, Ana. Aqui é Maria. Posso estar em uma situação de risco e preciso de ajuda. Minha localização: https://www.google.com/maps?q=-23.5505,-46.6333 (precisão de 20 m). Enviado às 19:10.',
      mapUrl: 'https://www.google.com/maps?q=-23.5505,-46.6333',
    });
    expect(measureMessage(message.text)).toEqual({ characters: 184, limit: 4096, withinLimit: true });
  });

  it('sem localização (135 caracteres), com o marcador da prévia e sem precisão', () => {
    const base = { template: TEMPLATE, displayName: 'Maria', contactNickname: 'Ana', at: AT };
    const without = composeMessage({ ...base, location: { kind: 'unavailable' } });
    expect(without.text).toBe(
      'Oi, Ana. Aqui é Maria. Posso estar em uma situação de risco e preciso de ajuda. Não foi possível obter a localização. Enviado às 19:10.',
    );
    expect(measureMessage(without.text).characters).toBe(135);
    expect(without.mapUrl).toBeNull();
    expect(composeMessage({ ...base, location: { kind: 'placeholder' } }).text).toContain(
      'Minha localização: [link do mapa na hora do pedido]. Enviado',
    );
    expect(
      composeMessage({
        ...base,
        location: { kind: 'point', point: { lat: 1.23456789, lng: 2, accuracyMeters: null } },
      }).text,
    ).toContain('https://www.google.com/maps?q=1.234568,2. Enviado');
    expect(composeMessage({ ...base, location: { kind: 'omitted' } }).text).toContain(
      'ajuda. Enviado às 19:10.',
    );
  });

  it('o apelido e o nome entram como texto puro, sem interpretar nada', () => {
    const text = composeMessage({
      template: '{nome} *{apelido}* {x}',
      displayName: '<b>Ana</b>',
      contactNickname: '_Beto_',
      location: { kind: 'omitted' },
      at: AT,
    }).text;
    expect(text).toBe('<b>Ana</b> *_Beto_* {x}');
  });

  it('acima de 4.096 caracteres fica fora do limite (emojis contam como 1)', () => {
    expect(measureMessage('a'.repeat(TELEGRAM_MESSAGE_LIMIT)).withinLimit).toBe(true);
    expect(measureMessage('a'.repeat(TELEGRAM_MESSAGE_LIMIT + 1)).withinLimit).toBe(false);
    expect(measureMessage('🙂🙂').characters).toBe(2);
  });

  it('formata a hora no fuso e valida o fuso', () => {
    expect(formatTime(AT)).toBe('19:10');
    expect(formatTime(AT, 'UTC')).toBe('22:10');
    expect(isValidTimezone('America/Sao_Paulo')).toBe(true);
    expect(isValidTimezone('Marte/Base')).toBe(false);
  });
});

describe('ReadinessCalculator', () => {
  const almost: ReadinessInput = {
    notes: { updatedLast14Days: 5 },
    safety: {
      totalContacts: 3,
      confirmedContacts: 2,
      messageReviewed: true,
      secretCodeSet: true,
      lastTestAt: new Date('2026-11-03T22:02:00Z'),
    },
    geoPermission: 'prompt',
    now: AT,
  };

  it('o exemplo do contrato dá 90 pontos (ready), com os mesmos textos', () => {
    const result = calculateReadiness(almost);
    expect(result.score).toBe(90);
    expect(result.level).toBe('ready');
    expect(result.items.map((i) => [i.id, i.ok, i.weight, i.text])).toEqual([
      ['network-confirmed', true, 30, '2 de 3 contatos confirmaram'],
      ['network-two-confirmed', true, 10, 'Você tem 2 contatos confirmados'],
      ['message-reviewed', true, 15, 'Mensagem revisada'],
      ['location-permission', false, 10, 'Localização ainda não permitida neste navegador'],
      ['recent-test', true, 20, 'Último Teste seguro há 3 dias'],
      ['facade-usage', true, 10, '5 notas atualizadas nos últimos 14 dias'],
      ['secret-code', true, 5, 'Código de bloqueio definido'],
    ]);
    expect(result.items[3]?.recommendation).toBe(
      'Permita a localização para a sua rede saber onde você está.',
    );
    expect(result.items.filter((i) => i.ok).every((i) => i.recommendation === null)).toBe(true);
  });

  it('os pesos somam 100 e cada item reprovado traz uma recomendação', () => {
    const full = calculateReadiness({ ...almost, geoPermission: 'granted' });
    expect(full.score).toBe(100);
    const empty = calculateReadiness({
      notes: null,
      safety: {
        totalContacts: 0,
        confirmedContacts: 0,
        messageReviewed: false,
        secretCodeSet: false,
        lastTestAt: null,
      },
      geoPermission: 'denied',
      now: AT,
    });
    expect(empty.score).toBe(0);
    expect(empty.level).toBe('attention');
    expect(empty.items.every((i) => !i.ok && typeof i.recommendation === 'string')).toBe(true);
    expect(empty.items.map((i) => i.text)).toEqual([
      'Sua rede de apoio ainda está vazia',
      'Menos de 2 contatos confirmados',
      'A mensagem ainda não foi revisada',
      'Localização bloqueada neste navegador',
      'Nenhum Teste seguro feito ainda',
      'Não foi possível consultar as notas agora',
      'Código de bloqueio não definido',
    ]);
  });

  it('níveis: 80 ou mais ready, de 50 a 79 almost, abaixo de 50 attention', () => {
    expect([100, 80, 79, 50, 49, 0].map(levelFor)).toEqual([
      'ready',
      'ready',
      'almost',
      'almost',
      'attention',
      'attention',
    ]);
  });

  it('teste com mais de 30 dias não conta; hoje e 1 dia têm texto próprio; 1 contato e 1 nota no singular', () => {
    const base = { ...almost.safety, totalContacts: 1, confirmedContacts: 1 };
    const old = calculateReadiness({
      ...almost,
      safety: { ...base, lastTestAt: new Date('2026-10-06T22:00:00Z') },
    });
    expect(old.items[4]).toMatchObject({ ok: false, text: 'Último Teste seguro há 31 dias' });
    expect(old.items[0]?.text).toBe('1 de 1 contato confirmou');
    const today = calculateReadiness({ ...almost, safety: { ...base, lastTestAt: AT } });
    expect(today.items[4]?.text).toBe('Último Teste seguro hoje');
    const yesterday = calculateReadiness({
      ...almost,
      safety: { ...base, lastTestAt: new Date('2026-11-05T22:00:00Z') },
    });
    expect(yesterday.items[4]?.text).toBe('Último Teste seguro há 1 dia');
    const one = calculateReadiness({ ...almost, notes: { updatedLast14Days: 1 } });
    expect(one.items[5]).toMatchObject({ ok: false, text: '1 nota atualizada nos últimos 14 dias' });
    const pending = calculateReadiness({
      ...almost,
      safety: { ...base, totalContacts: 2, confirmedContacts: 0 },
    });
    expect(pending.items[0]?.text).toBe('Nenhum contato confirmou o convite ainda');
  });
});

describe('DispatchPlanner', () => {
  const contacts: PlannedContact[] = [
    { contactId: 'c3', nickname: 'Carla', position: 3, status: 'pending', channel: null },
    { contactId: 'c1', nickname: 'Ana', position: 1, status: 'confirmed', channel: 'telegram' },
    { contactId: 'c2', nickname: 'Beto', position: 2, status: 'confirmed', channel: 'web' },
  ];

  it('modo real com Telegram ligado: respeita a ordem e só o Telegram é enviado', () => {
    expect(
      planDispatch(contacts, 'real', 'telegram').map((s) => [
        s.stepOrder,
        s.contact?.contactId,
        s.channel,
        s.action,
      ]),
    ).toEqual([
      [1, 'c1', 'telegram', 'send_telegram'],
      [2, 'c2', 'web', 'published_web'],
      [3, 'c3', 'none', 'skipped_unconfirmed'],
    ]);
  });

  it('DELIVERY_MODE=simulated nunca envia pelo Telegram', () => {
    expect(planDispatch(contacts, 'real', 'simulated').map((s) => s.action)).toEqual([
      'would_send',
      'published_web',
      'skipped_unconfirmed',
    ]);
  });

  it('o modo teste nunca chama o Telegram nem publica na página', () => {
    const actions = planDispatch(contacts, 'test', 'telegram').map((s) => s.action);
    expect(actions).toEqual(['would_send', 'would_send', 'skipped_unconfirmed']);
    expect(actions).not.toContain('send_telegram');
  });

  it('sem contatos confirmados: um único passo no_contacts', () => {
    const steps = planDispatch([contacts[0]!], 'real', 'telegram');
    expect(steps).toEqual([{ stepOrder: 1, contact: null, channel: 'none', action: 'no_contacts' }]);
    expect(planDispatch([], 'test', 'simulated')).toHaveLength(1);
  });

  it('o pedido falha quando ninguém foi alcançado', () => {
    expect(dispatchStatus(['failed', 'skipped_unconfirmed'])).toBe('failed');
    expect(dispatchStatus(['no_contacts'])).toBe('failed');
    expect(dispatchStatus(['failed', 'published_web'])).toBe('dispatched');
    expect(dispatchStatus(['would_send'])).toBe('dispatched');
  });
});

describe('TelegramCommandParser', () => {
  const token = 'jKotp-mc9i8mlKGKyexO0wc181jY4RIorNnJu-kXiag';

  it('reconhece /start com o token do convite e /parar', () => {
    expect(parseTelegramCommand(`/start ${token}`)).toEqual({ kind: 'start', token });
    expect(parseTelegramCommand(`/start@ghosty_dev_bot ${token}`)).toEqual({ kind: 'start', token });
    expect(parseTelegramCommand('/parar')).toEqual({ kind: 'leave' });
    expect(parseTelegramCommand('/PARAR')).toEqual({ kind: 'leave' });
    expect(parseTelegramCommand('/stop')).toEqual({ kind: 'leave' });
  });

  it('ignora qualquer outro texto, /start sem token e token malformado', () => {
    for (const text of [
      undefined,
      '',
      'oi',
      '/start',
      '/start abc',
      `/start ${token}x`,
      `/start ${token} extra`,
      '/parar agora',
    ]) {
      expect(parseTelegramCommand(text)).toEqual({ kind: 'ignore' });
    }
  });
});
