import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { API, server } from '../../../test/msw-server';
import { createApiClient, isProblem, isSafetyArea } from './client';

describe('createApiClient', () => {
  it('injeta o JWT, a chave do APIM e o X-Safety-Token só onde cabe', async () => {
    const seen: Record<string, Headers> = {};
    server.use(
      http.get(`${API}/notes`, ({ request }) => {
        seen.notes = request.headers;
        return HttpResponse.json({ items: [], page: 1, pageSize: 20, total: 0 });
      }),
      http.get(`${API}/safety/contacts`, ({ request }) => {
        seen.safety = request.headers;
        return HttpResponse.json({ items: [] });
      }),
      http.post(`${API}/auth/login`, ({ request }) => {
        seen.login = request.headers;
        return HttpResponse.json({}, { status: 401 });
      }),
    );
    const api = createApiClient({
      baseUrl: API,
      subscriptionKey: 'chave-publica',
      getAccessToken: () => 'jwt-1',
      getSafetyToken: () => 'seguro-1',
    });
    await api.GET('/notes');
    await api.GET('/safety/contacts');
    await api.POST('/auth/login', { body: { email: 'a@b.co', password: 'x' } });

    expect(seen.notes?.get('authorization')).toBe('Bearer jwt-1');
    expect(seen.notes?.get('ocp-apim-subscription-key')).toBe('chave-publica');
    expect(seen.notes?.get('x-safety-token')).toBeNull();
    expect(seen.safety?.get('x-safety-token')).toBe('seguro-1');
    expect(seen.login?.get('authorization')).toBeNull();
  });

  it('no 401 renova o JWT uma vez e repete a chamada com o corpo original', async () => {
    let calls = 0;
    server.use(
      http.post(`${API}/notes`, async ({ request }) => {
        calls += 1;
        const body = (await request.json()) as { title: string };
        if (request.headers.get('authorization') !== 'Bearer jwt-novo')
          return new HttpResponse(null, { status: 401 });
        return HttpResponse.json({ id: '1', title: body.title }, { status: 201 });
      }),
    );
    const refresh = vi.fn(() => Promise.resolve('jwt-novo'));
    const api = createApiClient({
      baseUrl: API,
      getAccessToken: () => 'jwt-velho',
      refreshAccessToken: refresh,
    });
    const { data, response } = await api.POST('/notes', {
      body: { kind: 'text', title: 'Oi', color: 'default', pinned: false },
    });
    expect(response.status).toBe(201);
    expect(data).toMatchObject({ title: 'Oi' });
    expect(refresh).toHaveBeenCalledOnce();
    expect(calls).toBe(2);
  });

  it('se a renovação falhar, devolve o 401 (o shell volta para Entrar)', async () => {
    server.use(http.get(`${API}/account`, () => new HttpResponse(null, { status: 401 })));
    const api = createApiClient({
      baseUrl: API,
      getAccessToken: () => 'x',
      refreshAccessToken: () => Promise.resolve(null),
    });
    expect((await api.GET('/account')).response.status).toBe(401);
  });

  it('403 na área de segurança aciona a saída rápida; fora dela, não', async () => {
    server.use(
      http.get(`${API}/safety/contacts`, () =>
        HttpResponse.json({ code: 'FORBIDDEN', status: 403 }, { status: 403 }),
      ),
      http.post(`${API}/safety/session`, () =>
        HttpResponse.json({ code: 'FORBIDDEN', status: 403 }, { status: 403 }),
      ),
    );
    const onSafetyForbidden = vi.fn();
    const api = createApiClient({ baseUrl: API, getAccessToken: () => 'x', onSafetyForbidden });
    const { error } = await api.GET('/safety/contacts');
    expect(isProblem(error)).toBe(true);
    expect(onSafetyForbidden).toHaveBeenCalledOnce();
    // Código errado no desbloqueio também é 403, mas não é "sessão acabou".
    await api.POST('/safety/session', { body: { code: '000000' } });
    expect(onSafetyForbidden).toHaveBeenCalledOnce();
  });

  it('isSafetyArea reconhece as rotas da sessão segura', () => {
    expect(isSafetyArea(`${API}/aggregated-data`)).toBe(true);
    expect(isSafetyArea(`${API}/safety/contacts/1`)).toBe(true);
    expect(isSafetyArea(`${API}/safety/session`)).toBe(false);
    expect(isSafetyArea(`${API}/notes`)).toBe(false);
  });
});
