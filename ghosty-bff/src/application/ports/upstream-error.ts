/**
 * Erro devolvido por um serviço interno (notes-service, safety-service ou Function). O `code` vem do
 * Problem Details do serviço; sem resposta (fora do ar ou timeout), o código é `UPSTREAM_UNAVAILABLE`.
 */
export class UpstreamError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly errors?: { field: string; message: string }[],
  ) {
    super(message);
    this.name = 'UpstreamError';
  }

  static unavailable(service: string): UpstreamError {
    return new UpstreamError('UPSTREAM_UNAVAILABLE', 503, `O ${service} não respondeu.`);
  }
}

/** Metadados que atravessam as chamadas internas. */
export interface RequestMeta {
  correlationId?: string;
}
