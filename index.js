const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// ⚠️ ЗАМЕНИТЕ НА ВАШ URL ИЗ GOOGLE APPS SCRIPT
const GAS_URL = "https://script.google.com/macros/s/AKfycbwPsFkUqSFwYoKLTbLyR86jJALN78mpntqOseYDgZwPWLv6bMFJvh2LxlffcoNyGD9Ung/exec";

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Проверка работоспособности
app.get('/api/health', (req, res) => {
  res.json({ 
    status: "ok", 
    message: "Сервер работает!",
    timestamp: new Date().toISOString()
  });
});

// Прокси для запросов к Google Apps Script (YandexGPT)
app.post('/api/battle', async (req, res) => {
  console.log("📥 Получен запрос на оценку батла");
  console.log("📝 Поэт 1:", req.body.p1Name, "| Длина текста:", req.body.p1Text?.length || 0);
  console.log("📝 Поэт 2:", req.body.p2Name, "| Длина текста:", req.body.p2Text?.length || 0);
  
  try {
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: req.body.id,
        p1Name: req.body.p1Name,
        p1Text: req.body.p1Text,
        p1Time: req.body.p1Time || "00:00",
        p2Name: req.body.p2Name,
        p2Text: req.body.p2Text,
        p2Time: req.body.p2Time || "00:00"
      })
    });
    
    const data = await response.json();
    console.log("📤 Ответ от Google Apps Script:", data.status);
    res.json(data);
    
  } catch (error) {
    console.error("❌ Ошибка прокси:", error);
    res.status(500).json({ 
      status: "error", 
      message: error.toString(),
      hint: "Проверьте, что Google Apps Script опубликован и доступен"
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
  console.log(`✅ Прокси для GAS: ${GAS_URL}`);
});
