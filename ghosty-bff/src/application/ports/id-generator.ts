export const ID_GENERATOR = Symbol('IdGenerator');

/** UUID v7 (o `jti` da sessão segura). */
export interface IdGenerator {
  newId(): string;
}
