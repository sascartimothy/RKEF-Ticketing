'use strict';
// Loopback server for generated output; dev rebuilds from src/ on every request.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { build, FRONTEND_FILES } = require('./build.cjs');
const publicFiles = new Set([...FRONTEND_FILES, '.nojekyll']);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
// Only served in dev mode, never written into dist/. Replaces a cached localhost
// worker without touching IndexedDB. Production/browser tests use src/sw.js verbatim.
const devWorker = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
// Development uses the network so a reload reads the latest src/ build.
`;

function createServer({ root = path.resolve(__dirname, '..'), development = true } = {}) {
  const output = path.join(root, 'dist');
  build({ root });
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
      if (development) build({ root }); // Failure returns 500, never stale dist/.
      const content = development && name === 'sw.js' ? Buffer.from(devWorker) : fs.readFileSync(path.join(output, name));
      res.writeHead(200, { 'Content-Type': mime[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      console.error(error.message);
      res.writeHead(500); res.end('Build/read failed. Check the server terminal; stale output is not served.');
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
    console.log(`RKEF Ticketing ${development ? 'dev (rebuild on request)' : 'preview (production PWA)'}: http://127.0.0.1:${server.address().port}/RKEF-Ticketing/ (also available at /)`);
  });
}
