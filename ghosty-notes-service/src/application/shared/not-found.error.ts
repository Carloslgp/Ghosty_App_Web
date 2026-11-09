/** O recurso não existe ou é de outra conta. A resposta não diz qual dos dois. */
export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND';

  constructor(message = 'Nota não encontrada.') {
    super(message);
    this.name = 'NotFoundError';
  }
}
