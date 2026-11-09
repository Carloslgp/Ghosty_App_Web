/** Tipos dos eventos publicados pelo outbox (o `type` do envelope define a fila). */
export const EVENT_TYPES = {
  helpRequestTriggered: 'ghosty.safety.help-request.triggered.v1',
  checkInDeadlineScheduled: 'ghosty.safety.check-in.deadline-scheduled.v1',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];
