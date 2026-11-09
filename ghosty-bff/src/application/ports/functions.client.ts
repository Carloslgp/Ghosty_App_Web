import type { RequestMeta } from './upstream-error.js';

export const FUNCTIONS = Symbol('FunctionsClient');

export type GeoPermission = 'granted' | 'denied' | 'prompt' | 'unknown';

/** O pedido de prontidão, montado a partir dos resumos dos dois serviços. */
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
  timezone: string;
}

export interface ReadinessItem {
  id: string;
  ok: boolean;
  weight: number;
  text: string;
  recommendation: string | null;
}

export interface MessagePreviewResult {
  text: string;
  characters: number;
  limit: number;
  withinLimit: boolean;
  mapUrl: string | null;
}

export interface ReadinessResult {
  score: number;
  level: 'ready' | 'almost' | 'attention';
  items: ReadinessItem[];
  messagePreview: MessagePreviewResult;
}

export interface MessagePreviewRequest {
  template: string;
  displayName: string;
  contactNickname: string;
  location?: { lat: number; lng: number; accuracyMeters?: number | null };
  timezone: string;
}

/** As funções HTTP da Azure Function (com `x-functions-key`). Erros saem como `UpstreamError`. */
export interface FunctionsClient {
  readiness(request: ReadinessRequest, meta: RequestMeta): Promise<ReadinessResult>;
  messagePreview(request: MessagePreviewRequest, meta: RequestMeta): Promise<MessagePreviewResult>;
}
