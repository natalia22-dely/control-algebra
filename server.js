const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();

// Разрешаем JSON и urlencoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// База данных
const db = new sqlite3.Database(':memory:');

// Создаём таблицы (УБИРАЕМ used и токеновую защиту)
db.serialize(() => {
  // Таблица ссылок (теперь просто регистрируем созданные ссылки)
  db.run(`
    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      usage_count INTEGER DEFAULT 0
    )
  `);
  
  // Таблица работ
  db.run(`
    CREATE TABLE IF NOT EXISTS works (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT,
      student_name TEXT,
      question1 TEXT,
      question2 TEXT,
      question3 TEXT,
      question4 TEXT,
      question5 TEXT,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Таблица нарушений
  db.run(`
    CREATE TABLE IF NOT EXISTS violations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT,
      reason TEXT,
      violation_time DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// ==================== МАРШРУТЫ ====================

// Главная страница
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial; padding: 30px; text-align: center; }
        .card { background: white; border-radius: 15px; padding: 30px; box-shadow: 0 5px 20px rgba(0,0,0,0.1); max-width: 600px; margin: 20px auto; }
        .btn { display: inline-block; background: #4CAF50; color: white; padding: 15px 30px; margin: 10px; border-radius: 10px; text-decoration: none; font-size: 18px; }
        .btn-blue { background: #2196F3; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background: #f5f5f5; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>📚 Система проверочных работ</h1>
        <div style="margin: 30px 0;">
          <a href="/admin/generate" class="btn">🎫 Сгенерировать ссылку</a>
          <a href="/admin/results" class="btn btn-blue">📊 Результаты работ</a>
        </div>
        <p>Ссылки теперь работают многократно для всех учеников.</p>
      </div>
    </body>
    </html>
  `);
});

// Генератор ссылок (теперь просто создаёт ссылку)
app.get('/admin/generate', (req, res) => {
  const token = crypto.randomBytes(16).toString('hex');
  
  db.run(
    'INSERT INTO links (token) VALUES (?)',
    [token],
    function(err) {
      if (err) {
        return res.status(500).send('Ошибка генерации');
      }
      
      const fullUrl = `https://${req.headers.host}/exam/${token}`;
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial; padding: 30px; max-width: 700px; margin: 0 auto; }
            .link-box { background: #f0f8ff; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 5px solid #4CAF50; word-break: break-all; }
            .copy-btn { background: #4CAF50; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-size: 16px; margin: 10px 0; }
            .info-box { background: #fff8e1; padding: 15px; border-radius: 8px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <h1>✅ Ссылка для учеников</h1>
          <div class="info-box">
            <p><strong>📢 Эта ссылка теперь работает для всех учеников!</strong></p>
            <p>Каждый ученик может перейти по ней и выполнить работу.</p>
          </div>
          
          <div class="link-box">
            <strong>Ссылка:</strong><br>
            <a href="${fullUrl}" target="_blank">${fullUrl}</a>
          </div>
          
          <button class="copy-btn" onclick="navigator.clipboard.writeText('${fullUrl}'); this.textContent='✅ Скопировано!'">
            📋 Скопировать ссылку
          </button>
          
          <div style="margin-top: 30px;">
            <p><strong>Как использовать:</strong></p>
            <ol>
              <li>Отправьте эту ссылку всем ученикам</li>
              <li>Каждый ученик переходит по ней и выполняет работу</li>
              <li>Результаты всех учеников собираются в одной таблице</li>
              <li>Просмотр результатов: <a href="/admin/results">/admin/results</a></li>
            </ol>
          </div>
          
          <p><a href="/">← На главную</a></p>
        </body>
        </html>
      `);
    }
  );
});

// Страница экзамена (УБРАНА проверка used)
app.get('/exam/:token', (req, res) => {
  const token = req.params.token;
  
  // Просто увеличиваем счётчик использования
  db.run(
    'UPDATE links SET usage_count = usage_count + 1 WHERE token = ?',
    [token],
    () => {
      // Если токена нет в базе - всё равно показываем страницу
      // (на случай, если база очистилась на Render)
      console.log(`📝 От
