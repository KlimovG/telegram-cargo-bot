import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, sheets_v4 } from 'googleapis';
import * as path from 'path';
import { AddCalculationParams, FieldDictionary, FieldDictionaryEntry } from './types';

@Injectable()
export class GoogleSheetsService {
  private sheets: sheets_v4.Sheets;
  private readonly spreadsheetId: string;
  private fieldDictionary: FieldDictionary | null = null;
  private headers: string[] | null = null;
  private readonly logger = new Logger(GoogleSheetsService.name);

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

  /**
   * Читает справочник из листа "Справочник" и строит объект соответствия
   */
  private async loadFieldDictionary(): Promise<FieldDictionary> {
    if (this.fieldDictionary) return this.fieldDictionary;
    const dictRows = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: 'Справочник!A2:D100',
    });
    const dict: FieldDictionary = {};
    for (const row of dictRows.data.values || []) {
      dict[row[0]] = {
        key: row[0],
        header: row[1],
        unit: row[2],
        hint: row[3],
      };
    }
    this.fieldDictionary = dict;
    return dict;
  }

  /**
   * Читает заголовки главной таблицы и возвращает массив
   */
  private async loadHeaders(): Promise<string[]> {
    if (this.headers) return this.headers;
    const headerRow = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: 'Расчет!1:1',
    });
    this.headers = (headerRow.data.values && headerRow.data.values[0]) ? headerRow.data.values[0] : [];
    return this.headers;
  }

  /**
   * Возвращает индекс столбца по ключу из справочника
   */
  private async getColumnIndexByKey(key: string): Promise<number> {
    const dict = await this.loadFieldDictionary();
    const headers = await this.loadHeaders();
    const entry = dict[key];
    if (!entry) throw new Error(`Нет ключа ${key} в справочнике`);
    const idx = headers.indexOf(entry.header);
    if (idx === -1) throw new Error(`Заголовок ${entry.header} не найден в главной таблице`);
    return idx;
  }

  /**
   * Возвращает подсказку для бота по ключу
   */
  public async getHintByKey(key: string): Promise<string | undefined> {
    const dict = await this.loadFieldDictionary();
    return dict[key]?.hint;
  }

  /**
   * Добавляет расчет с динамическим определением столбцов по справочнику
   * params должен содержать ключи, совпадающие с ключами справочника
   */
  async addCalculationWithFormulaCopy(params: Record<string, any>): Promise<number> {
    try {
      // 1. Получаем количество строк (чтобы узнать, куда вставлять новую строку)
      const getRows = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'Расчет!A:A',
      });
      const rowCount = getRows.data.values ? getRows.data.values.length : 1;
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

      // 3. Перезаписываем значения пользователя в новой строке ТОЛЬКО в нужных ячейках
      const now = new Date();
      const date = now.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
      const dict = await this.loadFieldDictionary();
      const headers = await this.loadHeaders();
      // Собираем значения для записи: ключ -> значение
      const valuesToWrite: Record<string, any> = { ...params, date };
      // Для каждого ключа, который есть в справочнике и есть в valuesToWrite, пишем в нужную ячейку
      for (const key of Object.keys(valuesToWrite)) {
        if (!dict[key]) continue;
        const idx = headers.indexOf(dict[key].header);
        if (idx === -1) continue;
        const colLetter = String.fromCharCode('A'.charCodeAt(0) + idx);

        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `Расчет!${colLetter}${newRow}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[valuesToWrite[key]]] },
        });
      }
      return newRow;
    } catch (error) {
      Logger.error('Ошибка при копировании строки и добавлении расчёта:', error);
      throw error;
    }
  }

  async appendCalculation(params: Record<string, any>): Promise<number> {
    return this.addCalculationWithFormulaCopy(params);
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
        range: 'Расчет', // все строки и столбцы
      });
      const rows = response.data.values || [];
      if (rows.length < 2) return { headers: [], userRows: [] };

      const headers = rows[0];
      const dict = await this.loadFieldDictionary();
      const userIdColIdx = headers.indexOf(dict['userTelegramId']?.header);
      if (userIdColIdx === -1) {
        throw new Error('Столбец userTelegramId не найден');
      }

      // Фильтруем строки по userId (начиная со 2-й строки)
      const userRows = rows.slice(1).filter(row => Number(row[userIdColIdx]) === Number(userId));
      return { headers, userRows };
    } catch (error) {
      Logger.error('Ошибка при получении истории:', error);
      throw error;
    }
  }
} 