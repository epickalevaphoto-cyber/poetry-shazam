const express = require('express');
const path = require('path');
const multer = require('multer');
const FormData = require('form-data');
const fs = require('fs');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const upload = multer({ storage: multer.memoryStorage() });

const YANDEX_API_KEY = process.env.YANDEX_API_KEY || "";
const YANDEX_FOLDER_ID = process.env.YANDEX_FOLDER_ID || "";

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: "ok", 
    speechKitConfigured: !!(YANDEX_API_KEY && YANDEX_FOLDER_ID),
    apiKeyLength: YANDEX_API_KEY.length,
    folderIdLength: YANDEX_FOLDER_ID.length
  });
});

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

// РАСПОЗНАВАНИЕ С ДИАГНОСТИКОЙ
app.post('/api/recognize', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No audio file' });
    }
    
    const poetNum = req.body.poetNum;
    console.log(`🎤 Распознавание аудио Поэта ${poetNum}, размер: ${req.file.size} bytes`);
    
    // СОХРАНЯЕМ АУДИО ДЛЯ ОТЛАДКИ
    const filename = `audio_poet${poetNum}_${Date.now()}.webm`;
    fs.writeFileSync(path.join(__dirname, filename), req.file.buffer);
    console.log(`🎤 Аудио сохранено: ${filename}`);
    
    if (!YANDEX_API_KEY || !YANDEX_FOLDER_ID) {
      return res.json({ 
        success: true, 
        text: "⚠️ SpeechKit не настроен. Введите текст вручную.",
        poetNum: poetNum 
      });
    }
    
    // ПРОБУЕМ ДРУГОЙ ENDPOINT
    const formData = new FormData();
    formData.append('audio', req.file.buffer, { filename: 'audio.webm', contentType: 'audio/webm' });
    formData.append('config', JSON.stringify({
      specification: {
        languageCode: 'ru-RU',
        model: 'general',
        audioEncoding: 'WEBM_OPUS',
        sampleRateHertz: 48000
      }
    }));
    
    // Синхронный endpoint (до 30 секунд)
    const url = `https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?folderId=${YANDEX_FOLDER_ID}`;
    console.log(`🎤 Отправка запроса в SpeechKit...`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Api-Key ${YANDEX_API_KEY}`
      },
      body: formData
    });
    
    const resultText = await response.text();
    console.log(`🎤 Статус: ${response.status}, Ответ: ${resultText}`);
    
    if (response.status === 200 && resultText !== '{"result":""}') {
      try {
        const parsed = JSON.parse(resultText);
        if (parsed.result && parsed.result.trim()) {
          res.json({ success: true, text: parsed.result, poetNum: poetNum });
        } else {
          res.json({ 
            success: true, 
            text: "🎤 Аудио записано, но речь не распознана. Говорите чётче.",
            poetNum: poetNum 
          });
        }
      } catch(e) {
        res.json({ success: true, text: resultText, poetNum: poetNum });
      }
    } else {
      res.json({ 
        success: true, 
        text: `🎤 Аудио записано (${Math.round(req.file.size/1024)} KB), но не распознано. Проверьте качество записи.`,
        poetNum: poetNum 
      });
    }
    
  } catch (error) {
    console.error("SpeechKit error:", error);
    res.json({ 
      success: true, 
      text: `⚠️ Ошибка: ${error.message}. Введите текст вручную.`,
      poetNum: req.body.poetNum 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
});
