import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/api/app.module.js';
import { OPENAPI } from '../../src/api/openapi.config.js';
import { configureApp } from '../../src/api/platform/bootstrap.js';

const KEY = 'test-internal-key';
const OWNER = '01a15965-b480-79af-a113-29b2fc82e5ef';
const OTHER = '01a15965-b480-79af-a113-000000000000';
const DB = 'notes_test';

describe('notes-service (HTTP + MongoDB em memória)', () => {
  let mongo: MongoMemoryServer;
  let client: MongoClient;
  let app: INestApplication;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    client = await MongoClient.connect(mongo.getUri());
    const moduleRef = await Test.createTestingModule({
      imports: [
        AppModule.forRoot({ mongoUri: mongo.getUri(), mongoDb: DB, internalApiKey: KEY, logLevel: 'silent' }),
      ],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app, OPENAPI);
    await app.init();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await client?.close();
    await mongo?.stop();
  });

  beforeEach(async () => {
    await client.db(DB).collection('notes').deleteMany({});
  });

  const http = () => request(app.getHttpServer());
  const as = (owner: string, req: request.Test) => req.set('X-Internal-Key', KEY).set('X-User-Id', owner);
  const create = (body: object, owner = OWNER) => as(owner, http().post('/notes')).send(body);

  describe('proteções', () => {
    it('/health responde sem chave e sem consultar o banco', async () => {
      const res = await http().get('/health').expect(200);
      expect(res.body).toMatchObject({ status: 'ok', service: 'notes-service' });
    });

    it('rota sem X-Internal-Key responde 401 em Problem Details, com o correlationId', async () => {
      const res = await http().get('/notes').set('X-Correlation-Id', 'abc-123').expect(401);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.headers['x-correlation-id']).toBe('abc-123');
      expect(res.body).toEqual({
        type: '/errors/unauthenticated',
        title: 'Não autenticado',
        status: 401,
        code: 'UNAUTHENTICATED',
        instance: '/notes',
        correlationId: 'abc-123',
      });
    });

    it('chave errada também responde 401', async () => {
      await http().get('/notes').set('X-Internal-Key', 'errada').set('X-User-Id', OWNER).expect(401);
    });

    it('sem X-User-Id válido responde 400', async () => {
      const res = await http()
        .get('/notes')
        .set('X-Internal-Key', KEY)
        .set('X-User-Id', 'nao-e-uuid')
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.errors).toEqual([{ field: 'X-User-Id', message: 'precisa ser um UUID' }]);
    });

    it('gera um X-Correlation-Id quando a requisição não traz', async () => {
      const res = await http().get('/health');
      expect(res.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('CRUD', () => {
    it('cria uma nota: 201, Location e a nota com versão 1', async () => {
      const res = await create({
        kind: 'checklist',
        title: 'Lista do mercado',
        items: [{ text: 'pão' }, { text: 'café', done: true }],
        color: 'yellow',
        labels: ['casa'],
        pinned: true,
      }).expect(201);
      expect(res.headers.location).toBe(`/notes/${res.body.id}`);
      expect(res.body).toMatchObject({
        ownerId: OWNER,
        kind: 'checklist',
        version: 1,
        reminderAt: null,
        pinned: true,
      });
      expect(res.body.id).toMatch(/^[0-9a-f]{24}$/);
      expect(res.body.items[0]).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        text: 'pão',
        done: false,
      });
      expect(res.body).not.toHaveProperty('body');
    });

    it('recusa nota sem título nem conteúdo, campo grande demais e campo desconhecido', async () => {
      const empty = await create({ kind: 'text', title: ' ' }).expect(400);
      expect(empty.body).toMatchObject({
        code: 'VALIDATION_FAILED',
        detail: 'A nota precisa de título ou conteúdo.',
      });

      const long = await create({ kind: 'text', title: 'x'.repeat(201) }).expect(400);
      expect(long.body.errors).toContainEqual({ field: 'title', message: 'máximo de 200 caracteres' });

      const unknown = await create({ kind: 'text', title: 'a', owner: 'x' }).expect(400);
      expect(unknown.body.errors[0].field).toBe('owner');

      const wrongKind = await create({ kind: 'text', title: 'a', items: [{ text: 'x' }] }).expect(400);
      expect(wrongKind.body.errors).toEqual([{ field: 'items', message: 'nota de texto não tem itens' }]);
    });

    it('JSON malformado responde 400 em Problem Details', async () => {
      const res = await as(OWNER, http().post('/notes'))
        .set('Content-Type', 'application/json')
        .send('{"kind":')
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('busca, atualiza com versão e recusa versão antiga com 409', async () => {
      const { body: note } = await create({ kind: 'text', title: 'Dentista', body: 'quinta' }).expect(201);
      await as(OWNER, http().get(`/notes/${note.id}`)).expect(200);

      const put = {
        version: 1,
        kind: 'text',
        title: 'Dentista quinta 14h',
        body: 'Levar a carteirinha',
        color: 'blue',
        labels: ['saúde'],
        pinned: false,
        archived: false,
        reminderAt: '2026-11-12T17:00:00Z',
      };
      const updated = await as(OWNER, http().put(`/notes/${note.id}`))
        .send(put)
        .expect(200);
      expect(updated.body).toMatchObject({
        version: 2,
        reminderAt: '2026-11-12T17:00:00.000Z',
        color: 'blue',
      });

      const conflict = await as(OWNER, http().put(`/notes/${note.id}`))
        .send(put)
        .expect(409);
      expect(conflict.body).toMatchObject({
        code: 'VERSION_CONFLICT',
        detail: 'A nota foi alterada depois da versão 1. Versão atual 2.',
      });
    });

    it('PUT sem version responde 400', async () => {
      const { body: note } = await create({ kind: 'text', title: 'a' }).expect(201);
      const res = await as(OWNER, http().put(`/notes/${note.id}`))
        .send({
          kind: 'text',
          title: 'b',
          color: 'default',
          labels: [],
          pinned: false,
          archived: false,
          reminderAt: null,
        })
        .expect(400);
      expect(res.body.errors.map((e: { field: string }) => e.field)).toContain('version');
    });

    it('PATCH converte texto em checklist e de volta, preservando o texto, e marca itens', async () => {
      const { body: note } = await create({ kind: 'text', title: 'Mercado', body: 'pão\nleite' }).expect(201);
      const checklist = await as(OWNER, http().patch(`/notes/${note.id}`))
        .send({ kind: 'checklist', version: 1 })
        .expect(200);
      expect(checklist.body.items.map((i: { text: string }) => i.text)).toEqual(['pão', 'leite']);

      const itemId = checklist.body.items[1].id as string;
      const checked = await as(OWNER, http().patch(`/notes/${note.id}`))
        .send({ item: { id: itemId, done: true } })
        .expect(200);
      expect(checked.body.items[1].done).toBe(true);

      const back = await as(OWNER, http().patch(`/notes/${note.id}`))
        .send({ kind: 'text' })
        .expect(200);
      expect(back.body).toMatchObject({ kind: 'text', body: 'pão\nleite', version: 4 });
      expect(back.body).not.toHaveProperty('items');

      const stored = await client.db(DB).collection('notes').findOne({});
      expect(stored).not.toHaveProperty('items');
    });

    it('PATCH vazio responde 400 e PATCH com versão antiga responde 409', async () => {
      const { body: note } = await create({ kind: 'text', title: 'a' }).expect(201);
      await as(OWNER, http().patch(`/notes/${note.id}`))
        .send({})
        .expect(400);
      await as(OWNER, http().patch(`/notes/${note.id}`))
        .send({ pinned: true, version: 9 })
        .expect(409);
      const unpin = await as(OWNER, http().patch(`/notes/${note.id}`))
        .send({ reminderAt: null })
        .expect(200);
      expect(unpin.body.reminderAt).toBeNull();
    });

    it('nota de outra conta e id inválido respondem 404, sem revelar qual dos dois', async () => {
      const { body: note } = await create({ kind: 'text', title: 'a' }).expect(201);
      const other = await as(OTHER, http().get(`/notes/${note.id}`)).expect(404);
      const invalid = await as(OWNER, http().get('/notes/nao-existe')).expect(404);
      expect(other.body.code).toBe('NOT_FOUND');
      expect(invalid.body.code).toBe('NOT_FOUND');
      await as(OTHER, http().delete(`/notes/${note.id}`)).expect(404);
      await as(OTHER, http().patch(`/notes/${note.id}`))
        .send({ pinned: true })
        .expect(404);
    });

    it('apaga uma nota (204) e depois responde 404', async () => {
      const { body: note } = await create({ kind: 'text', title: 'a' }).expect(201);
      await as(OWNER, http().delete(`/notes/${note.id}`)).expect(204);
      await as(OWNER, http().get(`/notes/${note.id}`)).expect(404);
    });

    it('DELETE /notes apaga todas as notas da conta e só dela', async () => {
      await create({ kind: 'text', title: 'a' }).expect(201);
      await create({ kind: 'text', title: 'b' }).expect(201);
      await create({ kind: 'text', title: 'c' }, OTHER).expect(201);
      await as(OWNER, http().delete('/notes')).expect(204);
      await as(OWNER, http().delete('/notes')).expect(204);
      expect((await as(OWNER, http().get('/notes'))).body.total).toBe(0);
      expect((await as(OTHER, http().get('/notes'))).body.total).toBe(1);
    });
  });

  describe('listagem e resumo', () => {
    it('lista fixadas primeiro, filtra, busca e pagina', async () => {
      await create({ kind: 'text', title: 'Ideias de presente', body: 'Mãe: livro de receitas' });
      await create({
        kind: 'checklist',
        title: 'Mercado',
        items: [{ text: 'Café' }],
        pinned: true,
        labels: ['casa'],
      });
      await create({ kind: 'text', title: 'Dentista', labels: ['saúde'] });
      const archived = await create({ kind: 'text', title: 'Antiga' });
      await as(OWNER, http().patch(`/notes/${archived.body.id}`))
        .send({ archived: true })
        .expect(200);

      const list = await as(OWNER, http().get('/notes')).expect(200);
      expect(list.body.items.map((n: { title: string }) => n.title)).toEqual([
        'Mercado',
        'Dentista',
        'Ideias de presente',
      ]);
      expect(list.body).toMatchObject({ page: 1, pageSize: 20, total: 3 });

      const titles = async (query: string) =>
        (await as(OWNER, http().get(`/notes?${query}`)).expect(200)).body.items.map(
          (n: { title: string }) => n.title,
        );
      expect(await titles('archived=true')).toEqual(['Antiga']);
      expect(await titles('label=casa')).toEqual(['Mercado']);
      expect(await titles('q=CAFÉ')).toEqual(['Mercado']);
      expect(await titles('q=receitas')).toEqual(['Ideias de presente']);
      expect(await titles('q=.*')).toEqual([]);
      expect(await titles('page=2&pageSize=2')).toEqual(['Ideias de presente']);

      await as(OWNER, http().get('/notes?pageSize=101')).expect(400);
      await as(OWNER, http().get('/notes?archived=talvez')).expect(400);
    });

    it('GET /notes/summary devolve os totais (e não é confundido com um id)', async () => {
      await create({ kind: 'text', title: 'a', pinned: true });
      await create({ kind: 'text', title: 'b' });
      const res = await as(OWNER, http().get('/notes/summary?timezone=America/Sao_Paulo')).expect(200);
      expect(res.body).toEqual({ total: 2, pinned: 1, archived: 0, updatedLast14Days: 2, remindersToday: 0 });
      const bad = await as(OWNER, http().get('/notes/summary?timezone=Marte/Base')).expect(400);
      expect(bad.body.errors).toEqual([{ field: 'timezone', message: 'fuso horário desconhecido' }]);
    });
  });

  describe('banco e documentação', () => {
    it('cria os índices de listagem, etiquetas e lembretes (parcial) ao iniciar', async () => {
      const indexes = await client.db(DB).collection('notes').indexes();
      const byName = Object.fromEntries(indexes.map((index) => [index.name, index]));
      expect(byName.owner_list?.key).toEqual({ ownerId: 1, archived: 1, pinned: -1, updatedAt: -1 });
      expect(byName.owner_labels?.key).toEqual({ ownerId: 1, labels: 1 });
      expect(byName.owner_reminders?.partialFilterExpression).toEqual({ reminderAt: { $exists: true } });
    });

    it('expõe o Swagger em /docs e o OpenAPI em /docs-json com as operações do contrato', async () => {
      await http().get('/docs').expect(200);
      const res = await http().get('/docs-json').expect(200);
      const operationIds = Object.values(
        res.body.paths as Record<string, Record<string, { operationId: string }>>,
      )
        .flatMap((path) => Object.values(path).map((op) => op.operationId))
        .sort();
      expect(operationIds).toEqual(
        [
          'createNote',
          'deleteAllNotesOfOwner',
          'deleteNote',
          'getHealth',
          'getNote',
          'getNotesSummary',
          'listNotes',
          'patchNote',
          'updateNote',
        ].sort(),
      );
      expect(res.body.components.securitySchemes.internalKey).toMatchObject({
        in: 'header',
        name: 'X-Internal-Key',
      });
    });
  });
});
