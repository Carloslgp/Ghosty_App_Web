// Guard dos serviços internos: toda rota, exceto as marcadas com `@Public()`, exige `X-Internal-Key`.
// O original fica em config/nest/internal/, na raiz do repositório. Cada microserviço recebe uma
// cópia idêntica em src/api/platform/. Não edite a cópia: edite o original e rode `node config/sync.mjs`.
import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { ProblemException } from './problem-details.js';
import { isPublicRoute } from './public.decorator.js';

export const INTERNAL_API_KEY = Symbol('INTERNAL_API_KEY');

/** Compara em tempo constante (os resumos SHA-256 têm sempre o mesmo tamanho). */
export function sameSecret(given: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

@Injectable()
export class InternalKeyGuard implements CanActivate {
  constructor(
    @Inject(INTERNAL_API_KEY) private readonly expected: string,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (isPublicRoute(this.reflector, context)) return true;
    const given = context.switchToHttp().getRequest<Request>().header('x-internal-key');
    if (!given || !sameSecret(given, this.expected)) throw new ProblemException('UNAUTHENTICATED');
    return true;
  }
}
