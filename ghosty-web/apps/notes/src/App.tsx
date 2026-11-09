import type { NotesAppProps } from '@ghosty/api-client';
import { Route, Routes } from 'react-router';
import { ApiContext } from './features/notes/api';
import { NoteEditor } from './features/notes/NoteEditor';
import { NotesList } from './features/notes/NotesList';

/**
 * O remote `notes` (a fachada), exposto como `notes/App`. Usa o roteador e o QueryClient do shell
 * (compartilhados como singleton): rotas `/`, `/arquivadas` e `/nota/:id`.
 */
export default function NotesApp({ api, onSearchSubmit }: NotesAppProps) {
  return (
    <ApiContext value={api}>
      <Routes>
        <Route index element={<NotesList onSearchSubmit={onSearchSubmit} />} />
        <Route path="arquivadas" element={<NotesList archived onSearchSubmit={onSearchSubmit} />} />
        <Route path="nota/:id" element={<NoteEditor />} />
        <Route path="*" element={<NotesList onSearchSubmit={onSearchSubmit} />} />
      </Routes>
    </ApiContext>
  );
}
