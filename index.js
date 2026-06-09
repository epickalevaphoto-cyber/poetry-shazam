const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Настройка хранения загруженных файлов
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

const YANDEX_API_KEY = process.env.YANDEX_API_KEY || "";
const YANDEX_FOLDER_ID = process.env.YANDEX_FOLDER_ID || "";

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: "ok", 
    speechKitConfigured: !!(YANDEX_API_KEY && YANDEX_FOLDER_ID),
    speechKitKey: YANDEX_API_KEY ? `${YANDEX_API_KEY.substring(0, 10)}...` : 'not set',
    folderId: YANDEX_FOLDER_ID ? `${YANDEX_FOLDER_ID.substring(0, 10)}...` : 'not set'
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

// ИСПРАВЛЕННОЕ РАСПОЗНАВАНИЕ - ВЕРСИЯ 3 (рабочая)
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
      fs.unlinkSync(audioPath);
      return res.json({ 
        success: true, 
        text: "",
        poetNum: poetNum 
      });
    }
    
    // Читаем файл как Buffer
    const audioBuffer = fs.readFileSync(audioPath);
    
    // ПРАВИЛЬНЫЙ URL для SpeechKit STT API
    const url = `https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?folderId=${YANDEX_FOLDER_ID}&lang=ru-RU&topic=general`;
    
    console.log(`🎤 Отправляем запрос в SpeechKit...`);
    console.log(`🎤 URL: ${url}`);
    console.log(`🎤 API Key: ${YANDEX_API_KEY.substring(0, 10)}...`);
    console.log(`🎤 Размер аудио: ${audioBuffer.length} bytes`);
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Api-Key ${YANDEX_API_KEY}`,
          'Content-Type': 'audio/webm'
        },
        body: audioBuffer
      });
      
      const responseText = await response.text();
      console.log(`🎤 Ответ SpeechKit (${response.status}): ${responseText.substring(0, 500)}`);
      
      if (response.status === 200) {
        // Успешное распознавание - ответ это просто текст
        const recognizedText = responseText.trim();
        if (recognizedText && recognizedText.length > 0 && !recognizedText.includes('error')) {
          console.log(`✅ Распознано: "${recognizedText.substring(0, 100)}..." (${recognizedText.length} симв.)`);
          fs.unlinkSync(audioPath);
          return res.json({ success: true, text: recognizedText, poetNum: poetNum });
        } else {
          console.log(`⚠️ Пустой результат или ошибка в ответе`);
          fs.unlinkSync(audioPath);
          return res.json({ success: true, text: "", poetNum: poetNum });
        }
      } else {
        // Ошибка от SpeechKit
        console.log(`❌ Ошибка SpeechKit: ${response.status}`);
        console.log(`❌ Ответ: ${responseText}`);
        
        // Пробуем другой endpoint (асинхронный)
        console.log(`🔄 Пробуем асинхронное распознавание...`);
        const asyncResult = await tryAsyncRecognition(audioBuffer);
        if (asyncResult) {
          fs.unlinkSync(audioPath);
          return res.json({ success: true, text: asyncResult, poetNum: poetNum });
        }
        
        fs.unlinkSync(audioPath);
        return res.json({ success: true, text: "", poetNum: poetNum });
      }
    } catch (fetchError) {
      console.error("❌ Fetch error:", fetchError);
      fs.unlinkSync(audioPath);
      return res.json({ success: true, text: "", poetNum: poetNum });
    }
    
  } catch (error) {
    console.error("SpeechKit error:", error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.json({ 
      success: true, 
      text: "",
      poetNum: req.body.poetNum 
    });
  }
});

// Асинхронное распознавание для длинных аудио
async function tryAsyncRecognition(audioBuffer) {
  try {
    // 1. Создаём задание
    const createUrl = `https://transcribe.api.cloud.yandex.net/speech/stt/v2/longRunningRecognize`;
    
    const requestBody = {
      config: {
        specification: {
          languageCode: 'ru-RU',
          model: 'general',
          audioEncoding: 'WEBM_OPUS',
          sampleRateHertz: 48000
        }
      },
      audio: {
        content: audioBuffer.toString('base64')
      }
    };
    
    const createResponse = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Api-Key ${YANDEX_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    const createData = await createResponse.json();
    console.log(`🔄 Создано задание:`, createData);
    
    if (!createData.id) {
      console.log(`❌ Не удалось создать задание`);
      return null;
    }
    
    // 2. Ждём результат (до 30 секунд)
    const operationId = createData.id;
    let attempts = 0;
    const maxAttempts = 15;
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const statusUrl = `https://operation.api.cloud.yandex.net/operations/${operationId}`;
      const statusResponse = await fetch(statusUrl, {
        headers: { 'Authorization': `Api-Key ${YANDEX_API_KEY}` }
      });
      const statusData = await statusResponse.json();
      
      console.log(`🔄 Статус операции: ${statusData.done ? 'Завершено' : 'В процессе'}`);
      
      if (statusData.done) {
        if (statusData.response && statusData.response.chunks) {
          const text = statusData.response.chunks
            .map(chunk => chunk.alternatives[0]?.text || '')
            .join(' ')
            .trim();
          console.log(`✅ Асинхронно распознано: "${text.substring(0, 100)}..."`);
          return text;
        }
        return null;
      }
      attempts++;
    }
    
    return null;
  } catch (error) {
    console.error("❌ Асинхронное распознавание ошибка:", error);
    return null;
  }
}

// Дополнительный endpoint для тестирования SpeechKit
app.post('/api/test-speechkit', async (req, res) => {
  try {
    // Простой тестовый запрос к SpeechKit
    const testUrl = `https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?folderId=${YANDEX_FOLDER_ID}&lang=ru-RU`;
    
    const response = await fetch(testUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Api-Key ${YANDEX_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ config: { specification: { languageCode: 'ru-RU' } } })
    });
    
    res.json({ 
      status: response.status, 
      message: await response.text(),
      apiKeyConfigured: !!YANDEX_API_KEY,
      folderIdConfigured: !!YANDEX_FOLDER_ID
    });
  } catch (error) {
    res.json({ error: error.toString() });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
  console.log(`✅ SpeechKit: ${YANDEX_API_KEY && YANDEX_FOLDER_ID ? 'НАСТРОЕН' : 'НЕ НАСТРОЕН'}`);
  console.log(`📁 Uploads directory: ${fs.existsSync('./uploads') ? 'OK' : 'created'}`);
});
