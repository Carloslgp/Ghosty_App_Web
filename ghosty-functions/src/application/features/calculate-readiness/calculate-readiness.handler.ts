import {
  composeMessage,
  DEFAULT_TIMEZONE,
  measureMessage,
  type MessageLength,
} from '../../../domain/message/message-composer.js';
import {
  calculateReadiness,
  type GeoPermission,
  type ReadinessScore,
} from '../../../domain/readiness/readiness-calculator.js';
import type { Clock } from '../../ports/runtime.js';

/** O pedido de prontidão, montado pelo BFF a partir dos resumos dos dois serviços. */
export interface ReadinessRequest {
  notes: { updatedLast14Days: number } | null;
  safety: {
    displayName: string;
    totalContacts: number;
    confirmedContacts: number;
    firstConfirmedNickname: string | null;
    messageTemplate: string;
    messageReviewed: boolean;
    includeLocation: boolean;
    secretCodeSet: boolean;
    lastTestAt: string | null;
  };
  geoPermission: GeoPermission;
  now?: string;
  timezone?: string;
}

export interface ReadinessResult extends ReadinessScore {
  messagePreview: { text: string; mapUrl: string | null } & MessageLength;
}

/** Sem contato confirmado, a prévia usa um marcador no lugar do apelido. */
export const NICKNAME_PLACEHOLDER = '[apelido do contato]';

export class CalculateReadinessHandler {
  constructor(private readonly clock: Clock) {}

  execute(request: ReadinessRequest): ReadinessResult {
    const now = request.now ? new Date(request.now) : this.clock.now();
    const { safety } = request;
    const score = calculateReadiness({
      notes: request.notes,
      safety: {
        totalContacts: safety.totalContacts,
        confirmedContacts: safety.confirmedContacts,
        messageReviewed: safety.messageReviewed,
        secretCodeSet: safety.secretCodeSet,
        lastTestAt: safety.lastTestAt ? new Date(safety.lastTestAt) : null,
      },
      geoPermission: request.geoPermission,
      now,
    });
    const message = composeMessage({
      template: safety.messageTemplate,
      displayName: safety.displayName,
      contactNickname: safety.firstConfirmedNickname ?? NICKNAME_PLACEHOLDER,
      location: { kind: safety.includeLocation ? 'placeholder' : 'omitted' },
      at: now,
      timezone: request.timezone ?? DEFAULT_TIMEZONE,
    });
    return { ...score, messagePreview: { ...message, ...measureMessage(message.text) } };
  }
}
