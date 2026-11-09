import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appOptionsFrom } from '../../src/api/app-options.js';
import { AppModule } from '../../src/api/app.module.js';
import { OPENAPI } from '../../src/api/openapi.config.js';
import { configureApp } from '../../src/api/platform/bootstrap.js';
import { configureHttp } from '../../src/api/shared/http-setup.js';
import { loadEnv } from '../../src/infrastructure/config/env.js';
import {
  ACCOUNT,
  CODE,
  fakeNotesService,
  fakeSafetyService,
  PASSWORD,
  REFRESH,
  ROTATED,
  type FakeUpstream,
} from '../support/fake-upstreams.js';

const KEY = 'test-internal-key';

async function bootApp(
  extra: Record<string, string>,
  safety: FakeUpstream,
  notes: FakeUpstream,
): Promise<INestApplication> {
  const env = loadEnv({
    INTERNAL_API_KEY: KEY,
    LOG_LEVEL: 'silent',
    SAFETY_SERVICE_URL: safety.url,
    NOTES_SERVICE_URL: notes.url,
    UPSTREAM_TIMEOUT_MS: '1000',
    ...extra,
  });
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(appOptionsFrom(env))],
  }).compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  configureHttp(app, { corsOrigins: env.CORS_ORIGINS, trustProxyHops: 0 });
  configureApp(app, OPENAPI);
  await app.init();
  return app;
}

describe('BFF (HTTP, com serviços internos falsos)', () => {
  let safety: FakeUpstream;
  let notes: FakeUpstream;
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    safety = fakeSafetyService();
    notes = fakeNotesService();
    await safety.start();
    await notes.start();
    app = await bootApp({ RATE_LIMIT_LOGIN_PER_MINUTE: '50' }, safety, notes);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await safety?.stop();
    await notes?.stop();
  });

  beforeEach(() => {
    safety.reset();
    notes.reset();
  });

  const http = () => request(app.getHttpServer());
  const login = () => http().post('/auth/login').send({ email: ACCOUNT.email, password: PASSWORD });
  const bearer = (req: request.Test) => req.set('Authorization', `Bearer ${accessToken}`);

  it('/health e Swagger sem autenticação; cabeçalhos do helmet e X-Correlation-Id', async () => {
    const res = await http().get('/health').expect(200);
    expect(res.body.service).toBe('bff');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-correlation-id']).toBeDefined();
    await http().get('/docs-json').expect(200);
  });

  it('CORS libera só a origem do front', async () => {
    const ok = await http()
      .options('/notes')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const other = await http()
      .options('/notes')
      .set('Origin', 'https://outro.example')
      .set('Access-Control-Request-Method', 'GET');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('login devolve JWT RS256 que o JWKS valida (iss, aud, sub, kid)', async () => {
    const res = await login().expect(200);
    accessToken = res.body.accessToken;
    expect(res.body).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 900,
      refreshToken: REFRESH,
      user: { id: ACCOUNT.id },
    });

    const config = (await http().get('/.well-known/openid-configuration').expect(200)).body;
    expect(config).toMatchObject({
      issuer: 'http://localhost:3000',
      jwks_uri: 'http://localhost:3000/.well-known/jwks.json',
    });
    const jwks = (await http().get('/.well-known/jwks.json').expect(200)).body;
    const { payload } = await jwtVerify(accessToken, createLocalJWKSet(jwks), {
      issuer: 'http://localhost:3000',
      audience: 'notes-web',
    });
    expect(payload.sub).toBe(ACCOUNT.id);
    expect(decodeProtectedHeader(accessToken)).toMatchObject({ alg: 'RS256', kid: 'dev' });
  });

  it('senha errada e e-mail inexistente dão o mesmo 401; e-mail repetido no cadastro dá 409', async () => {
    const a = await http().post('/auth/login').send({ email: ACCOUNT.email, password: 'x' }).expect(401);
    const b = await http()
      .post('/auth/login')
      .send({ email: 'ninguem@example.com', password: 'x' })
      .expect(401);
    expect({ ...a.body, correlationId: null }).toEqual({ ...b.body, correlationId: null });
    const dup = await http()
      .post('/auth/register')
      .send({ displayName: 'M', email: ACCOUNT.email, password: PASSWORD })
      .expect(409);
    expect(dup.body.code).toBe('EMAIL_IN_USE');
  });

  it('cadastro cria a conta, o refresh token e 3 notas de exemplo', async () => {
    const res = await http()
      .post('/auth/register')
      .send({ displayName: 'Nova', email: 'nova@example.com', password: PASSWORD })
      .expect(201);
    expect(res.body.user.email).toBe('nova@example.com');
    const created = notes.calls.filter((call) => call.method === 'POST' && call.path === '/notes');
    expect(created).toHaveLength(3);
    expect(created[0]?.headers['x-user-id']).toBe(ACCOUNT.id);
    expect(created[0]?.headers['x-internal-key']).toBe(KEY);
  });

  it('refresh rotaciona; refresh inválido dá 401; logout dá 204', async () => {
    const res = await http().post('/auth/refresh').send({ refreshToken: REFRESH }).expect(200);
    expect(res.body.refreshToken).toBe(ROTATED);
    await http().post('/auth/refresh').send({ refreshToken: ROTATED }).expect(401);
    await http().post('/auth/logout').send({ refreshToken: REFRESH }).expect(204);
  });

  it('rota protegida sem JWT ou com JWT inválido dá 401', async () => {
    await http().get('/notes').expect(401);
    await http().get('/notes').set('Authorization', 'Bearer abc').expect(401);
  });

  it('notas: repassa com X-User-Id e X-Correlation-Id, tira o ownerId e mantém o Problem Details do serviço', async () => {
    const list = await bearer(http().get('/notes?archived=false&q=dentista&extra=1'))
      .set('X-Correlation-Id', 'corr-9')
      .expect(200);
    expect(list.body.items[0]).not.toHaveProperty('ownerId');
    const call = notes.calls.at(-1);
    expect(call?.path).toBe('/notes?archived=false&q=dentista');
    expect(call?.headers['x-correlation-id']).toBe('corr-9');
    expect(call?.headers['x-user-id']).toBe(ACCOUNT.id);

    const created = await bearer(http().post('/notes')).send({ kind: 'text', title: 'Oi' }).expect(201);
    expect(created.headers.location).toBe('/notes/6aec6fc05bd053a2e3d78b78');
    expect(created.body).not.toHaveProperty('ownerId');

    const conflict = await bearer(http().put('/notes/6aec6fc05bd053a2e3d78b78'))
      .send({ version: 1 })
      .expect(409);
    expect(conflict.body).toMatchObject({
      code: 'VERSION_CONFLICT',
      instance: '/notes/6aec6fc05bd053a2e3d78b78',
    });
    await bearer(http().get('/notes/invalido')).expect(404);
  });

  it('conta: código de bloqueio com senha errada dá 400 em currentPassword', async () => {
    expect((await bearer(http().get('/account')).expect(200)).body).not.toHaveProperty('updatedAt');
    const res = await bearer(http().put('/account/lock-code'))
      .send({ currentPassword: 'x', code: CODE })
      .expect(400);
    expect(res.body.errors).toEqual([{ field: 'currentPassword', message: 'senha atual incorreta' }]);
    await bearer(http().put('/account/lock-code'))
      .send({ currentPassword: PASSWORD, code: CODE })
      .expect(204);
  });

  describe('sessão segura', () => {
    it('código errado dá 403, sempre igual; o certo devolve o token e a URL do remote', async () => {
      const a = await bearer(http().post('/safety/session')).send({ code: '000000' }).expect(403);
      const b = await bearer(http().post('/safety/session')).send({ code: '111111' }).expect(403);
      expect({ ...a.body, correlationId: null }).toEqual({ ...b.body, correlationId: null });
      const ok = await bearer(http().post('/safety/session')).send({ code: CODE }).expect(200);
      expect(ok.body).toMatchObject({ expiresIn: 600, remoteUrl: 'http://localhost:5175/remoteEntry.js' });
    });

    it('/safety/... sem X-Safety-Token dá 403; com o token repassa; depois da saída rápida, 403 de novo', async () => {
      await bearer(http().get('/safety/contacts')).expect(403);
      const { safetyToken } = (await bearer(http().post('/safety/session')).send({ code: CODE }).expect(200))
        .body as {
        safetyToken: string;
      };
      await bearer(http().get('/safety/contacts')).set('X-Safety-Token', safetyToken).expect(200);
      const added = await bearer(http().post('/safety/contacts'))
        .set('X-Safety-Token', safetyToken)
        .send({ nickname: 'Ana' })
        .expect(201);
      expect(added.headers.location).toBe('/safety/contacts/01a1596a-4860-7d3c-971c-a474b56c7ce7');

      // O token da sessão segura não serve como JWT de acesso.
      await http().get('/notes').set('Authorization', `Bearer ${safetyToken}`).expect(401);

      await bearer(http().delete('/safety/session')).set('X-Safety-Token', safetyToken).expect(204);
      await bearer(http().get('/safety/contacts')).set('X-Safety-Token', safetyToken).expect(403);
      await bearer(http().delete('/safety/session')).set('X-Safety-Token', 'qualquer').expect(204);
    });
  });

  it('exclusão da conta apaga as notas e depois a conta', async () => {
    await bearer(http().delete('/account')).expect(204);
    expect(notes.calls.some((c) => c.method === 'DELETE' && c.path === '/notes')).toBe(true);
    expect(safety.calls.some((c) => c.method === 'DELETE' && c.path === `/accounts/${ACCOUNT.id}`)).toBe(
      true,
    );
  });
});

describe('BFF: gateway, limite de taxa e serviço fora do ar', () => {
  let safety: FakeUpstream;
  let notes: FakeUpstream;
  let app: INestApplication;

  beforeAll(async () => {
    safety = fakeSafetyService();
    notes = fakeNotesService();
    await safety.start();
    await notes.start();
    app = await bootApp(
      { GATEWAY_SECRET: 'segredo-do-gateway', RATE_LIMIT_LOGIN_PER_MINUTE: '3' },
      safety,
      notes,
    );
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await safety?.stop();
    await notes?.stop();
  });

  const http = () => request(app.getHttpServer());
  const viaGateway = (req: request.Test) => req.set('X-Gateway-Secret', 'segredo-do-gateway');

  it('sem X-Gateway-Secret (quando configurado) dá 403; /health e /.well-known ficam livres', async () => {
    const res = await http()
      .post('/auth/login')
      .send({ email: ACCOUNT.email, password: PASSWORD })
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
    await http().post('/auth/login').set('X-Gateway-Secret', 'errado').send({}).expect(403);
    await http().get('/health').expect(200);
    await http().get('/.well-known/jwks.json').expect(200);
  });

  it('login passa do limite por IP: 429 com Retry-After', async () => {
    for (let i = 0; i < 3; i += 1) {
      await viaGateway(http().post('/auth/login')).send({ email: ACCOUNT.email, password: 'x' }).expect(401);
    }
    const res = await viaGateway(http().post('/auth/login'))
      .send({ email: ACCOUNT.email, password: PASSWORD })
      .expect(429);
    expect(res.body.code).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('serviço interno fora do ar dá 503 UPSTREAM_UNAVAILABLE', async () => {
    await safety.stop();
    const res = await viaGateway(http().post('/auth/register')).send({
      displayName: 'X',
      email: 'x@example.com',
      password: PASSWORD,
    });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('UPSTREAM_UNAVAILABLE');
  });
});
