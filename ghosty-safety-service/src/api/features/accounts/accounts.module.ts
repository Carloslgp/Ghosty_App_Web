import { Module } from '@nestjs/common';
import { AuthenticateAccountHandler } from '../../../application/features/accounts/authenticate-account/authenticate-account.handler.js';
import { CreateAccountHandler } from '../../../application/features/accounts/create-account/create-account.handler.js';
import { DeleteAccountHandler } from '../../../application/features/accounts/delete-account/delete-account.handler.js';
import { GetAccountHandler } from '../../../application/features/accounts/get-account/get-account.handler.js';
import { SetSecretCodeHandler } from '../../../application/features/accounts/set-secret-code/set-secret-code.handler.js';
import { UpdateAccountHandler } from '../../../application/features/accounts/update-account/update-account.handler.js';
import { VerifySecretCodeHandler } from '../../../application/features/accounts/verify-secret-code/verify-secret-code.handler.js';
import { IssueRefreshTokenHandler } from '../../../application/features/refresh-tokens/issue-refresh-token/issue-refresh-token.handler.js';
import { RevokeRefreshTokenHandler } from '../../../application/features/refresh-tokens/revoke-refresh-token/revoke-refresh-token.handler.js';
import { RotateRefreshTokenHandler } from '../../../application/features/refresh-tokens/rotate-refresh-token/rotate-refresh-token.handler.js';
import { CLOCK } from '../../../application/ports/clock.js';
import { ID_GENERATOR } from '../../../application/ports/id-generator.js';
import { OPAQUE_TOKENS } from '../../../application/ports/opaque-tokens.js';
import { PASSWORD_HASHER } from '../../../application/ports/password-hasher.js';
import { SAFETY_CONFIG } from '../../../application/ports/safety-config.js';
import { UNIT_OF_WORK } from '../../../application/ports/unit-of-work.js';
import { provideHandler } from '../../shared/provide-handler.js';
import { AccountsController } from './accounts.controller.js';
import { RefreshTokensController } from './refresh-tokens.controller.js';

@Module({
  controllers: [AccountsController, RefreshTokensController],
  providers: [
    provideHandler(CreateAccountHandler, [UNIT_OF_WORK, PASSWORD_HASHER, CLOCK, ID_GENERATOR]),
    provideHandler(AuthenticateAccountHandler, [UNIT_OF_WORK, PASSWORD_HASHER]),
    provideHandler(GetAccountHandler, [UNIT_OF_WORK]),
    provideHandler(UpdateAccountHandler, [UNIT_OF_WORK, CLOCK]),
    provideHandler(DeleteAccountHandler, [UNIT_OF_WORK]),
    provideHandler(SetSecretCodeHandler, [UNIT_OF_WORK, PASSWORD_HASHER, CLOCK]),
    provideHandler(VerifySecretCodeHandler, [UNIT_OF_WORK, PASSWORD_HASHER, CLOCK, SAFETY_CONFIG]),
    provideHandler(IssueRefreshTokenHandler, [UNIT_OF_WORK, OPAQUE_TOKENS, CLOCK, ID_GENERATOR]),
    provideHandler(RotateRefreshTokenHandler, [UNIT_OF_WORK, OPAQUE_TOKENS, CLOCK, ID_GENERATOR]),
    provideHandler(RevokeRefreshTokenHandler, [UNIT_OF_WORK, OPAQUE_TOKENS, CLOCK]),
  ],
})
export class AccountsModule {}
