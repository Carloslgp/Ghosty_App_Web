import { Module } from '@nestjs/common';
import { CancelCheckInHandler } from '../../../application/features/check-ins/cancel-check-in/cancel-check-in.handler.js';
import { ConfirmArrivalHandler } from '../../../application/features/check-ins/confirm-arrival/confirm-arrival.handler.js';
import { ExpireCheckInHandler } from '../../../application/features/check-ins/expire-check-in/expire-check-in.handler.js';
import { ExtendCheckInHandler } from '../../../application/features/check-ins/extend-check-in/extend-check-in.handler.js';
import { GetCheckInHandler } from '../../../application/features/check-ins/get-check-in/get-check-in.handler.js';
import { ListCheckInsHandler } from '../../../application/features/check-ins/list-check-ins/list-check-ins.handler.js';
import { StartCheckInHandler } from '../../../application/features/check-ins/start-check-in/start-check-in.handler.js';
import { CLOCK } from '../../../application/ports/clock.js';
import { ID_GENERATOR } from '../../../application/ports/id-generator.js';
import { OPAQUE_TOKENS } from '../../../application/ports/opaque-tokens.js';
import { SAFETY_CONFIG } from '../../../application/ports/safety-config.js';
import { UNIT_OF_WORK } from '../../../application/ports/unit-of-work.js';
import { provideHandler } from '../../shared/provide-handler.js';
import { CheckInDeadlinesController } from './check-in-deadlines.controller.js';
import { CheckInsController } from './check-ins.controller.js';

/** Check-ins "cheguei bem" e a rota interna que vence o prazo. */
@Module({
  controllers: [CheckInsController, CheckInDeadlinesController],
  providers: [
    provideHandler(StartCheckInHandler, [UNIT_OF_WORK, OPAQUE_TOKENS, CLOCK, ID_GENERATOR]),
    provideHandler(ListCheckInsHandler, [UNIT_OF_WORK]),
    provideHandler(GetCheckInHandler, [UNIT_OF_WORK]),
    provideHandler(ExtendCheckInHandler, [UNIT_OF_WORK, CLOCK, ID_GENERATOR]),
    provideHandler(CancelCheckInHandler, [UNIT_OF_WORK]),
    provideHandler(ConfirmArrivalHandler, [UNIT_OF_WORK, CLOCK]),
    provideHandler(ExpireCheckInHandler, [UNIT_OF_WORK, CLOCK, ID_GENERATOR, SAFETY_CONFIG]),
  ],
})
export class CheckInsModule {}
