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
      'Выберите команду:\n\n' +
      '/calc - для расчета доставки',
      {
        reply_markup: {
          keyboard: [
            [{ text: '/calc' }],
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      }
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
          let weightStr = text.replace(/\s+/g, '').replace(',', '.');
          weightStr = weightStr.replace(/[^\d.]/g, '');
          const weight = parseFloat(weightStr);
          if (isNaN(weight) || weight <= 0) {
            await ctx.reply('Пожалуйста, введите корректный вес (число больше 0, например: 12.5):');
            return;
          }
          this.stateService.setState(userId, { ...state, weight, step: 'volume' });
          await ctx.reply('Введите объем груза в м³:');
          break;

        case 'volume':
          let volumeStr = text.replace(/\s+/g, '').replace(',', '.');
          volumeStr = volumeStr.replace(/[^\d.]/g, '');
          const volume = parseFloat(volumeStr);
          if (isNaN(volume) || volume <= 0) {
            await ctx.reply('Пожалуйста, введите корректный объем (число больше 0, например: 0.15):');
            return;
          }
          this.stateService.setState(userId, { ...state, volume, step: 'price' });
          await ctx.reply('Введите стоимость товара в юанях:');
          break;

        case 'price':
          let priceStr = text.replace(/\s+/g, '').replace(',', '.');
          priceStr = priceStr.replace(/[^\d.]/g, '');
          const price = parseFloat(priceStr);
          if (isNaN(price) || price <= 0) {
            await ctx.reply('Пожалуйста, введите корректную стоимость (число больше 0, например: 1500):');
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
      // 1. Добавляем строку и получаем её номер
      const rowNumber = await this.sheetsService.appendCalculation({
        type: state.type,
        weight: state.weight!,
        volume: state.volume!,
        price: state.price!
      });

      // 2. Ждём, чтобы формула успела посчитать (можно увеличить при необходимости)
      await new Promise(res => setTimeout(res, 1000));
      const result = await this.sheetsService.getCalculationResult(rowNumber);

      // 3. Показываем результат пользователю
      await ctx.reply(
        `Расчет стоимости доставки:\n\n` +
        `Тип: ${state.type}\n` +
        `Вес: ${state.weight}кг\n` +
        `Объем: ${state.volume}м³\n` +
        `Стоимость: ${state.price}¥\n` +
        `Описание: ${state.description}\n\n` +
        `Итоговая стоимость: ${result ?? 'не удалось получить результат'}₽`
      );

      this.stateService.clearState(userId);
    } catch (error) {
      this.logger.error('Error calculating delivery:', error);
      await ctx.reply('Произошла ошибка при расчете стоимости. Пожалуйста, попробуйте позже.');
      this.stateService.clearState(userId);
    }
  }
}
