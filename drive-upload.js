const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const QRCode = require('qrcode');
const { PDFDocument } = require('pdf-lib');

const auth = new google.auth.GoogleAuth({
  credentials: process.env.GOOGLE_CREDENTIALS_JSON
    ? JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON)
    : require('./google-credentials.json'),
  scopes: ['https://www.googleapis.com/auth/drive']
});

const drive = google.drive({ version: 'v3', auth });

const folderId = '1fdUby-KZFDCK2H36BsmyF_GmGwIBsdyg'; // вставь свой ID папки

async function uploadToDriveAndAddQR(localPath, contractNumber) {
  try {
    const pdfBytes = fs.readFileSync(localPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // временно заливаем оригинальный PDF
    const driveRes = await drive.files.create({
      requestBody: {
        name: `shartnoma_${contractNumber}.pdf`,
        mimeType: 'application/pdf',
        parents: [folderId]
      },
      media: {
        mimeType: 'application/pdf',
        body: fs.createReadStream(localPath)
      }
    });

    const fileId = driveRes.data.id;

    // делаем файл публичным
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      }
    });

    const driveUrl = `https://drive.google.com/file/d/${fileId}/view`;

    // вставка QR кода на последнюю страницу
    const qrDataUrl = await QRCode.toDataURL(driveUrl);
    const qrImageBytes = Buffer.from(qrDataUrl.split(',')[1], 'base64');
    const qrImage = await pdfDoc.embedPng(qrImageBytes);
    const qrDims = qrImage.scale(0.5);

    const lastPage = pdfDoc.getPages().slice(-1)[0];
    lastPage.drawImage(qrImage, {
      x: 410,
      y: 56,
      width: qrDims.width,
      height: qrDims.height
    });

    const updatedBytes = await pdfDoc.save();
    fs.writeFileSync(localPath, updatedBytes);

    // перезаливаем файл с QR
    await drive.files.update({
      fileId,
      media: {
        mimeType: 'application/pdf',
        body: fs.createReadStream(localPath)
      }
    });

    console.log('✅ QR yuklangan fayl: ', driveUrl);
    return driveUrl;

  } catch (err) {
    console.error('❌ Drive yoki QR xatolik:', err.message);
    return null;
  }
}

module.exports = { uploadToDriveAndAddQR };
