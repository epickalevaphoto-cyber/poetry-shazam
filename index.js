const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

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

// ПРОСТОЕ РАСПОЗНАВАНИЕ С ОТЛАДКОЙ
app.post('/api/recognize', upload.single('audio'), async (req, res) => {
  console.log("=== НАЧАЛО РАСПОЗНАВАНИЯ ===");
  
  try {
    if (!req.file) {
      console.log("❌ Нет файла аудио");
      return res.status(400).json({ success: false, error: 'No audio file' });
    }
    
    const poetNum = req.body.poetNum;
    const fileSize = req.file.size;
    const filePath = req.file.path;
    
    console.log(`🎤 Поэт ${poetNum}`);
    console.log(`📁 Файл: ${filePath}`);
    console.log(`📏 Размер: ${fileSize} bytes (${(fileSize/1024).toFixed(2)} KB)`);
    
    // Проверяем наличие ключей
    if (!YANDEX_API_KEY || !YANDEX_FOLDER_ID) {
      console.log("❌ SpeechKit не настроен!");
      console.log(`API Key: ${YANDEX_API_KEY ? '✅ есть' : '❌ нет'}`);
      console.log(`Folder ID: ${YANDEX_FOLDER_ID ? '✅ есть' : '❌ нет'}`);
      fs.unlinkSync(filePath);
      return res.json({ success: true, text: "", poetNum });
    }
    
    // Читаем аудио файл
    const audioBuffer = fs.readFileSync(filePath);
    console.log(`📦 Buffer размер: ${audioBuffer.length} bytes`);
    
    // Пробуем отправить как есть
    const url = `https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?folderId=${YANDEX_FOLDER_ID}&lang=ru-RU`;
    
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
    console.log(`📄 Ответ: "${responseText.substring(0, 300)}"`);
    
    // Удаляем временный файл
    fs.unlinkSync(filePath);
    
    if (response.status === 200 && responseText && responseText.trim().length > 0) {
      console.log(`✅ УСПЕХ! Распознано: "${responseText.substring(0, 100)}..."`);
      return res.json({ success: true, text: responseText.trim(), poetNum });
    } else {
      console.log(`⚠️ Не удалось распознать. Ответ: ${responseText}`);
      
      // Пробуем другой формат
      console.log("🔄 Пробуем другой формат (audio/ogg)...");
      
      const formData = new FormData();
      formData.append('file', audioBuffer, {
        filename: 'audio.webm',
        contentType: 'audio/webm'
      });
      
      const response2 = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Api-Key ${YANDEX_API_KEY}`
        },
        body: formData
      });
      
      const responseText2 = await response2.text();
      console.log(`📥 Второй ответ: ${response2.status} - "${responseText2.substring(0, 200)}"`);
      
      if (response2.status === 200 && responseText2 && responseText2.trim().length > 0) {
        return res.json({ success: true, text: responseText2.trim(), poetNum });
      }
      
      return res.json({ success: true, text: "", poetNum });
    }
    
  } catch (error) {
    console.error("❌ ОШИБКА:", error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.json({ success: true, text: "", poetNum: req.body.poetNum });
  }
});

// ТЕСТОВЫЙ ENDPOINT ДЛЯ ДИАГНОСТИКИ
app.get('/api/test-speechkit', async (req, res) => {
  res.json({
    apiKeyConfigured: !!YANDEX_API_KEY,
    folderIdConfigured: !!YANDEX_FOLDER_ID,
    apiKeyPrefix: YANDEX_API_KEY ? YANDEX_API_KEY.substring(0, 10) : null,
    folderIdPrefix: YANDEX_FOLDER_ID ? YANDEX_FOLDER_ID.substring(0, 10) : null
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
  console.log(`✅ SpeechKit API Key: ${YANDEX_API_KEY ? 'НАСТРОЕН' : 'НЕ НАСТРОЕН'}`);
  console.log(`✅ SpeechKit Folder ID: ${YANDEX_FOLDER_ID ? 'НАСТРОЕН' : 'НЕ НАСТРОЕН'}`);
});
