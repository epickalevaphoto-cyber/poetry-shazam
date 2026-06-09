const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Оценка батла через Google Apps Script
app.post('/api/battle', async (req, res) => {
  const GAS_URL = "https://script.google.com/macros/s/AKfycbwPsFkUqSFwYoKLTbLyR86jJALN78mpntqOseYDgZwPWLv6bMFJvh2LxlffcoNyGD9Ung/exec";
  
  console.log("\n=== ОЦЕНКА БАТЛА ===");
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
    console.log(`Ответ: ${data.status}`);
    
    res.json(data);
  } catch (error) {
    console.error("Ошибка:", error);
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Сервер запущен на порту ${PORT}`);
  console.log(`🌐 Открыть: http://localhost:${PORT}\n`);
});
