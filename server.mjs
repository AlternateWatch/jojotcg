import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 5001;
const HOST = process.env.HOST || '0.0.0.0';
const DIST_DIR = path.resolve(__dirname, 'dist');

const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'jojotcg',
  password: process.env.DB_PASSWORD || 'jojotcg_secret_2026',
  database: process.env.DB_NAME || 'jojotcg',
  waitForConnections: true,
  connectionLimit: 10,
};

let pool = null;

async function initDatabase() {
  try {
    pool = mysql.createPool(DB_CONFIG);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(32) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        progression_json LONGTEXT NOT NULL,
        decks_json LONGTEXT NOT NULL,
        settings_json LONGTEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        token VARCHAR(128) PRIMARY KEY,
        user_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log(`[JoJo TCG] MySQL connected (${DB_CONFIG.user}@${DB_CONFIG.host}/${DB_CONFIG.database})`);
  } catch (err) {
    console.error('[JoJo TCG] MySQL connection warning (API will retry on request):', err.message);
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  const [salt, key] = (storedHash || '').split(':');
  if (!salt || !key) return false;
  const derivedBuffer = crypto.scryptSync(password, salt, 64);
  const keyBuffer = Buffer.from(key, 'hex');
  if (derivedBuffer.length !== keyBuffer.length) return false;
  return crypto.timingSafeEqual(derivedBuffer, keyBuffer);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 2 * 1024 * 1024) {
        reject(new Error('Payload demasiado grande.'));
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('JSON inválido.'));
      }
    });
    req.on('error', reject);
  });
}

function extractBearerToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  return null;
}

async function getUserByToken(token) {
  if (!token || !pool) return null;
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.progression_json, u.decks_json, u.settings_json
     FROM user_sessions s
     INNER JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > NOW()
     LIMIT 1`,
    [token],
  );
  const list = Array.isArray(rows) ? rows : [];
  return list[0] || null;
}

function safeParseJson(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function handleApiRequest(req, res, pathname) {
  if (!pool) {
    await initDatabase();
  }
  if (!pool) {
    sendJson(res, 503, { error: 'Base de datos MySQL no disponible.' });
    return;
  }

  try {
    if (req.method === 'POST' && pathname === '/api/auth/register') {
      const body = await readJsonBody(req);
      const username = String(body.username || '').trim();
      const password = String(body.password || '');

      if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(username)) {
        sendJson(res, 400, {
          error: 'El usuario debe tener entre 3 y 24 caracteres (letras, números, _ . -).',
        });
        return;
      }
      if (password.length < 4) {
        sendJson(res, 400, { error: 'La contraseña debe tener al menos 4 caracteres.' });
        return;
      }

      const [existing] = await pool.query('SELECT id FROM users WHERE username = ? LIMIT 1', [
        username,
      ]);
      if (Array.isArray(existing) && existing.length > 0) {
        sendJson(res, 409, { error: 'Ese nombre de usuario ya está registrado.' });
        return;
      }

      const passwordHash = hashPassword(password);
      const progressionJson = JSON.stringify(body.progression ?? {});
      const decksJson = JSON.stringify(Array.isArray(body.customDecks) ? body.customDecks : []);
      const settingsJson = JSON.stringify(body.settings ?? {});

      const [insertRes] = await pool.query(
        `INSERT INTO users (username, password_hash, progression_json, decks_json, settings_json)
         VALUES (?, ?, ?, ?, ?)`,
        [username, passwordHash, progressionJson, decksJson, settingsJson],
      );

      const userId = insertRes.insertId;
      const token = crypto.randomBytes(32).toString('hex');
      await pool.query(
        `INSERT INTO user_sessions (token, user_id, expires_at)
         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))`,
        [token, userId],
      );

      sendJson(res, 201, {
        token,
        user: { id: userId, username },
        progression: safeParseJson(progressionJson, null),
        customDecks: safeParseJson(decksJson, []),
        settings: safeParseJson(settingsJson, null),
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/auth/login') {
      const body = await readJsonBody(req);
      const username = String(body.username || '').trim();
      const password = String(body.password || '');

      const [rows] = await pool.query(
        'SELECT id, username, password_hash, progression_json, decks_json, settings_json FROM users WHERE username = ? LIMIT 1',
        [username],
      );
      const user = Array.isArray(rows) ? rows[0] : null;
      if (!user || !verifyPassword(password, user.password_hash)) {
        sendJson(res, 401, { error: 'Usuario o contraseña incorrectos.' });
        return;
      }

      const token = crypto.randomBytes(32).toString('hex');
      await pool.query(
        `INSERT INTO user_sessions (token, user_id, expires_at)
         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))`,
        [token, user.id],
      );

      sendJson(res, 200, {
        token,
        user: { id: user.id, username: user.username },
        progression: safeParseJson(user.progression_json, null),
        customDecks: safeParseJson(user.decks_json, []),
        settings: safeParseJson(user.settings_json, null),
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/auth/logout') {
      const token = extractBearerToken(req);
      if (token) {
        await pool.query('DELETE FROM user_sessions WHERE token = ?', [token]);
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/auth/me') {
      const token = extractBearerToken(req);
      const user = await getUserByToken(token);
      if (!user) {
        sendJson(res, 401, { error: 'Sesión no válida o expirada.' });
        return;
      }
      sendJson(res, 200, {
        user: { id: user.id, username: user.username },
        progression: safeParseJson(user.progression_json, null),
        customDecks: safeParseJson(user.decks_json, []),
        settings: safeParseJson(user.settings_json, null),
      });
      return;
    }

    if (req.method === 'PUT' && pathname === '/api/user/sync') {
      const token = extractBearerToken(req);
      const user = await getUserByToken(token);
      if (!user) {
        sendJson(res, 401, { error: 'Sesión no válida.' });
        return;
      }
      const body = await readJsonBody(req);
      const nextProgression =
        body.progression !== undefined ? JSON.stringify(body.progression) : user.progression_json;
      const nextDecks =
        body.customDecks !== undefined ? JSON.stringify(body.customDecks) : user.decks_json;
      const nextSettings =
        body.settings !== undefined ? JSON.stringify(body.settings) : user.settings_json;

      await pool.query(
        'UPDATE users SET progression_json = ?, decks_json = ?, settings_json = ? WHERE id = ?',
        [nextProgression, nextDecks, nextSettings, user.id],
      );

      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 404, { error: 'Ruta API no encontrada.' });
  } catch (err) {
    console.error('[JoJo TCG API Error]:', err);
    sendJson(res, 500, { error: err.message || 'Error interno del servidor.' });
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function serveFile(res, filePath, ext) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal Server Error');
      return;
    }
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isHashedAsset = filePath.includes(`${path.sep}assets${path.sep}`);
    const cacheControl =
      ext === '.html'
        ? 'no-cache'
        : isHashedAsset
          ? 'public, max-age=604800'
          : 'public, max-age=86400';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const rawUrl = req.url || '/';
  const cleanPath = decodeURIComponent(rawUrl.split('?')[0]);

  if (cleanPath.startsWith('/api/')) {
    void handleApiRequest(req, res, cleanPath);
    return;
  }

  const safeRelative = path.normalize(cleanPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const candidatePath = path.resolve(DIST_DIR, `.${safeRelative}`);

  if (!candidatePath.startsWith(DIST_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(candidatePath, (err, stats) => {
    if (!err && stats.isFile()) {
      const ext = path.extname(candidatePath).toLowerCase();
      serveFile(res, candidatePath, ext);
      return;
    }

    const indexPath = path.join(DIST_DIR, 'index.html');
    serveFile(res, indexPath, '.html');
  });
});

void initDatabase();

server.listen(PORT, HOST, () => {
  console.log(`[JoJo TCG] Server running on http://${HOST}:${PORT}`);
});
