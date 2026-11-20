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

const LOGS_DIR = path.resolve(__dirname, 'logs');
const MATCH_LOG_FILE = path.join(LOGS_DIR, 'matches.jsonl');

function appendMatchLog(record) {
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
    const line = JSON.stringify({
      loggedAt: new Date().toISOString(),
      ...record,
    });
    fs.appendFileSync(MATCH_LOG_FILE, `${line}\n`, 'utf-8');
  } catch (err) {
    console.error('[JoJo TCG] Failed to write match log:', err.message);
  }
}

// ===================== ONLINE MULTIPLAYER MATCHMAKING & ROOMS =====================
// roomCode -> { code, isPrivate, status, p1, p2, gameState, lastEvents, version, updatedAt }
const onlineRooms = new Map();
// Queue of public room codes waiting for an opponent
const matchmakingQueue = [];

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[crypto.randomInt(0, chars.length)];
  }
  return onlineRooms.has(code) ? generateRoomCode() : code;
}

function cleanupStaleRooms() {
  const now = Date.now();
  const maxAgeMs = 45 * 60 * 1000; // 45 minutes
  for (const [code, room] of onlineRooms.entries()) {
    if (now - room.updatedAt > maxAgeMs) {
      onlineRooms.delete(code);
      const qIdx = matchmakingQueue.indexOf(code);
      if (qIdx !== -1) matchmakingQueue.splice(qIdx, 1);
    }
  }
}

setInterval(cleanupStaleRooms, 60 * 1000).unref?.();

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
  try {
    // ===================== ONLINE MULTIPLAYER ENDPOINTS =====================
    if (req.method === 'POST' && pathname === '/api/online/find-match') {
      const body = await readJsonBody(req);
      const playerToken = String(body.playerToken || '').trim();
      const playerName = String(body.playerName || 'Jugador').trim().slice(0, 24) || 'Jugador';
      const deckIds = Array.isArray(body.deckIds) ? body.deckIds : [];

      if (!playerToken || deckIds.length === 0) {
        sendJson(res, 400, { error: 'Token de jugador y mazo requeridos.' });
        return;
      }

      // Remove any existing waiting rooms from this same playerToken
      for (const [code, r] of onlineRooms.entries()) {
        if (r.status === 'WAITING' && r.p1.token === playerToken) {
          onlineRooms.delete(code);
          const qIdx = matchmakingQueue.indexOf(code);
          if (qIdx !== -1) matchmakingQueue.splice(qIdx, 1);
        }
      }

      // Find first available public waiting room in queue
      while (matchmakingQueue.length > 0) {
        const queuedCode = matchmakingQueue.shift();
        const room = onlineRooms.get(queuedCode);
        if (room && room.status === 'WAITING' && room.p1.token !== playerToken) {
          room.p2 = { token: playerToken, name: playerName, deckIds };
          room.status = 'PLAYING';
          room.firstPlayerId = Math.random() < 0.5 ? 'P1' : 'P2';
          room.version += 1;
          room.updatedAt = Date.now();

          sendJson(res, 200, {
            roomCode: room.code,
            role: 'P2',
            status: room.status,
            isPrivate: false,
            p1: { name: room.p1.name, deckIds: room.p1.deckIds },
            p2: { name: room.p2.name, deckIds: room.p2.deckIds },
            firstPlayerId: room.firstPlayerId,
            gameState: room.gameState,
            lastEvents: room.lastEvents,
            version: room.version,
          });
          return;
        }
      }

      // Otherwise create a new public room and enqueue it
      const code = generateRoomCode();
      const newRoom = {
        code,
        isPrivate: false,
        status: 'WAITING',
        p1: { token: playerToken, name: playerName, deckIds },
        p2: null,
        firstPlayerId: 'P1',
        gameState: null,
        lastEvents: [],
        version: 1,
        updatedAt: Date.now(),
      };
      onlineRooms.set(code, newRoom);
      matchmakingQueue.push(code);

      sendJson(res, 200, {
        roomCode: code,
        role: 'P1',
        status: 'WAITING',
        isPrivate: false,
        p1: { name: newRoom.p1.name, deckIds: newRoom.p1.deckIds },
        p2: null,
        firstPlayerId: newRoom.firstPlayerId,
        gameState: null,
        lastEvents: [],
        version: 1,
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/online/create-private') {
      const body = await readJsonBody(req);
      const playerToken = String(body.playerToken || '').trim();
      const playerName = String(body.playerName || 'Jugador 1').trim().slice(0, 24) || 'Jugador 1';
      const deckIds = Array.isArray(body.deckIds) ? body.deckIds : [];

      if (!playerToken || deckIds.length === 0) {
        sendJson(res, 400, { error: 'Token de jugador y mazo requeridos.' });
        return;
      }

      const code = generateRoomCode();
      const newRoom = {
        code,
        isPrivate: true,
        status: 'WAITING',
        p1: { token: playerToken, name: playerName, deckIds },
        p2: null,
        firstPlayerId: Math.random() < 0.5 ? 'P1' : 'P2',
        gameState: null,
        lastEvents: [],
        version: 1,
        updatedAt: Date.now(),
      };
      onlineRooms.set(code, newRoom);

      sendJson(res, 200, {
        roomCode: code,
        role: 'P1',
        status: 'WAITING',
        isPrivate: true,
        p1: { name: newRoom.p1.name, deckIds: newRoom.p1.deckIds },
        p2: null,
        firstPlayerId: newRoom.firstPlayerId,
        gameState: null,
        lastEvents: [],
        version: 1,
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/online/join-private') {
      const body = await readJsonBody(req);
      const code = String(body.roomCode || '').trim().toUpperCase();
      const playerToken = String(body.playerToken || '').trim();
      const playerName = String(body.playerName || 'Jugador 2').trim().slice(0, 24) || 'Jugador 2';
      const deckIds = Array.isArray(body.deckIds) ? body.deckIds : [];

      const room = onlineRooms.get(code);
      if (!room) {
        sendJson(res, 404, { error: `No existe ninguna sala con el código "${code}".` });
        return;
      }

      if (room.p1.token === playerToken) {
        sendJson(res, 400, { error: 'Ya eres el anfitrión de esta sala.' });
        return;
      }

      if (room.status !== 'WAITING' || room.p2) {
        sendJson(res, 409, { error: 'Esta sala ya está llena o en combate.' });
        return;
      }

      // Remove from public queue if someone joined via code
      const qIdx = matchmakingQueue.indexOf(code);
      if (qIdx !== -1) matchmakingQueue.splice(qIdx, 1);

      room.p2 = { token: playerToken, name: playerName, deckIds };
      room.status = 'PLAYING';
      room.version += 1;
      room.updatedAt = Date.now();

      sendJson(res, 200, {
        roomCode: room.code,
        role: 'P2',
        status: room.status,
        isPrivate: room.isPrivate,
        p1: { name: room.p1.name, deckIds: room.p1.deckIds },
        p2: { name: room.p2.name, deckIds: room.p2.deckIds },
        firstPlayerId: room.firstPlayerId,
        gameState: room.gameState,
        lastEvents: room.lastEvents,
        version: room.version,
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/online/room') {
      const urlObj = new URL(req.url || '/', 'http://localhost');
      const code = (urlObj.searchParams.get('code') || '').trim().toUpperCase();
      const playerToken = (urlObj.searchParams.get('token') || '').trim();

      const room = onlineRooms.get(code);
      if (!room) {
        sendJson(res, 404, { error: 'La sala ya no existe o fue cerrada.' });
        return;
      }

      const role =
        room.p1?.token === playerToken ? 'P1' : room.p2?.token === playerToken ? 'P2' : null;
      if (!role) {
        sendJson(res, 403, { error: 'No perteneces a esta sala.' });
        return;
      }

      sendJson(res, 200, {
        roomCode: room.code,
        role,
        status: room.status,
        isPrivate: room.isPrivate,
        p1: room.p1 ? { name: room.p1.name, deckIds: room.p1.deckIds } : null,
        p2: room.p2 ? { name: room.p2.name, deckIds: room.p2.deckIds } : null,
        firstPlayerId: room.firstPlayerId,
        gameState: room.gameState,
        lastEvents: room.lastEvents,
        version: room.version,
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/online/push-state') {
      const body = await readJsonBody(req);
      const code = String(body.roomCode || '').trim().toUpperCase();
      const playerToken = String(body.playerToken || '').trim();
      const nextGameState = body.gameState;
      const lastEvents = Array.isArray(body.lastEvents) ? body.lastEvents : [];

      const room = onlineRooms.get(code);
      if (!room) {
        sendJson(res, 404, { error: 'Sala no encontrada.' });
        return;
      }

      const isParticipant =
        room.p1?.token === playerToken || room.p2?.token === playerToken;
      if (!isParticipant) {
        sendJson(res, 403, { error: 'No autorizado en esta sala.' });
        return;
      }

      // Ignore duplicate init pushes if gameState is already initialized and body.isInitial
      if (body.isInitial && room.gameState) {
        sendJson(res, 200, {
          ok: true,
          version: room.version,
          gameState: room.gameState,
          lastEvents: room.lastEvents,
        });
        return;
      }

      room.gameState = nextGameState;
      room.lastEvents = lastEvents;
      room.version += 1;
      room.updatedAt = Date.now();
      if (nextGameState?.phase === 'GAME_OVER' && room.status !== 'FINISHED') {
        room.status = 'FINISHED';
        appendMatchLog({
          mode: 'ONLINE',
          roomCode: room.code,
          p1Name: room.p1?.name,
          p2Name: room.p2?.name,
          winnerId: nextGameState.winnerId,
          winnerName: nextGameState.winnerId
            ? nextGameState.players?.[nextGameState.winnerId]?.name
            : null,
          winReason: nextGameState.winReason,
          turnNumber: nextGameState.turnNumber,
          p1DeckRemaining: nextGameState.players?.P1?.deck?.length ?? null,
          p2DeckRemaining: nextGameState.players?.P2?.deck?.length ?? null,
          p1HandCount: nextGameState.players?.P1?.hand?.length ?? null,
          p2HandCount: nextGameState.players?.P2?.hand?.length ?? null,
          eventLog: (nextGameState.eventLog || []).slice(-40),
        });
      }

      sendJson(res, 200, {
        ok: true,
        version: room.version,
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/matches/log') {
      const body = await readJsonBody(req);
      appendMatchLog({
        mode: body.mode || 'LOCAL',
        p1Name: body.p1Name,
        p2Name: body.p2Name,
        winnerId: body.winnerId,
        winnerName: body.winnerName,
        winReason: body.winReason,
        turnNumber: body.turnNumber,
        p1DeckRemaining: body.p1DeckRemaining,
        p2DeckRemaining: body.p2DeckRemaining,
        p1HandCount: body.p1HandCount,
        p2HandCount: body.p2HandCount,
        eventLog: Array.isArray(body.eventLog) ? body.eventLog.slice(-40) : [],
      });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/matches/logs') {
      const urlObj = new URL(req.url || '/', 'http://localhost');
      const limit = Math.min(50, Math.max(1, Number(urlObj.searchParams.get('limit')) || 10));
      if (!fs.existsSync(MATCH_LOG_FILE)) {
        sendJson(res, 200, { count: 0, matches: [] });
        return;
      }
      const lines = fs
        .readFileSync(MATCH_LOG_FILE, 'utf-8')
        .split('\n')
        .filter((l) => l.trim().length > 0);
      const recent = lines
        .slice(-limit)
        .reverse()
        .map((l) => safeParseJson(l, null))
        .filter(Boolean);
      sendJson(res, 200, { count: recent.length, matches: recent });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/online/leave') {
      const body = await readJsonBody(req);
      const code = String(body.roomCode || '').trim().toUpperCase();
      const playerToken = String(body.playerToken || '').trim();

      const room = onlineRooms.get(code);
      if (room && (room.p1?.token === playerToken || room.p2?.token === playerToken)) {
        const qIdx = matchmakingQueue.indexOf(code);
        if (qIdx !== -1) matchmakingQueue.splice(qIdx, 1);

        if (room.status === 'WAITING') {
          onlineRooms.delete(code);
        } else if (room.gameState && room.gameState.phase !== 'GAME_OVER') {
          const leaverRole = room.p1?.token === playerToken ? 'P1' : 'P2';
          const winnerRole = leaverRole === 'P1' ? 'P2' : 'P1';
          const leaverName = leaverRole === 'P1' ? room.p1.name : room.p2?.name || 'Rival';
          room.gameState.phase = 'GAME_OVER';
          room.gameState.winnerId = winnerRole;
          room.gameState.winReason = `${leaverName} abandonó la partida online.`;
          room.status = 'FINISHED';
          room.version += 1;
          room.updatedAt = Date.now();
          appendMatchLog({
            mode: 'ONLINE',
            roomCode: room.code,
            p1Name: room.p1?.name,
            p2Name: room.p2?.name,
            winnerId: winnerRole,
            winnerName: room.gameState.players?.[winnerRole]?.name ?? null,
            winReason: room.gameState.winReason,
            turnNumber: room.gameState.turnNumber,
            p1DeckRemaining: room.gameState.players?.P1?.deck?.length ?? null,
            p2DeckRemaining: room.gameState.players?.P2?.deck?.length ?? null,
            p1HandCount: room.gameState.players?.P1?.hand?.length ?? null,
            p2HandCount: room.gameState.players?.P2?.hand?.length ?? null,
            eventLog: (room.gameState.eventLog || []).slice(-40),
          });
        }
      }

      sendJson(res, 200, { ok: true });
      return;
    }

    // ===================== MYSQL AUTH & USER ENDPOINTS =====================
    if (!pool) {
      await initDatabase();
    }
    if (!pool) {
      sendJson(res, 503, { error: 'Base de datos MySQL no disponible.' });
      return;
    }
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
  '.flac': 'audio/flac',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.opus': 'audio/opus',
};

function serveFile(req, res, filePath, ext, fileSize) {
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const isHashedAsset = filePath.includes(`${path.sep}assets${path.sep}`);
  const cacheControl =
    ext === '.html'
      ? 'no-cache'
      : isHashedAsset
        ? 'public, max-age=604800'
        : 'public, max-age=86400';

  const rangeHeader = req.headers.range;
  if (rangeHeader && typeof fileSize === 'number' && fileSize > 0) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (match) {
      const start = match[1] ? Number.parseInt(match[1], 10) : 0;
      const end = match[2] ? Math.min(Number.parseInt(match[2], 10), fileSize - 1) : fileSize - 1;
      if (start >= 0 && start <= end && start < fileSize) {
        res.writeHead(206, {
          'Content-Type': contentType,
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
          'Cache-Control': cacheControl,
        });
        const stream = fs.createReadStream(filePath, { start, end });
        stream.on('error', () => {
          if (!res.headersSent) res.writeHead(500);
          res.end();
        });
        stream.pipe(res);
        return;
      }
    }
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal Server Error');
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': data.length,
      'Accept-Ranges': 'bytes',
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
      serveFile(req, res, candidatePath, ext, stats.size);
      return;
    }

    const indexPath = path.join(DIST_DIR, 'index.html');
    serveFile(req, res, indexPath, '.html');
  });
});

void initDatabase();

server.listen(PORT, HOST, () => {
  console.log(`[JoJo TCG] Server running on http://${HOST}:${PORT}`);
});
