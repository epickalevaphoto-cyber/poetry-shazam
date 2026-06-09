const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Настройка загрузки файлов
const upload = multer({ 
  storage: multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
      cb(null, `audio_${Date.now()}_${req.body.poetNum || 'unknown'}.webm`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }
});

if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

const YANDEX_API_KEY = process.env.YANDEX_API_KEY || "";
const YANDEX_FOLDER_ID = process.env.YANDEX_FOLDER_ID || "";

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Распознавание речи
app.post('/api/recognize', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No audio file' });
    }
    
    const poetNum = req.body.poetNum;
    console.log(`🎤 Распознавание Поэта ${poetNum}, размер: ${(req.file.size / 1024).toFixed(2)} KB`);
    
    if (!YANDEX_API_KEY || !YANDEX_FOLDER_ID) {
      fs.unlinkSync(req.file.path);
      return res.json({ success: true, text: "", poetNum });
    }
    
    const audioBuffer = fs.readFileSync(req.file.path);
    const url = `https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?folderId=${YANDEX_FOLDER_ID}&lang=ru-RU&topic=general`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Api-Key ${YANDEX_API_KEY}`,
        'Content-Type': 'audio/webm'
      },
      body: audioBuffer
    });
    
    const responseText = await response.text();
    console.log(`Ответ SpeechKit: ${response.status} - ${responseText.substring(0, 200)}`);
    
    fs.unlinkSync(req.file.path);
    
    if (response.status === 200 && responseText && responseText.length > 0) {
      return res.json({ success: true, text: responseText, poetNum });
    } else {
      return res.json({ success: true, text: "", poetNum });
    }
    
  } catch (error) {
    console.error("SpeechKit error:", error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.json({ success: true, text: "", poetNum: req.body.poetNum });
  }
});

// Оценка батла через Google Apps Script
app.post('/api/battle', async (req, res) => {
  const GAS_URL = "https://script.google.com/macros/s/AKfycbwPsFkUqSFwYoKLTbLyR86jJALN78mpntqOseYDgZwPWLv6bMFJvh2LxlffcoNyGD9Ung/exec";
  try {
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ status: "error", message: error.toString() });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
  console.log(`✅ SpeechKit: ${YANDEX_API_KEY && YANDEX_FOLDER_ID ? 'НАСТРОЕН' : 'НЕ НАСТРОЕН'}`);
});
