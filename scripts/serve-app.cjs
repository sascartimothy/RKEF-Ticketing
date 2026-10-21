'use strict';
// Loopback server: read allowlisted application files directly from repository root.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { FRONTEND_FILES, readPublicFile } = require('./public-files.cjs');
const publicFiles = new Set(FRONTEND_FILES);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
// Only served in dev mode, never written to disk. Replaces a cached localhost
// worker without touching IndexedDB. Preview/browser tests use root sw.js verbatim.
const devWorker = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
// Development uses the network so a reload reads the latest root application files.
`;

function createServer({ root = path.resolve(__dirname, '..'), development = true } = {}) {
  root = fs.realpathSync(root);
  return http.createServer((req, res) => {
    try {
      let decoded;
      try { decoded = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
      catch { res.writeHead(400); res.end('Bad URL'); return; }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end('Method not allowed'); return; }
      if (decoded === '/RKEF-Ticketing') { res.writeHead(302, { Location: '/RKEF-Ticketing/' }); res.end(); return; }
      if (decoded.startsWith('/RKEF-Ticketing/')) decoded = decoded.slice('/RKEF-Ticketing'.length);
      const name = decoded.endsWith('/') ? decoded.slice(1) + 'index.html' : decoded.slice(1);
      if (!publicFiles.has(name)) { res.writeHead(404); res.end('Not found'); return; }
      const file = readPublicFile(root, name);
      const content = development && name === 'sw.js' ? Buffer.from(devWorker) : file;
      res.writeHead(200, { 'Content-Type': mime[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) { res.writeHead(404); res.end('Not found'); return; }
      console.error(error.message);
      res.writeHead(500); res.end('File read failed. Check the server terminal.');
    }
  });
}

module.exports = { createServer };
if (require.main === module) {
  const development = !process.argv.includes('--preview');
  const port = process.env.PORT === undefined ? 4173 : Number(process.env.PORT);
  const server = createServer({ development });
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => {
    console.log(`RKEF Ticketing ${development ? 'dev (root files)' : 'preview (production PWA)'}: http://127.0.0.1:${server.address().port}/RKEF-Ticketing/ (also available at /)`);
  });
}
