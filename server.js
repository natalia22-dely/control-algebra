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

// Создаём таблицы
db.serialize(() => {
  // Таблица доступа
  db.run(`
    CREATE TABLE IF NOT EXISTS access_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
        <p>Система автоматически сохраняет ответы в базу данных.</p>
      </div>
    </body>
    </html>
  `);
});

// Генератор ссылок
app.get('/admin/generate', (req, res) => {
  const token = crypto.randomBytes(16).toString('hex');
  
  db.run(
    'INSERT INTO access_log (token) VALUES (?)',
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
          </style>
        </head>
        <body>
          <h1>✅ Ссылка для ученика</h1>
          <div class="link-box">
            <strong>Ссылка:</strong><br>
            <a href="${fullUrl}" target="_blank">${fullUrl}</a>
          </div>
          <button class="copy-btn" onclick="navigator.clipboard.writeText('${fullUrl}'); this.textContent='✅ Скопировано!'">
            📋 Скопировать
          </button>
          <p><a href="/">← На главную</a></p>
        </body>
        </html>
      `);
    }
  );
});

// Страница экзамена
app.get('/exam/:token', (req, res) => {
  const token = req.params.token;
  
  db.get(
    'SELECT * FROM access_log WHERE token = ? AND used = 0',
    [token],
    (err, row) => {
      if (err || !row) {
        return res.send(`
          <h1 style="color:red; text-align:center; margin-top:50px;">⛔ Ссылка недействительна</h1>
          <p style="text-align:center;"><a href="/">На главную</a></p>
        `);
      }
      
      db.run('UPDATE access_log SET used = 1 WHERE id = ?', [row.id]);
      res.sendFile(path.join(__dirname, 'protected.html'));
    }
  );
});

// Сохранение работы
app.post('/submit-work', (req, res) => {
  const { token, studentName, answers } = req.body;
  
  console.log(`📝 Сохранение работы от ${studentName}, токен: ${token}`);
  
  db.run(
    `INSERT INTO works (token, student_name, question1, question2, question3, question4, question5) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      token,
      studentName,
      answers?.q1 || '',
      answers?.q2 || '',
      answers?.q3 || '',
      answers?.q4 || '',
      answers?.q5 || ''
    ],
    function(err) {
      if (err) {
        console.error('Ошибка сохранения:', err);
        return res.status(500).json({ error: 'Ошибка сохранения' });
      }
      
      res.json({ 
        success: true, 
        workId: this.lastID,
        message: 'Работа сохранена' 
      });
    }
  );
});

// Просмотр результатов
app.get('/admin/results', (req, res) => {
  db.all(`
    SELECT * FROM works 
    ORDER BY submitted_at DESC
  `, [], (err, rows) => {
    if (err) {
      return res.status(500).send('Ошибка базы данных');
    }
    
    let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial; padding: 20px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background: #4CAF50; color: white; }
        tr:nth-child(even) { background: #f9f9f9; }
        .correct { color: green; font-weight: bold; }
        .empty { color: #999; font-style: italic; }
      </style>
    </head>
    <body>
      <h1>📊 Результаты проверочных работ</h1>
      <p>Всего работ: ${rows.length}</p>
    `;
    
    if (rows.length > 0) {
      html += `
      <table>
        <tr>
          <th>ID</th>
          <th>Ученик</th>
          <th>1. 2a-4b</th>
          <th>2. Выражение</th>
          <th>3. Уравнение</th>
          <th>4. Корень 3?</th>
          <th>5. Детали</th>
          <th>Время</th>
        </tr>
      `;
      
      rows.forEach(row => {
        html += `
        <tr>
          <td>${row.id}</td>
          <td><strong>${row.student_name || '—'}</strong></td>
          <td class="${row.question1 ? '' : 'empty'}">${row.question1 || 'нет ответа'}</td>
          <td class="${row.question2 ? '' : 'empty'}">${row.question2 || 'нет ответа'}</td>
          <td class="${row.question3 ? '' : 'empty'}">${row.question3 || 'нет ответа'}</td>
          <td class="${row.question4 ? '' : 'empty'}">${row.question4 || 'нет ответа'}</td>
          <td class="${row.question5 ? '' : 'empty'}">${row.question5 || 'нет ответа'}</td>
          <td>${new Date(row.submitted_at).toLocaleString('ru-RU')}</td>
        </tr>
        `;
      });
      
      html += `</table>`;
    } else {
      html += `<p style="color: #666; padding: 20px; background: #f5f5f5; border-radius: 10px;">Работ пока нет.</p>`;
    }
    
    html += `
      <p style="margin-top: 30px;">
        <a href="/">← На главную</a> | 
        <a href="/admin/generate">🎫 Сгенерировать новую ссылку</a>
      </p>
    </body>
    </html>`;
    
    res.send(html);
  });
});

// Логирование нарушений
app.post('/log-violation', express.json(), (req, res) => {
  const { token, reason } = req.body;
  
  db.run(
    'INSERT INTO violations (token, reason) VALUES (?, ?)',
    [token, reason]
  );
  
  res.json({ logged: true });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ========================================
  🚀 Сервер запущен на порту ${PORT}
  ========================================
  📊 Просмотр результатов: /admin/results
  🎫 Генератор ссылок: /admin/generate
  `);
});
