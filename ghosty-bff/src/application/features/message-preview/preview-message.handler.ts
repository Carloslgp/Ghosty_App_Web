import type { BffConfig } from '../../ports/bff-config.js';
import type { FunctionsClient, MessagePreviewResult } from '../../ports/functions.client.js';
import type { SafetyServiceClient } from '../../ports/safety-service.client.js';
import type { RequestMeta } from '../../ports/upstream-error.js';

export interface PreviewMessageInput {
  template?: string;
  contactNickname?: string;
  location?: { lat: number; lng: number; accuracyMeters?: number | null } | null;
}

/** Sem contato confirmado, a prévia usa esta palavra no lugar do apelido. */
export const NICKNAME_FALLBACK = 'contato';

/**
 * Prévia da mensagem, montada pela Function. O BFF completa o nome da conta; sem `template`, usa o
 * modelo salvo; sem `contactNickname`, o primeiro contato confirmado da rede.
 */
export class PreviewMessageHandler {
  constructor(
    private readonly safety: SafetyServiceClient,
    private readonly functions: FunctionsClient,
    private readonly config: BffConfig,
  ) {}

  async execute(
    accountId: string,
    input: PreviewMessageInput,
    meta: RequestMeta,
  ): Promise<MessagePreviewResult> {
    const summary = await this.safety.summary(accountId, meta);
    const firstConfirmed = [...summary.network.contacts]
      .sort((a, b) => a.position - b.position)
      .find((contact) => contact.status === 'confirmed');
    return this.functions.messagePreview(
      {
        template: input.template ?? summary.alertSettings.messageTemplate,
        displayName: summary.displayName,
        contactNickname: input.contactNickname ?? firstConfirmed?.nickname ?? NICKNAME_FALLBACK,
        ...(input.location ? { location: input.location } : {}),
        timezone: this.config.timezone,
      },
      meta,
    );
  }
}
