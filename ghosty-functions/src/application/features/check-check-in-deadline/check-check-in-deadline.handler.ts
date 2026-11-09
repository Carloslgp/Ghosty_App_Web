import type { SafetyInternalClient } from '../../ports/safety-internal.client.js';

/** O evento `CheckInDeadlineScheduled` (fila `check-in-deadlines`), já validado. */
export interface CheckInDeadlineScheduled {
  id: string;
  correlationId: string;
  data: { checkInId: string; accountId: string; version: number; deadlineAt: string };
}

/**
 * A mensagem fica invisível até o prazo. Quando chega, pede ao safety-service para vencer o check-in
 * naquela versão. Se ele já foi confirmado, cancelado ou estendido, a resposta é `ignored` (idempotente).
 */
export class CheckCheckInDeadlineHandler {
  constructor(private readonly safety: SafetyInternalClient) {}

  execute(event: CheckInDeadlineScheduled) {
    return this.safety.expireCheckIn(event.data.checkInId, event.data.version, event.correlationId);
  }
}
