import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import type { FieldCipher } from '../../application/ports/field-cipher.js';

const VERSION = 'v1';

/**
 * AES-256-GCM com IV aleatório de 12 bytes por valor. Formato gravado: `v1:<iv>:<tag>:<cifra>` em
 * Base64; o prefixo de versão permite trocar a chave no futuro. O índice cego usa uma chave derivada
 * (HKDF), nunca a própria chave de cifra.
 */
export class AesGcmFieldCipher implements FieldCipher {
  private readonly key: Buffer;
  private readonly indexKey: Buffer;

  constructor(keyBase64: string) {
    const key = Buffer.from(keyBase64, 'base64');
    if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY precisa ter 32 bytes em Base64.');
    this.key = key;
    this.indexKey = Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), 'ghosty-blind-index', 32));
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [
      VERSION,
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      data.toString('base64'),
    ].join(':');
  }

  decrypt(stored: string): string {
    const [version, iv, tag, data] = stored.split(':');
    if (version !== VERSION || !iv || !tag || data === undefined)
      throw new Error('Valor cifrado em formato desconhecido.');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  }

  blindIndex(plain: string): string {
    return createHmac('sha256', this.indexKey).update(plain).digest('hex');
  }
}
