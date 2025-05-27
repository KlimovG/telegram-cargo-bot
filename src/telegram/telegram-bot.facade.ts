import { Injectable } from '@nestjs/common';
import { GoogleSheetsService } from '../google-sheets/google-sheets.service';
import { StateService } from './state.service';
import { MessageBuilder } from './utils/message.builder';
import { DeliveryState, DeliveryStep, DeliveryStepHandleData, DeliveryStepResult } from './types';
import { Context } from 'telegraf';

@Injectable()
export class TelegramBotFacade {
    constructor(
        private readonly sheetsService: GoogleSheetsService,
        private readonly stateService: StateService,
    ) { }

    // StateService facade
    setState(userId: string, state: DeliveryState) {
        this.stateService.setState(userId, state);
    }
    getState(userId: string): DeliveryState | undefined {
        return this.stateService.getState(userId);
    }
    clearState(userId: string) {
        this.stateService.clearState(userId);
    }
    addBotMessage(userId: string, messageId: number) {
        this.stateService.addBotMessage(userId, messageId);
    }
    getAndClearBotMessages(userId: string): number[] {
        return this.stateService.getAndClearBotMessages(userId);
    }

    // SheetsService facade
    async getHintByKey(key: string): Promise<string | undefined> {
        return this.sheetsService.getHintByKey(key);
    }
    async appendCalculation(params: Record<string, any>): Promise<number> {
        return this.sheetsService.appendCalculation(params);
    }
    async getCalculationResult(rowNumber: number): Promise<string | null> {
        return this.sheetsService.getCalculationResult(rowNumber);
    }

    async buildHistoryMessage(userId: string): Promise<string> {
        const { headers, userRows } = await this.sheetsService.getUserHistory(userId);
        if (userRows.length === 0) {
            return 'У вас пока нет истории расчетов.';
        }
        const dict = await this.sheetsService['loadFieldDictionary']();
        const getIdx = (key: string) => headers.indexOf(dict[key]?.header);

        return userRows
            .map((row, index) => {
                const builder = new MessageBuilder();
                builder.addLine(`${index + 1}. ${row[getIdx('date')]}`)
                    .addField('Тип', row[getIdx('type')])
                    .addField('Вес', row[getIdx('weight')], 'кг')
                    .addField('Объем', row[getIdx('volume')], 'м³')
                    .addField('Цена', row[getIdx('price')], '¥')
                    .addField('Результат', row[getIdx('result')], '₽')
                    .addLine();
                return builder.build();
            })
            .join('\n');
    }

    async buildCalculationResultMessage(state: DeliveryState, result: string | null): Promise<string> {
        const builder = new MessageBuilder();
        builder.addLine('Расчет стоимости доставки:')
            .addField('Тип', state.type)
            .addField('Вес', state.weight, 'кг')
            .addField('Количество', state.count)
            .addField('Объем', state.volume, 'м³')
            .addField('Стоимость', state.price, '¥')
            .addField('Описание', state.description)
            .addLine()
            .addField('Итоговая стоимость', result ?? 'не удалось получить результат', '₽');
        return builder.build();
    }

    async handleStep(
        { step, text, state }: DeliveryStepHandleData
    ): Promise<DeliveryStepResult> {
        switch (step) {
            case 'weight':
                return this.handleWeightStep(text, state);
            case 'volumePerUnit':
                return this.handleVolumeStep(text, state);
            case 'count':
                return this.handleCountStep(text, state);
            case 'price':
                return this.handlePriceStep(text, state);
            case 'description':
                return this.handleDescriptionStep(text, state);
            default:
                return {
                    valid: false,
                    message: 'Неизвестный шаг. Начните заново с /calc',
                };
        }
    }

    private async handleWeightStep(text: string, state: DeliveryState): Promise<DeliveryStepResult> {
        let weightStr = text.replace(/\s+/g, '').replace(',', '.');
        weightStr = weightStr.replace(/[^\d.]/g, '');
        const weight = parseFloat(weightStr);
        if (isNaN(weight) || weight <= 0) {
            const hint = await this.sheetsService.getHintByKey('weight');
            return {
                valid: false,
                message: hint || 'Пожалуйста, введите корректный вес (число больше 0, например: 12.5):',
            };
        }
        const newState: DeliveryState = { ...state, weight, step: 'volumePerUnit' };
        const hint = await this.sheetsService.getHintByKey('volumePerUnit');
        return {
            valid: true,
            nextStep: 'volumePerUnit' as DeliveryState['step'],
            message: hint || 'Введите объем единицы товара (м³):',
            newState,
        };
    }

    private async handleVolumeStep(text: string, state: DeliveryState): Promise<DeliveryStepResult> {
        let vpuStr = text.replace(/\s+/g, '').replace(',', '.');
        vpuStr = vpuStr.replace(/[^\d.]/g, '');
        const volumePerUnit = parseFloat(vpuStr);
        if (isNaN(volumePerUnit) || volumePerUnit <= 0) {
            const hint = await this.sheetsService.getHintByKey('volumePerUnit');
            return {
                valid: false,
                message: hint || 'Пожалуйста, введите корректный объем единицы товара (например: 0.15):',
            };
        }
        const newState: DeliveryState = { ...state, volumePerUnit, step: 'count' };
        const hint = await this.sheetsService.getHintByKey('count');
        return {
            valid: true,
            nextStep: 'count' as DeliveryState['step'],
            message: hint || 'Введите количество единиц товара:',
            newState,
        };
    }

    private async handleCountStep(text: string, state: DeliveryState): Promise<DeliveryStepResult> {
        let countStr = text.replace(/\s+/g, '');
        countStr = countStr.replace(/[^\d]/g, '');
        const count = parseInt(countStr, 10);
        if (isNaN(count) || count <= 0) {
            const hint = await this.sheetsService.getHintByKey('count');
            return {
                valid: false,
                message: hint || 'Пожалуйста, введите корректное количество (целое число больше 0):',
            };
        }
        const volume = (state.volumePerUnit || 0) * count;
        if (isNaN(volume) || volume <= 0) {
            return {
                valid: false,
                message: 'Ошибка при вычислении общего объема. Попробуйте снова.',
            };
        }
        const newState: DeliveryState = { ...state, count, volume, step: 'price' };
        const hint = await this.sheetsService.getHintByKey('price');
        return {
            valid: true,
            nextStep: 'price' as DeliveryState['step'],
            message: hint || 'Введите стоимость товара в юанях:',
            newState,
        };
    }

    private async handlePriceStep(text: string, state: DeliveryState): Promise<DeliveryStepResult> {
        let priceStr = text.replace(/\s+/g, '').replace(',', '.');
        priceStr = priceStr.replace(/[^\d.]/g, '');
        const price = parseFloat(priceStr);
        if (isNaN(price) || price <= 0) {
            const hint = await this.sheetsService.getHintByKey('price');
            return {
                valid: false,
                message: hint || 'Пожалуйста, введите корректную стоимость (число больше 0, например: 1500):',
            };
        }
        const newState: DeliveryState = { ...state, price, step: 'description' };
        const hint = await this.sheetsService.getHintByKey('description');
        return {
            valid: true,
            nextStep: 'description' as DeliveryState['step'],
            message: hint || 'Введите описание товара:',
            newState,
        };
    }

    private async handleDescriptionStep(text: string, state: DeliveryState): Promise<DeliveryStepResult> {
        const newState: DeliveryState = { ...state, description: text, step: 'complete' };
        return {
            valid: true,
            complete: true,
            message: '',
            newState,
        };
    }

    async processCalculation(ctx: Context, userId: string, state: DeliveryState): Promise<void> {
        try {
            // Удаляем все предыдущие сообщения бота
            const oldMessages = this.getAndClearBotMessages(userId);
            for (const msgId of oldMessages) {
                try { await ctx.deleteMessage(msgId); } catch (e) {}
            }

            // 1. Сообщаем о начале расчета
            const waitMsg = await ctx.reply('Выполняется расчет, пожалуйста, подождите...');
            if (waitMsg && 'message_id' in waitMsg) {
                this.addBotMessage(userId, waitMsg.message_id);
            }

            // 2. Добавляем строку и получаем её номер
            const rowNumber = await this.appendCalculation({
                type: state.type,
                weight: state.weight!,
                volume: state.volume!,
                price: state.price!,
                userTelegramId: userId,
                count: state.count!,
            });

            // 3. Ждём, чтобы формула успела посчитать (можно увеличить при необходимости)
            await new Promise(res => setTimeout(res, 1000));
            const result = await this.getCalculationResult(rowNumber);

            // 4. Удаляем сообщение о расчете
            if (waitMsg && 'message_id' in waitMsg) {
                try {
                    await ctx.deleteMessage(waitMsg.message_id);
                } catch (e) {
                    // Если не удалось удалить — ничего страшного
                }
            }

            // 5. Показываем результат пользователю
            const message = await this.buildCalculationResultMessage(state, result);
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
                this.addBotMessage(userId, sent.message_id);
            }

            this.clearState(userId);
        } catch (error) {
            // Можно пробросить ошибку или обработать здесь
            const sent = await ctx.reply('Произошла ошибка при расчете стоимости. Пожалуйста, попробуйте позже.');
            if ('message_id' in sent) {
                this.addBotMessage(userId, sent.message_id);
            }
            this.clearState(userId);
        }
    }
} 