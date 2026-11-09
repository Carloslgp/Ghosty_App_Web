import { Writable } from 'node:stream';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { redactedPaths, REDACTED_KEYS, sanitizeUrl } from '../../src/api/platform/logger.js';

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  const logger = pino({ redact: { paths: redactedPaths(), censor: '[redigido]' } }, stream);
  return { logger, lines };
}

describe('logger: redação dos campos sensíveis', () => {
  it('redige os campos da lista no primeiro, segundo e terceiro nível', () => {
    const { logger, lines } = capture();
    logger.info({
      password: 'p1',
      headers: { authorization: 'Bearer x', 'x-internal-key': 'k', 'x-safety-token': 't' },
      body: { contact: { chatId: '123', location: { lat: 1 } }, code: '123456' },
    });
    const out = lines.join('');
    for (const secret of ['p1', 'Bearer x', '"k"', '"t"', '123456', '"123"', '"lat"']) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('[redigido]');
  });

  it('a lista cobre os campos obrigatórios das convenções', () => {
    for (const key of ['authorization', 'x-safety-token', 'x-internal-key', 'password', 'code', 'chatId']) {
      expect(REDACTED_KEYS).toContain(key);
    }
    for (const key of ['botToken', 'message', 'location']) expect(REDACTED_KEYS).toContain(key);
  });

  it('a URL registrada não tem query string nem o token do convite', () => {
    expect(sanitizeUrl('/notes?q=segredo')).toBe('/notes');
    expect(sanitizeUrl('/invitations/abc123/accept')).toBe('/invitations/***/accept');
    expect(sanitizeUrl('/c/abc123')).toBe('/c/***');
    expect(sanitizeUrl(undefined)).toBe('');
  });
});
