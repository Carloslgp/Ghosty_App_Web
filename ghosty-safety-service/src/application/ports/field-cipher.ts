export const FIELD_CIPHER = Symbol('FieldCipher');

/** Cifra campo a campo (AES-256-GCM) dos dados sensíveis gravados no banco. */
export interface FieldCipher {
  encrypt(plain: string): string;
  decrypt(stored: string): string;
  /** Índice determinístico (HMAC) para buscar um valor cifrado sem decifrar a tabela inteira. */
  blindIndex(plain: string): string;
}
