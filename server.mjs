import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 5001;
const HOST = process.env.HOST || '0.0.0.0';
const DIST_DIR = path.resolve(__dirname, 'dist');

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
  const safeRelative = path.normalize(cleanPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const candidatePath = path.resolve(DIST_DIR, `.${safeRelative}`);

  // Prevent directory traversal outside DIST_DIR
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

    // SPA fallback to dist/index.html
    const indexPath = path.join(DIST_DIR, 'index.html');
    serveFile(res, indexPath, '.html');
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[JoJo TCG] Server running on http://${HOST}:${PORT}`);
});
