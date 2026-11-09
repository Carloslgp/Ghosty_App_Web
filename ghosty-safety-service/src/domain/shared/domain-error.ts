/** Códigos que o domínio pode gerar. A camada api os traduz para o status HTTP. */
export type DomainErrorCode = 'VALIDATION_FAILED' | 'INVALID_STATE' | 'INVITATION_EXPIRED';

export interface FieldIssue {
  field: string;
  message: string;
}

/** Regra de negócio violada. A mensagem é segura para mostrar ao cliente. */
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly errors?: FieldIssue[],
  ) {
    super(message);
    this.name = 'DomainError';
  }

  static invalidField(field: string, message: string): DomainError {
    return new DomainError('VALIDATION_FAILED', `O campo ${field} é inválido: ${message}.`, [
      { field, message },
    ]);
  }

  static invalidState(message: string): DomainError {
    return new DomainError('INVALID_STATE', message);
  }
}

/** Modo de um pedido de ajuda ou check-in: `test` é o ensaio (Teste seguro) e nunca envia nada. */
export const MODES = ['real', 'test'] as const;
export type Mode = (typeof MODES)[number];

export function isMode(value: unknown): value is Mode {
  return MODES.includes(value as Mode);
}
