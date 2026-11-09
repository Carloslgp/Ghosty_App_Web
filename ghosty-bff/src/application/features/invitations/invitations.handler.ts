import type { BffConfig } from '../../ports/bff-config.js';
import type { Json, SafetyServiceClient, UpstreamResponse } from '../../ports/safety-service.client.js';
import type { RequestMeta } from '../../ports/upstream-error.js';

const path = (token: string, suffix = '') => `/invitations/${encodeURIComponent(token)}${suffix}`;

/**
 * Página pública do convite (rota `/c/:token` do front). Quem abre o link não tem conta: as chamadas
 * vão ao safety-service sem `X-User-Id`. As respostas do convite levam também o `remoteUrl`, para o
 * shell carregar o `safety/Invite`.
 */
export class InvitationsHandler {
  constructor(
    private readonly safety: SafetyServiceClient,
    private readonly config: BffConfig,
  ) {}

  private withRemote(response: UpstreamResponse): UpstreamResponse {
    return { ...response, body: { ...(response.body as Json), remoteUrl: this.config.safetyRemoteUrl } };
  }

  async get(token: string, meta: RequestMeta): Promise<UpstreamResponse> {
    return this.withRemote(await this.safety.invitation('GET', path(token), undefined, meta));
  }

  async accept(token: string, body: Json, meta: RequestMeta): Promise<UpstreamResponse> {
    return this.withRemote(await this.safety.invitation('POST', path(token, '/accept'), body, meta));
  }

  async decline(token: string, meta: RequestMeta): Promise<UpstreamResponse> {
    return this.withRemote(await this.safety.invitation('POST', path(token, '/decline'), undefined, meta));
  }

  /** Os avisos do contato do canal web. A página consulta a cada 5 segundos, com `since`. */
  alerts(token: string, since: string | undefined, meta: RequestMeta): Promise<UpstreamResponse> {
    const query = since ? `?${new URLSearchParams({ since }).toString()}` : '';
    return this.safety.invitation('GET', path(token, `/alerts${query}`), undefined, meta);
  }
}
