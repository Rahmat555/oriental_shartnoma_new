require('dotenv').config();
const { google } = require('googleapis');

async function appendToGoogleSheet(data) {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId: '1DA2Y8NXei2uO6ULY7u1PuDc4rTH54cr388mGws62c5s',
      range: 'A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          data.contractNumber, data.operator, data.name, data.jshshir,
          data.birthdate, data.educationType, data.direction,
          data.address, data.passport, data.phone, data.date
        ]]
      }
    });

    console.log('✅ Google Sheetga yozildi');
  } catch (err) {
    console.error('❌ Google Sheets yozishda xatolik:', err.message);
  }
}

module.exports = { appendToGoogleSheet };
