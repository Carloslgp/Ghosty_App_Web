declare module 'notes/App' {
  import type { ComponentType } from 'react';
  import type { NotesAppProps } from '@ghosty/api-client';

  const App: ComponentType<NotesAppProps>;
  export default App;
}
