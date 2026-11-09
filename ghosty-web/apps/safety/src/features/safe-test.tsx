import { Banner, Button, Card, Spinner } from '@ghosty/ui';
import { useEffect, useState } from 'react';
import { ApiError, useAlertSettings, useApi, useCheckIn, useHelpRequest, type HelpRequest } from './api';
import { HelpFlow, HelpReportCard, Timeline, type HelpReport } from './help';
import styles from './safety.module.css';

/** O ensaio do check-in vence em pouco mais de 1 minuto (o mínimo aceito é 1 minuto). */
export const TEST_CHECK_IN_SECONDS = 70;

function HelpRequestTimeline({ helpRequestId }: { helpRequestId: string }) {
  const query = useHelpRequest(helpRequestId);
  if (query.isPending) return <Spinner />;
  if (query.isError) return <Banner tone="alert">Não foi possível carregar o ensaio.</Banner>;
  return <Timeline request={query.data} updatedAt={query.dataUpdatedAt} />;
}

/** Ensaio do pedido de ajuda: o mesmo caminho do botão de verdade, com `mode: test`. */
function HelpRehearsal({
  countdownSeconds,
  includeLocation,
}: {
  countdownSeconds: number;
  includeLocation: boolean;
}) {
  const [run, setRun] = useState<{ request: HelpRequest; report: HelpReport } | null>(null);
  return (
    <Card>
      <h2 className={styles.title}>1. Ensaiar o pedido de ajuda</h2>
      {run ? (
        <div className={styles.stack}>
          <HelpReportCard report={run.report} />
          <HelpRequestTimeline helpRequestId={run.request.id} />
          <Button variant="secondary" onClick={() => setRun(null)}>
            Ensaiar de novo
          </Button>
        </div>
      ) : (
        <HelpFlow
          mode="test"
          label="Ensaiar pedido de ajuda"
          countdownSeconds={countdownSeconds}
          includeLocation={includeLocation}
          onTriggered={(request, report) => setRun({ request, report })}
        />
      )}
    </Card>
  );
}

/** Ensaio do check-in: prazo de pouco mais de 1 minuto, sem tolerância. Quando vence, vira o ensaio do aviso. */
function CheckInRehearsal() {
  const api = useApi();
  const [checkInId, setCheckInId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [starting, setStarting] = useState(false);
  const checkIn = useCheckIn(checkInId);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (checkIn.data?.status !== 'active') return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [checkIn.data?.status]);

  const start = async () => {
    setError(false);
    setStarting(true);
    try {
      const {
        data,
        error: problem,
        response,
      } = await api.POST('/safety/check-ins', {
        params: { header: { 'Idempotency-Key': globalThis.crypto.randomUUID() } },
        body: {
          destination: 'Teste seguro',
          dueAt: new Date(Date.now() + TEST_CHECK_IN_SECONDS * 1000).toISOString(),
          toleranceMinutes: 0,
          mode: 'test',
        },
      });
      if (data) {
        setCheckInId(data.id);
        return;
      }
      // Já existe um ensaio em andamento: continua de onde parou.
      if (response.status === 409) {
        const active = await api.GET('/safety/check-ins', {
          params: { query: { status: 'active', mode: 'test' } },
        });
        const current = active.data?.items[0];
        if (current) {
          setCheckInId(current.id);
          return;
        }
      }
      throw new ApiError(problem, response.status);
    } catch {
      setError(true);
    } finally {
      setStarting(false);
    }
  };

  const data = checkIn.data;
  const secondsLeft = data ? Math.max(0, Math.ceil((new Date(data.deadlineAt).getTime() - now) / 1000)) : 0;

  return (
    <Card>
      <h2 className={styles.title}>2. Ensaiar o check-in (prazo de 1 minuto)</h2>
      {error && <Banner tone="alert">Não foi possível iniciar o ensaio do check-in agora.</Banner>}
      {!checkInId && (
        <Button variant="secondary" onClick={() => void start()} disabled={starting}>
          Iniciar ensaio do check-in
        </Button>
      )}
      {checkInId && checkIn.isPending && <Spinner />}
      {data?.status === 'active' && (
        <p aria-live="polite">
          {secondsLeft > 0
            ? `O prazo vence em ${secondsLeft} s. Não confirme: o ensaio mostra o que acontece se você não chegar.`
            : 'Prazo vencido. Aguardando o aviso de ensaio…'}
        </p>
      )}
      {data?.status === 'expired' &&
        (data.helpRequestId ? (
          <HelpRequestTimeline helpRequestId={data.helpRequestId} />
        ) : (
          <Spinner label="Preparando o ensaio do aviso" />
        ))}
    </Card>
  );
}

/**
 * Teste seguro: ensaia o fluxo inteiro com `mode: test`. Nada é enviado, nem pelo Telegram nem pela
 * página web: cada passo termina em "teria sido enviado".
 */
export function SafeTestScreen() {
  const settings = useAlertSettings();
  return (
    <div className={styles.stack}>
      <h1 className={styles.heading}>Teste seguro</h1>
      <Banner tone="info">
        Ensaio: o caminho é o mesmo de um pedido de verdade, mas nenhuma mensagem sai. Faça um teste por mês
        para manter a prontidão em dia.
      </Banner>
      {settings.isPending && <Spinner />}
      {settings.isError && <Banner tone="alert">Não foi possível carregar a mensagem agora.</Banner>}
      {settings.isSuccess && (
        <HelpRehearsal
          countdownSeconds={settings.data.countdownSeconds}
          includeLocation={settings.data.includeLocation}
        />
      )}
      <CheckInRehearsal />
    </div>
  );
}
