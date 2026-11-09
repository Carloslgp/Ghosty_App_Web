export const ID_GENERATOR = Symbol('IdGenerator');

/** Ids dos itens de checklist (UUID v7). */
export interface IdGenerator {
  newId(): string;
}
