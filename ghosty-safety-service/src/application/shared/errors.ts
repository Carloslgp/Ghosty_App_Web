/** O recurso não existe ou é de outra conta. A resposta não diz qual dos dois. */
export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND';

  constructor(message = 'Não encontrado.') {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** Credencial errada, token inválido, código errado ou conta bloqueada: sempre a mesma resposta. */
export class UnauthenticatedError extends Error {
  readonly code = 'UNAUTHENTICATED';

  constructor() {
    super('Não autenticado.');
    this.name = 'UnauthenticatedError';
  }
}

export class EmailInUseError extends Error {
  readonly code = 'EMAIL_IN_USE';

  constructor() {
    super('Já existe uma conta com este e-mail.');
    this.name = 'EmailInUseError';
  }
}
