const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();

// Подключаем базу данных
const db = new sqlite3.Database(':memory:');

// Создаем таблицу
db.run(`
  CREATE TABLE IF NOT EXISTS access_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE,
    used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Настройка загрузки файлов
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const token = req.body.token || 'unknown';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `${token}_${timestamp}_${random}_${name}${ext}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB на файл
});

// Маршрут для загрузки фото (множественные файлы)
app.post('/upload-work', upload.array('solutions', 50), (req, res) => {
  const { token, studentName } = req.body;
  const files = req.files;
  
  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'Нет файлов для загрузки' });
  }
  
  console.log(`📚 Работа от ${studentName || 'ученика'}: ${files.length} файлов, токен: ${token}`);
  
  // Логируем в базу (упрощённо)
  db.run(
    'INSERT INTO submissions (token, file_count, student_name) VALUES (?, ?, ?)',
    [token, files.length, studentName],
    (err) => {
      if (err) console.error('Ошибка логирования:', err.message);
    }
  );
  
  res.json({ 
    success: true, 
    message: `Работа принята! Загружено ${files.length} файлов.`,
    files: files.map(f => ({
      name: f.originalname,
      savedAs: f.filename,
      size: f.size
    }))
  });
});

// Главная страница
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial; padding: 30px; text-align: center;">
      <h1>📚 Система контрольных работ</h1>
      <p><a href="/admin/generate" style="font-size: 18px; color: blue;">
        👉 Сгенерировать ссылку для ученика
      </a></p>
    </body>
    </html>
  `);
});

// Маршрут для экзамена
app.get('/exam/:token', (req, res) => {
  const token = req.params.token;
  
  db.get(
    'SELECT * FROM access_log WHERE token = ? AND used = 0',
    [token],
    (err, row) => {
      if (err || !row) {
        return res.send('<h1>Доступ запрещён</h1>');
      }
      
      // Помечаем как использованный
      db.run('UPDATE access_log SET used = 1 WHERE id = ?', [row.id]);
      
      // Отправляем страницу экзамена
      res.sendFile(path.join(__dirname, 'protected.html'));
    }
  );
});

// Маршрут для генерации ссылок
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
        <body style="font-family: Arial; padding: 30px;">
          <h1>✅ Ссылка сгенерирована</h1>
          <div style="background: #f0f0f0; padding: 20px; margin: 20px 0; border-radius: 10px;">
            <strong>Ссылка для ученика:</strong><br>
            <a href="${fullUrl}" target="_blank">${fullUrl}</a>
          </div>
          <button onclick="navigator.clipboard.writeText('${fullUrl}'); this.textContent='✅ Скопировано!'">
            📋 Скопировать
          </button>
        </body>
        </html>
      `);
    }
  );
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
  console.log(`📁 Файлы будут сохраняться в: ${uploadDir}`);
});
