const express = require('express');
const path = require('path');
const multer = require('multer');
const { Readable } = require('stream');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const upload = multer({ storage: multer.memoryStorage() });

// ========== НАСТРОЙКИ YANDEX CLOUD ==========
// Эти переменные должны быть добавлены в Environment на Render
const YANDEX_API_KEY = process.env.YANDEX_API_KEY || "";
const YANDEX_FOLDER_ID = process.env.YANDEX_FOLDER_ID || "";

// ========== МАРШРУТЫ ==========
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: "ok", 
    message: "Прокси работает!",
    speechKitConfigured: !!(YANDEX_API_KEY && YANDEX_FOLDER_ID),
    timestamp: new Date().toISOString()
  });
});

// Прокси для YandexGPT (Google Apps Script)
app.post('/api/battle', async (req, res) => {
  console.log("📥 Получен запрос на оценку батла");
  
  const GAS_URL = "https://script.google.com/macros/s/AKfycbzFNmmjqYx9WhN_L8T4IklAAHBPih4eHNXAVSOtwMNq4yI9C5T_4p7QWKYGAysBZzbc/exec";
  
  try {
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    console.log("📤 Ответ от Google Apps Script:", data.status);
    res.json(data);
  } catch (error) {
    console.error("❌ Ошибка:", error);
    res.status(500).json({ status: "error", message: error.toString() });
  }
});

// РАСПОЗНАВАНИЕ АУДИО через Yandex SpeechKit
app.post('/api/recognize', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No audio file' });
    }
    
    const poetNum = req.body.poetNum;
    console.log(`🎤 Распознавание аудио Поэта ${poetNum}, размер: ${req.file.size} bytes`);
    
    // Проверяем наличие ключей
    if (!YANDEX_API_KEY || !YANDEX_FOLDER_ID) {
      console.log("⚠️ SpeechKit не настроен: отсутствуют API ключи");
      return res.json({ 
        success: true, 
        text: "⚠️ Распознавание не настроено. Введите текст вручную.",
        poetNum: poetNum 
      });
    }
    
    // Конвертируем аудио в base64
    const audioBase64 = req.file.buffer.toString('base64');
    
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
    console.log("SpeechKit ответ:", JSON.stringify(speechResult).substring(0, 200));
    
    if (speechResult.result) {
      const recognizedText = speechResult.result;
      console.log(`✅ Распознано: ${recognizedText.substring(0, 100)}...`);
      res.json({
        success: true,
        text: recognizedText,
        poetNum: poetNum
      });
    } else if (speechResult.error) {
      throw new Error(speechResult.error.message || "Ошибка распознавания");
    } else {
      throw new Error("Не удалось распознать аудио (возможно, слишком тихо или коротко)");
    }
    
  } catch (error) {
    console.error("SpeechKit error:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      hint: "Попробуйте записать более чётко или введите текст вручную"
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
  console.log(`✅ SpeechKit: ${YANDEX_API_KEY && YANDEX_FOLDER_ID ? 'Настроен' : 'НЕ НАСТРОЕН'}`);
});
