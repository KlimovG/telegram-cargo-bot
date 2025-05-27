import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { GoogleSheetsModule } from '../google-sheets/google-sheets.module';
import { StateService } from './state.service';
import { TelegramBotFacade } from './telegram-bot.facade';

@Module({
  imports: [GoogleSheetsModule],
  providers: [TelegramService, StateService, TelegramBotFacade],
  exports: [TelegramService],
})
export class TelegramModule {}
