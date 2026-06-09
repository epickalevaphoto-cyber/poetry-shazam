const express = require('express');
const path = require('path');
const multer = require('multer');
const FormData = require('form-data');
const fs = require('fs');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const upload = multer({ 
  storage: multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
      cb(null, `audio_${Date.now()}_${req.body.poetNum}.webm`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Создаём папку для загрузок
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

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

// ИСПРАВЛЕННОЕ РАСПОЗНАВАНИЕ - ВЕРСИЯ 2
app.post('/api/recognize', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No audio file' });
    }
    
    const poetNum = req.body.poetNum;
    const audioPath = req.file.path;
    const fileSizeKB = (req.file.size / 1024).toFixed(2);
    
    console.log(`🎤 Распознавание Поэта ${poetNum}, файл: ${audioPath}, размер: ${fileSizeKB} KB`);
    
    // Проверяем настройки
    if (!YANDEX_API_KEY || !YANDEX_FOLDER_ID) {
      console.log("⚠️ SpeechKit не настроен");
      return res.json({ 
        success: true, 
        text: "⚠️ SpeechKit не настроен. Введите текст вручную.",
        poetNum: poetNum 
      });
    }
    
    // ВАЖНО: SpeechKit ожидает raw audio данные, а не multipart/form-data
    // Используем простой POST с audio/webm в теле
    
    const url = `https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?folderId=${YANDEX_FOLDER_ID}&lang=ru-RU&topic=general`;
    
    console.log(`🎤 Отправляем ${fileSizeKB}KB в SpeechKit...`);
    
    // Читаем файл как Buffer
    const audioBuffer = fs.readFileSync(audioPath);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Api-Key ${YANDEX_API_KEY}`,
        'Content-Type': 'audio/webm'
      },
      body: audioBuffer
    });
    
    const responseText = await response.text();
    console.log(`🎤 Ответ SpeechKit (${response.status}): ${responseText.substring(0, 300)}`);
    
    if (response.status === 200) {
      // Успешное распознавание
      const recognizedText = responseText.trim();
      if (recognizedText && recognizedText.length > 0) {
        console.log(`✅ Распознано ${recognizedText.length} символов`);
        res.json({ success: true, text: recognizedText, poetNum: poetNum });
      } else {
        console.log(`⚠️ Пустой результат для файла ${fileSizeKB}KB`);
        // Попробуем альтернативный метод с указанием кодека
        await tryAlternativeRecognition(audioBuffer, poetNum, res);
      }
    } else {
      console.log(`❌ Ошибка SpeechKit: ${response.status}`);
      // Пробуем альтернативный метод
      await tryAlternativeRecognition(audioBuffer, poetNum, res);
    }
    
    // Удаляем временный файл
    fs.unlinkSync(audioPath);
    
  } catch (error) {
    console.error("SpeechKit error:", error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.json({ 
      success: true, 
      text: `⚠️ Ошибка: ${error.message}. Введите текст вручную.`,
      poetNum: req.body.poetNum 
    });
  }
});

// Альтернативный метод с явным указанием параметров
async function tryAlternativeRecognition(audioBuffer, poetNum, res) {
  console.log("🔄 Пробуем альтернативный метод распознавания...");
  
  try {
    const url = `https://stt.api.cloud.yandex.net/speech/v1/stt:recognize`;
    const params = new URLSearchParams({
      folderId: YANDEX_FOLDER_ID,
      lang: 'ru-RU',
      topic: 'general',
      format: 'webm'
    });
    
    const response = await fetch(`${url}?${params}`, {
      method: 'POST',
      headers: {
        'Authorization': `Api-Key ${YANDEX_API_KEY}`,
        'Content-Type': 'audio/webm;codecs=opus'
      },
      body: audioBuffer
    });
    
    const text = await response.text();
    console.log(`🔄 Альтернативный ответ: ${text.substring(0, 200)}`);
    
    if (response.status === 200 && text && text.length > 0) {
      res.json({ success: true, text: text, poetNum: poetNum });
    } else {
      res.json({ 
        success: true, 
        text: `⚠️ Распознавание не удалось (${response.status}). Введите текст вручную.`,
        poetNum: poetNum 
      });
    }
  } catch (err) {
    res.json({ 
      success: true, 
      text: `⚠️ Ошибка распознавания. Введите текст вручную.`,
      poetNum: poetNum 
    });
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
  console.log(`✅ SpeechKit: ${YANDEX_API_KEY && YANDEX_FOLDER_ID ? 'НАСТРОЕН' : 'НЕ НАСТРОЕН'}`);
  console.log(`📁 Uploads directory: ${fs.existsSync('./uploads') ? 'OK' : 'created'}`);
});
