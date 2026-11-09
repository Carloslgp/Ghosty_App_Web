import { Banner, Button, Card, Spinner, TextField } from '@ghosty/ui';
import { useState, type FormEvent } from 'react';
import {
  useActiveCheckIn,
  useCancelCheckIn,
  useConfirmArrival,
  useExtendCheckIn,
  useStartCheckIn,
  type CheckIn,
} from './api';
import styles from './safety.module.css';

const MINUTE = 60_000;

export interface CheckInInput {
  destination: string;
  /** `HH:MM`, no horário local. */
  time: string;
  toleranceMinutes: string;
}

export interface CheckInValidation {
  errors: Partial<Record<keyof CheckInInput, string>>;
  value?: { destination: string; dueAt: Date; toleranceMinutes: number };
}

/** O próximo `HH:MM`: hoje, ou amanhã se o horário já passou (ou falta menos de 1 minuto). */
export function nextOccurrence(time: string, now: Date): Date | null {
  const match = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(time);
  if (!match) return null;
  const due = new Date(now);
  due.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (due.getTime() - now.getTime() < MINUTE) due.setDate(due.getDate() + 1);
  return due;
}

export function validateCheckIn(input: CheckInInput, now: Date): CheckInValidation {
  const errors: CheckInValidation['errors'] = {};
  const destination = input.destination.trim();
  if (destination.length === 0) errors.destination = 'Informe para onde você vai.';
  else if (destination.length > 120) errors.destination = 'Use até 120 caracteres.';
  const dueAt = nextOccurrence(input.time, now);
  if (!dueAt) errors.time = 'Informe o horário em que pretende chegar.';
  const tolerance = Number(input.toleranceMinutes);
  if (
    input.toleranceMinutes.trim() === '' ||
    !Number.isInteger(tolerance) ||
    tolerance < 0 ||
    tolerance > 60
  ) {
    errors.toleranceMinutes = 'De 0 a 60 minutos.';
  }
  if (Object.keys(errors).length > 0 || !dueAt) return { errors };
  return { errors, value: { destination, dueAt, toleranceMinutes: tolerance } };
}

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Destino, horário e tolerância. */
export function CheckInForm({ defaultTolerance }: { defaultTolerance: number }) {
  const start = useStartCheckIn();
  const [input, setInput] = useState<CheckInInput>({
    destination: '',
    time: '',
    toleranceMinutes: String(defaultTolerance),
  });
  const [errors, setErrors] = useState<CheckInValidation['errors']>({});

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const result = validateCheckIn(input, new Date());
    setErrors(result.errors);
    if (!result.value) return;
    start.mutate({
      destination: result.value.destination,
      dueAt: result.value.dueAt.toISOString(),
      toleranceMinutes: result.value.toleranceMinutes,
      mode: 'real',
    });
  };

  return (
    <form className={styles.stack} onSubmit={onSubmit} noValidate>
      <TextField
        label="Para onde você vai"
        value={input.destination}
        maxLength={120}
        error={errors.destination}
        onChange={(e) => setInput({ ...input, destination: e.target.value })}
      />
      <TextField
        label="Horário em que pretende chegar"
        type="time"
        value={input.time}
        error={errors.time}
        onChange={(e) => setInput({ ...input, time: e.target.value })}
      />
      <TextField
        label="Tolerância (minutos)"
        type="number"
        min={0}
        max={60}
        value={input.toleranceMinutes}
        error={errors.toleranceMinutes}
        hint="Depois do horário mais a tolerância, sem o seu 'cheguei bem', a sua rede é avisada."
        onChange={(e) => setInput({ ...input, toleranceMinutes: e.target.value })}
      />
      {start.isError && <Banner tone="alert">Não foi possível iniciar o check-in agora.</Banner>}
      <Button type="submit" disabled={start.isPending}>
        Iniciar check-in
      </Button>
    </form>
  );
}

/** O check-in ativo: "Cheguei bem", "Estender" e "Cancelar". */
export function ActiveCheckInCard({
  checkIn,
}: {
  checkIn: Pick<CheckIn, 'id' | 'destination' | 'dueAt' | 'deadlineAt'>;
}) {
  const confirm = useConfirmArrival();
  const extend = useExtendCheckIn();
  const cancel = useCancelCheckIn();
  const busy = confirm.isPending || extend.isPending || cancel.isPending;

  const extendBy = (minutes: number) => {
    const base = Math.max(new Date(checkIn.dueAt).getTime(), Date.now());
    extend.mutate({ checkInId: checkIn.id, dueAt: new Date(base + minutes * MINUTE).toISOString() });
  };

  return (
    <Card>
      <h2 className={styles.title}>Check-in ativo: {checkIn.destination}</h2>
      <p>
        Chegada prevista às {hhmm(checkIn.dueAt)}. Sem confirmação até {hhmm(checkIn.deadlineAt)}, a sua rede
        é avisada.
      </p>
      {(confirm.isError || extend.isError || cancel.isError) && (
        <Banner tone="alert">Não foi possível atualizar o check-in. Ele pode já ter vencido.</Banner>
      )}
      <div className={styles.stack}>
        <Button block className={styles.bigButton} disabled={busy} onClick={() => confirm.mutate(checkIn.id)}>
          Cheguei bem
        </Button>
        <div className={styles.row}>
          <Button variant="secondary" disabled={busy} onClick={() => extendBy(15)}>
            Mais 15 min
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => extendBy(30)}>
            Mais 30 min
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => cancel.mutate(checkIn.id)}>
            Cancelar check-in
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function CheckInScreen({ defaultTolerance = 10 }: { defaultTolerance?: number }) {
  const active = useActiveCheckIn('real');
  return (
    <div className={styles.stack}>
      <h1 className={styles.heading}>Check-in "cheguei bem"</h1>
      <p className={styles.hint}>
        Avise para onde vai e quando pretende chegar. Se você não confirmar a tempo, a sua rede de apoio
        recebe o aviso, como num pedido de ajuda. O lembrete por notificação ainda não existe: deixe esta tela
        por perto.
      </p>
      {active.isPending && <Spinner />}
      {active.isError && <Banner tone="alert">Não foi possível carregar os check-ins agora.</Banner>}
      {active.isSuccess &&
        (active.data ? (
          <ActiveCheckInCard checkIn={active.data} />
        ) : (
          <CheckInForm defaultTolerance={defaultTolerance} />
        ))}
    </div>
  );
}
