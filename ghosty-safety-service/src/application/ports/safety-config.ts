import type { CodeLockPolicy } from '../../domain/accounts/account.entity.js';

export const SAFETY_CONFIG = Symbol('SafetyConfig');

/** Parâmetros do serviço que os casos de uso usam (vêm das variáveis de ambiente). */
export interface SafetyConfig {
  codeLock: CodeLockPolicy;
  inviteTtlHours: number;
  /** Base do link do convite, sem a barra final (ex.: `http://localhost:5173/c`). */
  inviteBaseUrl: string;
  /** Nome do bot sem `@`, para o link `t.me/<bot>?start=<token>`. */
  telegramBotUsername: string;
}

export function inviteUrl(config: SafetyConfig, token: string): string {
  return `${config.inviteBaseUrl.replace(/\/+$/, '')}/${token}`;
}

export function telegramUrl(config: SafetyConfig, token: string): string {
  return `https://t.me/${config.telegramBotUsername}?start=${token}`;
}
