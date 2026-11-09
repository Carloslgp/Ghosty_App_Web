import { v7 as uuidv7 } from 'uuid';
import type { IdGenerator } from '../../application/ports/id-generator.js';

export class UuidV7Generator implements IdGenerator {
  newId(): string {
    return uuidv7();
  }
}
