import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GoogleSheetsModule } from './google-sheets/google-sheets.module';
import { TelegramModule } from './telegram/telegram.module';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const token = configService.get<string>('telegram.token');
        if (!token) {
          throw new Error('TELEGRAM_BOT_TOKEN is not defined');
        }
        return { token };
      },
      inject: [ConfigService],
    }),
    GoogleSheetsModule,
    TelegramModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
