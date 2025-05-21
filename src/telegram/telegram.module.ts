import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { GoogleSheetsModule } from '../google-sheets/google-sheets.module';
import { StateService } from './state.service';

@Module({
  imports: [GoogleSheetsModule],
  providers: [TelegramService, StateService],
  exports: [TelegramService],
})
export class TelegramModule {}
