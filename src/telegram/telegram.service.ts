import { Injectable, Logger } from '@nestjs/common';
import { Ctx, Start, Help, Command, Update, On, Message } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { GoogleSheetsService } from '../google-sheets/google-sheets.service';
import { StateService } from './state.service';
import { DeliveryState } from './types';
import { AddCalculationParams } from '../google-sheets/types';
import { MessageBuilder } from './utils/message.builder';

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
    // Удаляем все предыдущие сообщения бота
    const oldMessages = this.stateService.getAndClearBotMessages(userId);
    for (const msgId of oldMessages) {
      try { await ctx.deleteMessage(msgId); } catch (e) {}
    }

    // 1. Сообщаем о начале получения истории
    const waitMsg = await ctx.reply('Получение истории обращений...');
    if (waitMsg && 'message_id' in waitMsg) {
      this.stateService.addBotMessage(userId, waitMsg.message_id);
    }

    try {
      const { headers, userRows } = await this.sheetsService.getUserHistory(userId);
      if (userRows.length === 0) {
        if (waitMsg && 'message_id' in waitMsg) {
          try { await ctx.deleteMessage(waitMsg.message_id); } catch (e) {}
        }
        const sent = await ctx.reply('У вас пока нет истории расчетов.');
        if ('message_id' in sent) {
          this.stateService.addBotMessage(userId, sent.message_id);
        }
        return;
      }

      // Получаем справочник для поиска индексов
      const dict = await this.sheetsService['loadFieldDictionary']();
      const getIdx = (key: string) => headers.indexOf(dict[key]?.header);
      
      const message = userRows
        .map((row, index) => {
          const builder = new MessageBuilder();
          builder.addLine(`${index + 1}. ${row[getIdx('date')]}`)
            .addField('Тип', row[getIdx('type')])
            .addField('Вес', row[getIdx('weight')], 'кг')
            .addField('Объем', row[getIdx('volume')], 'м³')
            .addField('Цена', row[getIdx('price')], '¥')
            .addField('Результат', row[getIdx('result')], '₽');
          return builder.build();
        })
        .join('\n');

      if (waitMsg && 'message_id' in waitMsg) {
        try { await ctx.deleteMessage(waitMsg.message_id); } catch (e) {}
      }
      const sent = await ctx.reply(message);
      if ('message_id' in sent) {
        this.stateService.addBotMessage(userId, sent.message_id);
      }
    } catch (error) {
      this.logger.error('Error fetching history:', error);
      if (waitMsg && 'message_id' in waitMsg) {
        try { await ctx.deleteMessage(waitMsg.message_id); } catch (e) {}
      }
      const sent = await ctx.reply('Произошла ошибка при получении истории.');
      if ('message_id' in sent) {
        this.stateService.addBotMessage(userId, sent.message_id);
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
    const state = this.stateService.getState(userId);

    // Обработка новых кнопок
    if (callbackData === 'start_over') {
      this.stateService.clearState(userId);
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
      this.stateService.setState(userId, { ...state, type, step: 'weight' });
      const hint = await this.sheetsService.getHintByKey('weight');
      await ctx.reply(hint || 'Введите вес одной единицы в киллограммах:');
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
            const hint = await this.sheetsService.getHintByKey('weight');
            await ctx.reply(hint || 'Пожалуйста, введите корректный вес (число больше 0, например: 12.5):');
            return;
          }
          this.stateService.setState(userId, { ...state, weight, step: 'volumePerUnit' });
          {
            const hint = await this.sheetsService.getHintByKey('volumePerUnit');
            await ctx.reply(hint || 'Введите объем единицы товара (м³):');
          }
          break;

        case 'volumePerUnit':
          let vpuStr = text.replace(/\s+/g, '').replace(',', '.');
          vpuStr = vpuStr.replace(/[^\d.]/g, '');
          const volumePerUnit = parseFloat(vpuStr);
          if (isNaN(volumePerUnit) || volumePerUnit <= 0) {
            const hint = await this.sheetsService.getHintByKey('volumePerUnit');
            await ctx.reply(hint || 'Пожалуйста, введите корректный объем единицы товара (например: 0.15):');
            return;
          }
          this.stateService.setState(userId, { ...state, volumePerUnit, step: 'count' });
          {
            const hint = await this.sheetsService.getHintByKey('count');
            await ctx.reply(hint || 'Введите количество единиц товара:');
          }
          break;

        case 'count':
          let countStr = text.replace(/\s+/g, '');
          countStr = countStr.replace(/[^\d]/g, '');
          const count = parseInt(countStr, 10);
          if (isNaN(count) || count <= 0) {
            const hint = await this.sheetsService.getHintByKey('count');
            await ctx.reply(hint || 'Пожалуйста, введите корректное количество (целое число больше 0):');
            return;
          }
          // Вычисляем общий объем
          const volume = (state.volumePerUnit || 0) * count;
          if (isNaN(volume) || volume <= 0) {
            await ctx.reply('Ошибка при вычислении общего объема. Попробуйте снова.');
            this.stateService.clearState(userId);
            return;
          }
          this.stateService.setState(userId, { ...state, count, volume, step: 'price' });
          {
            const hint = await this.sheetsService.getHintByKey('price');
            await ctx.reply(hint || 'Введите стоимость товара в юанях:');
          }
          break;

        case 'price':
          let priceStr = text.replace(/\s+/g, '').replace(',', '.');
          priceStr = priceStr.replace(/[^\d.]/g, '');
          const price = parseFloat(priceStr);
          if (isNaN(price) || price <= 0) {
            const hint = await this.sheetsService.getHintByKey('price');
            await ctx.reply(hint || 'Пожалуйста, введите корректную стоимость (число больше 0, например: 1500):');
            return;
          }
          this.stateService.setState(userId, { ...state, price, step: 'description' });
          {
            const hint = await this.sheetsService.getHintByKey('description');
            await ctx.reply(hint || 'Введите описание товара:');
          }
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
      // Удаляем все предыдущие сообщения бота
      const oldMessages = this.stateService.getAndClearBotMessages(userId);
      for (const msgId of oldMessages) {
        try { await ctx.deleteMessage(msgId); } catch (e) {}
      }

      // 1. Сообщаем о начале расчета
      const waitMsg = await ctx.reply('Выполняется расчет, пожалуйста, подождите...');
      if (waitMsg && 'message_id' in waitMsg) {
        this.stateService.addBotMessage(userId, waitMsg.message_id);
      }

      // 2. Добавляем строку и получаем её номер
      const rowNumber = await this.sheetsService.appendCalculation({
        type: state.type,
        weight: state.weight!,
        volume: state.volume!,
        price: state.price!,
        userTelegramId: userId,
        count: state.count!,
      });

      // 3. Ждём, чтобы формула успела посчитать (можно увеличить при необходимости)
      await new Promise(res => setTimeout(res, 1000));
      const result = await this.sheetsService.getCalculationResult(rowNumber);

      // 4. Удаляем сообщение о расчете
      if (waitMsg && 'message_id' in waitMsg) {
        try {
          await ctx.deleteMessage(waitMsg.message_id);
        } catch (e) {
          // Если не удалось удалить — ничего страшного
        }
      }

      // 5. Показываем результат пользователю
      const sent = await ctx.reply(
        `Расчет стоимости доставки:\n\n` +
        `Тип: ${state.type}\n` +
        `Вес: ${state.weight}кг\n` +
        `Количество: ${state.count}\n` +
        `Объем: ${state.volume}м³\n` +
        `Стоимость: ${state.price}¥\n` +
        `Описание: ${state.description}\n\n` +
        `Итоговая стоимость: ${result ?? 'не удалось получить результат'}₽`,
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
        this.stateService.addBotMessage(userId, sent.message_id);
      }

      this.stateService.clearState(userId);
    } catch (error) {
      this.logger.error('Error calculating delivery:', error);
      const sent = await ctx.reply('Произошла ошибка при расчете стоимости. Пожалуйста, попробуйте позже.');
      if ('message_id' in sent) {
        this.stateService.addBotMessage(userId, sent.message_id);
      }
      this.stateService.clearState(userId);
    }
  }
}
