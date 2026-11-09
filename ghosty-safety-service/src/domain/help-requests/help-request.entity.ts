import { DomainError, type Mode } from '../shared/domain-error.js';

export const HELP_REQUEST_ORIGINS = ['button', 'check_in'] as const;
export type HelpRequestOrigin = (typeof HELP_REQUEST_ORIGINS)[number];

export const HELP_REQUEST_STATUSES = ['triggered', 'dispatched', 'cancelled', 'failed'] as const;
export type HelpRequestStatus = (typeof HELP_REQUEST_STATUSES)[number];

export interface GeoLocation {
  lat: number;
  lng: number;
  accuracyMeters: number | null;
}

export interface HelpRequestSnapshot {
  id: string;
  accountId: string;
  origin: HelpRequestOrigin;
  mode: Mode;
  status: HelpRequestStatus;
  location: GeoLocation | null;
  checkInId: string | null;
  createdAt: Date;
  dispatchedAt: Date | null;
}

function assertLocation(location: GeoLocation | null): void {
  if (location === null) return;
  const { lat, lng, accuracyMeters } = location;
  if (!Number.isFinite(lat) || lat < -90 || lat > 90)
    throw DomainError.invalidField('location.lat', 'entre -90 e 90');
  if (!Number.isFinite(lng) || lng < -180 || lng > 180)
    throw DomainError.invalidField('location.lng', 'entre -180 e 180');
  if (accuracyMeters !== null && (!Number.isFinite(accuracyMeters) || accuracyMeters < 0)) {
    throw DomainError.invalidField('location.accuracyMeters', 'não pode ser negativa');
  }
}

/**
 * Pedido de ajuda: `triggered → dispatched | failed`, e `triggered | dispatched → cancelled` quando a
 * pessoa marca "foi engano" (o aviso que já saiu não é desfeito).
 */
export class HelpRequest {
  private constructor(private state: HelpRequestSnapshot) {}

  static trigger(params: {
    id: string;
    accountId: string;
    origin: HelpRequestOrigin;
    mode: Mode;
    location: GeoLocation | null;
    checkInId: string | null;
    now: Date;
  }): HelpRequest {
    assertLocation(params.location);
    if (params.origin === 'check_in' && params.checkInId === null) {
      throw DomainError.invalidField('checkInId', 'obrigatório quando a origem é o check-in');
    }
    return new HelpRequest({
      id: params.id,
      accountId: params.accountId,
      origin: params.origin,
      mode: params.mode,
      status: 'triggered',
      location: params.location,
      checkInId: params.checkInId,
      createdAt: params.now,
      dispatchedAt: null,
    });
  }

  static restore(snapshot: HelpRequestSnapshot): HelpRequest {
    return new HelpRequest({ ...snapshot, location: snapshot.location ? { ...snapshot.location } : null });
  }

  get id(): string {
    return this.state.id;
  }

  get accountId(): string {
    return this.state.accountId;
  }

  get status(): HelpRequestStatus {
    return this.state.status;
  }

  get mode(): Mode {
    return this.state.mode;
  }

  /** Resultado do envio. Repetir o mesmo resultado não muda nada (reprocessamento da fila). */
  recordDispatch(result: 'dispatched' | 'failed', at: Date): void {
    if (this.state.status === result || this.state.status === 'cancelled') return;
    if (this.state.status !== 'triggered') {
      throw DomainError.invalidState(`O pedido de ajuda já está ${this.state.status}.`);
    }
    this.state = { ...this.state, status: result, dispatchedAt: at };
  }

  cancel(): void {
    if (this.state.status !== 'triggered' && this.state.status !== 'dispatched') {
      throw DomainError.invalidState(`Não é possível cancelar um pedido ${this.state.status}.`);
    }
    this.state = { ...this.state, status: 'cancelled' };
  }

  toSnapshot(): HelpRequestSnapshot {
    return { ...this.state, location: this.state.location ? { ...this.state.location } : null };
  }
}
