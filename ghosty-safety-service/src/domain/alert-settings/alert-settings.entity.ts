import { DomainError } from '../shared/domain-error.js';

export const DEFAULT_MESSAGE_TEMPLATE =
  'Oi, {apelido}. Aqui é {nome}. Posso estar em uma situação de risco e preciso de ajuda. {local} Enviado às {hora}.';

/** Sobra espaço para os valores dos campos caberem nos 4.096 caracteres do Telegram. */
export const MESSAGE_TEMPLATE_MAX = 3_800;

export interface AlertSettingsSnapshot {
  accountId: string;
  messageTemplate: string;
  includeLocation: boolean;
  countdownSeconds: number;
  checkInToleranceMinutes: number;
  reviewedAt: Date | null;
}

export interface AlertSettingsInput {
  messageTemplate: string;
  includeLocation: boolean;
  countdownSeconds: number;
  checkInToleranceMinutes: number;
}

function validate(input: AlertSettingsInput): AlertSettingsInput {
  const messageTemplate = input.messageTemplate.trim();
  if (messageTemplate.length === 0 || messageTemplate.length > MESSAGE_TEMPLATE_MAX) {
    throw DomainError.invalidField('messageTemplate', `entre 1 e ${MESSAGE_TEMPLATE_MAX} caracteres`);
  }
  if (
    !Number.isInteger(input.countdownSeconds) ||
    input.countdownSeconds < 5 ||
    input.countdownSeconds > 60
  ) {
    throw DomainError.invalidField('countdownSeconds', 'entre 5 e 60 segundos');
  }
  if (
    !Number.isInteger(input.checkInToleranceMinutes) ||
    input.checkInToleranceMinutes < 0 ||
    input.checkInToleranceMinutes > 60
  ) {
    throw DomainError.invalidField('checkInToleranceMinutes', 'entre 0 e 60 minutos');
  }
  return { ...input, messageTemplate };
}

/** A mensagem do aviso e as preferências do pedido de ajuda. Nasce com os valores padrão. */
export class AlertSettings {
  private constructor(private state: AlertSettingsSnapshot) {}

  static createDefault(accountId: string): AlertSettings {
    return new AlertSettings({
      accountId,
      messageTemplate: DEFAULT_MESSAGE_TEMPLATE,
      includeLocation: true,
      countdownSeconds: 10,
      checkInToleranceMinutes: 10,
      reviewedAt: null,
    });
  }

  static restore(snapshot: AlertSettingsSnapshot): AlertSettings {
    return new AlertSettings({ ...snapshot });
  }

  get accountId(): string {
    return this.state.accountId;
  }

  get reviewed(): boolean {
    return this.state.reviewedAt !== null;
  }

  /** Salvar marca a mensagem como revisada. */
  update(input: AlertSettingsInput, now: Date): void {
    this.state = { ...this.state, ...validate(input), reviewedAt: now };
  }

  toSnapshot(): AlertSettingsSnapshot {
    return { ...this.state };
  }
}
