import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { build, FRONTEND_FILES } = require('../scripts/build.cjs');
const { createServer } = require('../scripts/serve-app.cjs');
const project = path.resolve(import.meta.dirname, '..');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rkef-build-test-'));
  t.after(() => {
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('rkef-build-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  fs.cpSync(path.join(project, 'src'), path.join(root, 'src'), { recursive: true });
  return root;
}

function snapshot(root) {
  function walk(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
      ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
  }
  const output = path.join(root, 'dist');
  return Object.fromEntries(walk(output).sort().map(file => [path.relative(output, file), fs.readFileSync(file).toString('base64')]));
}

test('build is reproducible, cleans generated output, excludes private/dev files and preserves other folders', t => {
  const root = fixture(t);
  for (const folder of ['docs', 'private-data', 'apps-script', 'backups', 'tests']) {
    fs.mkdirSync(path.join(root, folder));
    fs.writeFileSync(path.join(root, folder, 'sentinel.txt'), 'keep');
  }
  for (const name of ['.env', 'backup.json', 'debug.test.js', 'assets/secret.key', 'js/app.js.bak']) fs.writeFileSync(path.join(root, 'src', name), 'DO NOT PUBLISH');
  assert.equal(build({ root }).changed, true);
  const first = snapshot(root);
  assert.equal(Object.keys(first).length, FRONTEND_FILES.length + 1);
  assert.equal(build({ root }).changed, false);
  assert.deepEqual(snapshot(root), first);
  fs.writeFileSync(path.join(root, 'dist', 'obsolete.js'), 'stale');
  fs.mkdirSync(path.join(root, 'dist', 'old-empty'));
  assert.equal(build({ root }).changed, true);
  assert.deepEqual(snapshot(root), first);
  for (const folder of ['docs', 'private-data', 'apps-script', 'backups', 'tests']) assert.equal(fs.readFileSync(path.join(root, folder, 'sentinel.txt'), 'utf8'), 'keep');
});

test('missing source fails before modifying a valid deployment output', t => {
  const root = fixture(t);
  build({ root });
  const before = snapshot(root);
  fs.unlinkSync(path.join(root, 'src', 'config.js'));
  assert.throws(() => build({ root }), /ENOENT/);
  assert.deepEqual(snapshot(root), before);
});

test('build refuses output/source junctions and preserves files outside generated output', t => {
  const root = fixture(t);
  const outside = path.join(root, 'private-data');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'keep.txt'), 'keep');
  const output = path.join(root, 'dist');
  fs.symlinkSync(outside, output, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => build({ root }), /symbolic link\/junction/);
  fs.unlinkSync(output);
  build({ root });
  const nested = path.join(output, 'linked');
  fs.symlinkSync(outside, nested, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => build({ root }), /symbolic link\/junction/);
  fs.unlinkSync(nested);
  const source = path.join(root, 'src', 'assets');
  fs.renameSync(source, path.join(root, 'original-assets'));
  fs.symlinkSync(outside, source, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => build({ root }), /symbolic link\/junction/);
  fs.unlinkSync(source);
  assert.equal(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8'), 'keep');
});

async function start(t, options) {
  const server = createServer(options);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('dev serves fresh source after edits and rejects build failures instead of stale output', async t => {
  const root = fixture(t);
  const origin = await start(t, { root });
  const redirect = await fetch(origin + '/RKEF-Ticketing', { redirect: 'manual' });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), '/RKEF-Ticketing/');
  for (const base of ['/', '/RKEF-Ticketing/']) assert.match(await (await fetch(origin + base)).text(), /RKEF Ticketing/);
  fs.appendFileSync(path.join(root, 'src', 'styles.css'), '\n/* source edit */');
  const response = await fetch(origin + '/RKEF-Ticketing/styles.css');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(await response.text(), /source edit/);
  const worker = await (await fetch(origin + '/RKEF-Ticketing/sw.js')).text();
  assert.match(worker, /skipWaiting/);
  assert.doesNotMatch(worker, /caches\.open/);
  assert.equal(fs.readFileSync(path.join(root, 'dist', 'sw.js'), 'utf8'), fs.readFileSync(path.join(root, 'src', 'sw.js'), 'utf8'));
  for (const url of ['/src/config.js', '/docs/README.md', '/RKEF-Ticketing/docs/testing/LOCAL_TEST_RESULTS.md', '/tests/browser-suite.js', '/RKEF-Ticketing/%2e%2e%2fpackage.json', '/RKEF-Ticketing/js%5capp.js', '/private-data/backup.json']) assert.equal((await fetch(origin + url)).status, 404);
  fs.unlinkSync(path.join(root, 'src', 'config.js'));
  assert.equal((await fetch(origin + '/RKEF-Ticketing/')).status, 500);
});

test('preview builds at startup and serves all deployment bytes with production PWA paths and MIME types', async t => {
  const root = fixture(t);
  const origin = await start(t, { root, development: false });
  for (const name of [...FRONTEND_FILES, '.nojekyll']) {
    const response = await fetch(origin + '/RKEF-Ticketing/' + name);
    assert.equal(response.status, 200, name);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), fs.readFileSync(path.join(root, 'dist', name)), name);
    if (name.endsWith('.js')) assert.match(response.headers.get('content-type'), /text\/javascript/);
    if (name.endsWith('.webmanifest')) assert.match(response.headers.get('content-type'), /application\/manifest\+json/);
  }
});
