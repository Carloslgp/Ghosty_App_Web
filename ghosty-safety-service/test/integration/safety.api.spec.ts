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

describe('safety-service (HTTP + SQLite em memória)', () => {
  let app: INestApplication;
  let accountId: string;

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
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const internal = (req: request.Test) => req.set('X-Internal-Key', KEY);
  const asUser = (req: request.Test) => internal(req).set('X-User-Id', accountId);

  it('/health sem chave; o resto exige X-Internal-Key (401 em Problem Details)', async () => {
    expect((await http().get('/health').expect(200)).body.service).toBe('safety-service');
    const res = await http().post('/accounts').send({}).expect(401);
    expect(res.body).toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('cria a conta (201 + Location), recusa e-mail repetido (409) e dados inválidos (400)', async () => {
    const created = await internal(http().post('/accounts'))
      .send({ email: 'Maria@Example.com', displayName: 'Maria', password: 'senha-forte-1' })
      .expect(201);
    accountId = created.body.id;
    expect(created.headers.location).toBe(`/accounts/${accountId}`);
    expect(created.body).toMatchObject({ email: 'maria@example.com', secretCodeSet: false });
    expect(created.body).not.toHaveProperty('passwordHash');

    const dup = await internal(http().post('/accounts'))
      .send({ email: 'maria@example.com', displayName: 'Outra', password: 'senha-forte-2' })
      .expect(409);
    expect(dup.body.code).toBe('EMAIL_IN_USE');

    const bad = await internal(http().post('/accounts'))
      .send({ email: 'x', displayName: '', password: '1' })
      .expect(400);
    expect(bad.body.errors.map((e: { field: string }) => e.field).sort()).toEqual([
      'displayName',
      'email',
      'password',
    ]);
  });

  it('autentica e responde igual para e-mail inexistente e senha errada', async () => {
    await internal(http().post('/accounts/authenticate'))
      .send({ email: 'maria@example.com', password: 'senha-forte-1' })
      .expect(200);
    const a = await internal(http().post('/accounts/authenticate'))
      .send({ email: 'maria@example.com', password: 'x' })
      .expect(401);
    const b = await internal(http().post('/accounts/authenticate'))
      .send({ email: 'ninguem@example.com', password: 'x' })
      .expect(401);
    expect({ ...a.body, correlationId: null }).toEqual({ ...b.body, correlationId: null });
  });

  it('código secreto: senha atual errada dá 400; erro e bloqueio dão a mesma resposta 401', async () => {
    const wrongPassword = await internal(http().put(`/accounts/${accountId}/secret-code`))
      .send({ currentPassword: 'errada', code: '246810' })
      .expect(400);
    expect(wrongPassword.body.errors).toEqual([
      { field: 'currentPassword', message: 'senha atual incorreta' },
    ]);
    await internal(http().put(`/accounts/${accountId}/secret-code`))
      .send({ currentPassword: 'senha-forte-1', code: '246810' })
      .expect(204);

    await internal(http().post(`/accounts/${accountId}/secret-code/verify`))
      .send({ code: '246810' })
      .expect(204);
    const bodies: unknown[] = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await internal(http().post(`/accounts/${accountId}/secret-code/verify`))
        .send({ code: '000000' })
        .expect(401);
      bodies.push({ ...res.body, correlationId: null });
    }
    // Bloqueada: o código certo recebe exatamente a mesma resposta.
    const locked = await internal(http().post(`/accounts/${accountId}/secret-code/verify`))
      .send({ code: '246810' })
      .expect(401);
    expect({ ...locked.body, correlationId: null }).toEqual(bodies[0]);
    expect(new Set(bodies.map((body) => JSON.stringify(body))).size).toBe(1);
  });

  it('refresh tokens: emite, rotaciona (o antigo deixa de valer) e revoga de forma idempotente', async () => {
    const issued = await internal(http().post('/refresh-tokens')).send({ accountId }).expect(201);
    expect(issued.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const rotated = await internal(http().post('/refresh-tokens/rotate'))
      .send({ token: issued.body.token })
      .expect(200);
    await internal(http().post('/refresh-tokens/rotate')).send({ token: issued.body.token }).expect(401);
    await internal(http().post('/refresh-tokens/revoke')).send({ token: rotated.body.token }).expect(204);
    await internal(http().post('/refresh-tokens/revoke')).send({ token: rotated.body.token }).expect(204);
    await internal(http().post('/refresh-tokens/rotate')).send({ token: rotated.body.token }).expect(401);
  });

  it('contatos e convite: cria, ordena, convida, abre, aceita pelo navegador e vê os avisos', async () => {
    const ana = await asUser(http().post('/contacts')).send({ nickname: 'Ana' }).expect(201);
    const beto = await asUser(http().post('/contacts')).send({ nickname: 'Beto' }).expect(201);
    expect(ana.headers.location).toBe(`/contacts/${ana.body.id}`);

    const order = await asUser(http().put('/contacts/order'))
      .send({ contactIds: [beto.body.id, ana.body.id] })
      .expect(200);
    expect(order.body.items.map((c: { nickname: string }) => c.nickname)).toEqual(['Beto', 'Ana']);
    await asUser(http().put('/contacts/order'))
      .send({ contactIds: [ana.body.id] })
      .expect(400);

    const invite = await asUser(http().post(`/contacts/${ana.body.id}/invitation`)).expect(201);
    const token = invite.body.token as string;
    expect(invite.body.inviteUrl).toBe(`http://localhost:5173/c/${token}`);

    const view = await internal(http().get(`/invitations/${token}`)).expect(200);
    expect(view.body).toMatchObject({ inviterDisplayName: 'Maria', status: 'pending', respondable: true });
    await internal(http().get('/invitations/curto')).expect(404);

    await internal(http().post(`/invitations/${token}/accept`))
      .send({ channel: 'web' })
      .expect(200);
    await internal(http().post(`/invitations/${token}/decline`)).expect(409);
    expect((await internal(http().get(`/invitations/${token}/alerts`)).expect(200)).body).toEqual({
      items: [],
    });
    await internal(http().get(`/invitations/${token}/alerts?since=ontem`)).expect(400);

    // Outra conta não enxerga o contato.
    await internal(http().get(`/contacts/${ana.body.id}`))
      .set('X-User-Id', '01a15965-b480-79af-a113-000000000000')
      .expect(404);
    await asUser(http().get('/contacts/nao-e-uuid')).expect(404);
    await asUser(http().delete(`/contacts/${beto.body.id}`)).expect(204);
    expect((await asUser(http().get('/contacts')).expect(200)).body.items).toHaveLength(1);
  });

  it('Telegram: o /start vincula e o /parar desfaz, pelas rotas internas', async () => {
    const carla = await asUser(http().post('/contacts')).send({ nickname: 'Carla' }).expect(201);
    const { token } = (await asUser(http().post(`/contacts/${carla.body.id}/invitation`)).expect(201))
      .body as { token: string };
    const linked = await internal(http().post('/internal/contacts/telegram-link'))
      .send({ token, chatId: '123456' })
      .expect(200);
    expect(linked.body).toEqual({ result: 'linked', inviterDisplayName: 'Maria' });
    const again = await internal(http().post('/internal/contacts/telegram-link'))
      .send({ token, chatId: '123456' })
      .expect(200);
    expect(again.body.result).toBe('ignored');
    const left = await internal(http().post('/internal/contacts/telegram-leave'))
      .send({ chatId: '123456' })
      .expect(200);
    expect(left.body).toEqual({ result: 'left', contactsAffected: 1 });
    await internal(http().post('/internal/contacts/telegram-leave')).send({ chatId: 'abc' }).expect(400);
  });

  it('mensagem e resumo', async () => {
    const settings = await asUser(http().get('/alert-settings')).expect(200);
    expect(settings.body).toMatchObject({ reviewed: false, countdownSeconds: 10 });
    const saved = await asUser(http().put('/alert-settings'))
      .send({
        messageTemplate: 'Oi {apelido}.',
        includeLocation: true,
        countdownSeconds: 20,
        checkInToleranceMinutes: 5,
      })
      .expect(200);
    expect(saved.body.reviewed).toBe(true);
    await asUser(http().put('/alert-settings'))
      .send({ messageTemplate: '', includeLocation: true, countdownSeconds: 2, checkInToleranceMinutes: 5 })
      .expect(400);

    const summary = await asUser(http().get('/summary')).expect(200);
    expect(summary.body).toMatchObject({
      displayName: 'Maria',
      secretCodeSet: true,
      network: { total: 2, confirmed: 1, declined: 1 },
      alertSettings: { reviewed: true, countdownSeconds: 20 },
      activeCheckIn: null,
      lastTest: null,
    });
  });

  it('Swagger em /docs-json com as operações das sessões 12, 14 e 15', async () => {
    const res = await http().get('/docs-json').expect(200);
    const ids = Object.values(
      res.body.paths as Record<string, Record<string, { operationId: string }>>,
    ).flatMap((p) => Object.values(p).map((op) => op.operationId));
    for (const id of [
      'createAccount',
      'verifySecretCode',
      'rotateRefreshToken',
      'reorderContacts',
      'acceptInvitation',
      'getInvitationAlerts',
      'linkTelegramContact',
      'getSafetySummary',
    ]) {
      expect(ids).toContain(id);
    }
  });

  it('apaga a conta em cascata', async () => {
    await internal(http().delete(`/accounts/${accountId}`)).expect(204);
    await internal(http().get(`/accounts/${accountId}`)).expect(404);
    expect((await asUser(http().get('/contacts')).expect(200)).body.items).toEqual([]);
  });
});
