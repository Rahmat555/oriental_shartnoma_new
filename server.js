const express = require('express');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const QRCode = require('qrcode');
const bodyParser = require('body-parser');
const cors = require('cors');
const { appendToGoogleSheet } = require('./google-sheets');
const { uploadToDriveAndAddQR } = require('./drive-upload');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

app.post('/api/generate-pdf', async (req, res) => {
  const {
    operator, name, jshshir, birthdate,
    educationType, direction, address,
    passport, phone, contractAmount, course
  } = req.body;

  try {
    // 1. Yangi shartnoma raqami
    const numberFile = path.join(__dirname, 'contract_number.txt');
    let contractNumber = 1;
    if (fs.existsSync(numberFile)) {
      contractNumber = parseInt(fs.readFileSync(numberFile, 'utf8')) + 1;
    }
    fs.writeFileSync(numberFile, String(contractNumber));

    // 2. Takroriy foydalanuvchi tekshiruvi
    const dbPath = path.join(__dirname, 'students.json');
    let students = [];
    if (fs.existsSync(dbPath)) {
      students = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    }
    const exists = students.find(e => e.jshshir === jshshir && e.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      return res.status(400).json({ error: 'Bu foydalanuvchi avval roʻyxatdan oʻtgan.' });
    }
    students.push({ name, jshshir, birthdate });
    fs.writeFileSync(dbPath, JSON.stringify(students, null, 2));

    // 3. Sana
    const today = new Date();
    const formattedDate = today.toLocaleDateString('uz-UZ');

    // 4. PDF tayyorlash
    const templatePath = path.join(__dirname, 'public', 'bakalavr.pdf');
    const templateBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const [page1, page2] = pdfDoc.getPages();

    page1.drawText(`Sh: ${contractNumber}`, { x: 253, y: 787, size: 10, font });
    page1.drawText(name, { x: 100, y: 718, size: 10, font });
    page1.drawText(jshshir, { x: 240, y: 762, size: 9, font });
    page1.drawText(educationType, { x: 175, y: 555, size: 10, font });
    page1.drawText(direction, { x: 195, y: 538, size: 10, font });
    page2.drawText(address, { x: 363, y: 234, size: 10, font });
    page2.drawText(passport, { x: 415, y: 214, size: 10, font });
    page2.drawText(jshshir, { x: 375, y: 180, size: 10, font });
    page2.drawText(phone, { x: 345, y: 170, size: 9, font });
    page2.drawText(`Sana: ${birthdate}`, { x: 321, y: 141, size: 10, font });
    page2.drawText(operator, { x: 100, y: 111, size: 10, font });

    page1.drawText(`${Number(contractAmount).toLocaleString()} so‘m`, {
      x: 400,
      y: 115,
      size: 9,
      font
    });

    page1.drawText(`${course}-kurs`, {
      x: 364,
      y: 126,
      size: 9,
      font
    });

    // 5. Saqlash va QR bilan yuklash
    const filename = `shartnoma_${contractNumber}.pdf`;
    const outputPath = path.join(__dirname, 'public', filename);
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);

    // QR kod va Drive yuklash (va PDF ni yangilash bilan)
    uploadToDriveAndAddQR(outputPath, contractNumber)
      .then(driveUrl => {
        if (driveUrl) {
          console.log('Загружено с QR:', driveUrl);
        } else {
          console.warn('Drive yoki QR xatolik');
        }
      })
      .catch(err => {
        console.error('QR yoki Drive jarayoni xatosi:', err.message);
      });

    // 6. Google Sheet fonda
    appendToGoogleSheet({
      contractNumber,
      operator,
      name,
      jshshir,
      birthdate,
      educationType,
      direction,
      address,
      passport,
      phone,
      date: formattedDate,
      contractAmount,
      course
    });


    // 7. Clientga javob — QR hali bo'lmasligi mumkin
    const localUrl = `${req.protocol}://${req.get('host')}/${filename}`;
    res.status(200).json({ contractNumber, downloadUrl: localUrl });

  } catch (err) {
    console.error('PDF yaratishda xatolik:', err);
    res.status(500).json({ error: 'PDF yaratib boʻlmadi.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server ishlamoqda: http://localhost:${PORT}`);
});
