import { Injectable, Logger } from '@nestjs/common';
import { Ctx, Start, Help, Command, Update, On, Message } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { GoogleSheetsService } from '../google-sheets/google-sheets.service';
import { StateService } from './state.service';
import { DeliveryState } from './types/delivery-state.interface';

@Update()
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    private readonly sheetsService: GoogleSheetsService,
    private readonly stateService: StateService,
  ) {}

  @Start()
  async start(@Ctx() ctx: Context) {
    await ctx.reply(
      'Привет! Я бот для расчета стоимости доставки из Китая.\n\n' +
      'Доступные команды:\n' +
      '/calc - Рассчитать стоимость доставки\n' +
      '/help - Показать справку\n' +
      '/history - История ваших расчетов'
    );
  }

  @Help()
  async help(@Ctx() ctx: Context) {
    await ctx.reply(
      'Я помогу рассчитать стоимость доставки из Китая.\n\n' +
      'Для начала расчета используйте команду /calc\n' +
      'Бот запросит у вас:\n' +
      '- Тип доставки (карго/белая)\n' +
      '- Вес груза (кг)\n' +
      '- Объем (м³)\n' +
      '- Стоимость товара (юани)\n' +
      '- Описание товара'
    );
  }

  @Command('calc')
  async calc(@Ctx() ctx: Context) {
    if (!ctx.from) {
      await ctx.reply('Ошибка: не удалось определить пользователя');
      return;
    }

    const userId = ctx.from.id.toString();
    this.stateService.setState(userId, {
      type: 'cargo',
      step: 'type'
    });

    await ctx.reply(
      'Выберите тип доставки:',
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Карго', callback_data: 'type_cargo' },
              { text: 'Белая', callback_data: 'type_white' }
            ]
          ]
        }
      }
    );
  }

  @Command('history')
  async history(@Ctx() ctx: Context) {
    if (!ctx.from) {
      await ctx.reply('Ошибка: не удалось определить пользователя');
      return;
    }

    const userId = ctx.from.id.toString();
    try {
      const history = await this.sheetsService.getUserHistory(userId);
      if (history.length === 0) {
        await ctx.reply('У вас пока нет истории расчетов.');
        return;
      }

      const message = history
        .map((row, index) => {
          const [date, _, type, weight, volume, price, description, result] = row;
          return `${index + 1}. ${date}\n` +
                 `Тип: ${type}\n` +
                 `Вес: ${weight}кг\n` +
                 `Объем: ${volume}м³\n` +
                 `Цена: ${price}¥\n` +
                 `Результат: ${result}₽\n`;
        })
        .join('\n');

      await ctx.reply(message);
    } catch (error) {
      this.logger.error('Error fetching history:', error);
      await ctx.reply('Произошла ошибка при получении истории.');
    }
  }

  @On('callback_query')
  async handleCallback(@Ctx() ctx: Context) {
    if (!ctx.callbackQuery || !ctx.from || !('data' in ctx.callbackQuery)) {
      await ctx.reply('Ошибка: не удалось обработать запрос');
      return;
    }

    const callbackData = ctx.callbackQuery.data;
    const userId = ctx.from.id.toString();
    const state = this.stateService.getState(userId);

    if (!state) {
      await ctx.reply('Пожалуйста, начните расчет заново с помощью команды /calc');
      return;
    }

    if (callbackData.startsWith('type_')) {
      const type = callbackData.replace('type_', '') as 'cargo' | 'white';
      this.stateService.setState(userId, { ...state, type, step: 'weight' });
      await ctx.reply('Введите вес груза в килограммах:');
    }
  }

  @On('text')
  async handleText(@Ctx() ctx: Context) {
    if (!ctx.from || !ctx.message || !('text' in ctx.message)) {
      return;
    }

    const userId = ctx.from.id.toString();
    const state = this.stateService.getState(userId);
    const text = ctx.message.text;

    if (!state) {
      return;
    }

    try {
      switch (state.step) {
        case 'weight':
          const weight = parseFloat(text);
          if (isNaN(weight) || weight <= 0) {
            await ctx.reply('Пожалуйста, введите корректный вес (число больше 0):');
            return;
          }
          this.stateService.setState(userId, { ...state, weight, step: 'volume' });
          await ctx.reply('Введите объем груза в м³:');
          break;

        case 'volume':
          const volume = parseFloat(text);
          if (isNaN(volume) || volume <= 0) {
            await ctx.reply('Пожалуйста, введите корректный объем (число больше 0):');
            return;
          }
          this.stateService.setState(userId, { ...state, volume, step: 'price' });
          await ctx.reply('Введите стоимость товара в юанях:');
          break;

        case 'price':
          const price = parseFloat(text);
          if (isNaN(price) || price <= 0) {
            await ctx.reply('Пожалуйста, введите корректную стоимость (число больше 0):');
            return;
          }
          this.stateService.setState(userId, { ...state, price, step: 'description' });
          await ctx.reply('Введите описание товара:');
          break;

        case 'description':
          this.stateService.setState(userId, { ...state, description: text, step: 'complete' });
          await this.calculateAndShowResult(ctx, userId, { ...state, description: text });
          break;
      }
    } catch (error) {
      this.logger.error('Error processing input:', error);
      await ctx.reply('Произошла ошибка при обработке данных. Пожалуйста, начните заново с /calc');
      this.stateService.clearState(userId);
    }
  }

  private async calculateAndShowResult(ctx: Context, userId: string, state: DeliveryState) {
    try {
      const result = await this.sheetsService.calculateDelivery({
        type: state.type,
        weight: state.weight!,
        volume: state.volume!,
        price: state.price!,
        description: state.description!,
      });

      await ctx.reply(
        `Расчет стоимости доставки:\n\n` +
        `Тип: ${state.type}\n` +
        `Вес: ${state.weight}кг\n` +
        `Объем: ${state.volume}м³\n` +
        `Стоимость: ${state.price}¥\n` +
        `Описание: ${state.description}\n\n` +
        `Итоговая стоимость: ${result.result}₽`
      );

      this.stateService.clearState(userId);
    } catch (error) {
      this.logger.error('Error calculating delivery:', error);
      await ctx.reply('Произошла ошибка при расчете стоимости. Пожалуйста, попробуйте позже.');
      this.stateService.clearState(userId);
    }
  }
}
