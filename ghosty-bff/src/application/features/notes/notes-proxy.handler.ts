import type { NotesServiceClient } from '../../ports/notes-service.client.js';
import type { Json, UpstreamResponse } from '../../ports/safety-service.client.js';
import type { RequestMeta } from '../../ports/upstream-error.js';
import { withoutOwner } from '../../shared/auth-session.js';

/**
 * As notas da fachada: o BFF repassa ao notes-service com o `X-User-Id` tirado do JWT (o front nunca
 * escolhe a conta) e tira o `ownerId` das respostas.
 */
export class NotesProxyHandler {
  constructor(private readonly notes: NotesServiceClient) {}

  async forward(
    accountId: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body: Json | undefined,
    meta: RequestMeta,
  ): Promise<UpstreamResponse> {
    const response = await this.notes.forUser(accountId, method, path, body, meta);
    return { ...response, body: withoutOwner(response.body) };
  }
}
