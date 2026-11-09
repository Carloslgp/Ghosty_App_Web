import type { SafetySessionPolicy } from '../../domain/session/safety-session.js';

export const BFF_CONFIG = Symbol('BffConfig');

export interface BffConfig {
  /** `remoteEntry.js` do remote `safety`, devolvido no desbloqueio. */
  safetyRemoteUrl: string;
  safetySession: SafetySessionPolicy;
}
