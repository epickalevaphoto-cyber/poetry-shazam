const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ЯВНЫЙ МАРШРУТ ДЛЯ ГЛАВНОЙ СТРАНИЦЫ
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ⚠️ ВАЖНО: ЗАМЕНИТЕ ЭТУ ССЫЛКУ НА ВАШ АКТУАЛЬНЫЙ URL ИЗ GOOGLE APPS SCRIPT
// Откройте в браузере ваш скрипт — он должен показывать {"status":"active"...}
// Только после этого вставляйте ссылку сюда
const GAS_URL = "https://script.google.com/macros/s/AKfycbzFNmmjqYx9WhN_L8T4IklAAHBPih4eHNXAVSOtwMNq4yI9C5T_4p7QWKYGAysBZzbc/exec";

// Прокси для запросов к Google Apps Script
app.post('/api/battle', async (req, res) => {
  console.log("📥 Получен запрос от браузера");
  console.log("Данные:", req.body);
  
  // Проверяем, что URL не пустой и не заглушка
  if (!GAS_URL || GAS_URL.includes("ВАШ_НОВЫЙ_АКТУАЛЬНЫЙ_URL")) {
    console.error("❌ Ошибка: GAS_URL не настроен!");
    return res.status(500).json({ 
      status: "error", 
      message: "Сервер не настроен. Пожалуйста, обновите GAS_URL в коде." 
    });
  }
  
  try {
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log("📤 Ответ от Google Apps Script:", data.status);
    res.json(data);
    
  } catch (error) {
    console.error("❌ Ошибка прокси:", error);
    res.status(500).json({ 
      status: "error", 
      message: error.toString(),
      hint: "Проверьте, что Google Apps Script опубликован и доступен по ссылке " + GAS_URL
    });
  }
});

// Проверка работоспособности
app.get('/api/health', (req, res) => {
  res.json({ 
    status: "ok", 
    message: "Прокси работает!",
    gasUrl: GAS_URL,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
  console.log(`✅ Прокси для GAS: ${GAS_URL}`);
  console.log(`✅ Открыть сайт: https://poetry-shazam.onrender.com`);
});
