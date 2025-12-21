const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const app = express();

// Подключаем базу данных
const db = new sqlite3.Database('./exam.db');

// Создаем таблицы
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS access_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE,
      ip TEXT,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS violations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT,
      ip TEXT,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// Маршрут для генерации ссылок (для учителя)
app.get('/admin/generate', (req, res) => {
  const token = crypto.randomBytes(16).toString('hex');
  
  db.run(
    'INSERT INTO access_log (token) VALUES (?)',
    [token],
    function(err) {
      if (err) {
        console.error(err);
        return res.status(500).send('Ошибка генерации токена');
      }
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Генератор ссылок</title>
          <style>
            body { font-family: Arial; padding: 40px; text-align: center; }
            .link { background: #f0f0f0; padding: 20px; margin: 20px; border-radius: 10px; font-size: 18px; }
            .copy-btn { background: #4CAF50; color: white; border: none; padding: 10px 20px; cursor: pointer; border-radius: 5px; }
          </style>
        </head>
        <body>
          <h1>🔗 Ссылка для ученика</h1>
          <div class="link" id="link">https://ваш-сайт.onrender.com/exam/${token}</div>
          <button class="copy-btn" onclick="navigator.clipboard.writeText(document.getElementById('link').innerText)">
            📋 Скопировать ссылку
          </button>
          <p><small>Ссылка сгенерирована: ${new Date().toLocaleString()}</small></p>
          <p>Отправьте эту ссылку ученику. Каждая ссылка работает только один раз.</p>
        </body>
        </html>
      `);
    }
  );
});

// Главный маршрут для экзамена
app.get('/exam/:token', (req, res) => {
  const token = req.params.token;
  const userIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
  
  console.log(`Попытка входа: ${token} с IP: ${userIP}`);
  
  // Проверяем токен
  db.get(
    'SELECT * FROM access_log WHERE token = ? AND used = 0',
    [token],
    (err, row) => {
      if (err || !row) {
        return res.send(`
          <!DOCTYPE html>
          <html>
          <body style="text-align:center;padding:50px;font-family:Arial;background:#fff5f5;">
            <h1 style="color:#d32f2f;">⛔ Доступ запрещен</h1>
            <div style="max-width:500px;margin:0 auto;background:white;padding:30px;border-radius:10px;box-shadow:0 5px 15px rgba(0,0,0,0.1);">
              <p>Возможные причины:</p>
              <ul style="text-align:left;display:inline-block;">
                <li>Ссылка уже использована</li>
                <li>Ссылка недействительна</li>
                <li>С этого устройства уже был выполнен вход</li>
              </ul>
              <p style="margin-top:20px;">Обратитесь к учителю за новой ссылкой.</p>
            </div>
          </body>
          </html>
        `);
      }
      
      // Проверяем, не заходил ли уже этот IP
      db.get(
        'SELECT * FROM access_log WHERE ip = ? AND used = 1',
        [userIP],
        (err, ipRow) => {
          if (ipRow) {
            return res.send(`
              <!DOCTYPE html>
              <html>
              <body style="text-align:center;padding:50px;font-family:Arial;">
                <h1 style="color:#f57c00;">⚠️ Внимание!</h1>
                <p>С этого устройства уже был выполнен вход в систему.</p>
                <p>Каждый ученик может войти только с одного устройства.</p>
              </body>
              </html>
            `);
          }
          
          // Помечаем токен как использованный
          db.run(
            'UPDATE access_log SET used = 1, ip = ? WHERE token = ?',
            [userIP, token]
          );
          
          console.log(`Доступ разрешен для IP: ${userIP}, токен: ${token}`);
          
          // Отправляем защищенную страницу экзамена
          res.sendFile(__dirname + '/protected.html');
        }
      );
    }
  );
});

// Маршрут для регистрации нарушений
app.post('/violation', express.json(), (req, res) => {
  const { token, reason } = req.body;
  const userIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  
  db.run(
    'INSERT INTO violations (token, ip, reason) VALUES (?, ?, ?)',
    [token, userIP, reason || 'Неизвестное нарушение']
  );
  
  res.json({ status: 'violation_logged' });
});

// Главная страница
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <body style="text-align:center;padding:50px;font-family:Arial;background:linear-gradient(135deg,#667eea,#764ba2);color:white;min-height:100vh;">
      <div style="max-width:600px;margin:0 auto;background:rgba(255,255,255,0.1);padding:40px;border-radius:20px;backdrop-filter:blur(10px);">
        <h1 style="font-size:2.5em;">📚 Система контрольных работ</h1>
        <p style="font-size:1.2em;margin:30px 0;">Для учеников: перейдите по ссылке от учителя</p>
        <p style="font-size:1.2em;">Для учителей: <a href="/admin/generate" style="color:#4CAF50;font-weight:bold;text-decoration:none;">сгенерировать ссылку для ученика →</a></p>
      </div>
    </body>
    </html>
  `);
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
  console.log(`🔗 Главная страница: http://localhost:${PORT}`);
  console.log(`👨‍🏫 Панель учителя: http://localhost:${PORT}/admin/generate`);
});