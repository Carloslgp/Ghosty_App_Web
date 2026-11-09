import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

export interface RecordedCall {
  method: string;
  path: string;
  headers: IncomingMessage['headers'];
  body: unknown;
}

type Handler = (call: RecordedCall) => { status: number; body?: unknown; headers?: Record<string, string> };

/** Um serviço interno falso: registra as chamadas e responde com o que cada rota mandar. */
export class FakeUpstream {
  readonly calls: RecordedCall[] = [];
  private readonly routes = new Map<string, Handler>();
  private server: Server | undefined;
  url = '';
  /** Responde 503 a tudo, como um serviço fora do ar (a porta continua a mesma). */
  down = false;
  /** Atrasa cada resposta (para testar o limite de tempo do BFF). */
  delayMs = 0;

  on(method: string, path: string | RegExp, handler: Handler): this {
    this.routes.set(`${method} ${path instanceof RegExp ? path.source : path}`, handler);
    return this;
  }

  private match(method: string, path: string): Handler | undefined {
    for (const [key, handler] of this.routes) {
      const [m, ...rest] = key.split(' ');
      const pattern = rest.join(' ');
      if (m !== method) continue;
      if (pattern === path || new RegExp(`^${pattern}$`).test(path)) return handler;
    }
    return undefined;
  }

  async start(): Promise<void> {
    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const call: RecordedCall = {
          method: req.method ?? 'GET',
          path: req.url ?? '/',
          headers: req.headers,
          body: text ? (JSON.parse(text) as unknown) : undefined,
        };
        this.calls.push(call);
        const handler = this.match(call.method, call.path.split('?')[0] ?? '/');
        const result = this.down
          ? { status: 503, body: { code: 'UPSTREAM_UNAVAILABLE' } }
          : handler
            ? handler(call)
            : { status: 404, body: { code: 'NOT_FOUND', detail: 'Não encontrado.' } };
        const send = () => {
          if (res.destroyed) return;
          const type = result.status >= 400 ? 'application/problem+json' : 'application/json';
          res.writeHead(result.status, { 'Content-Type': type, ...(result.headers ?? {}) });
          res.end(result.body === undefined ? '' : JSON.stringify(result.body));
        };
        if (this.delayMs > 0) setTimeout(send, this.delayMs);
        else send();
      });
    });
    await new Promise<void>((resolve) => this.server?.listen(0, '127.0.0.1', resolve));
    const address = this.server.address();
    this.url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  }

  async stop(): Promise<void> {
    this.server?.closeAllConnections();
    await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
  }

  reset(): void {
    this.calls.length = 0;
    this.down = false;
    this.delayMs = 0;
  }
}

export const ACCOUNT = {
  id: '01a15965-b480-79af-a113-29b2fc82e5ef',
  email: 'maria.exemplo@example.com',
  displayName: 'Maria',
  secretCodeSet: true,
  createdAt: '2026-11-01T12:00:00.000Z',
  updatedAt: '2026-11-01T12:00:00.000Z',
};

export const PASSWORD = 'senha-forte-1';
export const CODE = '246810';
export const REFRESH = 'r'.repeat(43);
export const ROTATED = 's'.repeat(43);

const unauthenticated = { status: 401, body: { code: 'UNAUTHENTICATED', detail: 'Não autenticado.' } };

/** O safety-service falso, com uma conta e um código secreto. */
export function fakeSafetyService(): FakeUpstream {
  const refresh = { accountId: ACCOUNT.id, token: REFRESH, expiresAt: '2026-11-13T12:00:00.000Z' };
  return new FakeUpstream()
    .on('POST', '/accounts', (call) => {
      const body = call.body as { email: string };
      if (body.email === ACCOUNT.email)
        return { status: 409, body: { code: 'EMAIL_IN_USE', detail: 'Já existe.' } };
      return { status: 201, body: { ...ACCOUNT, email: body.email, secretCodeSet: false } };
    })
    .on('POST', '/accounts/authenticate', (call) => {
      const body = call.body as { email: string; password: string };
      return body.email === ACCOUNT.email && body.password === PASSWORD
        ? { status: 200, body: ACCOUNT }
        : unauthenticated;
    })
    .on('GET', `/accounts/${ACCOUNT.id}`, () => ({ status: 200, body: ACCOUNT }))
    .on('PUT', `/accounts/${ACCOUNT.id}`, (call) => ({
      status: 200,
      body: { ...ACCOUNT, displayName: (call.body as { displayName: string }).displayName },
    }))
    .on('DELETE', `/accounts/${ACCOUNT.id}`, () => ({ status: 204 }))
    .on('PUT', `/accounts/${ACCOUNT.id}/secret-code`, (call) =>
      (call.body as { currentPassword: string }).currentPassword === PASSWORD
        ? { status: 204 }
        : {
            status: 400,
            body: {
              code: 'VALIDATION_FAILED',
              detail: 'O campo currentPassword é inválido: senha atual incorreta.',
              errors: [{ field: 'currentPassword', message: 'senha atual incorreta' }],
            },
          },
    )
    .on('POST', `/accounts/${ACCOUNT.id}/secret-code/verify`, (call) =>
      (call.body as { code: string }).code === CODE ? { status: 204 } : unauthenticated,
    )
    .on('POST', '/refresh-tokens', () => ({ status: 201, body: refresh }))
    .on('POST', '/refresh-tokens/rotate', (call) =>
      (call.body as { token: string }).token === REFRESH
        ? { status: 200, body: { ...refresh, token: ROTATED } }
        : unauthenticated,
    )
    .on('POST', '/refresh-tokens/revoke', () => ({ status: 204 }))
    .on('GET', '/contacts', () => ({ status: 200, body: { items: [] } }))
    .on('POST', '/contacts', () => ({
      status: 201,
      body: { id: '01a1596a-4860-7d3c-971c-a474b56c7ce7', nickname: 'Ana', position: 1, status: 'pending' },
      headers: { Location: '/contacts/01a1596a-4860-7d3c-971c-a474b56c7ce7' },
    }))
    .on('GET', '/alert-settings', () => ({ status: 200, body: { reviewed: false } }));
}

/** O notes-service falso. */
export function fakeNotesService(): FakeUpstream {
  const note = {
    id: '6aec6fc05bd053a2e3d78b78',
    ownerId: ACCOUNT.id,
    kind: 'text',
    title: 'Dentista',
    version: 1,
  };
  return new FakeUpstream()
    .on('POST', '/notes', (call) => ({
      status: 201,
      body: { ...note, ...(call.body as object) },
      headers: { Location: `/notes/${note.id}` },
    }))
    .on('GET', '/notes', () => ({ status: 200, body: { items: [note], page: 1, pageSize: 20, total: 1 } }))
    .on('GET', `/notes/${note.id}`, () => ({ status: 200, body: note }))
    .on('PUT', `/notes/${note.id}`, () => ({
      status: 409,
      body: { code: 'VERSION_CONFLICT', detail: 'A nota foi alterada depois da versão 1. Versão atual 2.' },
    }))
    .on('DELETE', '/notes', () => ({ status: 204 }));
}
