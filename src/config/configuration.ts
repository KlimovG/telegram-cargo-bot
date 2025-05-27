export default () => ({
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
  },
  google: {
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    sheetId: process.env.GOOGLE_SHEET_ID,
    credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH
  },
}); 