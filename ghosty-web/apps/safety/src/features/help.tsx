import { Banner, Button, Card, Spinner } from '@ghosty/ui';
import { useEffect, useId, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  getCurrentLocation,
  triggerHelpRequest,
  useApi,
  useCancelHelpRequest,
  useHelpRequest,
  type DeliveryStep,
  type HelpRequest,
  type Location,
  type Mode,
} from './api';
import styles from './safety.module.css';

export const HOLD_MS = 2_000;
/** Sem resposta da Function depois disso, a tela avisa que o envio ainda está sendo processado. */
export const SLOW_DISPATCH_MS = 60_000;

export const DISCLAIMER =
  'O Ghosty avisa a sua rede de apoio. Ele não chama a polícia nem outros serviços de emergência. ' +
  'Em perigo imediato, ligue 190.';

// ---------------------------------------------------------------- HoldButton

/**
 * Só dispara se for segurado por 2 segundos, com um anel de progresso. Soltar ou sair do botão antes
 * cancela. Pelo teclado, segurar Espaço ou Enter.
 */
export function HoldButton({
  label,
  onComplete,
  disabled,
}: {
  label: string;
  /** Recebe quanto tempo o botão ficou segurado, em milissegundos. */
  onComplete: (heldMs: number) => void;
  disabled?: boolean;
}) {
  const hintId = useId();
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef(0);

  const cancel = () => {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };

  const start = () => {
    if (disabled || timer.current !== null) return;
    startedAt.current = Date.now();
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onComplete(Date.now() - startedAt.current);
    }, HOLD_MS);
  };

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const isHoldKey = (key: string) => key === ' ' || key === 'Enter';

  return (
    <div className={styles.holdWrap}>
      <button
        type="button"
        className={styles.holdButton}
        data-holding={holding}
        disabled={disabled}
        aria-describedby={hintId}
        onPointerDown={start}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (!isHoldKey(event.key)) return;
          event.preventDefault();
          if (!event.repeat) start();
        }}
        onKeyUp={(event) => {
          if (isHoldKey(event.key)) cancel();
        }}
        onBlur={cancel}
      >
        <span className={styles.holdRing} aria-hidden="true" />
        <span>{label}</span>
      </button>
      <span id={hintId} className={styles.hint}>
        Segure por 2 segundos
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- Countdown

/** Contagem antes de enviar, com o "Cancelar" grande e já focado. Cancelar não chama a API. */
export function Countdown({
  seconds,
  onDone,
  onCancel,
}: {
  seconds: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [remaining, setRemaining] = useState(seconds);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const left = Math.max(0, seconds - Math.floor((Date.now() - startedAt) / 1000));
      setRemaining(left);
      if (left === 0) {
        clearInterval(timer);
        done.current();
      }
    }, 250);
    return () => clearInterval(timer);
  }, [seconds]);

  return (
    <div className={styles.countdown}>
      <p className={styles.countdownNumber} aria-live="polite">
        Enviando em {remaining} s
      </p>
      <Button variant="secondary" block autoFocus onClick={onCancel} className={styles.bigButton}>
        Cancelar
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------- HelpFlow

export interface HelpReport {
  heldMs: number;
  countdownSeconds: number;
  /** `null`: sem permissão, sem GPS ou sem resposta a tempo. */
  location: Location | null;
  locationRequested: boolean;
}

type Phase =
  { kind: 'idle' } | { kind: 'countdown'; heldMs: number } | { kind: 'sending' } | { kind: 'error' };

/**
 * Segurar por 2 segundos → contagem regressiva → localização (se a pessoa ativou) → `POST
 * /safety/help-requests`. No modo `test` (Teste seguro), o mesmo caminho, e nada é enviado.
 */
export function HelpFlow({
  mode,
  countdownSeconds,
  includeLocation,
  label,
  onTriggered,
}: {
  mode: Mode;
  countdownSeconds: number;
  includeLocation: boolean;
  label: string;
  onTriggered: (request: HelpRequest, report: HelpReport) => void;
}) {
  const api = useApi();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  const send = async (heldMs: number) => {
    setPhase({ kind: 'sending' });
    const location = includeLocation ? await getCurrentLocation() : null;
    try {
      const request = await triggerHelpRequest(api, mode, location);
      setPhase({ kind: 'idle' });
      onTriggered(request, { heldMs, countdownSeconds, location, locationRequested: includeLocation });
    } catch {
      setPhase({ kind: 'error' });
    }
  };

  if (phase.kind === 'countdown') {
    return (
      <Countdown
        seconds={countdownSeconds}
        onCancel={() => setPhase({ kind: 'idle' })}
        onDone={() => void send(phase.heldMs)}
      />
    );
  }
  if (phase.kind === 'sending') return <Spinner label={mode === 'test' ? 'Ensaiando' : 'Enviando'} />;
  return (
    <div className={styles.stack}>
      {phase.kind === 'error' && (
        <Banner tone="alert">
          Não foi possível registrar o pedido agora. Tente de novo. Em perigo imediato, ligue 190.
        </Banner>
      )}
      <HoldButton label={label} onComplete={(heldMs) => setPhase({ kind: 'countdown', heldMs })} />
    </div>
  );
}

// ---------------------------------------------------------------- Timeline

const OUTCOME_TEXT: Record<DeliveryStep['outcome'], string> = {
  sent: 'Enviado',
  published_web: 'Publicado na página do contato',
  would_send: 'Teria sido enviado',
  failed: 'Falhou',
  skipped_unconfirmed: 'Não recebeu: ainda não confirmou o convite',
  no_contacts: 'Ninguém para avisar: nenhum contato confirmado',
};

const CHANNEL_TEXT: Record<DeliveryStep['channel'], string> = {
  telegram: 'Telegram',
  web: 'Página web',
  none: '—',
};

const STATUS_TEXT: Record<HelpRequest['status'], { real: string; test: string }> = {
  triggered: { real: 'Avisando a sua rede…', test: 'Ensaiando o envio…' },
  dispatched: { real: 'Avisos enviados', test: 'Ensaio concluído' },
  failed: { real: 'Não foi possível avisar ninguém', test: 'O ensaio não alcançou ninguém' },
  cancelled: { real: 'Marcado como engano', test: 'Ensaio cancelado' },
};

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** O que aconteceu com cada contato, na ordem de aviso. */
export function Timeline({
  request,
  updatedAt,
}: {
  request: HelpRequest;
  /** Quando a consulta mais recente chegou (`dataUpdatedAt`): mede a demora sem relógio no render. */
  updatedAt: number;
}) {
  const test = request.mode === 'test';
  const slow =
    request.status === 'triggered' && updatedAt - new Date(request.createdAt).getTime() > SLOW_DISPATCH_MS;
  return (
    <Card>
      <h2 className={styles.title}>
        {STATUS_TEXT[request.status][test ? 'test' : 'real']}{' '}
        {test && <span className={styles.badge}>Ensaio</span>}
      </h2>
      {test && (
        <Banner tone="info">
          Nada foi enviado: no Teste seguro nenhuma mensagem sai, nem pelo Telegram nem pela página web.
        </Banner>
      )}
      {request.status === 'triggered' &&
        (slow ? <Banner tone="warning">Ainda processando…</Banner> : <Spinner />)}
      {request.location === null && request.status !== 'triggered' && (
        <p className={styles.hint}>Sem localização: o aviso seguiu sem o mapa.</p>
      )}
      {request.steps.length > 0 && (
        <ol className={styles.timeline}>
          {request.steps.map((step) => (
            <li key={step.id} className={styles.step} data-outcome={step.outcome}>
              <div className={styles.row}>
                <strong>
                  {step.stepOrder}. {step.contactNickname ?? (step.contactId ? 'Contato removido' : 'Rede')}
                </strong>
                <span className={styles.hint}>
                  {CHANNEL_TEXT[step.channel]} · {OUTCOME_TEXT[step.outcome]} · {time(step.occurredAt)}
                </span>
              </div>
              {step.errorCode && <span className={styles.hint}>Erro: {step.errorCode}</span>}
              {step.message && <p className={styles.preview}>{step.message}</p>}
            </li>
          ))}
        </ol>
      )}
      <p className={styles.hint}>{DISCLAIMER}</p>
    </Card>
  );
}

/** O relatório do Teste seguro: o tempo segurado, a contagem e a localização obtida. */
export function HelpReportCard({ report }: { report: HelpReport }) {
  return (
    <Card>
      <h2 className={styles.title}>O que aconteceu antes do envio</h2>
      <ul className={styles.items}>
        <li>Botão segurado por {(report.heldMs / 1000).toFixed(1).replace('.', ',')} s</li>
        <li>Contagem de {report.countdownSeconds} s</li>
        <li>
          {!report.locationRequested
            ? 'Localização desligada na mensagem'
            : report.location
              ? `Localização obtida${report.location.accuracyMeters !== null ? ` (precisão de ${report.location.accuracyMeters} m)` : ''}`
              : 'Localização indisponível (sem permissão ou sem resposta em 8 s)'}
        </li>
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------- tela /ajuda/:id

/** Acompanha um pedido de ajuda: linha do tempo em polling e "Foi engano". */
export function HelpRequestScreen() {
  const { helpRequestId = null } = useParams();
  const navigate = useNavigate();
  const report = (useLocation().state as { report?: HelpReport } | null)?.report;
  const query = useHelpRequest(helpRequestId);
  const cancel = useCancelHelpRequest();

  if (query.isPending) return <Spinner />;
  if (query.isError) return <Banner tone="alert">Não foi possível carregar o pedido agora.</Banner>;
  const request = query.data;
  const cancellable =
    request.mode === 'real' && (request.status === 'triggered' || request.status === 'dispatched');

  return (
    <div className={styles.stack}>
      <h1 className={styles.heading}>{request.mode === 'test' ? 'Teste seguro' : 'Pedido de ajuda'}</h1>
      {report && <HelpReportCard report={report} />}
      <Timeline request={request} updatedAt={query.dataUpdatedAt} />
      {cancellable && (
        <Button variant="secondary" onClick={() => cancel.mutate(request.id)} disabled={cancel.isPending}>
          Foi engano
        </Button>
      )}
      {request.status === 'cancelled' && (
        <p className={styles.hint}>
          Registrado como engano. Os avisos que já saíram não são desfeitos: se precisar, fale com a sua rede.
        </p>
      )}
      <Button variant="ghost" onClick={() => navigate('/painel')}>
        Voltar ao painel
      </Button>
    </div>
  );
}
