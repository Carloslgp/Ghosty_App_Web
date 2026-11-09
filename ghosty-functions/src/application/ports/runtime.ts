import type { DeliveryMode } from '../../domain/dispatch/dispatch-planner.js';

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  newId(): string;
}

export interface FunctionsConfig {
  /** `simulated` (padrão): nada sai pelo Telegram. `telegram`: envio real. */
  deliveryMode: DeliveryMode;
  timezone: string;
  alertDispatchesQueue: string;
}
