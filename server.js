const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const nodemailer = require('nodemailer');

const app = express();

// ==================== НАСТРОЙКА ПОЧТЫ ====================
const EMAIL_CONFIG = {
  teacherEmail: 'nataliafreze22@gmail.com', // ВАША ПОЧТА
  systemEmail: 'control.system.helper@gmail.com', // Системная почта (можно оставить)
  
  // НАСТРОЙКИ ДЛЯ GMAIL:
  service: 'gmail',
  auth: {
    user: 'nataliafreze22@gmail.com', // ⚠️ ЗАМЕНИТЕ на ваш Gmail
    pass: 'ваш-пароль-приложения' // ⚠️ Пароль приложения (не обычный!)
  }
};

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
const uploadDir = path.join(__dirname, 'uploads');
const publicDir = path.join(__dirname, 'public');

// Создаем папки если нет
[uploadDir, publicDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Раздаем статические файлы
app.use(express.static('public'));

// ==================== БАЗА ДАННЫХ ====================
const db = new sqlite3.Database(':memory:');

// Таблица доступа
db.run(`
  CREATE TABLE IF NOT EXISTS access_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE,
    used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Таблица загрузок
db.run(`
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT,
    student_name TEXT,
    file_count INTEGER,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// ==================== НАСТРОЙКА ЗАГРУЗКИ ФАЙЛОВ ====================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const token = req.body.token || 'unknown';
    const student = (req.body.studentName || 'anonymous')
      .replace(/[^a-zA-ZА-Яа-я0-9]/g, '_')
      .substring(0, 30);
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext)
      .replace(/[^a-zA-ZА-Яа-я0-9]/g, '_')
      .substring(0, 50);
    
    cb(null, `${student}_${token}_${timestamp}_${name}${ext}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB на файл
    files: 10 // максимум 10 файлов
  }
});

// ==================== ФУНКЦИЯ ОТПРАВКИ НА ПОЧТУ ====================
async function sendWorkToTeacher(token, studentName, files) {
  console.log(`📧 Подготовка отправки работы от ${studentName}...`);
  
  // Если нет настроек почты - только логируем
  if (!EMAIL_CONFIG.auth.user || EMAIL_CONFIG.auth.user.includes('ваш-email')) {
    console.log('⚠️ Настройки почты не заполнены. Заполните EMAIL_CONFIG в коде.');
    console.log(`📁 Файлы сохранены: ${files.map(f => f.filename).join(', ')}`);
    return false;
  }
  
  try {
    // Создаем транспорт
    const transporter = nodemailer.createTransport({
      service: EMAIL_CONFIG.service,
      auth: EMAIL_CONFIG.auth
    });
    
    // Подготовка вложений (первые 3 файла)
    const attachments = files.slice(0, 3).map(file => ({
      filename: `${studentName}_${path.basename(file.originalname)}`,
      path: file.path,
      contentType: file.mimetype
    }));
    
    // Текст письма
    const mailOptions = {
      from: `"Система Контрольных" <${EMAIL_CONFIG.auth.user}>`,
      to: EMAIL_CONFIG.teacherEmail,
      subject: `📚 Контрольная работа: ${studentName || 'Ученик'}`,
      text: `
Контрольная работа по математике

👨‍🎓 Ученик: ${studentName || 'Не указано'}
🔑 Токен: ${token}
📁 Файлов: ${files.length}
🕐 Время отправки: ${new Date().toLocaleString('ru-RU')}
🌐 Ссылка: https://control-algebra-1.onrender.com/admin/download/${token}

Файлы прикреплены к письму (первые 3 из ${files.length}).
Все файлы также сохранены на сервере.
      `,
      html: `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; padding: 20px;">
  <h2 style="color: #2E7D32;">📚 Новая контрольная работа</h2>
  
  <div style="background: #f5f5f5; padding: 15px; border-radius: 10px; margin: 15px 0;">
    <p><strong>👨‍🎓 Ученик:</strong> ${studentName || 'Не указано'}</p>
    <p><strong>🔑 Токен:</strong> <code>${token}</code></p>
    <p><strong>📁 Файлов:</strong> ${files.length}</p>
    <p><strong>🕐 Время:</strong> ${new Date().toLocaleString('ru-RU')}</p>
  </div>
  
  <div style="margin: 20px 0;">
    <a href="https://control-algebra-1.onrender.com/admin/download/${token}" 
       style="background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
       📥 Скачать все файлы
    </a>
  </div>
  
  <p style="color: #666; font-size: 14px;">
    Это письмо отправлено автоматически системой контроля работ.
  </p>
</body>
</html>
      `,
      attachments: attachments
    };
    
    // Отправляем
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Письмо отправлено! ID: ${info.messageId}`);
    return true;
    
  } catch (error) {
    console.error('❌ Ошибка отправки почты:', error.message);
    
    // Сохраняем ошибку в лог
    fs.appendFileSync(
      path.join(__dirname, 'email_errors.log'),
      `${new Date().toISOString()} | ${studentName} | ${token} | ${error.message}\n`
    );
    
    return false;
  }
}

// ==================== МАРШРУТЫ ====================

// 1. Загрузка работы
app.post('/upload-work', upload.array('solutions', 10), async (req, res) => {
  const { token, studentName } = req.body;
  const files = req.files || [];
  
  console.log(`\n📥 Новая загрузка:`);
  console.log(`   Ученик: ${studentName || 'Аноним'}`);
  console.log(`   Токен: ${token}`);
  console.log(`   Файлов: ${files.length}`);
  
  // Сохраняем в БД
  db.run(
    'INSERT INTO submissions (token, student_name, file_count) VALUES (?, ?, ?)',
    [token, studentName, files.length],
    (err) => {
      if (err) console.error('Ошибка БД:', err.message);
    }
  );
  
  // Отправляем на почту
  const emailSent = await sendWorkToTeacher(token, studentName, files);
  
  // Ответ клиенту
  res.json({ 
    success: true, 
    message: `✅ Работа принята! ${files.length} файлов.`,
    emailSent: emailSent,
    student: studentName,
    token: token,
    fileCount: files.length,
    files: files.map(f => ({
      original: f.originalname,
      saved: f.filename,
      size: Math.round(f.size / 1024) + ' KB'
    }))
  });
});

// 2. Админка: просмотр загрузок
app.get('/admin/uploads', (req, res) => {
  db.all(`
    SELECT * FROM submissions 
    ORDER BY uploaded_at DESC 
    LIMIT 50
  `, [], (err, rows) => {
    if (err) {
      return res.status(500).send('Ошибка базы данных');
    }
    
    let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>📊 Загрузки работ</title>
      <style>
        body { font-family: Arial; padding: 20px; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
        th { background: #4CAF50; color: white; }
        tr:nth-child(even) { background: #f9f9f9; }
        .download-btn { background: #2196F3; color: white; padding: 5px 10px; text-decoration: none; border-radius: 3px; }
      </style>
    </head>
    <body>
      <h1>📊 Загруженные работы</h1>
      <p>Всего: ${rows.length} работ</p>
    `;
    
    if (rows.length > 0) {
      html += `
      <table>
        <tr>
          <th>ID</th>
          <th>Время</th>
          <th>Ученик</th>
          <th>Токен</th>
          <th>Файлов</th>
          <th>Действия</th>
        </tr>
      `;
      
      rows.forEach(row => {
        html += `
        <tr>
          <td>${row.id}</td>
          <td>${new Date(row.uploaded_at).toLocaleString('ru-RU')}</td>
          <td>${row.student_name || '—'}</td>
          <td><code style="font-size:12px">${row.token}</code></td>
          <td>${row.file_count}</td>
          <td>
            <a href="/admin/download/${row.token}" class="download-btn">📥 Скачать</a>
          </td>
        </tr>
        `;
      });
      
      html += `</table>`;
    } else {
      html += `<p style="color: #666;">Загрузок пока нет.</p>`;
    }
    
    html += `
      <p style="margin-top: 30px;">
        <a href="/" style="color: #4CAF50;">← На главную</a> | 
        <a href="/admin/generate" style="color: #2196F3;">🎫 Сгенерировать ссылку</a>
      </p>
    </body>
    </html>`;
    
    res.send(html);
  });
});

// 3. Скачивание файлов по токену
app.get('/admin/download/:token', (req, res) => {
  const token = req.params.token;
  
  // Находим все файлы с этим токеном
  const files = fs.readdirSync(uploadDir)
    .filter(f => f.includes(token))
    .map(f => {
      const stat = fs.statSync(path.join(uploadDir, f));
      return { name: f, size: stat.size, path: path.join(uploadDir, f) };
    });
  
  if (files.length === 0) {
    return res.send(`
      <h1>Файлы не найдены</h1>
      <p>Для токена <code>${token}</code> нет загруженных файлов.</p>
      <p><a href="/admin/uploads">← Назад к списку</a></p>
    `);
  }
  
  let html = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body { font-family: Arial; padding: 20px; }
      .file-item { background: #f5f5f5; padding: 10px; margin: 5px 0; border-radius: 5px; }
    </style>
  </head>
  <body>
    <h1>📁 Файлы работы</h1>
    <p>Токен: <code>${token}</code></p>
    <p>Найдено файлов: ${files.length}</p>
  `;
  
  files.forEach(file => {
    const sizeKB = Math.round(file.size / 1024);
    html += `
    <div class="file-item">
      <strong>${file.name}</strong> (${sizeKB} KB)
      <a href="/admin/file/${file.name}" style="float:right;">⬇️ Скачать</a>
    </div>
    `;
  });
  
  html += `
    <p style="margin-top: 30px;">
      <a href="/admin/uploads">← Назад к списку</a>
    </p>
  </body>
  </html>`;
  
  res.send(html);
});

// 4. Отдача файла
app.get('/admin/file/:filename', (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).send('Файл не найден');
  }
});

// 5. Главная страница
app.get('/', (req, res) => {
  res.send(`
  <!DOCTYPE html>
  <html>
  <body style="font-family: Arial; padding: 30px; text-align: center;">
    <h1>📚 Система контрольных работ</h1>
    <div style="margin: 40px;">
      <a href="/admin/generate" style="display:inline-block; background:#4CAF50; color:white; padding:15px 30px; margin:10px; border-radius:10px; text-decoration:none; font-size:18px;">
        🎫 Сгенерировать ссылку
      </a>
      <a href="/admin/uploads" style="display:inline-block; background:#2196F3; color:white; padding:15px 30px; margin:10px; border-radius:10px; text-decoration:none; font-size:18px;">
        📊 Просмотреть работы
      </a>
    </div>
    <div style="max-width:600px; margin:40px auto; padding:20px; background:#f9f9f9; border-radius:10px; text-align:left;">
      <h3>📋 Инструкция:</h3>
      <ol>
        <li>Сгенерируйте ссылку для ученика</li>
        <li>Ученик переходит по ссылке и решает задания</li>
        <li>Ученик фотографирует решения и загружает файлы</li>
        <li>Работа автоматически отправляется на почту</li>
        <li>Все работы доступны в панели администратора</li>
      </ol>
    </div>
  </body>
  </html>
  `);
});

// 6. Страница экзамена
app.get('/exam/:token', (req, res) => {
  const token = req.params.token;
  
  db.get(
    'SELECT * FROM access_log WHERE token = ? AND used = 0',
    [token],
    (err, row) => {
      if (err || !row) {
        return res.send(`
        <!DOCTYPE html>
        <html>
        <body style="font-family:Arial; padding:50px; text-align:center;">
          <h1 style="color:red;">⛔ Доступ закрыт</h1>
          <p>Ссылка недействительна или уже использована.</p>
          <p><a href="/">На главную</a></p>
        </body>
        </html>
        `);
      }
      
      // Помечаем как использованную
      db.run('UPDATE access_log SET used = 1 WHERE id = ?', [row.id]);
      
      // Отправляем страницу экзамена
      res.sendFile(path.join(__dirname, 'protected.html'));
    }
  );
});

// 7. Генератор ссылок
app.get('/admin/generate', (req, res) => {
  const token = crypto.randomBytes(16).toString('hex');
  
  db.run(
    'INSERT INTO access_log (token) VALUES (?)',
    [token],
    function(err) {
      if (err) {
        return res.status(500).send('Ошибка генерации токена');
      }
      
      const fullUrl = `https://${req.headers.host}/exam/${token}`;
      
      res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial; padding: 30px; max-width: 800px; margin: 0 auto; }
          .link-box { background: #f0f8ff; padding: 20px; margin: 20px 0; border-radius: 10px; border-left: 5px solid #4CAF50; word-break: break-all; }
          .copy-btn { background: #4CAF50; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-size: 16px; margin: 10px 0; }
          .copy-btn:hover { background: #45a049; }
        </style>
      </head>
      <body>
        <h1>✅ Ссылка для ученика сгенерирована</h1>
        
        <div class="link-box">
          <strong>Ссылка:</strong><br>
          <a href="${fullUrl}" target="_blank" style="font-size: 18px;">${fullUrl}</a>
        </div>
        
        <button class="copy-btn" onclick="navigator.clipboard.writeText('${fullUrl}'); this.innerHTML='✅ Скопировано!'; setTimeout(() => this.innerHTML='📋 Скопировать', 2000)">
          📋 Скопировать ссылку
        </button>
        
        <div style="margin-top: 30px; background: #fff8e1; padding: 20px; border-radius: 8px;">
          <h3>📋 Что делать ученику:</h3>
          <ol>
            <li>Перейти по ссылке выше</li>
            <li>Решить все 6 заданий на бумаге</li>
            <li>Сфотографировать каждое решение</li>
            <li>Ввести свою фамилию и имя</li>
            <li>Загрузить все фотографии в зоне загрузки</li>
            <li>Нажать "Отправить контрольную работу"</li>
          </ol>
          <p><strong>📧 Результаты будут отправлены на почту учителя автоматически.</strong></p>
        </div>
        
        <p style="margin-top: 30px;">
          <a href="/">← На главную</a> | 
          <a href="/admin/uploads">📊 Просмотреть работы</a>
        </p>
      </body>
      </html>
      `);
    }
  );
});

// ==================== ЗАПУСК СЕРВЕРА ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ========================================
  🚀 Сервер запущен на порту ${PORT}
  ========================================
  📧 Почта учителя: ${EMAIL_CONFIG.teacherEmail}
  📁 Папка загрузок: ${uploadDir}
  📁 Статические файлы: ${publicDir}
  
  🔗 Главная страница: http://localhost:${PORT}
  🎫 Генератор ссылок: http://localhost:${PORT}/admin/generate
  📊 Панель работ: http://localhost:${PORT}/admin/uploads
  
  ⚠️ ВНИМАНИЕ: Для работы почты заполните настройки в EMAIL_CONFIG!
  `);
});
