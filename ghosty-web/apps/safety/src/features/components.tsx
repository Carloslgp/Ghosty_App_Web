import { Banner, Button, Card, EmptyState, Spinner, TextArea, TextField } from '@ghosty/ui';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  fetchPreview,
  useAddContact,
  useApi,
  useContacts,
  useCreateInvitation,
  useRemoveContact,
  useReorderContacts,
  type AggregatedData,
  type AlertSettings,
  type Contact,
  type MessagePreview,
} from './api';
import styles from './safety.module.css';

// ---------------------------------------------------------------- saída rápida e canais oficiais

/** Sempre visível. Esc duas vezes em até 1 segundo também aciona. */
export function QuickExitButton({ onQuickExit }: { onQuickExit: () => void }) {
  const lastEsc = useRef(0);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const now = Date.now();
      if (now - lastEsc.current <= 1000) onQuickExit();
      lastEsc.current = now;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onQuickExit]);
  return (
    <Button variant="secondary" onClick={onQuickExit}>
      Voltar às notas
    </Button>
  );
}

/** 190, 180 e 192 como links `tel:`. O Ghosty só mostra os números: não liga nem avisa ninguém. */
export function OfficialChannels() {
  const channels = [
    { number: '190', name: 'Polícia Militar' },
    { number: '180', name: 'Central de Atendimento à Mulher' },
    { number: '192', name: 'SAMU' },
  ];
  return (
    <nav aria-label="Canais oficiais" className={styles.channels}>
      {channels.map((channel) => (
        <a key={channel.number} href={`tel:${channel.number}`} className={styles.channel}>
          <strong>{channel.number}</strong> <span>{channel.name}</span>
        </a>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------- prontidão

const LEVEL_TEXT = { ready: 'Pronta', almost: 'Quase pronta', attention: 'Precisa de atenção' } as const;

export function ReadinessCard({ data }: { data: AggregatedData }) {
  const { readiness, sources } = data;
  return (
    <Card>
      <h2 className={styles.title}>Prontidão: {readiness.score} de 100</h2>
      <p className={styles.level} data-level={readiness.level}>
        {LEVEL_TEXT[readiness.level]}
      </p>
      {sources.readiness === 'fallback' && (
        <Banner tone="warning">Cálculo simplificado: o serviço de prontidão não respondeu agora.</Banner>
      )}
      <ul className={`${styles.items} ${styles.marked}`}>
        {readiness.items.map((item) => (
          <li key={item.id} data-ok={item.ok}>
            <span aria-hidden="true">{item.ok ? '✓' : '•'}</span> {item.text}
            {item.recommendation && <span className={styles.hint}> {item.recommendation}</span>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------- rede de apoio

const STATUS_TEXT = { pending: 'Convite pendente', confirmed: 'Confirmado', declined: 'Recusou' } as const;
const CHANNEL_TEXT = { telegram: 'Telegram', web: 'Página web' } as const;

/** A ordem de aviso, com ↑ e ↓ acessíveis pelo teclado. Reordenar chama `PUT /safety/contacts/order`. */
export function ContactList() {
  const contacts = useContacts();
  const add = useAddContact();
  const reorder = useReorderContacts();
  const remove = useRemoveContact();
  const invite = useCreateInvitation();
  const [nickname, setNickname] = useState('');
  const [links, setLinks] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const move = (list: Contact[], index: number, delta: -1 | 1) => {
    const ids = list.map((contact) => contact.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved as string);
    reorder.mutate(ids);
  };

  const onAdd = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!nickname.trim()) return;
    try {
      await add.mutateAsync(nickname.trim());
      setNickname('');
    } catch {
      setError('Não foi possível adicionar. A rede tem no máximo 10 contatos.');
    }
  };

  const onInvite = async (contactId: string) => {
    const created = await invite.mutateAsync(contactId);
    setLinks((current) => ({ ...current, [contactId]: created.inviteUrl }));
  };

  if (contacts.isPending) return <Spinner />;
  if (contacts.isError) return <Banner tone="alert">Não foi possível carregar a rede de apoio.</Banner>;
  const list = contacts.data;

  return (
    <div className={styles.stack}>
      {list.length === 0 && <EmptyState>Sua rede de apoio ainda está vazia.</EmptyState>}
      <ol className={styles.contacts}>
        {list.map((contact, index) => (
          <li key={contact.id} className={styles.contact}>
            <div>
              <strong>
                {index + 1}. {contact.nickname}
              </strong>
              <span className={styles.hint}>
                {STATUS_TEXT[contact.status]}
                {contact.channel ? ` · ${CHANNEL_TEXT[contact.channel]}` : ''}
              </span>
            </div>
            <div className={styles.row}>
              <Button
                variant="ghost"
                aria-label={`Subir ${contact.nickname}`}
                disabled={index === 0 || reorder.isPending}
                onClick={() => move(list, index, -1)}
              >
                ↑
              </Button>
              <Button
                variant="ghost"
                aria-label={`Descer ${contact.nickname}`}
                disabled={index === list.length - 1 || reorder.isPending}
                onClick={() => move(list, index, 1)}
              >
                ↓
              </Button>
              <Button variant="secondary" onClick={() => onInvite(contact.id)}>
                Gerar convite
              </Button>
              <Button
                variant="ghost"
                aria-label={`Remover ${contact.nickname}`}
                onClick={() => remove.mutate(contact.id)}
              >
                Remover
              </Button>
            </div>
            {links[contact.id] && (
              <div className={styles.row}>
                <TextField
                  label={`Link do convite de ${contact.nickname}`}
                  readOnly
                  value={links[contact.id]}
                />
                <Button
                  variant="secondary"
                  onClick={() => void navigator.clipboard?.writeText(links[contact.id] ?? '')}
                >
                  Copiar link
                </Button>
              </div>
            )}
          </li>
        ))}
      </ol>
      <form onSubmit={onAdd} className={styles.row}>
        <TextField
          label="Apelido do contato"
          value={nickname}
          maxLength={40}
          onChange={(e) => setNickname(e.target.value)}
        />
        <Button type="submit" disabled={add.isPending}>
          Adicionar
        </Button>
      </form>
      {error && <Banner tone="alert">{error}</Banner>}
      <p className={styles.hint}>
        O Ghosty não envia o convite: copie o link e mande como preferir. Ele vale 72 horas. O contato escolhe
        receber os avisos pelo Telegram ou por uma página web.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- mensagem

export const PREVIEW_DEBOUNCE_MS = 500;

/** Edição com prévia ao vivo (500 ms depois da última tecla) e contagem contra os 4.096 caracteres. */
export function MessageEditor({
  settings,
  onSave,
  saving,
}: {
  settings: AlertSettings;
  onSave: (
    values: Pick<
      AlertSettings,
      'messageTemplate' | 'includeLocation' | 'countdownSeconds' | 'checkInToleranceMinutes'
    >,
  ) => void;
  saving: boolean;
}) {
  const api = useApi();
  const [template, setTemplate] = useState(settings.messageTemplate);
  const [includeLocation, setIncludeLocation] = useState(settings.includeLocation);
  const [countdown, setCountdown] = useState(settings.countdownSeconds);
  const [preview, setPreview] = useState<MessagePreview | null>(null);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void fetchPreview(api, template)
        .then((result) => active && setPreview(result))
        .catch(() => active && setPreview(null));
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, template]);

  const overLimit = preview !== null && !preview.withinLimit;

  return (
    <form
      className={styles.stack}
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          messageTemplate: template,
          includeLocation,
          countdownSeconds: countdown,
          checkInToleranceMinutes: settings.checkInToleranceMinutes,
        });
      }}
    >
      <TextArea
        label="Mensagem"
        hint="Campos: {apelido}, {nome}, {local} e {hora}"
        value={template}
        maxLength={3800}
        rows={6}
        onChange={(e) => setTemplate(e.target.value)}
      />
      <Card>
        <h3 className={styles.title}>Prévia</h3>
        {preview ? (
          <>
            <p className={styles.preview}>{preview.text}</p>
            <p className={styles.hint} aria-live="polite">
              {preview.characters} de {preview.limit} caracteres
            </p>
          </>
        ) : (
          <p className={styles.hint}>Montando a prévia…</p>
        )}
      </Card>
      {overLimit && (
        <Banner tone="alert">A mensagem passa do limite do Telegram. Encurte o texto para salvar.</Banner>
      )}
      <label className={styles.row}>
        <input
          type="checkbox"
          checked={includeLocation}
          onChange={(e) => setIncludeLocation(e.target.checked)}
        />{' '}
        Incluir minha localização no aviso
      </label>
      <TextField
        label="Contagem antes de enviar (segundos)"
        type="number"
        min={5}
        max={60}
        value={countdown}
        onChange={(e) => setCountdown(Number(e.target.value))}
      />
      <Button type="submit" disabled={saving || overLimit || countdown < 5 || countdown > 60}>
        Salvar mensagem
      </Button>
    </form>
  );
}
