'use strict';
// This allowlist is the public deployment contract. Never recursively copy src/.
const fs = require('node:fs');
const path = require('node:path');
const FRONTEND_FILES = Object.freeze([
  'index.html', 'integration-test.html', 'styles.css', 'config.js',
  'manifest.webmanifest', 'sw.js',
  'assets/icon.svg', 'assets/icon-192.png', 'assets/icon-512.png',
  'js/app.js', 'js/apps-script-api.js', 'js/database.js', 'js/destinations-ui.js',
  'js/import-ui.js', 'js/master-data.js', 'js/navigation.js', 'js/operational-ui.js',
  'js/report-ui.js', 'js/setup-ui.js', 'js/state.js', 'js/time-date.js',
  'js/ui-components.js', 'js/validation.js', 'js/wa-exporter.js', 'js/wa-parser.js'
].sort());

function inside(parent, target) {
  const relative = path.relative(parent, target);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw Error('Refusing path outside generated output: ' + target);
  }
}

function plainPath(root, relative) {
  let target = root;
  for (const segment of relative.split('/')) {
    target = path.join(target, segment);
    if (fs.lstatSync(target).isSymbolicLink()) throw Error('Refusing symbolic link/junction: ' + target);
  }
  return target;
}

function outputTree(output) {
  if (!fs.existsSync(output)) return [];
  const result = [];
  function visit(target) {
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) throw Error('Refusing symbolic link/junction: ' + target);
    if (!stat.isDirectory() && !stat.isFile()) throw Error('Refusing special output entry: ' + target);
    if (target !== output) { inside(output, target); result.push({ target, directory: stat.isDirectory() }); }
    else if (!stat.isDirectory()) throw Error('Output must be a directory: ' + output);
    if (stat.isDirectory()) for (const name of fs.readdirSync(target).sort()) visit(path.join(target, name));
  }
  visit(output);
  return result;
}

function build({ root = path.resolve(__dirname, '..') } = {}) {
  root = fs.realpathSync(root);
  const output = path.join(root, 'dist');
  inside(root, output);
  // Read and validate ALL inputs before touching dist/. src/ and backend are never deleted.
  const files = new Map(FRONTEND_FILES.map(name => {
    const target = plainPath(root, 'src/' + name);
    if (!fs.statSync(target).isFile()) throw Error('Source must be a file: ' + target);
    return [name, fs.readFileSync(target)];
  }));
  files.set('.nojekyll', Buffer.alloc(0));
  const tree = outputTree(output);
  const existing = tree.filter(entry => !entry.directory);
  const unchanged = existing.length === files.size && existing.every(({ target }) => {
    const name = path.relative(output, target).split(path.sep).join('/');
    return files.has(name) && fs.readFileSync(target).equals(files.get(name));
  }) && tree.filter(entry => entry.directory).every(({ target }) =>
    [...files.keys()].some(name => name.startsWith(path.relative(output, target).split(path.sep).join('/') + '/')));
  if (unchanged) return { changed: false, count: files.size };

  // dist/ is exclusively generated. Verify each absolute target before deleting it.
  for (const { target, directory } of tree.reverse()) {
    inside(output, target);
    if (directory) fs.rmdirSync(target); else fs.unlinkSync(target);
  }
  fs.mkdirSync(output, { recursive: true });
  for (const [name, content] of files) {
    const target = path.join(output, name);
    inside(output, target);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, { flag: 'wx' });
  }
  return { changed: true, count: files.size };
}

module.exports = { build, FRONTEND_FILES };
if (require.main === module) {
  const result = build();
  console.log(`PASS build: ${result.count} public files src/ → dist/ (${result.changed ? 'generated' : 'already current'}); no deployment`);
}
