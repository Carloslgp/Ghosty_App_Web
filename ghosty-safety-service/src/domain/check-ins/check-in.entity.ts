import { DomainError, type Mode } from '../shared/domain-error.js';

export const CHECK_IN_STATUSES = ['active', 'confirmed', 'cancelled', 'expired'] as const;
export type CheckInStatus = (typeof CHECK_IN_STATUSES)[number];

export const CHECK_IN_MIN_MINUTES = 1;
export const CHECK_IN_MAX_HOURS = 24;
export const DESTINATION_MAX = 120;

export interface CheckInSnapshot {
  id: string;
  accountId: string;
  destination: string;
  dueAt: Date;
  toleranceMinutes: number;
  status: CheckInStatus;
  mode: Mode;
  /** Sobe a cada extensão. A mensagem de prazo com versão antiga é ignorada. */
  version: number;
  confirmedAt: Date | null;
  expiredAt: Date | null;
  createdAt: Date;
}

function assertDue(dueAt: Date, now: Date): void {
  const diff = dueAt.getTime() - now.getTime();
  if (Number.isNaN(diff) || diff < CHECK_IN_MIN_MINUTES * 60_000 || diff > CHECK_IN_MAX_HOURS * 3_600_000) {
    throw DomainError.invalidField(
      'dueAt',
      `entre ${CHECK_IN_MIN_MINUTES} minuto e ${CHECK_IN_MAX_HOURS} horas a partir de agora`,
    );
  }
}

/** Resultado de uma mensagem de prazo: só vence o check-in ativo com a mesma versão. */
export type ExpireOutcome = 'expired' | 'ignored';

/** Check-in "cheguei bem": `active → confirmed | cancelled | expired`, e `active → active` ao estender. */
export class CheckIn {
  private constructor(private state: CheckInSnapshot) {}

  static start(params: {
    id: string;
    accountId: string;
    destination: string;
    dueAt: Date;
    toleranceMinutes: number;
    mode: Mode;
    now: Date;
  }): CheckIn {
    const destination = params.destination.trim();
    if (destination.length === 0 || destination.length > DESTINATION_MAX) {
      throw DomainError.invalidField('destination', `entre 1 e ${DESTINATION_MAX} caracteres`);
    }
    assertDue(params.dueAt, params.now);
    return new CheckIn({
      id: params.id,
      accountId: params.accountId,
      destination,
      dueAt: params.dueAt,
      toleranceMinutes: params.toleranceMinutes,
      status: 'active',
      mode: params.mode,
      version: 1,
      confirmedAt: null,
      expiredAt: null,
      createdAt: params.now,
    });
  }

  static restore(snapshot: CheckInSnapshot): CheckIn {
    return new CheckIn({ ...snapshot });
  }

  get id(): string {
    return this.state.id;
  }

  get status(): CheckInStatus {
    return this.state.status;
  }

  get version(): number {
    return this.state.version;
  }

  /** Prazo final: o horário combinado mais a tolerância. */
  get deadlineAt(): Date {
    return new Date(this.state.dueAt.getTime() + this.state.toleranceMinutes * 60_000);
  }

  private assertActive(action: string): void {
    if (this.state.status !== 'active') {
      throw DomainError.invalidState(`Não é possível ${action} um check-in ${this.state.status}.`);
    }
  }

  extend(dueAt: Date, now: Date): void {
    this.assertActive('estender');
    assertDue(dueAt, now);
    this.state = { ...this.state, dueAt, version: this.state.version + 1 };
  }

  confirm(now: Date): void {
    this.assertActive('confirmar');
    this.state = { ...this.state, status: 'confirmed', confirmedAt: now };
  }

  cancel(): void {
    this.assertActive('cancelar');
    this.state = { ...this.state, status: 'cancelled' };
  }

  /** Chamado pela mensagem de prazo. Idempotente: versão antiga ou check-in já encerrado é ignorado. */
  expire(version: number, now: Date): ExpireOutcome {
    if (this.state.status !== 'active' || version !== this.state.version) return 'ignored';
    this.state = { ...this.state, status: 'expired', expiredAt: now };
    return 'expired';
  }

  toSnapshot(): CheckInSnapshot {
    return { ...this.state };
  }
}
