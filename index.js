const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ⚠️ ЗАМЕНИТЕ НА ВАШ URL ИЗ GOOGLE APPS SCRIPT
const GAS_URL = "https://script.google.com/macros/s/AKfycbzPOvZ0hNDbJj01x_h817a-hrhziEZaizTTmmE7TSQ9C3PtbcJyhTNr119WX9UPAiQu/exec";

app.post('/api/battle', async (req, res) => {
  console.log("📥 Получен запрос от браузера");
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

app.get('/api/health', (req, res) => {
  res.json({ status: "ok", message: "Прокси работает!" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
  console.log(`✅ Прокси для GAS: ${GAS_URL}`);
});
