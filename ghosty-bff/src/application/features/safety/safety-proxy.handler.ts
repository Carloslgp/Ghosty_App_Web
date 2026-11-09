import type { Json, SafetyServiceClient, UpstreamResponse } from '../../ports/safety-service.client.js';
import type { RequestMeta } from '../../ports/upstream-error.js';

/**
 * Rotas `/safety/...` que só repassam ao safety-service (rede de apoio, convite, mensagem, check-ins e
 * pedidos de ajuda). A sessão
 * segura já foi conferida pelo guard. O `Location` do serviço ganha o prefixo `/safety`.
 */
export class SafetyProxyHandler {
  constructor(private readonly safety: SafetyServiceClient) {}

  async forward(
    accountId: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body: Json | undefined,
    meta: RequestMeta,
    headers?: Record<string, string>,
  ): Promise<UpstreamResponse> {
    const response = await this.safety.forUser(accountId, method, path, body, meta, headers);
    return response.location ? { ...response, location: `/safety${response.location}` } : response;
  }
}
