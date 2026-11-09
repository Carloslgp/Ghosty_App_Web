import { Module } from '@nestjs/common';
import { GetAlertSettingsHandler } from '../../../application/features/alert-settings/get-alert-settings/get-alert-settings.handler.js';
import { UpdateAlertSettingsHandler } from '../../../application/features/alert-settings/update-alert-settings/update-alert-settings.handler.js';
import { GetSafetySummaryHandler } from '../../../application/features/summary/get-safety-summary/get-safety-summary.handler.js';
import { CLOCK } from '../../../application/ports/clock.js';
import { UNIT_OF_WORK } from '../../../application/ports/unit-of-work.js';
import { provideHandler } from '../../shared/provide-handler.js';
import { SettingsController } from './settings.controller.js';

@Module({
  controllers: [SettingsController],
  providers: [
    provideHandler(GetAlertSettingsHandler, [UNIT_OF_WORK]),
    provideHandler(UpdateAlertSettingsHandler, [UNIT_OF_WORK, CLOCK]),
    provideHandler(GetSafetySummaryHandler, [UNIT_OF_WORK]),
  ],
})
export class SettingsModule {}
