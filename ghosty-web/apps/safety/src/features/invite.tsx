import type { ApiClient, InviteAppProps, Schemas } from '@ghosty/api-client';
import { Banner, Button, Card, Spinner } from '@ghosty/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './safety.module.css';

type InvitationPage = Schemas['InvitationPage'];
type Alert = Schemas['InvitationAlerts']['items'][number];

export const ALERTS_POLL_MS = 5_000;

class InviteError extends Error {
  constructor(readonly status: number) {
    super(`Convite: ${status}`);
  }
}

async function getInvitation(api: ApiClient, token: string): Promise<InvitationPage> {
  const { data, response } = await api.GET('/invitations/{token}', { params: { path: { token } } });
  if (!data) throw new InviteError(response.status);
  return data;
}

/**
 * Os avisos do contato do canal web, consultados a cada 5 segundos com `since` (só o que é novo). A página
 * precisa ficar aberta: ainda não existe notificação push.
 */
export function AlertsPanel({ api, token, inviter }: { api: ApiClient; token: string; inviter: string }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [failed, setFailed] = useState(false);
  const since = useRef<string | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      const { data } = await api.GET('/invitations/{token}/alerts', {
        params: { path: { token }, query: since.current ? { since: since.current } : {} },
      });
      if (!active) return;
      setFailed(!data);
      if (!data || data.items.length === 0) return;
      since.current = data.items[0]?.publishedAt;
      setAlerts((current) => {
        const known = new Set(current.map((alert) => `${alert.helpRequestId}:${alert.publishedAt}`));
        const fresh = data.items.filter((alert) => !known.has(`${alert.helpRequestId}:${alert.publishedAt}`));
        return [...fresh, ...current];
      });
    };
    void poll().catch(() => active && setFailed(true));
    const timer = setInterval(() => void poll().catch(() => active && setFailed(true)), ALERTS_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api, token]);

  return (
    <div className={styles.stack}>
      <Card>
        <h2 className={styles.title}>Você está na rede de apoio de {inviter}</h2>
        <p>
          Os avisos aparecem aqui enquanto esta página estiver aberta (ela atualiza a cada 5 segundos). Para
          não depender da página aberta, prefira o Telegram.
        </p>
      </Card>
      {failed && <Banner tone="warning">Sem conexão agora. Tentando de novo…</Banner>}
      {alerts.length === 0 ? (
        <p className={styles.hint}>Nenhum aviso por enquanto.</p>
      ) : (
        <div role="alert" className={styles.stack}>
          {alerts.map((alert) => (
            <Card key={`${alert.helpRequestId}:${alert.publishedAt}`}>
              <p className={styles.preview}>{alert.message}</p>
              <p className={styles.hint}>
                Recebido em{' '}
                {new Date(alert.publishedAt).toLocaleString('pt-BR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Neutral({ children }: { children: ReactNode }) {
  return (
    <main className={styles.invite}>
      <Card>{children}</Card>
    </main>
  );
}

/**
 * Página pública do convite (`/c/:token`): aceitar pelo Telegram, aceitar pelo navegador ou recusar. Aceito
 * pelo navegador, a mesma página vira o painel de avisos. Token desconhecido: tela neutra.
 */
export function InvitePage({ api, token }: InviteAppProps) {
  const invitation = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => getInvitation(api, token),
    retry: false,
  });
  const [choseTelegram, setChoseTelegram] = useState(false);

  const respond = useMutation({
    mutationFn: async (choice: 'telegram' | 'web' | 'decline') => {
      const result =
        choice === 'decline'
          ? await api.POST('/invitations/{token}/decline', { params: { path: { token } } })
          : await api.POST('/invitations/{token}/accept', {
              params: { path: { token } },
              body: { channel: choice },
            });
      if (!result.data) throw new InviteError(result.response.status);
      return { choice, page: result.data };
    },
    onSuccess: ({ choice }) => {
      if (choice === 'telegram') setChoseTelegram(true);
      void invitation.refetch();
    },
  });

  if (invitation.isPending) {
    return (
      <Neutral>
        <Spinner />
      </Neutral>
    );
  }
  if (invitation.isError) {
    const expired = invitation.error instanceof InviteError && invitation.error.status === 410;
    return (
      <Neutral>
        <p>
          {expired
            ? 'Este convite venceu. Peça um link novo para quem convidou você.'
            : 'Este link não é válido.'}
        </p>
      </Neutral>
    );
  }

  const page = invitation.data;
  const name = page.inviterDisplayName;

  if (page.status === 'confirmed' && page.channel === 'web') {
    return (
      <main className={styles.invite}>
        <AlertsPanel api={api} token={token} inviter={name} />
      </main>
    );
  }
  if (page.status === 'confirmed') {
    return (
      <Neutral>
        <p>
          Você está na rede de apoio de {name} pelo Telegram. Se essa pessoa pedir ajuda, o aviso chega na
          conversa com o bot. Para sair, envie /parar ao bot.
        </p>
      </Neutral>
    );
  }
  if (page.status === 'declined') {
    return (
      <Neutral>
        <p>Você recusou o convite. Nada mais vai chegar por este link.</p>
      </Neutral>
    );
  }
  if (choseTelegram) {
    return (
      <Neutral>
        <h1 className={styles.heading}>Falta um passo no Telegram</h1>
        <p>
          Abra a conversa com o bot e toque em <strong>Iniciar</strong>. Só então você entra na rede de apoio
          de {name}: um bot do Telegram não pode puxar conversa, quem começa é você.
        </p>
        <a className={styles.linkButton} href={page.telegramUrl} target="_blank" rel="noreferrer noopener">
          Abrir no Telegram
        </a>
        <Button variant="ghost" onClick={() => setChoseTelegram(false)}>
          Escolher outra opção
        </Button>
      </Neutral>
    );
  }

  return (
    <Neutral>
      <h1 className={styles.heading}>{name} quer ter você na rede de apoio</h1>
      <p>
        Se aceitar, você pode receber um aviso caso essa pessoa precise de ajuda. O convite vale até{' '}
        {new Date(page.expiresAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} e só
        pode ser respondido uma vez.
      </p>
      {respond.isError && <Banner tone="alert">Não foi possível registrar a resposta. Tente de novo.</Banner>}
      <div className={styles.stack}>
        <Button block disabled={respond.isPending} onClick={() => respond.mutate('telegram')}>
          Aceitar pelo Telegram
        </Button>
        <Button block variant="secondary" disabled={respond.isPending} onClick={() => respond.mutate('web')}>
          Aceitar pelo navegador
        </Button>
        <Button block variant="ghost" disabled={respond.isPending} onClick={() => respond.mutate('decline')}>
          Recusar
        </Button>
      </div>
      <p className={styles.hint}>
        Pelo Telegram, o aviso chega mesmo com esta página fechada. Pelo navegador, ele só aparece enquanto
        esta página estiver aberta. O Ghosty não pede nem guarda o seu telefone.
      </p>
    </Neutral>
  );
}
