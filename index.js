const express = require('express');
const path = require('path');
const multer = require('multer');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const upload = multer({ storage: multer.memoryStorage() });

// Переменные окружения (должны быть добавлены на Render)
const YANDEX_API_KEY = process.env.YANDEX_API_KEY || "";
const YANDEX_FOLDER_ID = process.env.YANDEX_FOLDER_ID || "";

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: "ok", 
    speechKitConfigured: !!(YANDEX_API_KEY && YANDEX_FOLDER_ID)
  });
});

// Прокси для YandexGPT
app.post('/api/battle', async (req, res) => {
  const GAS_URL = "https://script.google.com/macros/s/AKfycbwL7XqW2dgveG5oWLil2cgiyQELKmqEcC0GurcN1SxwYr4CqP7VVGIm1jj0rOVtQImq/exec";
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

// Распознавание аудио через Yandex SpeechKit
app.post('/api/recognize', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No audio file' });
    }
    
    const poetNum = req.body.poetNum;
    console.log(`🎤 Распознавание аудио Поэта ${poetNum}, размер: ${req.file.size} bytes`);
    
    if (!YANDEX_API_KEY || !YANDEX_FOLDER_ID) {
      return res.json({ 
        success: true, 
        text: "🎤 Аудио записано. Для распознавания настройте SpeechKit.",
        poetNum: poetNum 
      });
    }
    
    // Отправляем аудио в SpeechKit
    const audioBase64 = req.file.buffer.toString('base64');
    
    const response = await fetch('https://stt.api.cloud.yandex.net/speech/v2/stt', {
      method: 'POST',
      headers: {
        'Authorization': `Api-Key ${YANDEX_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        config: {
          specification: {
            languageCode: 'ru-RU',
            model: 'general',
            audioEncoding: 'WEBM_OPUS',
            sampleRateHertz: 48000
          }
        },
        audio: { content: audioBase64 }
      })
    });
    
    const result = await response.json();
    
    if (result.result) {
      res.json({ success: true, text: result.result, poetNum: poetNum });
    } else {
      throw new Error(result.error?.message || "Не удалось распознать");
    }
    
  } catch (error) {
    console.error("SpeechKit error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
});
