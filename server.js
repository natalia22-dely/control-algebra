const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');
const app = express();

// Подключаем базу данных
const db = new sqlite3.Database(':memory:'); // Используем память для теста

// Создаем таблицу
db.run(`
  CREATE TABLE IF NOT EXISTS access_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE,
    used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

console.log('🚀 Сервер запущен, база данных инициализирована');

// Маршрут для генерации ссылок
app.get('/admin/generate', (req, res) => {
  const token = crypto.randomBytes(16).toString('hex');
  const siteUrl = `https://${req.headers.host}`;
  
  db.run(
    'INSERT INTO access_log (token) VALUES (?)',
    [token],
    function(err) {
      if (err) {
        console.error('Ошибка при сохранении токена:', err.message);
        return res.send(`<h1>Ошибка генерации</h1><p>${err.message}</p>`);
      }
      
      const fullUrl = `${siteUrl}/exam/${token}`;
      console.log(`✅ Сгенерирован токен: ${token}, ID: ${this.lastID}`);
      
      res.send(`
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial; padding: 30px;">
          <h1>✅ Ссылка сгенерирована</h1>
          <div style="background: #f0f0f0; padding: 20px; margin: 20px 0; border-radius: 10px;">
            <strong>Ссылка для ученика:</strong><br>
            <a href="${fullUrl}" target="_blank">${fullUrl}</a>
          </div>
          <button onclick="navigator.clipboard.writeText('${fullUrl}'); this.textContent='✅ Скопировано!'">
            📋 Скопировать ссылку
          </button>
          <p><a href="/">← На главную</a></p>
        </body>
        </html>
      `);
    }
  );
});

// Маршрут для экзамена (упрощенный)
app.get('/exam/:token', (req, res) => {
  const token = req.params.token;
  console.log(`🔍 Проверка токена: ${token}`);
  
  db.get(
    'SELECT * FROM access_log WHERE token = ? AND used = 0',
    [token],
    (err, row) => {
      if (err) {
        console.error('Ошибка БД:', err.message);
        return res.send('<h1>Ошибка сервера</h1>');
      }
      
      if (!row) {
        console.log(`❌ Токен не найден или уже использован: ${token}`);
        return res.send(`
          <!DOCTYPE html>
          <html>
          <body style="font-family: Arial; padding: 30px; text-align: center;">
            <h1 style="color: red;">⛔ Доступ запрещен</h1>
            <p>Токен: ${token}</p>
            <p>Статус: не найден в базе данных</p>
            <p><a href="/">На главную</a></p>
          </body>
          </html>
        `);
      }
      
      console.log(`✅ Токен найден, ID: ${row.id}, маркируем как использованный`);
      
      // Помечаем как использованный
      db.run(
        'UPDATE access_log SET used = 1 WHERE id = ?',
        [row.id]
      );
      
      // Отправляем страницу экзамена
      res.sendFile(path.join(__dirname, 'protected.html'));
    }
  );
});

// Главная страница
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial; padding: 30px; text-align: center;">
      <h1>📚 Система контрольных работ</h1>
      <p><a href="/admin/generate" style="font-size: 18px; color: blue;">👉 Сгенерировать ссылку для ученика</a></p>
    </body>
    </html>
  `);
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
});
