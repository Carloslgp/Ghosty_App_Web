import { fallbackReadiness } from '../../../../domain/readiness/fallback-readiness.js';
import type { BffConfig } from '../../../ports/bff-config.js';
import type { Clock } from '../../../ports/clock.js';
import type { FunctionsClient, GeoPermission, ReadinessItem } from '../../../ports/functions.client.js';
import type { NotesServiceClient, NotesSummary } from '../../../ports/notes-service.client.js';
import type { SafetyServiceClient, SafetySummary } from '../../../ports/safety-service.client.js';
import { UpstreamError, type RequestMeta } from '../../../ports/upstream-error.js';

export interface DisabledFeature {
  id: 'sms-whatsapp-email' | 'web-push' | 'check-in-push' | 'decoy-code' | 'false-alarm-message';
  title: string;
  reason: string;
}

/** Recursos desligados, sempre com o motivo (a tela mostra em vez de esconder). */
export const DISABLED_FEATURES: DisabledFeature[] = [
  {
    id: 'sms-whatsapp-email',
    title: 'Aviso por SMS, WhatsApp ou e-mail',
    reason: 'Planejado. Hoje os avisos saem só pelo Telegram ou pela página web do contato.',
  },
  {
    id: 'web-push',
    title: 'Notificação para quem escolheu o canal web',
    reason:
      'Planejado. Exige Web Push. Hoje a página precisa estar aberta para mostrar o aviso. Prefira o Telegram.',
  },
  {
    id: 'check-in-push',
    title: 'Lembrete do check-in por notificação',
    reason: 'Planejado. Exige Web Push, que ainda não foi implementado.',
  },
  {
    id: 'decoy-code',
    title: 'Código alternativo que abre uma área falsa',
    reason: 'Planejado para uma próxima versão.',
  },
  {
    id: 'false-alarm-message',
    title: 'Mensagem de "foi engano" para a rede',
    reason: 'Planejado. Hoje o cancelamento só é registrado.',
  },
];

export interface AggregatedData {
  generatedAt: string;
  facade: {
    totalNotes: number;
    pinned: number;
    archived: number;
    updatedLast14Days: number;
    remindersToday: number;
  } | null;
  safety: {
    network: SafetySummary['network'];
    alertSettings: { includeLocation: boolean; countdownSeconds: number; reviewed: boolean };
    activeCheckIn: SafetySummary['activeCheckIn'];
    lastTest: SafetySummary['lastTest'];
  } | null;
  readiness: {
    score: number;
    level: 'ready' | 'almost' | 'attention';
    items: ReadinessItem[];
    messagePreview: { text: string; characters: number; limit: number } | null;
  };
  disabledFeatures: DisabledFeature[];
  sources: { notes: 'ok' | 'unavailable'; safety: 'ok' | 'unavailable'; readiness: 'ok' | 'fallback' };
}

/** Só a falha de um serviço (fora do ar, timeout, erro dele) vira bloco vazio; bug do BFF continua erro. */
async function optional<T>(call: Promise<T>): Promise<T | null> {
  try {
    return await call;
  } catch (error) {
    if (error instanceof UpstreamError) return null;
    throw error;
  }
}

/**
 * `GET /aggregated-data`: o painel da área de segurança em um único JSON.
 * 1. Em paralelo: o resumo das notas (notes-service) e o resumo da segurança (safety-service).
 * 2. Com os dois resumos: a prontidão calculada pela Function.
 * Cada chamada tem o limite de tempo do cliente HTTP (3 s). Uma fonte fora do ar não derruba a
 * resposta: o bloco dela vem `null` e `sources` diz o que faltou. Sem a Function, a prontidão é a de
 * reserva, calculada aqui (`sources.readiness = "fallback"`).
 */
export class GetAggregatedDataHandler {
  constructor(
    private readonly notes: NotesServiceClient,
    private readonly safety: SafetyServiceClient,
    private readonly functions: FunctionsClient,
    private readonly clock: Clock,
    private readonly config: BffConfig,
  ) {}

  async execute(
    query: { accountId: string; geo: GeoPermission },
    meta: RequestMeta,
  ): Promise<AggregatedData> {
    const { timezone } = this.config;
    const [notes, safety] = await Promise.all([
      optional(this.notes.summary(query.accountId, timezone, meta)),
      optional(this.safety.summary(query.accountId, meta)),
    ]);
    const readiness = safety ? await optional(this.readiness(notes, safety, query.geo, meta)) : null;

    return {
      generatedAt: this.clock.now().toISOString(),
      facade: notes ? facadeBlock(notes) : null,
      safety: safety
        ? {
            network: safety.network,
            alertSettings: {
              includeLocation: safety.alertSettings.includeLocation,
              countdownSeconds: safety.alertSettings.countdownSeconds,
              reviewed: safety.alertSettings.reviewed,
            },
            activeCheckIn: safety.activeCheckIn,
            lastTest: safety.lastTest,
          }
        : null,
      readiness:
        readiness ??
        fallbackReadiness(
          safety
            ? {
                totalContacts: safety.network.total,
                confirmedContacts: safety.network.confirmed,
                messageReviewed: safety.alertSettings.reviewed,
                secretCodeSet: safety.secretCodeSet,
              }
            : null,
        ),
      disabledFeatures: DISABLED_FEATURES,
      sources: {
        notes: notes ? 'ok' : 'unavailable',
        safety: safety ? 'ok' : 'unavailable',
        readiness: readiness ? 'ok' : 'fallback',
      },
    };
  }

  private async readiness(
    notes: NotesSummary | null,
    safety: SafetySummary,
    geo: GeoPermission,
    meta: RequestMeta,
  ): Promise<AggregatedData['readiness']> {
    const firstConfirmed = [...safety.network.contacts]
      .sort((a, b) => a.position - b.position)
      .find((contact) => contact.status === 'confirmed');
    const result = await this.functions.readiness(
      {
        notes: notes ? { updatedLast14Days: notes.updatedLast14Days } : null,
        safety: {
          displayName: safety.displayName,
          totalContacts: safety.network.total,
          confirmedContacts: safety.network.confirmed,
          firstConfirmedNickname: firstConfirmed?.nickname ?? null,
          messageTemplate: safety.alertSettings.messageTemplate,
          messageReviewed: safety.alertSettings.reviewed,
          includeLocation: safety.alertSettings.includeLocation,
          secretCodeSet: safety.secretCodeSet,
          lastTestAt: safety.lastTest?.at ?? null,
        },
        geoPermission: geo,
        timezone: this.config.timezone,
      },
      meta,
    );
    const preview = result.messagePreview;
    return {
      score: result.score,
      level: result.level,
      items: result.items,
      messagePreview: { text: preview.text, characters: preview.characters, limit: preview.limit },
    };
  }
}

function facadeBlock(notes: NotesSummary): NonNullable<AggregatedData['facade']> {
  return {
    totalNotes: notes.total,
    pinned: notes.pinned,
    archived: notes.archived,
    updatedLast14Days: notes.updatedLast14Days,
    remindersToday: notes.remindersToday,
  };
}
