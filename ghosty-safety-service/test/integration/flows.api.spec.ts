import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appOptionsFrom } from '../../src/api/app-options.js';
import { AppModule } from '../../src/api/app.module.js';
import { OPENAPI } from '../../src/api/openapi.config.js';
import { configureApp } from '../../src/api/platform/bootstrap.js';
import { loadEnv } from '../../src/infrastructure/config/env.js';
import { TEST_KEY } from '../support/safety-kit.js';

const KEY = 'test-internal-key';
const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

describe('safety-service: check-ins e pedidos de ajuda (HTTP + SQLite em memória)', () => {
  let app: INestApplication;
  let accountId: string;
  let anaId: string;

  beforeAll(async () => {
    const env = loadEnv({
      INTERNAL_API_KEY: KEY,
      DATA_ENCRYPTION_KEY: TEST_KEY,
      SQLITE_PATH: ':memory:',
      MESSAGING_ENABLED: 'false',
      LOG_LEVEL: 'silent',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(appOptionsFrom(env))],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app, OPENAPI);
    await app.init();

    const account = await internal(http().post('/accounts'))
      .send({ email: 'maria@example.com', displayName: 'Maria', password: 'senha-forte-1' })
      .expect(201);
    accountId = account.body.id;
    const ana = await asUser(http().post('/contacts')).send({ nickname: 'Ana' }).expect(201);
    anaId = ana.body.id;
    const invite = await asUser(http().post(`/contacts/${anaId}/invitation`)).expect(201);
    await internal(http().post('/internal/contacts/telegram-link'))
      .send({ token: invite.body.token, chatId: '5123456789' })
      .expect(200);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const internal = (req: request.Test) => req.set('X-Internal-Key', KEY);
  const asUser = (req: request.Test) => internal(req).set('X-User-Id', accountId);
  const withKey = (req: request.Test, key: string) => asUser(req).set('Idempotency-Key', key);

  it('pedido de ajuda: 202 + Location, idempotente pela chave, e a Idempotency-Key é obrigatória', async () => {
    const missing = await asUser(http().post('/help-requests')).send({ mode: 'real' }).expect(400);
    expect(missing.body.errors[0].field).toBe('Idempotency-Key');

    const first = await withKey(http().post('/help-requests'), 'chave-http-0001')
      .send({ mode: 'real', location: { lat: -23.5505, lng: -46.6333, accuracyMeters: 20 } })
      .expect(202);
    expect(first.headers.location).toBe(`/help-requests/${first.body.id}`);
    expect(first.body).toMatchObject({ origin: 'button', status: 'triggered', steps: [] });

    const again = await withKey(http().post('/help-requests'), 'chave-http-0001')
      .send({ mode: 'real' })
      .expect(202);
    expect(again.body.id).toBe(first.body.id);

    await withKey(http().post('/help-requests'), 'chave-http-0002').send({ mode: 'talvez' }).expect(400);
    await withKey(http().post('/help-requests'), 'chave-http-0003')
      .send({ mode: 'real', location: { lat: 120, lng: 0 } })
      .expect(400);
    await withKey(http().post('/help-requests'), 'chave-http-0004')
      .send({ mode: 'real', location: null })
      .expect(202);
  });

  it('destinos de entrega (rota interna), consulta, lista e "foi engano"', async () => {
    const list = await asUser(http().get('/help-requests?mode=real&pageSize=1')).expect(200);
    expect(list.body).toMatchObject({ page: 1, pageSize: 1, total: 2 });
    const id = list.body.items[0].id as string;

    const targets = await internal(http().get(`/internal/help-requests/${id}/delivery-targets`)).expect(200);
    expect(targets.body).toMatchObject({
      helpRequestId: id,
      accountId,
      mode: 'real',
      targets: [{ contactId: anaId, nickname: 'Ana', channel: 'telegram', telegramChatId: '5123456789' }],
      recordedSteps: [],
    });
    // O chat do Telegram nunca aparece nas rotas da pessoa usuária.
    const view = await asUser(http().get(`/help-requests/${id}`)).expect(200);
    expect(JSON.stringify(view.body)).not.toContain('5123456789');

    const cancelled = await asUser(http().post(`/help-requests/${id}/cancel`)).expect(200);
    expect(cancelled.body.status).toBe('cancelled');
    const twice = await asUser(http().post(`/help-requests/${id}/cancel`)).expect(409);
    expect(twice.body.code).toBe('INVALID_STATE');

    await asUser(http().get('/help-requests/nao-e-uuid')).expect(404);
    await asUser(http().get('/help-requests?page=0')).expect(400);
    await internal(http().get(`/help-requests/${id}`))
      .set('X-User-Id', '01a15965-b480-79af-a113-000000000000')
      .expect(404);
  });

  it('check-in: inicia (201), recusa o segundo (409), estende, e o prazo antigo é ignorado', async () => {
    const started = await withKey(http().post('/check-ins'), 'check-in-http-01')
      .send({ destination: 'Casa', dueAt: inMinutes(30), mode: 'real' })
      .expect(201);
    const id = started.body.id as string;
    expect(started.headers.location).toBe(`/check-ins/${id}`);
    expect(started.body).toMatchObject({ status: 'active', version: 1, toleranceMinutes: 10 });

    const dup = await withKey(http().post('/check-ins'), 'check-in-http-02')
      .send({ destination: 'Trabalho', dueAt: inMinutes(30), mode: 'real' })
      .expect(409);
    expect(dup.body).toMatchObject({ code: 'INVALID_STATE', detail: 'Já existe um check-in ativo.' });
    await withKey(http().post('/check-ins'), 'check-in-http-03')
      .send({ destination: '', dueAt: 'amanhã', mode: 'real', toleranceMinutes: 90 })
      .expect(400);

    const summary = await asUser(http().get('/summary')).expect(200);
    expect(summary.body.activeCheckIn).toMatchObject({ id, destination: 'Casa', status: 'active' });

    const extended = await asUser(http().put(`/check-ins/${id}`))
      .send({ dueAt: inMinutes(60), toleranceMinutes: 5 })
      .expect(200);
    expect(extended.body).toMatchObject({ version: 2, toleranceMinutes: 5 });

    const stale = await internal(http().post(`/internal/check-ins/${id}/expire`))
      .send({ version: 1 })
      .expect(200);
    expect(stale.body).toEqual({ result: 'ignored', helpRequestId: null });
    await internal(http().post(`/internal/check-ins/${id}/expire`))
      .send({ version: 0 })
      .expect(400);

    const confirmed = await asUser(http().post(`/check-ins/${id}/confirm`)).expect(200);
    expect(confirmed.body.status).toBe('confirmed');
    await asUser(http().post(`/check-ins/${id}/confirm`)).expect(409);
    await asUser(http().delete(`/check-ins/${id}`)).expect(409);
  });

  it('Teste seguro por check-in: o prazo vence e vira um pedido de ajuda no modo test', async () => {
    const started = await withKey(http().post('/check-ins'), 'check-in-http-10')
      .send({ destination: 'Teste', dueAt: inMinutes(2), toleranceMinutes: 0, mode: 'test' })
      .expect(201);
    const id = started.body.id as string;

    const expired = await internal(http().post(`/internal/check-ins/${id}/expire`))
      .set('X-Correlation-Id', 'corr-prazo-http')
      .send({ version: 1 })
      .expect(200);
    expect(expired.body.result).toBe('expired');
    const helpRequestId = expired.body.helpRequestId as string;

    const checkIn = await asUser(http().get(`/check-ins/${id}`)).expect(200);
    expect(checkIn.body).toMatchObject({ status: 'expired', helpRequestId });
    const helpRequest = await asUser(http().get(`/help-requests/${helpRequestId}`)).expect(200);
    expect(helpRequest.body).toMatchObject({
      origin: 'check_in',
      mode: 'test',
      checkInId: id,
      location: null,
    });

    const page = await asUser(http().get('/check-ins?status=expired&mode=test')).expect(200);
    expect(page.body.items).toHaveLength(1);
    expect(page.body.items[0].helpRequestId).toBe(helpRequestId);
    expect((await asUser(http().get('/summary')).expect(200)).body.lastTest).toMatchObject({
      helpRequestId,
      outcome: 'pending',
    });

    const cancelled = await withKey(http().post('/check-ins'), 'check-in-http-11')
      .send({ destination: 'Outro teste', dueAt: inMinutes(5), mode: 'test' })
      .expect(201);
    await asUser(http().delete(`/check-ins/${cancelled.body.id}`)).expect(204);
    await internal(http().post('/internal/check-ins/01a1b2e9-0000-7000-8000-0000000000ff/expire'))
      .send({ version: 1 })
      .expect(404);
  });

  it('Swagger em /docs-json com as operações de check-in, pedido de ajuda e as internas', async () => {
    const res = await http().get('/docs-json').expect(200);
    const ids = Object.values(
      res.body.paths as Record<string, Record<string, { operationId: string }>>,
    ).flatMap((p) => Object.values(p).map((op) => op.operationId));
    for (const id of [
      'startCheckIn',
      'listCheckIns',
      'getCheckIn',
      'extendCheckIn',
      'cancelCheckIn',
      'confirmArrival',
      'expireCheckIn',
      'triggerHelpRequest',
      'listHelpRequests',
      'getHelpRequest',
      'cancelHelpRequest',
      'getDeliveryTargets',
    ]) {
      expect(ids).toContain(id);
    }
  });
});
