import { Banner, Button, EmptyState, Spinner } from '@ghosty/ui';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useCreateNote, useNotes, type Note } from './api';
import styles from './notes.module.css';
import { matchesQuery, splitPinned } from './search';

function NoteCard({ note }: { note: Note }) {
  const preview =
    note.kind === 'checklist'
      ? (note.items ?? []).slice(0, 4).map((item) => `${item.done ? '☑' : '☐'} ${item.text}`)
      : [(note.body ?? '').slice(0, 160)];
  return (
    <li>
      <Link to={`/nota/${note.id}`} className={styles.card} data-color={note.color}>
        {note.title && <strong className={styles.cardTitle}>{note.title}</strong>}
        {preview.filter(Boolean).map((line) => (
          <span key={line} className={styles.cardLine}>
            {line}
          </span>
        ))}
        {note.reminderAt && (
          <span className={styles.chip}>
            ⏰ {new Date(note.reminderAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
          </span>
        )}
        {note.labels.length > 0 && (
          <span className={styles.labels}>
            {note.labels.map((label) => (
              <span key={label} className={styles.chip}>
                {label}
              </span>
            ))}
          </span>
        )}
      </Link>
    </li>
  );
}

function Section({ title, notes }: { title: string; notes: Note[] }) {
  if (notes.length === 0) return null;
  return (
    <section aria-label={title}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <ul className={styles.grid}>
        {notes.map((note) => (
          <NoteCard key={note.id} note={note} />
        ))}
      </ul>
    </section>
  );
}

export interface NotesListProps {
  archived?: boolean;
  onSearchSubmit: (query: string) => void;
}

/**
 * A lista de notas. A busca filtra no navegador; no Enter, avisa o shell (`onSearchSubmit`) e continua
 * mostrando o resultado da busca, como em qualquer app de notas.
 */
export function NotesList({ archived = false, onSearchSubmit }: NotesListProps) {
  const notes = useNotes(archived);
  const create = useCreateNote();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSearchSubmit(query);
  };

  const newNote = async (kind: 'text' | 'checklist') => {
    const note = await create.mutateAsync({
      kind,
      title: kind === 'text' ? 'Nova nota' : 'Nova lista',
      color: 'default',
      pinned: false,
    });
    await navigate(`/nota/${note.id}`);
  };

  const filtered = (notes.data ?? []).filter((note) => matchesQuery(note, query));
  const { pinned, others } = splitPinned(filtered);

  return (
    <main className={styles.page}>
      <form role="search" onSubmit={onSubmit} className={styles.search}>
        <label htmlFor="busca" className="visually-hidden">
          Buscar notas
        </label>
        <input
          id="busca"
          type="search"
          className={styles.searchInput}
          placeholder="Buscar notas"
          value={query}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
        />
      </form>

      <nav className={styles.toolbar} aria-label="Notas">
        {!archived && (
          <>
            <Button onClick={() => newNote('text')} disabled={create.isPending}>
              Nova nota
            </Button>
            <Button variant="secondary" onClick={() => newNote('checklist')} disabled={create.isPending}>
              Nova lista
            </Button>
          </>
        )}
        <Link to={archived ? '/' : '/arquivadas'} className={styles.link}>
          {archived ? 'Voltar às notas' : 'Arquivadas'}
        </Link>
      </nav>

      {archived && <h1 className={styles.sectionTitle}>Arquivadas</h1>}
      {notes.isPending && <Spinner />}
      {notes.isError && <Banner tone="alert">Não foi possível carregar as notas.</Banner>}
      {notes.isSuccess && filtered.length === 0 && (
        <EmptyState>{query.trim() ? 'Nenhuma nota encontrada' : 'Nenhuma nota ainda'}</EmptyState>
      )}
      <Section title="Fixadas" notes={pinned} />
      <Section title={pinned.length > 0 ? 'Outras' : 'Notas'} notes={others} />
    </main>
  );
}
