import { Banner, Button, Spinner, TextArea, TextField } from '@ghosty/ui';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  ApiError,
  NOTE_COLORS,
  useDeleteNote,
  useNote,
  usePatchNote,
  useUpdateNote,
  type Note,
  type NoteColor,
  type PatchNote,
} from './api';
import styles from './notes.module.css';

/** `datetime-local` usa a hora local, sem fuso; a API usa ISO em UTC. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface Draft {
  title: string;
  body: string;
  items: { id?: string; text: string; done: boolean }[];
  color: NoteColor;
  labels: string;
  reminder: string;
}

const draftOf = (note: Note): Draft => ({
  title: note.title,
  body: note.body ?? '',
  items: (note.items ?? []).map((item) => ({ ...item })),
  color: note.color,
  labels: note.labels.join(', '),
  reminder: toLocalInput(note.reminderAt),
});

function Editor({ note }: { note: Note }) {
  const navigate = useNavigate();
  const update = useUpdateNote(note.id);
  const patch = usePatchNote(note.id);
  const remove = useDeleteNote(note.id);
  const [draft, setDraft] = useState<Draft>(() => draftOf(note));
  const [message, setMessage] = useState<{ tone: 'success' | 'alert' | 'warning'; text: string } | null>(
    null,
  );
  const [newItem, setNewItem] = useState('');

  const fail = (error: unknown) => {
    if (error instanceof ApiError && error.status === 409) {
      setMessage({
        tone: 'warning',
        text: 'A nota mudou em outro lugar. Recarregue para ver a versão atual.',
      });
    } else if (error instanceof ApiError && error.status === 400) {
      setMessage({ tone: 'alert', text: error.problem?.detail ?? 'Confira os campos da nota.' });
    } else {
      setMessage({ tone: 'alert', text: 'Não foi possível salvar agora.' });
    }
  };

  /** Ações imediatas (fixar, arquivar, marcar item, converter) usam o PATCH. */
  const quick = async (body: PatchNote) => {
    setMessage(null);
    try {
      const saved = await patch.mutateAsync({ ...body, version: note.version });
      setDraft(draftOf(saved));
    } catch (error) {
      fail(error);
    }
  };

  const save = async () => {
    setMessage(null);
    try {
      await update.mutateAsync({
        version: note.version,
        kind: note.kind,
        title: draft.title,
        ...(note.kind === 'text'
          ? { body: draft.body }
          : { items: draft.items.map(({ id, text, done }) => ({ ...(id ? { id } : {}), text, done })) }),
        color: draft.color,
        labels: draft.labels
          .split(',')
          .map((label) => label.trim())
          .filter(Boolean),
        pinned: note.pinned,
        archived: note.archived,
        reminderAt: draft.reminder ? new Date(draft.reminder).toISOString() : null,
      });
      setMessage({ tone: 'success', text: 'Nota salva.' });
    } catch (error) {
      fail(error);
    }
  };

  const onDelete = async () => {
    await remove.mutateAsync();
    await navigate('/', { replace: true });
  };

  const busy = update.isPending || patch.isPending || remove.isPending;

  return (
    <main className={styles.page}>
      <p>
        <Link to={note.archived ? '/arquivadas' : '/'} className={styles.link}>
          ← Voltar
        </Link>
      </p>
      <div className={styles.editor} data-color={draft.color}>
        {message && <Banner tone={message.tone}>{message.text}</Banner>}
        <TextField
          label="Título"
          value={draft.title}
          maxLength={200}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />

        {note.kind === 'text' ? (
          <TextArea
            label="Texto"
            value={draft.body}
            maxLength={20000}
            rows={10}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          />
        ) : (
          <fieldset className={styles.items}>
            <legend>Itens</legend>
            {draft.items.map((item, index) => (
              <div key={item.id ?? `novo-${index}`} className={styles.item}>
                <input
                  type="checkbox"
                  aria-label={`Marcar ${item.text}`}
                  checked={item.done}
                  disabled={!item.id || busy}
                  onChange={(e) => item.id && quick({ item: { id: item.id, done: e.target.checked } })}
                />
                <input
                  className={styles.itemText}
                  aria-label={`Item ${index + 1}`}
                  value={item.text}
                  maxLength={500}
                  onChange={(e) => {
                    const items = [...draft.items];
                    items[index] = { ...item, text: e.target.value };
                    setDraft({ ...draft, items });
                  }}
                />
                <Button
                  variant="ghost"
                  aria-label={`Remover ${item.text}`}
                  onClick={() => setDraft({ ...draft, items: draft.items.filter((_, i) => i !== index) })}
                >
                  ✕
                </Button>
              </div>
            ))}
            <div className={styles.item}>
              <input
                className={styles.itemText}
                aria-label="Novo item"
                placeholder="Novo item"
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newItem.trim()) {
                    e.preventDefault();
                    setDraft({ ...draft, items: [...draft.items, { text: newItem.trim(), done: false }] });
                    setNewItem('');
                  }
                }}
              />
            </div>
          </fieldset>
        )}

        <fieldset className={styles.colors}>
          <legend>Cor</legend>
          {NOTE_COLORS.map((color) => (
            <label key={color.value} className={styles.color} data-color={color.value}>
              <input
                type="radio"
                name="cor"
                value={color.value}
                checked={draft.color === color.value}
                onChange={() => setDraft({ ...draft, color: color.value })}
              />
              <span>{color.label}</span>
            </label>
          ))}
        </fieldset>

        <TextField
          label="Etiquetas"
          hint="Separe por vírgula"
          value={draft.labels}
          onChange={(e) => setDraft({ ...draft, labels: e.target.value })}
        />
        <TextField
          label="Lembrete"
          type="datetime-local"
          value={draft.reminder}
          onChange={(e) => setDraft({ ...draft, reminder: e.target.value })}
        />

        <div className={styles.toolbar}>
          <Button onClick={save} disabled={busy}>
            Salvar
          </Button>
          <Button variant="secondary" onClick={() => quick({ pinned: !note.pinned })} disabled={busy}>
            {note.pinned ? 'Desafixar' : 'Fixar'}
          </Button>
          <Button variant="secondary" onClick={() => quick({ archived: !note.archived })} disabled={busy}>
            {note.archived ? 'Desarquivar' : 'Arquivar'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => quick({ kind: note.kind === 'text' ? 'checklist' : 'text' })}
            disabled={busy}
          >
            {note.kind === 'text' ? 'Converter em lista' : 'Converter em texto'}
          </Button>
          <Button variant="danger" onClick={onDelete} disabled={busy}>
            Apagar
          </Button>
        </div>
      </div>
    </main>
  );
}

export function NoteEditor() {
  const { id = '' } = useParams();
  const note = useNote(id);
  if (note.isPending) return <Spinner />;
  if (note.isError) return <Banner tone="alert">Nota não encontrada.</Banner>;
  // A versão nova chega pela prop (cache do TanStack Query); a chave só muda quando é outra nota.
  return <Editor key={note.data.id} note={note.data} />;
}
