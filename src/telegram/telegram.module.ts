import { Module } from '@nestjs/common';
import { TelegramControllerService } from './telegram-controller.service';
import { GoogleSheetsModule } from '../google-sheets/google-sheets.module';
import { StateService } from './state.service';
import { TelegramBotFacade } from './telegram-bot.facade';
import { DeliveryValidationService } from './delivery-validation.service';

@Module({
  imports: [GoogleSheetsModule],
  providers: [TelegramControllerService, StateService, TelegramBotFacade, DeliveryValidationService],
  exports: [TelegramControllerService],
})
export class TelegramModule {}
