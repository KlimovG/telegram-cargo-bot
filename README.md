# Cargo Bot - Telegram Delivery Cost Calculator

Telegram bot for calculating delivery costs based on cargo parameters. Built with NestJS and integrated with Google Sheets for calculations and data storage.

## Features

- Calculate delivery costs for cargo and white goods
- Support for weight, volume, and price-based calculations
- User request history tracking
- Integration with Google Sheets for calculations and data storage
- Multi-language support (Russian/English)

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Telegram Bot Token (from [@BotFather](https://t.me/BotFather))
- Google Cloud Project with Google Sheets API enabled
- Google Service Account credentials

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd cargo-bot
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
GOOGLE_CREDENTIALS_PATH=path/to/your/credentials.json
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id
```

4. Place your Google Service Account credentials JSON file in the specified path.

## Google Sheets Setup

1. Create a new Google Spreadsheet with the following sheets:
   - "Расчет" - For cost calculations
   - "История" - For storing user request history

2. Share the spreadsheet with the service account email address from your credentials file.

3. Ensure the spreadsheet has the following structure:
   - "Расчет" sheet: Columns A-F (Type, Weight, Volume, Price, Description, Result)
   - "История" sheet: Columns A-F (Timestamp, User ID, Type, Weight, Volume, Price, Description)

## Running the Application

Development mode:
```bash
npm run start:dev
```

Production mode:
```bash
npm run build
npm run start:prod
```

## Usage

1. Start a chat with your bot on Telegram
2. Use the following commands:
   - `/start` - Start the bot and get welcome message
   - `/calculate` - Start a new calculation
   - `/history` - View your calculation history

3. Follow the bot's prompts to enter:
   - Cargo type (cargo/white)
   - Weight (in kg)
   - Volume (in m³)
   - Price (in currency)
   - Description

## Project Structure

```
src/
├── config/           # Configuration files
├── google-sheets/    # Google Sheets integration
├── telegram/         # Telegram bot handlers
├── app.module.ts     # Main application module
└── main.ts          # Application entry point
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 