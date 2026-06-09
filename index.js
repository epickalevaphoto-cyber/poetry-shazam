const express = require('express');
const path = require('path');
const multer = require('multer');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const upload = multer({ storage: multer.memoryStorage() });

// Переменные окружения (должны быть на Render)
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

// Упрощённое распознавание с диагностикой
app.post('/api/recognize', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No audio file' });
    }
    
    const poetNum = req.body.poetNum;
    console.log(`🎤 Распознавание аудио Поэта ${poetNum}, размер: ${req.file.size} bytes`);
    
    if (!YANDEX_API_KEY || !YANDEX_FOLDER_ID) {
      console.log("❌ Нет API ключа");
      return res.json({ 
        success: true, 
        text: "⚠️ SpeechKit не настроен. Добавьте ключи в Environment на Render.",
        poetNum: poetNum 
      });
    }
    
    // Конвертируем аудио в base64
    const audioBase64 = req.file.buffer.toString('base64');
    console.log(`🎤 Аудио в base64, длина: ${audioBase64.length}`);
    
    // Отправляем запрос в Yandex SpeechKit
    const requestBody = {
      config: {
        specification: {
          languageCode: 'ru-RU',
          model: 'general',
          audioEncoding: 'WEBM_OPUS',
          sampleRateHertz: 48000
        }
      },
      audio: { content: audioBase64 }
    };
    
    console.log(`🎤 Отправка запроса в SpeechKit...`);
    
    const response = await fetch('https://stt.api.cloud.yandex.net/speech/v2/stt', {
      method: 'POST',
      headers: {
        'Authorization': `Api-Key ${YANDEX_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    console.log(`🎤 Статус ответа: ${response.status}`);
    
    const resultText = await response.text();
    console.log(`🎤 Ответ от SpeechKit (первые 200 символов): ${resultText.substring(0, 200)}`);
    
    let result;
    try {
      result = JSON.parse(resultText);
    } catch(e) {
      console.error("❌ Не JSON ответ:", resultText);
      return res.json({ 
        success: true, 
        text: `⚠️ Ошибка SpeechKit: сервер вернул не JSON. Проверьте API ключ и права.`,
        poetNum: poetNum 
      });
    }
    
    if (result.result) {
      console.log(`✅ Распознано: ${result.result.substring(0, 100)}...`);
      res.json({ success: true, text: result.result, poetNum: poetNum });
    } else if (result.error) {
      console.error(`❌ Ошибка SpeechKit:`, result.error);
      res.json({ 
        success: true, 
        text: `⚠️ Ошибка: ${result.error.message || 'неизвестная'}. Введите текст вручную.`,
        poetNum: poetNum 
      });
    } else {
      throw new Error("Неизвестный ответ");
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
  console.log(`✅ SpeechKit: ${YANDEX_API_KEY && YANDEX_FOLDER_ID ? 'НАСТРОЕН' : 'НЕ НАСТРОЕН'}`);
  console.log(`✅ API Key длина: ${YANDEX_API_KEY.length}`);
});
