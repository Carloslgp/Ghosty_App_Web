import type { NotesAppProps, SafetyAppProps } from '@ghosty/api-client';
import { Banner, Spinner } from '@ghosty/ui';
import { loadRemote, registerRemotes } from '@module-federation/runtime';
import {
  Component,
  createContext,
  use,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';

export interface RemoteLoaders {
  notes: () => Promise<{ default: ComponentType<NotesAppProps> }>;
  /** O `safety` é registrado na hora, com a URL que o BFF devolve no desbloqueio. */
  safety: (remoteUrl: string) => Promise<{ default: ComponentType<SafetyAppProps> }>;
}

export const defaultLoaders: RemoteLoaders = {
  notes: () => import('notes/App'),
  async safety(remoteUrl) {
    registerRemotes([{ name: 'safety', entry: remoteUrl, type: 'module' }], { force: true });
    const remote = await loadRemote<{ default: ComponentType<SafetyAppProps> }>('safety/App');
    if (!remote) throw new Error('Remote indisponível.');
    return remote;
  },
};

const LoadersContext = createContext<RemoteLoaders>(defaultLoaders);

/** Os testes trocam os carregadores (não há remotes de verdade no jsdom). */
export function RemoteLoadersProvider({
  loaders,
  children,
}: {
  loaders: RemoteLoaders;
  children: ReactNode;
}) {
  return <LoadersContext value={loaders}>{children}</LoadersContext>;
}

/** Erro dentro do remote (depois de carregado) não derruba o shell. */
class RemoteBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

type RemoteState<P> =
  { status: 'loading' } | { status: 'ready'; Component: ComponentType<P> } | { status: 'failed' };

/** Carrega o módulo do remote e guarda o componente em estado (o componente nunca é criado na renderização). */
function useRemote<P>(load: () => Promise<{ default: ComponentType<P> }>): RemoteState<P> {
  const [state, setState] = useState<RemoteState<P>>({ status: 'loading' });
  useEffect(() => {
    let active = true;
    load().then(
      (module) => active && setState({ status: 'ready', Component: module.default }),
      () => active && setState({ status: 'failed' }),
    );
    return () => {
      active = false;
    };
  }, [load]);
  return state;
}

const loading = (
  <div style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
    <Spinner />
  </div>
);

const notesFailed = <Banner tone="alert">Não foi possível carregar as notas. Recarregue a página.</Banner>;

export function NotesHost(props: NotesAppProps) {
  const loaders = use(LoadersContext);
  const remote = useRemote(loaders.notes);
  if (remote.status === 'loading') return loading;
  if (remote.status === 'failed') return notesFailed;
  return (
    <RemoteBoundary fallback={notesFailed}>
      <remote.Component {...props} />
    </RemoteBoundary>
  );
}

export function SafetyHost({ remoteUrl, ...props }: SafetyAppProps & { remoteUrl: string }) {
  const loaders = use(LoadersContext);
  const [load] = useState(() => () => loaders.safety(remoteUrl));
  const remote = useRemote(load);
  if (remote.status === 'loading') return loading;
  // Se o remote falhar, nada de mensagem que revele outra área: a saída rápida devolve as notas.
  if (remote.status === 'failed') return null;
  return (
    <RemoteBoundary fallback={null}>
      <remote.Component {...props} />
    </RemoteBoundary>
  );
}
