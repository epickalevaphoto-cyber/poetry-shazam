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
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Создаём папку для загрузок
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

// Получаем ключи из переменных окружения
const YANDEX_API_KEY = process.env.YANDEX_API_KEY || "";
const YANDEX_FOLDER_ID = process.env.YANDEX_FOLDER_ID || "";

// ============ ОСНОВНЫЕ ENDPOINTS ============

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Диагностика SpeechKit
app.get('/api/health', (req, res) => {
  res.json({ 
    status: "ok", 
    speechKitConfigured: !!(YANDEX_API_KEY && YANDEX_FOLDER_ID),
    apiKeyPresent: !!YANDEX_API_KEY,
    folderIdPresent: !!YANDEX_FOLDER_ID,
    apiKeyPrefix: YANDEX_API_KEY ? YANDEX_API_KEY.substring(0, 10) : null,
    folderIdPrefix: YANDEX_FOLDER_ID ? YANDEX_FOLDER_ID.substring(0, 10) : null
  });
});

// Тестовый endpoint для проверки SpeechKit
app.get('/api/test-speechkit', async (req, res) => {
  try {
    if (!YANDEX_API_KEY || !YANDEX_FOLDER_ID) {
      return res.json({ 
        success: false, 
        message: "SpeechKit не настроен. Установите переменные окружения YANDEX_API_KEY и YANDEX_FOLDER_ID" 
      });
    }
    
    // Простой тестовый запрос к SpeechKit (пустое аудио)
    const testUrl = `https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?folderId=${YANDEX_FOLDER_ID}&lang=ru-RU`;
    
    const response = await fetch(testUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Api-Key ${YANDEX_API_KEY}`,
        'Content-Type': 'audio/webm'
      },
      body: Buffer.from([]) // пустое тело
    });
    
    res.json({ 
      success: response.status === 400, // 400 ожидаем (нет аудио)
      status: response.status,
      message: response.status === 400 ? "SpeechKit работает (ожидаемо вернул 400 на пустой запрос)" : `Неожиданный статус: ${response.status}`,
      apiKeyConfigured: true,
      folderIdConfigured: true
    });
  } catch (error) {
    res.json({ 
      success: false, 
      message: error.toString(),
      apiKeyConfigured: !!YANDEX_API_KEY,
      folderIdConfigured: !!YANDEX_FOLDER_ID
    });
  }
});

// Распознавание речи через Yandex SpeechKit
app.post('/api/recognize', upload.single('audio'), async (req, res) => {
  console.log("\n=== НАЧАЛО РАСПОЗНАВАНИЯ ===");
  
  try {
    // Проверяем наличие аудиофайла
    if (!req.file) {
      console.log("❌ Нет файла аудио");
      return res.status(400).json({ success: false, error: 'No audio file' });
    }
    
    const poetNum = req.body.poetNum;
    const fileSize = req.file.size;
    const filePath = req.file.path;
    
    console.log(`🎤 Поэт: ${poetNum}`);
    console.log(`📁 Файл: ${filePath}`);
    console.log(`📏 Размер: ${fileSize} bytes (${(fileSize/1024).toFixed(2)} KB)`);
    
    // Проверяем наличие ключей SpeechKit
    if (!YANDEX_API_KEY || !YANDEX_FOLDER_ID) {
      console.log("⚠️ SpeechKit не настроен. Возвращаем пустой результат.");
      fs.unlinkSync(filePath);
      return res.json({ 
        success: true, 
        text: "", 
        poetNum,
        message: "SpeechKit not configured" 
      });
    }
    
    // Проверяем размер аудио (слишком маленькое)
    if (fileSize < 1000) {
      console.log("⚠️ Аудио слишком маленькое (< 1KB), возможно пустая запись");
      fs.unlinkSync(filePath);
      return res.json({ 
        success: true, 
        text: "", 
        poetNum,
        message: "Audio too short" 
      });
    }
    
    // Читаем аудио файл
    const audioBuffer = fs.readFileSync(filePath);
    console.log(`📦 Buffer размер: ${audioBuffer.length} bytes`);
    
    // Отправляем запрос в SpeechKit
    const url = `https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?folderId=${YANDEX_FOLDER_ID}&lang=ru-RU&topic=general`;
    
    console.log(`📤 Отправляем запрос в SpeechKit...`);
    console.log(`🔑 API Key: ${YANDEX_API_KEY.substring(0, 10)}...`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Api-Key ${YANDEX_API_KEY}`,
        'Content-Type': 'audio/webm'
      },
      body: audioBuffer
    });
    
    const responseText = await response.text();
    console.log(`📥 Статус ответа: ${response.status}`);
    console.log(`📄 Ответ: "${responseText.substring(0, 500)}"`);
    
    // Удаляем временный файл
    fs.unlinkSync(filePath);
    
    // Обрабатываем успешный ответ
    if (response.status === 200 && responseText && responseText.trim().length > 0) {
      const recognizedText = responseText.trim();
      console.log(`✅ УСПЕХ! Распознано: "${recognizedText.substring(0, 100)}..." (${recognizedText.length} симв.)`);
      return res.json({ success: true, text: recognizedText, poetNum });
    } 
    
    // Обрабатываем ошибки
    else if (response.status === 200 && (!responseText || responseText.trim().length === 0)) {
      console.log(`⚠️ Речь не распознана (пустой ответ)`);
      return res.json({ success: true, text: "", poetNum, message: "No speech detected" });
    }
    
    else {
      console.log(`⚠️ Ошибка SpeechKit: ${response.status}`);
      return res.json({ success: true, text: "", poetNum, message: `SpeechKit error: ${response.status}` });
    }
    
  } catch (error) {
    console.error("❌ ОШИБКА в распознавании:", error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.json({ 
      success: true, 
      text: "", 
      poetNum: req.body.poetNum,
      message: error.toString() 
    });
  }
});

// Оценка батла через Google Apps Script
app.post('/api/battle', async (req, res) => {
  const GAS_URL = "https://script.google.com/macros/s/AKfycbwPsFkUqSFwYoKLTbLyR86jJALN78mpntqOseYDgZwPWLv6bMFJvh2LxlffcoNyGD9Ung/exec";
  
  console.log("\n=== НАЧАЛО ОЦЕНКИ БАТЛА ===");
  console.log(`Батл ID: ${req.body.id}`);
  console.log(`Поэт 1: ${req.body.p1Name} (${req.body.p1Text?.length || 0} симв.)`);
  console.log(`Поэт 2: ${req.body.p2Name} (${req.body.p2Text?.length || 0} симв.)`);
  
  try {
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    
    const data = await response.json();
    console.log(`Ответ GAS: ${data.status}`);
    
    if (data.status === "success") {
      console.log(`Оценки: П1: ${data.p1Content}/${data.p1Delivery}, П2: ${data.p2Content}/${data.p2Delivery}`);
    } else {
      console.log(`Ошибка GAS: ${data.message}`);
    }
    
    res.json(data);
  } catch (error) {
    console.error("❌ Ошибка оценки:", error);
    res.status(500).json({ 
      status: "error", 
      message: error.toString(),
      p1Content: 3,
      p1Delivery: 3,
      p2Content: 3,
      p2Delivery: 3,
      p1Critique: "Ошибка при оценке. Попробуйте позже.",
      p2Critique: "Ошибка при оценке. Попробуйте позже.",
      totalVerdict: "Не удалось оценить батл из-за технической ошибки."
    });
  }
});

// ============ ЗАПУСК СЕРВЕРА ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Сервер запущен на порту ${PORT}`);
  console.log(`🌐 Доступен по адресу: http://localhost:${PORT}`);
  console.log(`\n📋 КОНФИГУРАЦИЯ SPEECHKIT:`);
  console.log(`   API Key: ${YANDEX_API_KEY ? '✅ НАСТРОЕН (' + YANDEX_API_KEY.substring(0, 10) + '...)' : '❌ НЕ НАСТРОЕН'}`);
  console.log(`   Folder ID: ${YANDEX_FOLDER_ID ? '✅ НАСТРОЕН (' + YANDEX_FOLDER_ID.substring(0, 10) + '...)' : '❌ НЕ НАСТРОЕН'}`);
  console.log(`\n💡 Если SpeechKit не настроен, распознавание будет работать через Web Speech API в браузере`);
  console.log(`📁 Uploads directory: ${fs.existsSync('./uploads') ? '✅ OK' : '⚠️ создана'}\n`);
});
