const express = require('express');
const path = require('path');
const multer = require('multer');
const { Readable } = require('stream');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Настройка multer для приёма аудиофайлов
const upload = multer({ storage: multer.memoryStorage() });

// ⚠️ ЗАМЕНИТЕ НА ВАШИ ДАННЫЕ ИЗ YANDEX CLOUD
const YANDEX_API_KEY = process.env.YANDEX_API_KEY;
const YANDEX_FOLDER_ID = process.env.YANDEX_FOLDER_ID;
// SpeechKit использует тот же API ключ

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Прокси для YandexGPT
app.post('/api/battle', async (req, res) => {
  console.log("📥 Получен запрос на оценку батла");
  try {
    const response = await fetch("https://script.google.com/macros/s/AKfycbwL7XqW2dgveG5oWLil2cgiyQELKmqEcC0GurcN1SxwYr4CqP7VVGIm1jj0rOVtQImq/exec", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    console.log("📤 Ответ от Google Apps Script:", data.status);
    res.json(data);
  } catch (error) {
    console.error("❌ Ошибка прокси:", error);
    res.status(500).json({ status: "error", message: error.toString() });
  }
});

// НОВЫЙ МАРШРУТ: Распознавание аудио через Yandex SpeechKit
app.post('/api/recognize', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No audio file' });
    }
    
    const audioBuffer = req.file.buffer;
    const poetNum = req.body.poetNum;
    
    console.log(`🎤 Получено аудио Поэта ${poetNum}, размер: ${audioBuffer.length} bytes`);
    
    // Преобразуем буфер в Base64 (SpeechKit принимает Base64)
    const audioBase64 = audioBuffer.toString('base64');
    
    // Отправляем запрос в Yandex SpeechKit
    const speechResponse = await fetch('https://stt.api.cloud.yandex.net/speech/v2/stt', {
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
            sampleRateHertz: 48000,
            profanityFilter: false,
            literatureText: true
          }
        },
        audio: {
          content: audioBase64
        }
      })
    });
    
    const speechResult = await speechResponse.json();
    console.log("SpeechKit ответ:", speechResult);
    
    if (speechResult.result) {
      const recognizedText = speechResult.result;
      res.json({
        success: true,
        text: recognizedText,
        poetNum: poetNum
      });
    } else if (speechResult.error) {
      throw new Error(speechResult.error.message || "Ошибка распознавания");
    } else {
      throw new Error("Не удалось распознать аудио");
    }
    
  } catch (error) {
    console.error("SpeechKit error:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      hint: "Возможно, аудио слишком короткое или SpeechKit не настроен"
    });
  }
});

// Проверка работоспособности
app.get('/api/health', (req, res) => {
  res.json({ 
    status: "ok", 
    message: "Прокси работает!",
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
  console.log(`✅ SpeechKit настроен для folder: ${YANDEX_FOLDER_ID}`);
});
