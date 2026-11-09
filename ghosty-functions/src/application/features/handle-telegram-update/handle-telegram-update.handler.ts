import { parseTelegramCommand } from '../../../domain/telegram/telegram-command-parser.js';
import type { SafetyInternalClient } from '../../ports/safety-internal.client.js';
import type { TelegramGateway } from '../../ports/telegram-gateway.js';

/** O que interessa de um `Update` da Bot API: o texto e o chat de quem escreveu. */
export interface TelegramMessage {
  text?: string;
  chatId: string;
  /** `private` numa conversa direta com o bot. Grupos e canais são ignorados. */
  chatType: string;
}

export type TelegramUpdateResult = 'linked' | 'left' | 'ignored';

export function linkedReply(inviterDisplayName: string): string {
  return (
    `Pronto, você faz parte da rede de apoio de ${inviterDisplayName}. ` +
    'Se essa pessoa pedir ajuda, o aviso chega aqui. Para sair, envie /parar.'
  );
}

export const LEFT_REPLY = 'Você saiu da rede de apoio e não vai mais receber avisos por aqui.';

/**
 * Trata uma mensagem recebida pelo bot (webhook na Azure, `telegram:poll` na máquina local):
 * - `/start <token>` vincula o chat ao contato do convite e confirma no próprio chat;
 * - `/parar` tira o contato da rede;
 * - qualquer outra coisa, ou token inválido, vencido ou já usado, é ignorada em silêncio.
 *
 * A resposta no chat é só uma cortesia: se ela falhar, o vínculo já feito continua valendo.
 */
export class HandleTelegramUpdateHandler {
  constructor(
    private readonly safety: SafetyInternalClient,
    /** Nulo sem token do bot configurado: o vínculo acontece, mas ninguém responde no chat. */
    private readonly telegram: TelegramGateway | null,
  ) {}

  async execute(message: TelegramMessage | undefined, correlationId: string): Promise<TelegramUpdateResult> {
    if (!message || message.chatType !== 'private') return 'ignored';
    const command = parseTelegramCommand(message.text);

    if (command.kind === 'start') {
      const linked = await this.safety.linkTelegramContact(command.token, message.chatId, correlationId);
      if (linked.result !== 'linked') return 'ignored';
      await this.reply(message.chatId, linkedReply(linked.inviterDisplayName ?? 'quem convidou você'));
      return 'linked';
    }
    if (command.kind === 'leave') {
      const left = await this.safety.leaveTelegramContact(message.chatId, correlationId);
      if (left.result !== 'left') return 'ignored';
      await this.reply(message.chatId, LEFT_REPLY);
      return 'left';
    }
    return 'ignored';
  }

  private async reply(chatId: string, text: string): Promise<void> {
    try {
      await this.telegram?.sendMessage(chatId, text);
    } catch {
      // Sem nova tentativa: repetir o webhook encontraria o convite já respondido.
    }
  }
}
