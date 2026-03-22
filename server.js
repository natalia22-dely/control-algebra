const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// ===== ПОЧТА =====
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'nataliafreze22@gmail.com',
    pass: 'hssx xzov rypm dgox'
  }
});

// ===== БАЗА ДАННЫХ (файл на диске) =====
const DB_PATH = path.join(__dirname, 'data', 'works.db');
const dataDir = path.join(__dirname, 'data');
if (!require('fs').existsSync(dataDir)) {
  require('fs').mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('Ошибка открытия БД:', err);
  else console.log('✅ База данных подключена:', DB_PATH);
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    usage_count INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS works (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT,
    student_name TEXT,
    theory_t1 INTEGER DEFAULT 0,
    theory_t2 INTEGER DEFAULT 0,
    theory_t3 INTEGER DEFAULT 0,
    theory_t4 INTEGER DEFAULT 0,
    inter1 TEXT,
    inter2 TEXT,
    inter3 TEXT,
    inter4 TEXT,
    inter5 TEXT,
    question1 TEXT,
    question2 TEXT,
    question3 TEXT,
    question4 TEXT,
    question5 TEXT,
    photos_p1 TEXT,
    photos_p2 TEXT,
    photos_p3 TEXT,
    photos_p4 TEXT,
    photos_p5 TEXT,
    photos_p6 TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS violations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT,
    student TEXT,
    reason TEXT,
    violation_time DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// ===== ОТПРАВКА EMAIL =====
async function sendResultEmail(studentName, theory, intermediate, answers, photos) {
  const theoryScore = [theory?.t1, theory?.t2, theory?.t3, theory?.t4].filter(Boolean).length;

  // Фото П6 — прикрепляем как вложения
  let attachments = [];
  let p6photos = (photos && photos['p6-photos']) || [];
  p6photos.forEach((base64, i) => {
    const matches = base64.match(/^data:(.+);base64,(.+)$/);
    if (matches) {
      attachments.push({
        filename: `foto_p6_${i + 1}.jpg`,
        content: matches[2],
        encoding: 'base64',
        contentType: matches[1]
      });
    }
  });

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 700px;">
      <h2 style="color:#1a1a2e;">📋 Новая работа сдана</h2>
      <p><strong>Ученик:</strong> ${studentName}</p>
      <p><strong>Время:</strong> ${new Date().toLocaleString('ru-RU')}</p>
      <p><strong>Тема:</strong> Формулы сокращённого умножения · 7 класс</p>

      <hr style="margin: 20px 0;">

      <h3>Часть I — Теория (${theoryScore}/4)</h3>
      <table style="border-collapse:collapse; width:100%;">
        <tr style="background:#f0f0f0;">
          <th style="padding:8px; border:1px solid #ddd;">Задание</th>
          <th style="padding:8px; border:1px solid #ddd;">Результат</th>
        </tr>
        <tr><td style="padding:8px; border:1px solid #ddd;">Т–1: Определить формулу для (5x+3)²</td>
            <td style="padding:8px; border:1px solid #ddd;">${theory?.t1 ? '✅ Верно' : '❌ Неверно'}</td></tr>
        <tr><td style="padding:8px; border:1px solid #ddd;">Т–2: Определить формулу для (2a−7b)(2a+7b)</td>
            <td style="padding:8px; border:1px solid #ddd;">${theory?.t2 ? '✅ Верно' : '❌ Неверно'}</td></tr>
        <tr><td style="padding:8px; border:1px solid #ddd;">Т–3: Найти ошибку в (a+4)²=a²+4²</td>
            <td style="padding:8px; border:1px solid #ddd;">${theory?.t3 ? '✅ Верно' : '❌ Неверно'}</td></tr>
        <tr><td style="padding:8px; border:1px solid #ddd;">Т–4: Найти ошибку в x²−9=(x−3)(x−3)</td>
            <td style="padding:8px; border:1px solid #ddd;">${theory?.t4 ? '✅ Верно' : '❌ Неверно'}</td></tr>
      </table>

      <h3 style="margin-top:24px;">Часть II — Практика</h3>
      <table style="border-collapse:collapse; width:100%;">
        <tr style="background:#f0f0f0;">
          <th style="padding:8px; border:1px solid #ddd;">Задание</th>
          <th style="padding:8px; border:1px solid #ddd;">Назвал формулу</th>
          <th style="padding:8px; border:1px solid #ddd;">Решение</th>
        </tr>
        <tr>
          <td style="padding:8px; border:1px solid #ddd;"><strong>П–1</strong> (3x+5)²</td>
          <td style="padding:8px; border:1px solid #ddd;">${intermediate?.i1 || '—'}</td>
          <td style="padding:8px; border:1px solid #ddd;">${answers?.q1 || '—'}</td>
        </tr>
        <tr>
          <td style="padding:8px; border:1px solid #ddd;"><strong>П–2</strong> (4a−1)²</td>
          <td style="padding:8px; border:1px solid #ddd;">${intermediate?.i2 || '—'}</td>
          <td style="padding:8px; border:1px solid #ddd;">${answers?.q2 || '—'}</td>
        </tr>
        <tr>
          <td style="padding:8px; border:1px solid #ddd;"><strong>П–3</strong> (x−3)(x+3)</td>
          <td style="padding:8px; border:1px solid #ddd;">${intermediate?.i3 || '—'}</td>
          <td style="padding:8px; border:1px solid #ddd;">${answers?.q3 || '—'}</td>
        </tr>
        <tr>
          <td style="padding:8px; border:1px solid #ddd;"><strong>П–4</strong> 25m²−49n²</td>
          <td style="padding:8px; border:1px solid #ddd;">${intermediate?.i4 || '—'}</td>
          <td style="padding:8px; border:1px solid #ddd;">${answers?.q4 || '—'}</td>
        </tr>
        <tr>
          <td style="padding:8px; border:1px solid #ddd;"><strong>П–5</strong> x²−10x+25</td>
          <td style="padding:8px; border:1px solid #ddd;">${intermediate?.i5 || '—'}</td>
          <td style="padding:8px; border:1px solid #ddd;">${answers?.q5 || '—'}</td>
        </tr>
      </table>

      <p style="margin-top:16px;"><strong>П–6 (10 примеров):</strong> ${p6photos.length > 0 ? `фото прикреплено (${p6photos.length} шт.)` : 'фото не прикреплено'}</p>

      <hr style="margin: 20px 0;">
      <p style="color:#888; font-size:12px;">Письмо отправлено автоматически системой проверочных работ.</p>
    </div>
  `;

  await transporter.sendMail({
    from: '"Система работ" <nataliafreze22@gmail.com>',
    to: 'nataliafreze22@gmail.com',
    subject: `📋 Работа сдана: ${studentName} — Формулы сокращённого умножения`,
    html,
    attachments
  });
}

// ==================== МАРШРУТЫ ====================

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>body{font-family:Arial;padding:30px;text-align:center;background:#f5f5f5;}
  .card{background:white;border-radius:15px;padding:30px;box-shadow:0 5px 20px rgba(0,0,0,0.1);max-width:600px;margin:20px auto;}
  .btn{display:inline-block;background:#4CAF50;color:white;padding:15px 30px;margin:10px;border-radius:10px;text-decoration:none;font-size:18px;}
  .btn-blue{background:#2196F3;}</style></head>
  <body><div class="card"><h1>📚 Система проверочных работ</h1>
  <div style="margin:30px 0;">
  <a href="/admin/generate" class="btn">🎫 Сгенерировать ссылку</a>
  <a href="/admin/results" class="btn btn-blue">📊 Результаты работ</a>
  </div><p>Ссылки работают многократно для всех учеников.</p>
  </div></body></html>`);
});

app.get('/admin/generate', (req, res) => {
  const token = crypto.randomBytes(16).toString('hex');
  db.run('INSERT INTO links (token) VALUES (?)', [token], function(err) {
    if (err) return res.status(500).send('Ошибка генерации');
    const fullUrl = `https://${req.headers.host}/exam/${token}`;
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>body{font-family:Arial;padding:30px;max-width:700px;margin:0 auto;}
    .link-box{background:#f0f8ff;padding:20px;border-radius:10px;margin:20px 0;border-left:5px solid #4CAF50;word-break:break-all;}
    .copy-btn{background:#4CAF50;color:white;border:none;padding:12px 24px;border-radius:6px;cursor:pointer;font-size:16px;}
    .info-box{background:#fff8e1;padding:15px;border-radius:8px;margin:20px 0;}</style></head>
    <body><h1>✅ Ссылка для учеников</h1>
    <div class="info-box"><p><strong>📢 Эта ссылка работает для всех учеников!</strong></p></div>
    <div class="link-box"><strong>Ссылка:</strong><br>
    <a href="${fullUrl}" target="_blank">${fullUrl}</a></div>
    <button class="copy-btn" onclick="navigator.clipboard.writeText('${fullUrl}');this.textContent='✅ Скопировано!'">📋 Скопировать ссылку</button>
    <p style="margin-top:30px;"><a href="/">← На главную</a> | <a href="/admin/results">📊 Результаты</a></p>
    </body></html>`);
  });
});

app.get('/exam/:token', (req, res) => {
  const token = req.params.token;

  db.get('SELECT * FROM links WHERE token = ?', [token], (err, link) => {
    if (err || !link) {
      return res.status(404).send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
        <style>body{font-family:Arial;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5;}
        .card{background:white;padding:40px;border-radius:12px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.1);max-width:480px;}
        h2{color:#c0392b;margin-bottom:12px;}p{color:#666;line-height:1.6;}</style></head>
        <body><div class="card"><h2>❌ Ссылка не найдена</h2>
        <p>Эта ссылка недействительна. Обратитесь к учителю.</p>
        </div></body></html>`);
    }

    if (link.usage_count >= 1) {
      return res.status(403).send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
        <style>body{font-family:Arial;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5;}
        .card{background:white;padding:40px;border-radius:12px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.1);max-width:480px;}
        h2{color:#c0392b;margin-bottom:12px;}p{color:#666;line-height:1.6;}</style></head>
        <body><div class="card"><h2>🔒 Ссылка уже использована</h2>
        <p>Эта ссылка была открыта ранее и больше не действует.<br>Обратитесь к учителю для получения новой ссылки.</p>
        </div></body></html>`);
    }

    db.run('UPDATE links SET usage_count = 1 WHERE token = ?', [token]);
    console.log(`📝 Открытие работы: ${token}`);
    res.sendFile(path.join(__dirname, 'protected.html'));
  });
});

app.post('/submit-work', async (req, res) => {
  const { token, studentName, theory, intermediate, answers, photos } = req.body;
  console.log(`📝 Сохранение работы от: ${studentName}`);

  const photosP1 = JSON.stringify((photos && photos['p1-photos']) || []);
  const photosP2 = JSON.stringify((photos && photos['p2-photos']) || []);
  const photosP3 = JSON.stringify((photos && photos['p3-photos']) || []);
  const photosP4 = JSON.stringify((photos && photos['p4-photos']) || []);
  const photosP5 = JSON.stringify((photos && photos['p5-photos']) || []);
  const photosP6 = JSON.stringify((photos && photos['p6-photos']) || []);

  // Сохраняем в БД
  db.run(
    `INSERT INTO works (
      token, student_name,
      theory_t1, theory_t2, theory_t3, theory_t4,
      inter1, inter2, inter3, inter4, inter5,
      question1, question2, question3, question4, question5,
      photos_p1, photos_p2, photos_p3, photos_p4, photos_p5, photos_p6
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      token, studentName,
      theory?.t1 ? 1 : 0, theory?.t2 ? 1 : 0, theory?.t3 ? 1 : 0, theory?.t4 ? 1 : 0,
      intermediate?.i1 || '', intermediate?.i2 || '', intermediate?.i3 || '',
      intermediate?.i4 || '', intermediate?.i5 || '',
      answers?.q1 || '', answers?.q2 || '', answers?.q3 || '',
      answers?.q4 || '', answers?.q5 || '',
      photosP1, photosP2, photosP3, photosP4, photosP5, photosP6
    ],
    async function(err) {
      if (err) {
        console.error('Ошибка сохранения в БД:', err);
        return res.status(500).json({ error: 'Ошибка сохранения' });
      }

      // Отправляем email (не блокируем ответ)
      try {
        await sendResultEmail(studentName, theory, intermediate, answers, photos);
        console.log(`📧 Письмо отправлено для: ${studentName}`);
      } catch (mailErr) {
        console.error('Ошибка отправки письма:', mailErr.message);
      }

      res.json({ success: true, workId: this.lastID });
    }
  );
});

app.get('/admin/results', (req, res) => {
  db.all(`SELECT token, COUNT(*) as student_count,
    GROUP_CONCAT(student_name, ', ') as students,
    MAX(submitted_at) as last_submission
    FROM works GROUP BY token ORDER BY last_submission DESC`, [], (err, groups) => {
    if (err) return res.status(500).send('Ошибка');

    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>body{font-family:Arial;padding:20px;background:#f5f5f5;}
    .card{background:white;border-radius:10px;padding:24px;margin-bottom:20px;box-shadow:0 2px 10px rgba(0,0,0,0.08);}
    table{width:100%;border-collapse:collapse;}
    th,td{border:1px solid #ddd;padding:10px 12px;text-align:left;vertical-align:top;}
    th{background:#1a1a2e;color:white;}tr:nth-child(even){background:#f9f9f9;}
    .btn{background:#2196F3;color:white;padding:6px 14px;border:none;border-radius:4px;cursor:pointer;}
    .check{color:#27ae60;font-weight:bold;}.cross{color:#c0392b;font-weight:bold;}
    </style>
    <script>
    function showDetails(token){
      fetch('/admin/results/'+token).then(r=>r.text()).then(h=>{document.getElementById('d-'+token).innerHTML=h;});
    }
    </script></head><body>
    <div class="card"><h1>📊 Результаты проверочных работ</h1>
    <p style="color:#666;">Формулы сокращённого умножения · 7 класс</p></div>`;

    if (groups.length > 0) {
      html += `<div class="card"><table><tr>
        <th>Токен</th><th>Учеников</th><th>Имена</th><th>Последняя сдача</th><th>Действия</th></tr>`;
      groups.forEach(g => {
        html += `<tr>
          <td style="font-family:monospace;font-size:12px;">${g.token.substring(0,12)}...</td>
          <td><strong>${g.student_count}</strong></td>
          <td>${g.students||'—'}</td>
          <td>${new Date(g.last_submission).toLocaleString('ru-RU')}</td>
          <td><button class="btn" onclick="showDetails('${g.token}')">📄 Показать</button></td>
        </tr>
        <tr><td colspan="5" style="padding:0;"><div id="d-${g.token}"></div></td></tr>`;
      });
      html += `</table></div>`;
    } else {
      html += `<div class="card"><p style="color:#888;">Работ пока нет.</p></div>`;
    }

    db.all(`SELECT * FROM violations ORDER BY violation_time DESC LIMIT 50`, [], (err2, viols) => {
      if (!err2 && viols.length > 0) {
        html += `<div class="card"><h2>⚠️ Нарушения</h2><table>
          <tr><th>Ученик</th><th>Причина</th><th>Время</th></tr>`;
        viols.forEach(v => {
          html += `<tr><td>${v.student||'—'}</td><td>${v.reason}</td>
            <td>${new Date(v.violation_time).toLocaleString('ru-RU')}</td></tr>`;
        });
        html += `</table></div>`;
      }
      html += `<p><a href="/">← На главную</a> &nbsp;|&nbsp; <a href="/admin/generate">🎫 Новая ссылка</a></p>
      </body></html>`;
      res.send(html);
    });
  });
});

app.get('/admin/results/:token', (req, res) => {
  const token = req.params.token;
  db.all(`SELECT * FROM works WHERE token = ? ORDER BY submitted_at DESC`, [token], (err, rows) => {
    if (err || rows.length === 0) return res.send('<p style="padding:16px;color:#888;">Работ не найдено.</p>');

    let html = `<div style="padding:20px;">
      <h3>📋 Токен: <code style="font-size:12px;">${token}</code> — работ: ${rows.length}</h3>`;

    rows.forEach(row => {
      const score = [row.theory_t1,row.theory_t2,row.theory_t3,row.theory_t4].filter(Boolean).length;
      let p6photos = [];
      try { p6photos = JSON.parse(row.photos_p6 || '[]'); } catch(e) {}

      html += `<div style="border:1px solid #ddd;border-radius:8px;padding:20px;margin:16px 0;background:white;">
        <h4 style="margin:0 0 12px;">👤 ${row.student_name||'Без имени'} — ${new Date(row.submitted_at).toLocaleString('ru-RU')}</h4>
        <p><strong>Теория:</strong> ${score}/4
          &nbsp;Т1:${row.theory_t1?'<span class="check">✓</span>':'<span class="cross">✗</span>'}
          &nbsp;Т2:${row.theory_t2?'<span class="check">✓</span>':'<span class="cross">✗</span>'}
          &nbsp;Т3:${row.theory_t3?'<span class="check">✓</span>':'<span class="cross">✗</span>'}
          &nbsp;Т4:${row.theory_t4?'<span class="check">✓</span>':'<span class="cross">✗</span>'}
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px;">
          <tr style="background:#f0f0f0;">
            <th style="padding:8px;border:1px solid #ddd;">Задание</th>
            <th style="padding:8px;border:1px solid #ddd;">Промежуточный ответ</th>
            <th style="padding:8px;border:1px solid #ddd;">Решение</th>
          </tr>
          <tr><td style="padding:8px;border:1px solid #ddd;"><strong>П–1</strong> (3x+5)²</td>
            <td style="padding:8px;border:1px solid #ddd;">${row.inter1||'—'}</td>
            <td style="padding:8px;border:1px solid #ddd;">${row.question1||'—'}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;"><strong>П–2</strong> (4a−1)²</td>
            <td style="padding:8px;border:1px solid #ddd;">${row.inter2||'—'}</td>
            <td style="padding:8px;border:1px solid #ddd;">${row.question2||'—'}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;"><strong>П–3</strong> (x−3)(x+3)</td>
            <td style="padding:8px;border:1px solid #ddd;">${row.inter3||'—'}</td>
            <td style="padding:8px;border:1px solid #ddd;">${row.question3||'—'}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;"><strong>П–4</strong> 25m²−49n²</td>
            <td style="padding:8px;border:1px solid #ddd;">${row.inter4||'—'}</td>
            <td style="padding:8px;border:1px solid #ddd;">${row.question4||'—'}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;"><strong>П–5</strong> x²−10x+25</td>
            <td style="padding:8px;border:1px solid #ddd;">${row.inter5||'—'}</td>
            <td style="padding:8px;border:1px solid #ddd;">${row.question5||'—'}</td></tr>
        </table>
        <div style="margin-top:14px;">
          <strong>П–6 (10 примеров) — фото:</strong><br>
          ${p6photos.length > 0
            ? p6photos.map(src=>`<img src="${src}" style="max-width:200px;max-height:200px;margin:6px 6px 0 0;border:1px solid #ddd;border-radius:4px;object-fit:contain;">`).join('')
            : '<span style="color:#888;font-size:13px;">Фото не прикреплено</span>'
          }
        </div>
      </div>`;
    });

    html += `</div>`;
    res.send(html);
  });
});

app.post('/log-violation', (req, res) => {
  const { token, reason, student } = req.body;
  console.log(`⚠️ Нарушение: ${student||'?'} — ${reason}`);
  db.run('INSERT INTO violations (token, student, reason) VALUES (?,?,?)', [token, student||'', reason]);
  res.json({ logged: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n========================================\n🚀 Сервер запущен на порту ${PORT}\n========================================\n📊 /admin/results\n🎫 /admin/generate\n`);
});
