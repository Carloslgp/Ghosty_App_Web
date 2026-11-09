/** Códigos de erro que o domínio pode gerar. A camada api os traduz para o status HTTP. */
export type DomainErrorCode = 'VALIDATION_FAILED' | 'INVALID_STATE' | 'VERSION_CONFLICT';

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
}
