import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, sheets_v4 } from 'googleapis';
import * as path from 'path';

@Injectable()
export class GoogleSheetsService {
  private sheets: sheets_v4.Sheets;
  private readonly spreadsheetId: string;

  constructor(private configService: ConfigService) {
    const credentialsPath = this.configService.get<string>('google.credentialsPath');
    const spreadsheetId = this.configService.get<string>('google.spreadsheetId');

    if (!credentialsPath || !spreadsheetId) {
      throw new Error('Google Sheets configuration is incomplete');
    }

    const auth = new google.auth.GoogleAuth({
      keyFile: path.join(process.cwd(), credentialsPath),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    this.sheets = google.sheets({ version: 'v4', auth });
    this.spreadsheetId = spreadsheetId;
  }

  async appendToHistory(values: any[]) {
    try {
      const timestamp = new Date().toISOString();
      const rowData = [timestamp, ...values];
      
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: 'История!A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [rowData] },
      });
    } catch (error) {
      Logger.error('Ошибка при добавлении в историю:', error);
      throw error;
    }
  }

  /**
   * Копирует последнюю строку листа 'Расчет' (с формулами) в новую строку,
   * затем перезаписывает значения пользователя в нужные ячейки.
   * Возвращает номер новой строки.
   */
  async addCalculationWithFormulaCopy({
    type,
    weight,
    volume,
    price,
  }: {
    type: string;
    weight: number;
    volume: number;
    price: number;
  }): Promise<number> {
    try {
      // 1. Получаем количество строк (чтобы узнать, куда вставлять новую строку)
      const getRows = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'Расчет!A:A',
      });
      const rowCount = getRows.data.values ? getRows.data.values.length : 1;
      // Новая строка всегда добавляется в конец
      const newRow = rowCount + 1;

      // 2. Копируем строку-образец (2-ю строку) в новую строку
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [
            {
              copyPaste: {
                source: {
                  sheetId: 600372163, // <-- sheetId листа 'Расчет', подставь свой gid
                  startRowIndex: 1, // строка 2 (индексация с 0)
                  endRowIndex: 2,
                  startColumnIndex: 0,
                  endColumnIndex: 21,
                },
                destination: {
                  sheetId: 600372163, // <-- sheetId листа 'Расчет', подставь свой gid
                  startRowIndex: newRow - 1,
                  endRowIndex: newRow,
                  startColumnIndex: 0,
                  endColumnIndex: 21,
                },
                pasteType: 'PASTE_NORMAL',
                pasteOrientation: 'NORMAL',
              },
            },
          ],
        },
      });

      // 3. Перезаписываем значения пользователя в новой строке ТОЛЬКО в нужных ячейках, чтобы не затирать формулы
      const now = new Date();
      const date = now.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
      const updates = [
        { range: `Расчет!A${newRow}`, value: date },
        { range: `Расчет!D${newRow}`, value: type },
        { range: `Расчет!E${newRow}`, value: volume },
        { range: `Расчет!G${newRow}`, value: weight },
        { range: `Расчет!L${newRow}`, value: price },
        // Столбец U не трогаем!
      ];
      for (const upd of updates) {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: upd.range,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[upd.value]] },
        });
      }
      return newRow;
    } catch (error) {
      Logger.error('Ошибка при копировании строки и добавлении расчёта:', error);
      throw error;
    }
  }

  // Обновляю appendCalculation для использования новой логики
  async appendCalculation({
    type,
    weight,
    volume,
    price,
  }: {
    type: string;
    weight: number;
    volume: number;
    price: number;
  }): Promise<number> {
    return this.addCalculationWithFormulaCopy({ type, weight, volume, price });
  }

  /**
   * Получает результат расчета из столбца U указанной строки
   */
  async getCalculationResult(rowNumber: number): Promise<string | null> {
    try {
      const range = `Расчет!U${rowNumber}`;
      const result = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range,
      });
      return result.data.values?.[0]?.[0] || null;
    } catch (error) {
      Logger.error('Ошибка при получении результата расчета:', error);
      throw error;
    }
  }

  async getUserHistory(userId: string) {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'История!A:F',
      });

      const rows = response.data.values || [];
      return rows.filter(row => row[1] === userId);
    } catch (error) {
      Logger.error('Ошибка при получении истории:', error);
      throw error;
    }
  }
} 