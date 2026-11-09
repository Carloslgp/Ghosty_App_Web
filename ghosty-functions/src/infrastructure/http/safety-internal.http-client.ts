import type {
  DeliveryTargets,
  SafetyInternalClient,
} from '../../application/ports/safety-internal.client.js';

export interface SafetyClientOptions {
  baseUrl: string;
  internalKey: string;
  timeoutMs: number;
}

/** Erro do safety-service. 5xx e falha de rede são passageiros (a fila tenta de novo). */
export class SafetyServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'SafetyServiceError';
  }
}

export class SafetyInternalHttpClient implements SafetyInternalClient {
  constructor(private readonly options: SafetyClientOptions) {}

  private async call<T>(method: string, path: string, correlationId: string, body?: object): Promise<T> {
    let response: Response;
    try {
      response = await fetch(new URL(path, this.options.baseUrl), {
        method,
        headers: {
          'X-Internal-Key': this.options.internalKey,
          'X-Correlation-Id': correlationId,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch {
      throw new SafetyServiceError('O safety-service não respondeu.', 503);
    }
    if (!response.ok)
      throw new SafetyServiceError(`O safety-service respondeu ${response.status}.`, response.status);
    return (await response.json()) as T;
  }

  getDeliveryTargets(helpRequestId: string, correlationId: string): Promise<DeliveryTargets> {
    return this.call(
      'GET',
      `/internal/help-requests/${encodeURIComponent(helpRequestId)}/delivery-targets`,
      correlationId,
    );
  }

  expireCheckIn(checkInId: string, version: number, correlationId: string) {
    return this.call<{ result: 'expired' | 'ignored'; helpRequestId: string | null }>(
      'POST',
      `/internal/check-ins/${encodeURIComponent(checkInId)}/expire`,
      correlationId,
      { version },
    );
  }
}
