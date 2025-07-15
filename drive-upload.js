const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const QRCode = require('qrcode');
const { PDFDocument } = require('pdf-lib');

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
  scopes: ['https://www.googleapis.com/auth/drive']
});

const drive = google.drive({ version: 'v3', auth });

// ✅ Укажи ID папки в Shared Drive
const folderId = '1MHnkAisRMaLL1TRQGbAXtbWxuYLHaOrE';

async function uploadToDriveAndAddQR(localPath, contractNumber) {
  try {
    // Проверка, существует ли локальный файл
    if (!fs.existsSync(localPath)) {
      throw new Error(`Local file not found: ${localPath}`);
    }

    // ✅ Проверка, существует ли папка в Shared Drive
    await drive.files.get({
      fileId: folderId,
      fields: 'id, name',
      supportsAllDrives: true
    });

    const pdfBytes = fs.readFileSync(localPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Временно загружаем PDF
    const uploadRes = await drive.files.create({
      requestBody: {
        name: `shartnoma_${contractNumber}.pdf`,
        mimeType: 'application/pdf',
        parents: [folderId]
      },
      media: {
        mimeType: 'application/pdf',
        body: fs.createReadStream(localPath)
      },
      supportsAllDrives: true
    });

    const fileId = uploadRes.data.id;

    // Делаем файл публичным
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      },
      supportsAllDrives: true
    });

    const driveUrl = `https://drive.google.com/file/d/${fileId}/view`;

    // Генерируем QR-код по этой ссылке
    const qrDataUrl = await QRCode.toDataURL(driveUrl);
    const qrImageBytes = Buffer.from(qrDataUrl.split(',')[1], 'base64');
    const qrImage = await pdfDoc.embedPng(qrImageBytes);
    const qrDims = qrImage.scale(0.5);

    // Добавляем QR на последнюю страницу
    const lastPage = pdfDoc.getPages().slice(-1)[0];
    lastPage.drawImage(qrImage, {
      x: 410,
      y: 56,
      width: qrDims.width,
      height: qrDims.height
    });

    const updatedBytes = await pdfDoc.save();
    fs.writeFileSync(localPath, updatedBytes);

    // Обновляем файл в Drive с QR
    await drive.files.update({
      fileId,
      media: {
        mimeType: 'application/pdf',
        body: fs.createReadStream(localPath)
      },
      supportsAllDrives: true
    });

    console.log('✅ QR yuklangan fayl:', driveUrl);
    return driveUrl;

  } catch (err) {
    console.error('❌ Drive yoki QR xatolik:', err.message);
    return null;
  }
}

module.exports = { uploadToDriveAndAddQR };
