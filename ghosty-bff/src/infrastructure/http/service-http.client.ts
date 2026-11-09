import type { Json, UpstreamResponse } from '../../application/ports/safety-service.client.js';
import { UpstreamError, type RequestMeta } from '../../application/ports/upstream-error.js';

export interface ServiceHttpOptions {
  /** Nome do serviço nas mensagens de erro (ex.: `notes-service`). */
  service: string;
  baseUrl: string;
  internalKey: string;
  timeoutMs: number;
}

export interface CallOptions {
  userId?: string;
  body?: Json;
  meta: RequestMeta;
  /** O 401 é uma resposta esperada (senha, código ou refresh token errado), e não chave interna recusada. */
  authCall?: boolean;
}

interface Problem {
  code?: unknown;
  detail?: unknown;
  errors?: unknown;
}

/**
 * Chamada a um serviço interno, com `X-Internal-Key`, `X-User-Id` e `X-Correlation-Id`, e timeout.
 * - Sem resposta, timeout ou 5xx: `UPSTREAM_UNAVAILABLE` (503).
 * - 401 fora das chamadas de autenticação: a chave interna foi recusada, o que é erro de configuração
 *   do BFF (500), e não "sessão inválida" do cliente.
 * - Outros 4xx: o Problem Details do serviço, com o mesmo `code`.
 */
export class ServiceHttpClient {
  constructor(private readonly options: ServiceHttpOptions) {}

  async call(method: string, path: string, call: CallOptions): Promise<UpstreamResponse> {
    const headers: Record<string, string> = {
      'X-Internal-Key': this.options.internalKey,
      Accept: 'application/json',
    };
    if (call.userId) headers['X-User-Id'] = call.userId;
    if (call.meta.correlationId) headers['X-Correlation-Id'] = call.meta.correlationId;
    if (call.body !== undefined) headers['Content-Type'] = 'application/json';

    let response: Response;
    try {
      response = await fetch(new URL(path, this.options.baseUrl), {
        method,
        headers,
        body: call.body === undefined ? undefined : JSON.stringify(call.body),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch {
      throw UpstreamError.unavailable(this.options.service);
    }

    const text = await response.text();
    let body: unknown;
    try {
      body = text ? (JSON.parse(text) as unknown) : undefined;
    } catch {
      body = undefined;
    }

    if (response.status >= 500) throw UpstreamError.unavailable(this.options.service);
    if (response.status === 401 && !call.authCall) {
      throw new UpstreamError('INTERNAL_ERROR', 500, `O ${this.options.service} recusou a chave interna.`);
    }
    if (response.status >= 400) {
      const problem = (body ?? {}) as Problem;
      throw new UpstreamError(
        typeof problem.code === 'string' ? problem.code : 'VALIDATION_FAILED',
        response.status,
        typeof problem.detail === 'string' ? problem.detail : 'Requisição recusada.',
        Array.isArray(problem.errors) ? (problem.errors as { field: string; message: string }[]) : undefined,
      );
    }
    return { status: response.status, body, location: response.headers.get('location') ?? undefined };
  }
}
