import {
  composeMessage,
  DEFAULT_TIMEZONE,
  measureMessage,
  type GeoPoint,
  type MessageLength,
} from '../../../domain/message/message-composer.js';
import type { Clock } from '../../ports/runtime.js';

export interface MessagePreviewRequest {
  template: string;
  displayName: string;
  contactNickname: string;
  location?: GeoPoint;
  at?: string;
  timezone?: string;
}

export type MessagePreview = { text: string; mapUrl: string | null } & MessageLength;

/**
 * Mostra exatamente o que sairia para um contato. Acima de 4.096 caracteres, `withinLimit` vem `false`
 * (e o editor não deixa salvar), mas a resposta continua 200.
 */
export class PreviewMessageHandler {
  constructor(private readonly clock: Clock) {}

  execute(request: MessagePreviewRequest): MessagePreview {
    const message = composeMessage({
      template: request.template,
      displayName: request.displayName,
      contactNickname: request.contactNickname,
      location: request.location ? { kind: 'point', point: request.location } : { kind: 'unavailable' },
      at: request.at ? new Date(request.at) : this.clock.now(),
      timezone: request.timezone ?? DEFAULT_TIMEZONE,
    });
    return { ...message, ...measureMessage(message.text) };
  }
}
