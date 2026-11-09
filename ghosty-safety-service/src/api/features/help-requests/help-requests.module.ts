import { Module } from '@nestjs/common';
import { CancelHelpRequestHandler } from '../../../application/features/help-requests/cancel-help-request/cancel-help-request.handler.js';
import { GetDeliveryTargetsHandler } from '../../../application/features/help-requests/get-delivery-targets/get-delivery-targets.handler.js';
import { GetHelpRequestHandler } from '../../../application/features/help-requests/get-help-request/get-help-request.handler.js';
import { ListHelpRequestsHandler } from '../../../application/features/help-requests/list-help-requests/list-help-requests.handler.js';
import { TriggerHelpRequestHandler } from '../../../application/features/help-requests/trigger-help-request/trigger-help-request.handler.js';
import { CLOCK } from '../../../application/ports/clock.js';
import { ID_GENERATOR } from '../../../application/ports/id-generator.js';
import { OPAQUE_TOKENS } from '../../../application/ports/opaque-tokens.js';
import { SAFETY_CONFIG } from '../../../application/ports/safety-config.js';
import { UNIT_OF_WORK } from '../../../application/ports/unit-of-work.js';
import { provideHandler } from '../../shared/provide-handler.js';
import { DeliveryTargetsController } from './delivery-targets.controller.js';
import { HelpRequestsController } from './help-requests.controller.js';

/** Pedidos de ajuda e a rota interna com os destinos de entrega. */
@Module({
  controllers: [HelpRequestsController, DeliveryTargetsController],
  providers: [
    provideHandler(TriggerHelpRequestHandler, [
      UNIT_OF_WORK,
      OPAQUE_TOKENS,
      CLOCK,
      ID_GENERATOR,
      SAFETY_CONFIG,
    ]),
    provideHandler(ListHelpRequestsHandler, [UNIT_OF_WORK]),
    provideHandler(GetHelpRequestHandler, [UNIT_OF_WORK]),
    provideHandler(CancelHelpRequestHandler, [UNIT_OF_WORK]),
    provideHandler(GetDeliveryTargetsHandler, [UNIT_OF_WORK]),
  ],
})
export class HelpRequestsModule {}
