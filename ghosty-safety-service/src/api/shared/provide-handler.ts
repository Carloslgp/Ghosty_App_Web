import type { Provider } from '@nestjs/common';

/**
 * Registra um handler da `application` (que não conhece o NestJS) com `useFactory`: as portas são
 * injetadas pelos tokens, na ordem do construtor.
 */
export function provideHandler<T>(Handler: new (...deps: never[]) => T, inject: symbol[]): Provider {
  return { provide: Handler, useFactory: (...deps: unknown[]) => new Handler(...(deps as never[])), inject };
}
