import { Injectable, Logger } from '@nestjs/common';
import { Ctx, Start, Help, Command, Update, On, Message } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { TelegramBotFacade } from './telegram-bot.facade';
import { DeliveryState } from './types';

@Update()
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    private readonly botFacade: TelegramBotFacade,
  ) {}

  @Start()
  async start(@Ctx() ctx: Context) {
    await ctx.reply(
      'Привет! Я бот для расчета стоимости доставки из Китая.\n\n' +
      'Выберите команду:\n\n' +
      '/calc - для расчета доставки\n\n'+
      '/history - посмотреть историю расчетов',
      {
        reply_markup: {
          keyboard: [
            [{ text: '/calc' }, { text: '/history' }],
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
      '- Объем единицы товара (м³)\n' +
      '- Количество единиц товара\n' +
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
    this.botFacade.setState(userId, {
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
    // Удаляем все предыдущие сообщения бота
    const oldMessages = this.botFacade.getAndClearBotMessages(userId);
    for (const msgId of oldMessages) {
      try { await ctx.deleteMessage(msgId); } catch (e) {}
    }

    // 1. Сообщаем о начале получения истории
    const waitMsg = await ctx.reply('Получение истории обращений...');
    if (waitMsg && 'message_id' in waitMsg) {
      this.botFacade.addBotMessage(userId, waitMsg.message_id);
    }

    try {
      const message = await this.botFacade.buildHistoryMessage(userId);
      if (waitMsg && 'message_id' in waitMsg) {
        try { await ctx.deleteMessage(waitMsg.message_id); } catch (e) {}
      }
      const sent = await ctx.reply(message);
      if ('message_id' in sent) {
        this.botFacade.addBotMessage(userId, sent.message_id);
      }
    } catch (error) {
      this.logger.error('Error fetching history:', error);
      if (waitMsg && 'message_id' in waitMsg) {
        try { await ctx.deleteMessage(waitMsg.message_id); } catch (e) {}
      }
      const sent = await ctx.reply('Произошла ошибка при получении истории.');
      if ('message_id' in sent) {
        this.botFacade.addBotMessage(userId, sent.message_id);
      }
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
    const state = this.botFacade.getState(userId);

    // Обработка новых кнопок
    if (callbackData === 'start_over') {
      this.botFacade.clearState(userId);
      await this.calc(ctx);
      return;
    }
    if (callbackData === 'show_history') {
      await this.history(ctx);
      return;
    }

    if (!state) {
      await ctx.reply('Пожалуйста, начните расчет заново с помощью команды /calc');
      return;
    }

    if (callbackData.startsWith('type_')) {
      const type = callbackData.replace('type_', '') as 'cargo' | 'white';
      this.botFacade.setState(userId, { ...state, type, step: 'weight' });
      const hint = await this.botFacade.getHintByKey('weight');
      await ctx.reply(hint || 'Введите вес одной единицы в киллограммах:');
    }
  }

  @On('text')
  async handleText(@Ctx() ctx: Context) {
    if (!ctx.from || !ctx.message || !('text' in ctx.message)) {
      return;
    }

    const userId = ctx.from.id.toString();
    const state = this.botFacade.getState(userId);
    const text = ctx.message.text;

    if (!state) {
      return;
    }

    try {
      const stepResult = await this.botFacade.handleStep({ step: state.step, text, state});
      if (!stepResult.valid) {
        await ctx.reply(stepResult.message);
        return;
      }
      if (stepResult.newState) {
        this.botFacade.setState(userId, stepResult.newState);
      }
      if (stepResult.complete && stepResult.newState) {
        await this.calculateAndShowResult(ctx, userId, stepResult.newState);
        return;
      }
      if (stepResult.message) {
        await ctx.reply(stepResult.message);
      }
    } catch (error) {
      this.logger.error('Error processing input:', error);
      await ctx.reply('Произошла ошибка при обработке данных. Пожалуйста, начните заново с /calc');
      this.botFacade.clearState(userId);
    }
  }

  private async calculateAndShowResult(ctx: Context, userId: string, state: DeliveryState) {
    try {
      // Удаляем все предыдущие сообщения бота
      const oldMessages = this.botFacade.getAndClearBotMessages(userId);
      for (const msgId of oldMessages) {
        try { await ctx.deleteMessage(msgId); } catch (e) {}
      }

      // 1. Сообщаем о начале расчета
      const waitMsg = await ctx.reply('Выполняется расчет, пожалуйста, подождите...');
      if (waitMsg && 'message_id' in waitMsg) {
        this.botFacade.addBotMessage(userId, waitMsg.message_id);
      }

      // 2. Добавляем строку и получаем её номер
      const rowNumber = await this.botFacade.appendCalculation({
        type: state.type,
        weight: state.weight!,
        volume: state.volume!,
        price: state.price!,
        userTelegramId: userId,
        count: state.count!,
      });

      // 3. Ждём, чтобы формула успела посчитать (можно увеличить при необходимости)
      await new Promise(res => setTimeout(res, 1000));
      const result = await this.botFacade.getCalculationResult(rowNumber);

      // 4. Удаляем сообщение о расчете
      if (waitMsg && 'message_id' in waitMsg) {
        try {
          await ctx.deleteMessage(waitMsg.message_id);
        } catch (e) {
          // Если не удалось удалить — ничего страшного
        }
      }

      // 5. Показываем результат пользователю
      const message = await this.botFacade.buildCalculationResultMessage(state, result);
      const sent = await ctx.reply(
        message,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'Начать сначала', callback_data: 'start_over' },
                { text: 'История расчетов', callback_data: 'show_history' }
              ]
            ]
          }
        }
      );
      if ('message_id' in sent) {
        this.botFacade.addBotMessage(userId, sent.message_id);
      }

      this.botFacade.clearState(userId);
    } catch (error) {
      this.logger.error('Error calculating delivery:', error);
      const sent = await ctx.reply('Произошла ошибка при расчете стоимости. Пожалуйста, попробуйте позже.');
      if ('message_id' in sent) {
        this.botFacade.addBotMessage(userId, sent.message_id);
      }
      this.botFacade.clearState(userId);
    }
  }
}
