import { Banner, Card, Spinner } from '@ghosty/ui';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { InviteHost } from '../notes/RemoteHosts';
import styles from './pages.module.css';

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

type Lookup = { kind: 'ok'; remoteUrl: string } | { kind: 'expired' } | { kind: 'invalid' };

/**
 * `/c/:token`: página pública, sem login. O shell só baixa o remote do convite se o BFF confirmar que o
 * token é válido (a resposta traz o `remoteUrl`). Token desconhecido: tela neutra, sem nada do Ghosty.
 */
export function InvitePage() {
  const { token = '' } = useParams();
  const { api } = useAuth();
  const valid = TOKEN.test(token);
  const lookup = useQuery({
    queryKey: ['invitation-lookup', token],
    enabled: valid,
    retry: false,
    queryFn: async (): Promise<Lookup> => {
      const { data, response } = await api.GET('/invitations/{token}', { params: { path: { token } } });
      if (data) return { kind: 'ok', remoteUrl: data.remoteUrl };
      if (response.status === 410) return { kind: 'expired' };
      if (response.status === 404) return { kind: 'invalid' };
      throw new Error(`Convite: ${response.status}`);
    },
  });

  if (!valid || lookup.data?.kind === 'invalid') {
    return (
      <main className={styles.page}>
        <Card>
          <p>Este link não é válido.</p>
        </Card>
      </main>
    );
  }
  if (lookup.isPending) {
    return (
      <main className={styles.page}>
        <Spinner />
      </main>
    );
  }
  if (lookup.isError) {
    return (
      <main className={styles.page}>
        <Banner tone="alert">Não foi possível abrir o link agora. Tente de novo em instantes.</Banner>
      </main>
    );
  }
  if (lookup.data.kind === 'expired') {
    return (
      <main className={styles.page}>
        <Card>
          <p>Este convite venceu. Peça um link novo para quem convidou você.</p>
        </Card>
      </main>
    );
  }
  return <InviteHost remoteUrl={lookup.data.remoteUrl} api={api} token={token} />;
}
