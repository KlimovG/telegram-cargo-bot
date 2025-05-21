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

  async calculateDelivery(params: {
    type: 'cargo' | 'white';
    weight: number;
    volume: number;
    price: number;
    description: string;
  }) {
    try {
      const values = [
        params.type,
        params.weight,
        params.volume,
        params.price,
        params.description
      ];

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: 'Расчет!A2:E2',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [values] },
      });

      const result = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'Расчет!F2',
      });
      this.appendToHistory(result.data.values?.[0]?.[0]);
      return {
        success: true,
        result: result.data.values?.[0]?.[0] || null,
        params
      };
    } catch (error) {
      Logger.error('Ошибка при расчете доставки:', error);
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