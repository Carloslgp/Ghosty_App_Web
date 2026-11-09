import { describe, expect, it } from 'vitest';
import { fallbackReadiness, readinessLevel } from './fallback-readiness.js';

describe('Prontidão de reserva', () => {
  it('o exemplo do contrato: 1 de 1 confirmado e mensagem não revisada dão 30, attention', () => {
    const result = fallbackReadiness({
      totalContacts: 1,
      confirmedContacts: 1,
      messageReviewed: false,
      secretCodeSet: false,
    });
    expect(result.score).toBe(30);
    expect(result.level).toBe('attention');
    expect(result.messagePreview).toBeNull();
    expect(result.items.slice(0, 2)).toEqual([
      {
        id: 'network-confirmed',
        ok: true,
        weight: 30,
        text: '1 de 1 contato confirmou',
        recommendation: null,
      },
      {
        id: 'message-reviewed',
        ok: false,
        weight: 15,
        text: 'Mensagem ainda não revisada',
        recommendation: 'Revise a mensagem e veja a prévia.',
      },
    ]);
  });

  it('tudo cumprido soma 50 (o máximo sem a Function): almost', () => {
    const result = fallbackReadiness({
      totalContacts: 3,
      confirmedContacts: 2,
      messageReviewed: true,
      secretCodeSet: true,
    });
    expect(result).toMatchObject({ score: 50, level: 'almost' });
    expect(result.items[0]?.text).toBe('2 de 3 contatos confirmaram');
    expect(result.items.every((item) => item.recommendation === null)).toBe(true);
  });

  it('rede vazia, nenhum confirmado e sem o resumo da segurança', () => {
    const empty = { totalContacts: 0, confirmedContacts: 0, messageReviewed: false, secretCodeSet: false };
    expect(fallbackReadiness(empty).items[0]?.text).toBe('Sua rede de apoio ainda está vazia');
    expect(fallbackReadiness({ ...empty, totalContacts: 2 }).items[0]?.text).toBe(
      'Nenhum contato confirmou o convite ainda',
    );
    expect(fallbackReadiness(null)).toEqual({
      score: 0,
      level: 'attention',
      items: [],
      messagePreview: null,
    });
  });

  it('níveis: 80 ou mais ready, 50 a 79 almost, abaixo attention', () => {
    expect([readinessLevel(80), readinessLevel(79), readinessLevel(50), readinessLevel(49)]).toEqual([
      'ready',
      'almost',
      'almost',
      'attention',
    ]);
  });
});
