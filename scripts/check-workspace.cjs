'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { FRONTEND_FILES, readPublicFile } = require('./public-files.cjs');
const root = path.resolve(__dirname, '..');
const required = ['README.md', 'AGENTS.md', 'docs/README.md', 'docs/requirements/PRD_RKEF_Ticketing_v0.9.md',
  'docs/development/CODEX_ONE_SHOT_PROMPT.md', 'docs/development/SETUP_VSCODE_GITHUB.md',
  'docs/development/SETUP_APPS_SCRIPT_GITHUB.md', 'docs/testing/LOCAL_TEST_RESULTS.md',
  'docs/architecture/PROJECT_STRUCTURE.md', 'package.json', 'apps-script/Code.gs',
  'apps-script/appsscript.json', 'tests/test_apps_script.cjs'];
for (const name of required) assert.ok(fs.existsSync(path.join(root, name)), `Missing ${name}`);
for (const name of ['src', 'dist', 'scripts/build.cjs', '.github/workflows/deploy-pages.yml']) {
  assert.ok(!fs.existsSync(path.join(root, name)), `Obsolete architecture entry: ${name}`);
}
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.ok(!pkg.scripts.build && !pkg.scripts.pretest, 'No build pipeline');
function inventory(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    assert.ok(!entry.isSymbolicLink(), `Linked entry: ${entry.name}`);
    return entry.isDirectory() ? inventory(path.join(directory, entry.name)).map(name => entry.name + '/' + name) : [entry.name];
  }).sort();
}
assert.deepEqual(fs.readdirSync(root).filter(name => name.endsWith('.md')).sort(), ['AGENTS.md', 'README.md']);
assert.deepEqual(fs.readdirSync(root).filter(name => name.endsWith('.html')).sort(), ['index.html', 'integration-test.html']);
for (const name of inventory(path.join(root, 'docs'))) assert.ok(name.endsWith('.md'), `Non-documentation file in docs/: ${name}`);
for (const folder of ['js', 'assets']) {
  assert.deepEqual(inventory(path.join(root, folder)).map(name => folder + '/' + name), FRONTEND_FILES.filter(name => name.startsWith(folder + '/')));
}
for (const name of FRONTEND_FILES) readPublicFile(root, name);
assert.equal(readPublicFile(root, '.nojekyll').length, 0);
console.log('PASS single root application; no src/dist/build/workflow; docs is Markdown-only; explicit public inventory');
const cfg = readPublicFile(root, 'config.js').toString();
assert.ok(cfg.includes(`appVersion: "${pkg.version}"`), 'Display version matches package');
assert.ok(readPublicFile(root, 'sw.js').toString().includes(`rkef-shell-v${pkg.version}-`), 'Offline cache version matches package');
assert.match(cfg, /https:\/\/script\.google\.com\/macros\/s\/AKfycbw_UKTsxY6Pl2oaUnzr5K38usn2wGwcDG75xtvVIjADUugPp79QJdTAzZ6qIXjHJIAtBQ\/exec/);
assert.match(readPublicFile(root, 'integration-test.html').toString(), /RKEF_CONFIG/);
console.log('PASS workspace files and public Apps Script endpoint config (static check only)');
function publishedReference(file, reference) {
  const base = 'https://sascartimothy.github.io/RKEF-Ticketing/';
  const url = new URL(reference, new URL(file, base));
  assert.ok(url.href.startsWith(base), `Reference leaves Pages subpath ${file}: ${reference}`);
  const name = url.pathname.slice(new URL(base).pathname.length);
  assert.ok(FRONTEND_FILES.includes(name), `Unpublished reference ${file}: ${reference}`);
  readPublicFile(root, name);
}
const modules = FRONTEND_FILES.filter(name => name.startsWith('js/'));
for (const file of modules) {
  for (const match of readPublicFile(root, file).toString().matchAll(/(?:from\s+|import\s*\()['"](\.{1,2}\/[^'"]+)['"]/g)) publishedReference(file, match[1]);
}
for (const file of ['index.html', 'integration-test.html']) {
  for (const match of readPublicFile(root, file).toString().matchAll(/(?:src|href)=["'](\.\/[^"']+)["']/g)) publishedReference(file, match[1]);
}
assert.equal((readPublicFile(root, 'index.html').toString().match(/class="view"/g) || []).length, 3, 'exactly three main views');
const manifest = JSON.parse(readPublicFile(root, 'manifest.webmanifest'));
assert.equal(manifest.id, './');
assert.equal(manifest.scope, './');
assert.equal(manifest.start_url, './#operasional');
for (const icon of manifest.icons) publishedReference('manifest.webmanifest', icon.src);
const precache = [...readPublicFile(root, 'sw.js').toString().matchAll(/['"]\.\/([^'"\s]+)['"]/g)].map(match => match[1]);
for (const name of precache) publishedReference('sw.js', './' + name);
assert.deepEqual(precache.sort(), FRONTEND_FILES.filter(name => !['.nojekyll', 'integration-test.html', 'sw.js'].includes(name)), 'Complete offline app shell inventory');
console.log(`PASS ${modules.length} frontend modules, relative Pages paths, manifest identity, three views and offline asset inventory`);
