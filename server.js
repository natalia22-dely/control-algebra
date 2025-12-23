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
  // Таблица ссылок
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
      </style>
    </head>
    <body>
      <div class="card">
        <h1>📚 Система проверочных работ</h1>
        <div style="margin: 30px 0;">
          <a href="/admin/generate" class="btn">🎫 Сгенерировать ссылку</a>
          <a href="/admin/results" class="btn btn-blue">📊 Результаты работ</a>
        </div>
        <p>Ссылки работают многократно для всех учеников.</p>
      </div>
    </body>
    </html>
  `);
});

// Генератор ссылок
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
            <p><strong>📢 Эта ссылка работает для всех учеников!</strong></p>
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

// Страница экзамена (всегда открываем)
app.get('/exam/:token', (req, res) => {
  const token = req.params.token;
  
  // Увеличиваем счётчик использования
  db.run(
    'UPDATE links SET usage_count = usage_count + 1 WHERE token = ?',
    [token]
  );
  
  console.log(`📝 Открытие работы по токену: ${token}`);
  res.sendFile(path.join(__dirname, 'protected.html'));
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
    SELECT 
      token,
      COUNT(*) as student_count,
      GROUP_CONCAT(student_name, ', ') as students,
      MAX(submitted_at) as last_submission
    FROM works 
    GROUP BY token
    ORDER BY last_submission DESC
  `, [], (err, tokenGroups) => {
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
        .details-btn { background: #2196F3; color: white; padding: 5px 10px; border: none; border-radius: 4px; cursor: pointer; }
        .token { font-family: monospace; font-size: 12px; }
      </style>
      <script>
        function showDetails(token) {
          fetch('/admin/results/' + token)
            .then(r => r.text())
            .then(html => {
              document.getElementById('details').innerHTML = html;
              document.getElementById('details').scrollIntoView();
            });
        }
      </script>
    </head>
    <body>
      <h1>📊 Результаты проверочных работ</h1>
      <p>Сгруппировано по ссылкам (токенам)</p>
    `;
    
    if (tokenGroups.length > 0) {
      html += `
      <table>
        <tr>
          <th>Токен</th>
          <th>Кол-во учеников</th>
          <th>Ученики</th>
          <th>Последняя сдача</th>
          <th>Действия</th>
        </tr>
      `;
      
      tokenGroups.forEach(group => {
        html += `
        <tr>
          <td class="token">${group.token}</td>
          <td><strong>${group.student_count}</strong></td>
          <td>${group.students || '—'}</td>
          <td>${new Date(group.last_submission).toLocaleString('ru-RU')}</td>
          <td>
            <button class="details-btn" onclick="showDetails('${group.token}')">
              📄 Показать работы
            </button>
          </td>
        </tr>
        `;
      });
      
      html += `</table>`;
    } else {
      html += `<p style="color: #666; padding: 20px; background: #f5f5f5; border-radius: 10px;">Работ пока нет.</p>`;
    }
    
    html += `
      <div id="details" style="margin-top: 40px;"></div>
      <p style="margin-top: 30px;">
        <a href="/">← На главную</a> | 
        <a href="/admin/generate">🎫 Сгенерировать новую ссылку</a>
      </p>
    </body>
    </html>`;
    
    res.send(html);
  });
});

// Детали по токену
app.get('/admin/results/:token', (req, res) => {
  const token = req.params.token;
  
  db.all(`
    SELECT * FROM works 
    WHERE token = ?
    ORDER BY submitted_at DESC
  `, [token], (err, rows) => {
    if (err || rows.length === 0) {
      return res.send('<p>Работ по этому токену не найдено.</p>');
    }
    
    let html = `<h3>📋 Работы по токену: <code>${token}</code></h3>`;
    html += `<p>Всего работ: ${rows.length}</p>`;
    html += `<table border="1" style="width:100%; border-collapse:collapse;">`;
    html += `
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
        <td>${row.question1 || '—'}</td>
        <td>${row.question2 || '—'}</td>
        <td>${row.question3 || '—'}</td>
        <td>${row.question4 || '—'}</td>
        <td>${row.question5 || '—'}</td>
        <td>${new Date(row.submitted_at).toLocaleString('ru-RU')}</td>
      </tr>
      `;
    });
    
    html += `</table>`;
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
