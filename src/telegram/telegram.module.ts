import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { GoogleSheetsModule } from '../google-sheets/google-sheets.module';
import { StateService } from './state.service';
import { TelegramBotFacade } from './telegram-bot.facade';
import { DeliveryValidationService } from './delivery-validation.service';

@Module({
  imports: [GoogleSheetsModule],
  providers: [TelegramService, StateService, TelegramBotFacade, DeliveryValidationService],
  exports: [TelegramService],
})
export class TelegramModule {}
