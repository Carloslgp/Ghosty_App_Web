import createClient, { type Client, type Middleware } from 'openapi-fetch';
import type { components, paths } from './schema';

export type ApiClient = Client<paths>;
export type Schemas = components['schemas'];

export interface ApiClientOptions {
  baseUrl: string;
  /** Chave pública do produto `web-app` do API Management (vazia na máquina local). */
  subscriptionKey?: string;
  /** JWT de acesso atual (em memória). */
  getAccessToken?: () => string | null;
  /** Renova o JWT com o refresh token. Devolve o novo JWT, ou `null` se não deu (volta para Entrar). */
  refreshAccessToken?: () => Promise<string | null>;
  /** Token da sessão segura (só em memória). Vai em `X-Safety-Token`. */
  getSafetyToken?: () => string | null;
  /** 403 numa rota da área de segurança: a sessão segura acabou, o shell faz a saída rápida. */
  onSafetyForbidden?: () => void;
  fetch?: typeof fetch;
}

/**
 * O caminho da rota do BFF, sem o prefixo da URL base. No API Management, a API pode ter um sufixo
 * (ex.: `https://<apim>.azure-api.net/app`): `/app/safety/contacts` é a rota `/safety/contacts`.
 */
export function routeOf(url: string, baseUrl = ''): string {
  const { pathname } = new URL(url);
  const prefix = baseUrl ? new URL(baseUrl, 'http://base.invalid').pathname.replace(/\/+$/, '') : '';
  return prefix && pathname.startsWith(`${prefix}/`) ? pathname.slice(prefix.length) : pathname;
}

/** Rotas que exigem a sessão segura (o 403 delas vira saída rápida). */
export function isSafetyArea(url: string, baseUrl = ''): boolean {
  const route = routeOf(url, baseUrl);
  return (
    (route.startsWith('/safety/') && !route.startsWith('/safety/session')) || route === '/aggregated-data'
  );
}

/** Rotas públicas: nem renovação no 401, nem `Authorization`. */
function isPublic(url: string, baseUrl: string): boolean {
  const route = routeOf(url, baseUrl);
  return route.startsWith('/auth/') || route.startsWith('/invitations/');
}

/**
 * Cliente do BFF com os tipos gerados do contrato. Os remotes recebem este cliente pronto e nunca veem
 * os tokens. No 401, renova o JWT uma vez e repete a chamada; no 403 da área de segurança, avisa o shell.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseFetch = options.fetch ?? ((input: Request) => globalThis.fetch(input));
  const pending = new Map<string, Request>();

  const withHeaders = (request: Request, accessToken: string | null): Request => {
    const headers = new Headers(request.headers);
    if (options.subscriptionKey) headers.set('Ocp-Apim-Subscription-Key', options.subscriptionKey);
    if (accessToken && !isPublic(request.url, options.baseUrl)) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }
    const safetyToken = options.getSafetyToken?.();
    const route = routeOf(request.url, options.baseUrl);
    if (safetyToken && (route.startsWith('/safety/') || route === '/aggregated-data')) {
      headers.set('X-Safety-Token', safetyToken);
    }
    return new Request(request, { headers });
  };

  const auth: Middleware = {
    onRequest({ request, id }) {
      const prepared = withHeaders(request, options.getAccessToken?.() ?? null);
      // Guarda uma cópia para repetir a chamada depois de renovar o JWT.
      pending.set(id, prepared.clone());
      return prepared;
    },
    async onResponse({ request, response, id }) {
      const original = pending.get(id);
      pending.delete(id);
      if (
        response.status === 401 &&
        original &&
        !isPublic(request.url, options.baseUrl) &&
        options.refreshAccessToken
      ) {
        const token = await options.refreshAccessToken();
        if (token) return baseFetch(withHeaders(original, token));
      }
      if (response.status === 403 && isSafetyArea(request.url, options.baseUrl))
        options.onSafetyForbidden?.();
      return response;
    },
    onError({ id }) {
      pending.delete(id);
    },
  };

  const client = createClient<paths>({ baseUrl: options.baseUrl, fetch: baseFetch });
  client.use(auth);
  return client;
}

/** O Problem Details de uma resposta de erro do BFF. */
export interface Problem {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  errors?: { field: string; message: string }[];
}

export function isProblem(value: unknown): value is Problem {
  return typeof value === 'object' && value !== null && 'code' in value && 'status' in value;
}
