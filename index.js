const express = require('express');
const path = require('path');
const multer = require('multer');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Настройка multer для приёма аудиофайлов
const upload = multer({ storage: multer.memoryStorage() });

// ⚠️ ВАЖНО: ЗАМЕНИТЕ НА ВАШИ ДАННЫЕ ИЗ YANDEX CLOUD
// (Эти переменные должны быть добавлены в Environment на Render)
const YANDEX_API_KEY = process.env.YANDEX_API_KEY || "";
const YANDEX_FOLDER_ID = process.env.YANDEX_FOLDER_ID || "";

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Проверка работоспособности
app.get('/api/health', (req, res) => {
  res.json({ 
    status: "ok", 
    message: "Прокси работает!",
    timestamp: new Date().toISOString()
  });
});

// Прокси для YandexGPT (Google Apps Script)
app.post('/api/battle', async (req, res) => {
  console.log("📥 Получен запрос на оценку батла");
  console.log("Данные:", req.body);
  
  // Ваш URL из Google Apps Script
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
    console.error("❌ Ошибка прокси:", error);
    res.status(500).json({ status: "error", message: error.toString() });
  }
});

// Распознавание аудио (упрощённая версия — пока возвращает заглушку)
app.post('/api/recognize', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No audio file' });
    }
    
    const poetNum = req.body.poetNum;
    console.log(`🎤 Получено аудио Поэта ${poetNum}, размер: ${req.file.size} bytes`);
    
    // ⚠️ ВРЕМЕННО: возвращаем заглушку
    // Распознавание будет работать, когда добавите API ключ SpeechKit
    res.json({ 
      success: true, 
      text: "🎤 Аудио получено. Для распознавания настройте Yandex SpeechKit.",
      poetNum: poetNum 
    });
    
  } catch (error) {
    console.error("Ошибка:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
});
