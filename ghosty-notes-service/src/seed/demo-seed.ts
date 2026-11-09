import type { IdGenerator } from '../application/ports/id-generator.js';
import type { NoteRepository } from '../application/ports/note.repository.js';
import { Note, type NoteContent } from '../domain/notes/note.entity.js';

const DAY = 24 * 60 * 60 * 1000;
/** Brasília não tem horário de verão: 14h locais são 17h UTC. */
const SAO_PAULO_OFFSET_HOURS = 3;

interface DemoNote {
  /** Há quantos dias a nota foi atualizada pela última vez. */
  daysAgo: number;
  content: NoteContent;
}

/** A próxima quinta-feira às 14h (horário de Brasília), a partir de `now`. */
export function nextThursdayAt14(now: Date): Date {
  const local = new Date(now.getTime() - SAO_PAULO_OFFSET_HOURS * 60 * 60 * 1000);
  const daysUntil = (4 - local.getUTCDay() + 7) % 7;
  const candidate = new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() + daysUntil,
      14 + SAO_PAULO_OFFSET_HOURS,
    ),
  );
  return candidate.getTime() > now.getTime() ? candidate : new Date(candidate.getTime() + 7 * DAY);
}

/**
 * As 8 notas fictícias da conta de demonstração: 5 atualizadas nos últimos 14 dias (a fachada parece
 * usada de verdade) e 3 mais antigas.
 */
export function demoNotes(now: Date): DemoNote[] {
  return [
    {
      daysAgo: 1,
      content: {
        kind: 'checklist',
        title: 'Lista do mercado',
        items: [
          { text: 'Pão' },
          { text: 'Leite' },
          { text: 'Café', done: true },
          { text: 'Bananas' },
          { text: 'Sabão em pó' },
        ],
        pinned: true,
        color: 'yellow',
        labels: ['casa'],
      },
    },
    {
      daysAgo: 3,
      content: {
        kind: 'text',
        title: 'Ideias de presente',
        body: 'Mãe: livro de receitas ou uma planta.\nPai: caneca térmica.\nJu: fone de ouvido.',
        color: 'pink',
      },
    },
    {
      daysAgo: 30,
      content: {
        kind: 'text',
        title: 'Livros para ler',
        body: 'Torto Arado\nO Avesso da Pele\nTudo É Rio\nA Hora da Estrela',
        color: 'blue',
      },
    },
    {
      daysAgo: 45,
      content: {
        kind: 'text',
        title: 'Receita do bolo de cenoura',
        body:
          'Massa: 3 cenouras, 3 ovos, 1 xícara de óleo, 2 xícaras de açúcar, 2 xícaras de farinha, 1 colher de fermento.\n' +
          'Cobertura: 4 colheres de chocolate em pó, 1 colher de manteiga, 1 xícara de açúcar, 5 colheres de leite.',
        labels: ['receitas'],
      },
    },
    {
      daysAgo: 2,
      content: {
        kind: 'text',
        title: 'Dentista quinta 14h',
        body: 'Levar a carteirinha do convênio.',
        reminderAt: nextThursdayAt14(now),
        color: 'green',
      },
    },
    {
      daysAgo: 20,
      content: {
        kind: 'text',
        title: 'Filmes para ver',
        body: 'Ainda Estou Aqui\nCentral do Brasil\nO Auto da Compadecida',
      },
    },
    {
      daysAgo: 5,
      content: {
        kind: 'checklist',
        title: 'Treino da semana',
        items: [
          { text: 'Segunda: caminhada 30 min', done: true },
          { text: 'Quarta: alongamento' },
          { text: 'Sexta: bicicleta' },
        ],
        labels: ['saúde'],
      },
    },
    {
      daysAgo: 7,
      content: {
        kind: 'text',
        title: 'Endereço da festa',
        body: 'Rua das Flores, 123, apto 41. Sábado às 20h. Levar refrigerante.',
        color: 'gray',
      },
    },
  ];
}

export type DemoNotesRepository = Pick<NoteRepository, 'nextId' | 'insert' | 'deleteAllOfOwner'>;

/** Recomeça do zero: apaga as notas da conta demo e grava as 8 de novo. Devolve quantas gravou. */
export async function seedDemoNotes(
  notes: DemoNotesRepository,
  ids: IdGenerator,
  ownerId: string,
  now: Date,
): Promise<number> {
  await notes.deleteAllOfOwner(ownerId);
  const list = demoNotes(now);
  for (const demo of list) {
    await notes.insert(
      Note.create({
        id: notes.nextId(),
        ownerId,
        now: new Date(now.getTime() - demo.daysAgo * DAY),
        content: demo.content,
        newItemId: () => ids.newId(),
      }),
    );
  }
  return list.length;
}
