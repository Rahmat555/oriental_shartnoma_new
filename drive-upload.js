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

// Укажи корректный ID своей папки
const folderId = '1APSVgcUikEsVkiIlxof3z1uR0B23VttE';

async function uploadToDriveAndAddQR(localPath, contractNumber) {
  try {
    // Проверка файла
    if (!fs.existsSync(localPath)) {
      throw new Error(`❌ PDF fayl topilmadi: ${localPath}`);
    }

    // Проверка доступа к папке
    try {
      await drive.files.get({
        fileId: folderId,
        fields: 'id, name'
      });
    } catch (folderErr) {
      throw new Error(`❌ Google Drive папка topilmadi yoki ruxsat yo'q. Folder ID: ${folderId}`);
    }

    // Чтение PDF и подготовка
    const pdfBytes = fs.readFileSync(localPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Временная загрузка оригинального файла
    const uploadRes = await drive.files.create({
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

    const fileId = uploadRes.data.id;

    // Публикация
    await drive.permissions.create({
      fileId,
      requestBody: {
        type: 'anyone',
        role: 'reader'
      }
    });

    const driveUrl = `https://drive.google.com/file/d/${fileId}/view`;

    // Генерация QR-кода
    const qrDataUrl = await QRCode.toDataURL(driveUrl);
    const qrImageBytes = Buffer.from(qrDataUrl.split(',')[1], 'base64');
    const qrImage = await pdfDoc.embedPng(qrImageBytes);
    const qrDims = qrImage.scale(0.5);

    // Вставка QR на последнюю страницу
    const lastPage = pdfDoc.getPages().slice(-1)[0];
    lastPage.drawImage(qrImage, {
      x: 410,
      y: 56,
      width: qrDims.width,
      height: qrDims.height
    });

    const updatedPdfBytes = await pdfDoc.save();
    fs.writeFileSync(localPath, updatedPdfBytes);

    // Перезапись файла
    await drive.files.update({
      fileId,
      media: {
        mimeType: 'application/pdf',
        body: fs.createReadStream(localPath)
      }
    });

    console.log('✅ QR bilan yuklandi:', driveUrl);
    return driveUrl;

  } catch (err) {
    console.error('❌ Drive yoki QR xatolik:', err.message);
    return null;
  }
}

module.exports = { uploadToDriveAndAddQR };
