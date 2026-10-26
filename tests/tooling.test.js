import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { FRONTEND_FILES } = require('../scripts/public-files.cjs');
const { createServer } = require('../scripts/serve-app.cjs');
const project = path.resolve(import.meta.dirname, '..');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rkef-server-test-'));
  t.after(() => {
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('rkef-server-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  for (const name of FRONTEND_FILES) {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(project, name), target);
  }
  return root;
}

async function start(t, options) {
  const server = createServer(options);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('dev serves root edits immediately without generating or modifying other application files', async t => {
  const root = fixture(t);
  const before = new Map(FRONTEND_FILES.map(name => [name, fs.readFileSync(path.join(root, name))]));
  const origin = await start(t, { root });
  const redirect = await fetch(origin + '/RKEF-Ticketing', { redirect: 'manual' });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), '/RKEF-Ticketing/');
  for (const base of ['/', '/RKEF-Ticketing/']) assert.match(await (await fetch(origin + base)).text(), /RKEF Ticketing/);
  const edits = { 'styles.css': '\n/* root edit */', 'js/app.js': '\n/* root edit */', 'index.html': '\n<!-- root edit -->' };
  for (const [name, edit] of Object.entries(edits)) {
    fs.appendFileSync(path.join(root, name), edit);
    const response = await fetch(origin + '/RKEF-Ticketing/' + name);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(await response.text(), /root edit/);
  }
  const worker = await (await fetch(origin + '/RKEF-Ticketing/sw.js')).text();
  assert.match(worker, /skipWaiting/);
  assert.doesNotMatch(worker, /caches\.open/);
  for (const [name, content] of before) {
    if (!(name in edits)) assert.deepEqual(fs.readFileSync(path.join(root, name)), content, name);
  }
  assert.deepEqual(fs.readdirSync(root).sort(), [...new Set(FRONTEND_FILES.map(name => name.split('/')[0]))].sort());
  fs.unlinkSync(path.join(root, 'config.js'));
  assert.equal((await fetch(origin + '/RKEF-Ticketing/config.js')).status, 404);
  assert.equal((await fetch(origin + '/RKEF-Ticketing/')).status, 200);
});

test('dev and preview deny existing private, development, traversal, backup and unknown files', async t => {
  const root = fixture(t);
  const secretFiles = ['private-data/backup.json', 'docs/README.md', 'tests/browser-suite.js', 'scripts/serve-app.cjs',
    'apps-script/Code.gs', 'backups/ritase.json', 'exports/ritase.tsv', '.git/config', '.env', 'credentials.json',
    'package.json', 'README.md', 'assets/secret.key', 'js/app.js.bak', 'assets/extra.svg'];
  for (const name of secretFiles) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), 'PRIVATE_SENTINEL');
  }
  const suspicious = ['%2e%2e%2fprivate-data/backup.json', 'js%5capp.js', 'assets/%2e%2e%5c.env', '%252e%252e%252f.env',
    'assets/', 'js/', 'unknown.js', 'src/config.js', 'dist/index.html'];
  for (const development of [true, false]) {
    const origin = await start(t, { root, development });
    for (const base of ['/', '/RKEF-Ticketing/']) {
      for (const name of [...secretFiles, ...suspicious]) {
        const response = await fetch(origin + base + name);
        assert.equal(response.status, 404, base + name);
        assert.doesNotMatch(await response.text(), /PRIVATE_SENTINEL/);
      }
    }
    assert.equal((await fetch(origin + '/RKEF-Ticketing/%E0%A4%A')).status, 400);
    assert.equal((await fetch(origin + '/RKEF-Ticketing/config.js', { method: 'POST' })).status, 405);
  }
  for (const name of secretFiles) assert.equal(fs.readFileSync(path.join(root, name), 'utf8'), 'PRIVATE_SENTINEL');
});

test('server refuses directory junctions and file symlinks at allowlisted paths', async t => {
  const root = fixture(t);
  const outside = path.join(root, 'private-data');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'icon-192.png'), 'PRIVATE_SENTINEL');
  fs.renameSync(path.join(root, 'assets'), path.join(root, 'original-assets'));
  fs.symlinkSync(outside, path.join(root, 'assets'), process.platform === 'win32' ? 'junction' : 'dir');
  for (const development of [true, false]) {
    const origin = await start(t, { root, development });
    assert.equal((await fetch(origin + '/RKEF-Ticketing/assets/icon-192.png')).status, 404);
    assert.equal((await fetch(origin + '/RKEF-Ticketing/index.html')).status, 200);
  }
  fs.unlinkSync(path.join(root, 'assets'));
  const fileLink = path.join(root, 'config.js');
  fs.unlinkSync(fileLink);
  // File symlinks may require Windows Developer Mode; junction coverage is mandatory.
  try { fs.symlinkSync(path.join(outside, 'icon-192.png'), fileLink, 'file'); }
  catch (error) { if (error.code !== 'EPERM') throw error; t.diagnostic('File symlink unavailable (Windows EPERM); junction denial verified.'); return; }
  const origin = await start(t, { root });
  assert.equal((await fetch(origin + '/RKEF-Ticketing/config.js')).status, 404);
});

test('preview serves every root application byte with production worker and correct MIME types', async t => {
  const root = fixture(t);
  const origin = await start(t, { root, development: false });
  for (const name of FRONTEND_FILES) {
    const response = await fetch(origin + '/RKEF-Ticketing/' + name);
    assert.equal(response.status, 200, name);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), fs.readFileSync(path.join(root, name)), name);
    if (name.endsWith('.js')) assert.match(response.headers.get('content-type'), /text\/javascript/);
    if (name.endsWith('.webmanifest')) assert.match(response.headers.get('content-type'), /application\/manifest\+json/);
    const head = await fetch(origin + '/RKEF-Ticketing/' + name, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  }
  fs.appendFileSync(path.join(root, 'styles.css'), '\n/* preview edit */');
  assert.match(await (await fetch(origin + '/RKEF-Ticketing/styles.css')).text(), /preview edit/);
});
