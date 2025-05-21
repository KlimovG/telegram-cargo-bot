export default () => ({
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
  },
  google: {
    spreadsheetId: process.env.GOOGLE_SHEETS_ID,
    credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || 'credentials.json',
  },
}); 