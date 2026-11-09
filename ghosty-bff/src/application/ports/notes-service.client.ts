import type { Json, UpstreamResponse } from './safety-service.client.js';
import type { RequestMeta } from './upstream-error.js';

export const NOTES_SERVICE = Symbol('NotesServiceClient');

/** Cliente do notes-service: as rotas de notas são repassadas com o `X-User-Id` da conta. */
export interface NotesServiceClient {
  forUser(
    accountId: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body: Json | undefined,
    meta: RequestMeta,
  ): Promise<UpstreamResponse>;
}
