import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appOptionsFrom } from '../../src/api/app-options.js';
import { AppModule } from '../../src/api/app.module.js';
import { OPENAPI } from '../../src/api/openapi.config.js';
import { configureApp } from '../../src/api/platform/bootstrap.js';
import { loadEnv } from '../../src/infrastructure/config/env.js';
import {
  ACCOUNT,
  CODE,
  fakeNotesService,
  fakeSafetyService,
  FakeUpstream,
  PASSWORD,
} from '../support/fake-upstreams.js';

const KEY = 'test-internal-key';
const FN_KEY = 'chave-da-function';
const CHECK_IN = '01a1b2e0-3300-7abf-90bf-07d69a5799b9';
const HELP = '01a1b2e9-6678-7ead-96cd-77eeda864fb3';
const TOKEN = 'jKotp-mc9i8mlKGKyexO0wc181jY4RIorNnJu-kXiag';

const SUMMARY = {
  displayName: 'Maria',
  secretCodeSet: true,
  network: {
    total: 3,
    confirmed: 2,
    pending: 1,
    declined: 0,
    contacts: [
      {
        id: '01a1596b-32c0-78b2-b54a-d7fa1a1e7fa2',
        nickname: 'Beto',
        position: 2,
        status: 'confirmed',
        channel: 'web',
      },
      {
        id: '01a1596a-4860-7d3c-971c-a474b56c7ce7',
        nickname: 'Ana',
        position: 1,
        status: 'confirmed',
        channel: 'telegram',
      },
      {
        id: '01a1596c-1d20-7fdb-b978-4d0ae408d877',
        nickname: 'Carla',
        position: 3,
        status: 'pending',
        channel: null,
      },
    ],
  },
  alertSettings: {
    messageTemplate: 'Oi, {apelido}. Aqui é {nome}.',
    includeLocation: true,
    countdownSeconds: 10,
    reviewed: true,
  },
  activeCheckIn: null,
  lastTest: { helpRequestId: HELP, at: '2026-11-03T22:02:00.000Z', outcome: 'ok' },
};

const NOTES_SUMMARY = { total: 14, pinned: 2, archived: 3, updatedLast14Days: 5, remindersToday: 1 };

const READINESS = {
  score: 100,
  level: 'ready',
  items: [
    {
      id: 'network-confirmed',
      ok: true,
      weight: 30,
      text: '2 de 3 contatos confirmaram',
      recommendation: null,
    },
  ],
  messagePreview: {
    text: 'Oi, Ana. Aqui é Maria.',
    characters: 22,
    limit: 4096,
    withinLimit: true,
    mapUrl: null,
  },
};

const INVITATION = {
  inviterDisplayName: 'Maria',
  status: 'pending',
  channel: null,
  expiresAt: '2026-11-09T22:10:00.000Z',
  respondable: true,
  telegramUrl: `https://t.me/ghosty_dev_bot?start=${TOKEN}`,
};

function fakeSafetyWithFlows(): FakeUpstream {
  return fakeSafetyService()
    .on('GET', '/summary', () => ({ status: 200, body: SUMMARY }))
    .on('POST', '/check-ins', () => ({
      status: 201,
      body: { id: CHECK_IN, status: 'active', version: 1 },
      headers: { Location: `/check-ins/${CHECK_IN}` },
    }))
    .on('GET', '/check-ins', () => ({ status: 200, body: { items: [], page: 1, pageSize: 20, total: 0 } }))
    .on('GET', `/check-ins/${CHECK_IN}`, () => ({ status: 200, body: { id: CHECK_IN, status: 'active' } }))
    .on('PUT', `/check-ins/${CHECK_IN}`, () => ({ status: 200, body: { id: CHECK_IN, version: 2 } }))
    .on('DELETE', `/check-ins/${CHECK_IN}`, () => ({ status: 204 }))
    .on('POST', `/check-ins/${CHECK_IN}/confirm`, () => ({
      status: 409,
      body: { code: 'INVALID_STATE', detail: 'Não é possível confirmar um check-in expired.' },
    }))
    .on('POST', '/help-requests', () => ({
      status: 202,
      body: { id: HELP, status: 'triggered', steps: [] },
      headers: { Location: `/help-requests/${HELP}` },
    }))
    .on('GET', '/help-requests', () => ({ status: 200, body: { items: [], page: 2, pageSize: 5, total: 0 } }))
    .on('GET', `/help-requests/${HELP}`, () => ({ status: 200, body: { id: HELP, status: 'dispatched' } }))
    .on('POST', `/help-requests/${HELP}/cancel`, () => ({
      status: 200,
      body: { id: HELP, status: 'cancelled' },
    }))
    .on('GET', `/invitations/${TOKEN}`, () => ({ status: 200, body: INVITATION }))
    .on('POST', `/invitations/${TOKEN}/accept`, (call) => ({
      status: 200,
      body: {
        ...INVITATION,
        status: 'confirmed',
        channel: (call.body as { channel: string }).channel,
        respondable: false,
      },
    }))
    .on('POST', `/invitations/${TOKEN}/decline`, () => ({
      status: 409,
      body: { code: 'INVALID_STATE', detail: 'Este convite já foi respondido.' },
    }))
    .on('GET', `/invitations/${TOKEN}/alerts`, () => ({ status: 200, body: { items: [] } }));
}

function fakeNotesWithSummary(): FakeUpstream {
  return fakeNotesService().on('GET', '/notes/summary', () => ({ status: 200, body: NOTES_SUMMARY }));
}

function fakeFunctions(): FakeUpstream {
  return new FakeUpstream()
    .on('POST', '/api/readiness', () => ({ status: 200, body: READINESS }))
    .on('POST', '/api/message-preview', (call) => {
      const body = call.body as { template: string; contactNickname: string; displayName: string };
      const text = body.template
        .replace('{apelido}', body.contactNickname)
        .replace('{nome}', body.displayName);
      return {
        status: 200,
        body: { text, characters: text.length, limit: 4096, withinLimit: true, mapUrl: null },
      };
    });
}

describe('BFF: painel, prévia, check-ins, pedidos de ajuda e convites', () => {
  let safety: FakeUpstream;
  let notes: FakeUpstream;
  let functions: FakeUpstream;
  let app: INestApplication;
  let accessToken: string;
  let safetyToken: string;

  beforeAll(async () => {
    safety = fakeSafetyWithFlows();
    notes = fakeNotesWithSummary();
    functions = fakeFunctions();
    await Promise.all([safety.start(), notes.start(), functions.start()]);
    const env = loadEnv({
      INTERNAL_API_KEY: KEY,
      LOG_LEVEL: 'silent',
      SAFETY_SERVICE_URL: safety.url,
      NOTES_SERVICE_URL: notes.url,
      FUNCTIONS_BASE_URL: functions.url,
      FUNCTIONS_KEY: FN_KEY,
      UPSTREAM_TIMEOUT_MS: '1000',
      RATE_LIMIT_USER_PER_MINUTE: '500',
      SAFETY_REMOTE_URL: 'http://localhost:5175/remoteEntry.js',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(appOptionsFrom(env))],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app, OPENAPI);
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: ACCOUNT.email, password: PASSWORD })
      .expect(200);
    accessToken = login.body.accessToken;
    const session = await request(app.getHttpServer())
      .post('/safety/session')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: CODE })
      .expect(200);
    safetyToken = session.body.safetyToken;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await Promise.all([safety?.stop(), notes?.stop(), functions?.stop()]);
  });

  beforeEach(() => {
    safety.reset();
    notes.reset();
    functions.reset();
  });

  const http = () => request(app.getHttpServer());
  const secure = (req: request.Test) =>
    req.set('Authorization', `Bearer ${accessToken}`).set('X-Safety-Token', safetyToken);

  describe('GET /aggregated-data', () => {
    it('exige o JWT e o X-Safety-Token', async () => {
      await http().get('/aggregated-data').expect(401);
      await http().get('/aggregated-data').set('Authorization', `Bearer ${accessToken}`).expect(403);
    });

    it('junta as 3 fontes: notas e segurança em paralelo, depois a prontidão da Function', async () => {
      const res = await secure(http().get('/aggregated-data?geo=granted'))
        .set('X-Correlation-Id', 'corr-painel')
        .expect(200);
      expect(res.body).toMatchObject({
        facade: { totalNotes: 14, pinned: 2, archived: 3, updatedLast14Days: 5, remindersToday: 1 },
        safety: {
          network: { total: 3, confirmed: 2 },
          alertSettings: { includeLocation: true, countdownSeconds: 10, reviewed: true },
          activeCheckIn: null,
          lastTest: { outcome: 'ok' },
        },
        readiness: {
          score: 100,
          level: 'ready',
          messagePreview: { text: 'Oi, Ana. Aqui é Maria.', characters: 22, limit: 4096 },
        },
        sources: { notes: 'ok', safety: 'ok', readiness: 'ok' },
      });
      expect(res.body.disabledFeatures.map((f: { id: string }) => f.id)).toEqual([
        'sms-whatsapp-email',
        'web-push',
        'check-in-push',
        'decoy-code',
        'false-alarm-message',
      ]);
      // A prévia do painel não leva campos que o contrato não tem, e o modelo da mensagem fica de fora.
      expect(Object.keys(res.body.readiness.messagePreview).sort()).toEqual(['characters', 'limit', 'text']);
      expect(res.body.safety.alertSettings).not.toHaveProperty('messageTemplate');

      expect(notes.calls[0]).toMatchObject({ path: '/notes/summary?timezone=America%2FSao_Paulo' });
      expect(notes.calls[0]?.headers['x-user-id']).toBe(ACCOUNT.id);
      const [readiness] = functions.calls;
      expect(readiness?.headers['x-functions-key']).toBe(FN_KEY);
      expect(readiness?.headers['x-internal-key']).toBeUndefined();
      expect(readiness?.headers['x-correlation-id']).toBe('corr-painel');
      expect(readiness?.body).toEqual({
        notes: { updatedLast14Days: 5 },
        safety: {
          displayName: 'Maria',
          totalContacts: 3,
          confirmedContacts: 2,
          firstConfirmedNickname: 'Ana',
          messageTemplate: 'Oi, {apelido}. Aqui é {nome}.',
          messageReviewed: true,
          includeLocation: true,
          secretCodeSet: true,
          lastTestAt: '2026-11-03T22:02:00.000Z',
        },
        geoPermission: 'granted',
        timezone: 'America/Sao_Paulo',
      });
    });

    it('geo inválido dá 400; sem geo, vale unknown', async () => {
      await secure(http().get('/aggregated-data?geo=talvez')).expect(400);
      await secure(http().get('/aggregated-data')).expect(200);
      expect((functions.calls[0]?.body as { geoPermission: string }).geoPermission).toBe('unknown');
    });

    it('notes-service fora do ar: 200 parcial, facade null e a Function recebe notes null', async () => {
      notes.down = true;
      const res = await secure(http().get('/aggregated-data')).expect(200);
      expect(res.body.facade).toBeNull();
      expect(res.body.safety).not.toBeNull();
      expect(res.body.sources).toEqual({ notes: 'unavailable', safety: 'ok', readiness: 'ok' });
      expect((functions.calls[0]?.body as { notes: unknown }).notes).toBeNull();
    });

    it('fonte lenta: o limite de tempo corta a espera e a resposta sai parcial', async () => {
      notes.delayMs = 1_500;
      const started = Date.now();
      const res = await secure(http().get('/aggregated-data')).expect(200);
      expect(Date.now() - started).toBeLessThan(1_450);
      expect(res.body.sources.notes).toBe('unavailable');
    });

    it('Function fora do ar: prontidão de reserva, sem prévia da mensagem', async () => {
      functions.down = true;
      const res = await secure(http().get('/aggregated-data')).expect(200);
      expect(res.body.sources).toEqual({ notes: 'ok', safety: 'ok', readiness: 'fallback' });
      expect(res.body.readiness).toMatchObject({ score: 50, level: 'almost', messagePreview: null });
      expect(res.body.readiness.items.map((i: { id: string }) => i.id)).toEqual([
        'network-confirmed',
        'message-reviewed',
        'secret-code',
      ]);
    });

    it('safety-service fora do ar: safety null, prontidão 0 e a Function nem é chamada', async () => {
      // O guard da sessão segura não consulta o safety-service: só o painel sente a falta.
      safety.down = true;
      const res = await secure(http().get('/aggregated-data')).expect(200);
      expect(res.body.safety).toBeNull();
      expect(res.body.facade).not.toBeNull();
      expect(res.body.readiness).toEqual({ score: 0, level: 'attention', items: [], messagePreview: null });
      expect(res.body.sources).toEqual({ notes: 'ok', safety: 'unavailable', readiness: 'fallback' });
      expect(functions.calls).toHaveLength(0);
    });
  });

  describe('POST /safety/message-preview', () => {
    it('completa o nome, o modelo salvo e o primeiro contato confirmado (pela posição)', async () => {
      const res = await secure(http().post('/safety/message-preview')).send({}).expect(200);
      expect(res.body).toMatchObject({ text: 'Oi, Ana. Aqui é Maria.', withinLimit: true, limit: 4096 });
      expect(functions.calls[0]?.headers['x-functions-key']).toBe(FN_KEY);
    });

    it('usa o texto e o apelido enviados, e repassa a localização', async () => {
      const res = await secure(http().post('/safety/message-preview'))
        .send({
          template: 'Socorro, {apelido}!',
          contactNickname: 'Beto',
          location: { lat: -23.55, lng: -46.63 },
        })
        .expect(200);
      expect(res.body.text).toBe('Socorro, Beto!');
      expect(functions.calls[0]?.body).toMatchObject({
        displayName: 'Maria',
        location: { lat: -23.55, lng: -46.63 },
        timezone: 'America/Sao_Paulo',
      });
    });

    it('valida no BFF (campos desconhecidos e limites) e responde 503 sem a Function', async () => {
      const bad = await secure(http().post('/safety/message-preview'))
        .send({ template: '', location: { lat: 99, lng: 0 }, extra: 1 })
        .expect(400);
      expect(bad.body.code).toBe('VALIDATION_FAILED');
      expect(functions.calls).toHaveLength(0);
      functions.down = true;
      const down = await secure(http().post('/safety/message-preview')).send({}).expect(503);
      expect(down.body.code).toBe('UPSTREAM_UNAVAILABLE');
    });
  });

  describe('check-ins e pedidos de ajuda', () => {
    it('inicia o check-in repassando a Idempotency-Key, com o Location prefixado', async () => {
      const res = await secure(http().post('/safety/check-ins'))
        .set('Idempotency-Key', 'chave-de-teste-0001')
        .send({ destination: 'Casa', dueAt: '2026-11-07T02:30:00Z', mode: 'real' })
        .expect(201);
      expect(res.headers.location).toBe(`/safety/check-ins/${CHECK_IN}`);
      expect(safety.calls[0]?.headers['idempotency-key']).toBe('chave-de-teste-0001');
      expect(safety.calls[0]?.headers['x-user-id']).toBe(ACCOUNT.id);
    });

    it('lista (só os filtros conhecidos), busca, estende, cancela e repassa o 409 do confirmar', async () => {
      await secure(http().get('/safety/check-ins?status=active&mode=real&page=1&hack=1')).expect(200);
      expect(safety.calls[0]?.path).toBe('/check-ins?status=active&mode=real&page=1');
      await secure(http().get(`/safety/check-ins/${CHECK_IN}`)).expect(200);
      await secure(http().put(`/safety/check-ins/${CHECK_IN}`))
        .send({ dueAt: '2026-11-07T03:00:00Z' })
        .expect(200);
      await secure(http().delete(`/safety/check-ins/${CHECK_IN}`)).expect(204);
      const conflict = await secure(http().post(`/safety/check-ins/${CHECK_IN}/confirm`)).expect(409);
      expect(conflict.body.code).toBe('INVALID_STATE');
      await secure(http().get('/safety/check-ins/nao-e-uuid')).expect(404);
      expect(safety.calls.some((c) => c.path.includes('nao-e-uuid'))).toBe(false);
    });

    it('dispara o pedido de ajuda (202 + Location) e acompanha, lista e cancela', async () => {
      const res = await secure(http().post('/safety/help-requests'))
        .set('Idempotency-Key', 'chave-de-teste-0002')
        .send({ mode: 'test' })
        .expect(202);
      expect(res.headers.location).toBe(`/safety/help-requests/${HELP}`);
      expect(safety.calls[0]?.headers['idempotency-key']).toBe('chave-de-teste-0002');

      expect((await secure(http().get(`/safety/help-requests/${HELP}`)).expect(200)).body.status).toBe(
        'dispatched',
      );
      await secure(http().get('/safety/help-requests?mode=test&page=2&pageSize=5')).expect(200);
      expect(safety.calls.at(-1)?.path).toBe('/help-requests?mode=test&page=2&pageSize=5');
      expect(
        (await secure(http().post(`/safety/help-requests/${HELP}/cancel`)).expect(200)).body.status,
      ).toBe('cancelled');
    });

    it('sem a sessão segura, nada chega ao safety-service', async () => {
      await http()
        .post('/safety/help-requests')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(403);
      expect(safety.calls).toHaveLength(0);
    });
  });

  describe('convites (públicos)', () => {
    it('abre e aceita sem login, sem X-User-Id, com o remoteUrl do remote safety', async () => {
      const page = await http().get(`/invitations/${TOKEN}`).expect(200);
      expect(page.body).toEqual({ ...INVITATION, remoteUrl: 'http://localhost:5175/remoteEntry.js' });
      expect(safety.calls[0]?.headers['x-user-id']).toBeUndefined();
      expect(safety.calls[0]?.headers['x-internal-key']).toBe(KEY);

      const accepted = await http().post(`/invitations/${TOKEN}/accept`).send({ channel: 'web' }).expect(200);
      expect(accepted.body).toMatchObject({
        status: 'confirmed',
        channel: 'web',
        remoteUrl: expect.any(String),
      });
    });

    it('repassa o 409 do recusar, os avisos com since e recusa token malformado sem chamar o serviço', async () => {
      expect((await http().post(`/invitations/${TOKEN}/decline`).expect(409)).body.code).toBe(
        'INVALID_STATE',
      );
      await http().get(`/invitations/${TOKEN}/alerts?since=2026-11-06T22:00:00Z`).expect(200);
      expect(safety.calls.at(-1)?.path).toBe(`/invitations/${TOKEN}/alerts?since=2026-11-06T22%3A00%3A00Z`);
      safety.reset();
      await http().get('/invitations/..').expect(404);
      await http().get('/invitations/curto').expect(404);
      expect(safety.calls).toHaveLength(0);
    });
  });

  it('o Swagger tem as operações do contrato do BFF', async () => {
    const res = await http().get('/docs-json').expect(200);
    const ids = Object.values(
      res.body.paths as Record<string, Record<string, { operationId: string }>>,
    ).flatMap((p) => Object.values(p).map((op) => op.operationId));
    for (const id of [
      'getAggregatedData',
      'previewMessage',
      'startCheckIn',
      'confirmArrival',
      'triggerHelpRequest',
      'cancelHelpRequest',
      'getInvitation',
      'getInvitationAlerts',
    ]) {
      expect(ids).toContain(id);
    }
  });
});
