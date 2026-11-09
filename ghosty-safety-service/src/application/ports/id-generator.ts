export const ID_GENERATOR = Symbol('IdGenerator');

/** UUID v7. */
export interface IdGenerator {
  newId(): string;
}
