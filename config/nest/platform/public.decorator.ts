// Marca rotas que não passam pelos guards de autenticação (ex.: `/health`).
// O original fica em config/nest/platform/, na raiz do repositório. Cada serviço NestJS recebe uma
// cópia idêntica em src/api/platform/. Não edite a cópia: edite o original e rode `node config/sync.mjs`.
import { SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

export const IS_PUBLIC = 'platform:isPublic';

export const Public = () => SetMetadata(IS_PUBLIC, true);

export function isPublicRoute(reflector: Reflector, context: ExecutionContext): boolean {
  return (
    reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]) === true
  );
}
