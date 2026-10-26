'use strict';
// Local HTTP inventory: never expose arbitrary repository files through this server.
const fs = require('node:fs');
const path = require('node:path');
const FRONTEND_FILES = Object.freeze([
  'index.html', 'integration-test.html', 'styles.css', 'config.js',
  'manifest.webmanifest', 'sw.js', '.nojekyll',
  'assets/icon.svg', 'assets/icon-192.png', 'assets/icon-512.png',
  'js/checkers.js', 'js/checker-ui.js', 'js/app.js', 'js/apps-script-api.js', 'js/database.js', 'js/destinations-ui.js',
  'js/import-ui.js', 'js/master-data.js', 'js/navigation.js', 'js/operational-ui.js',
  'js/report-ui.js', 'js/setup-ui.js', 'js/state.js', 'js/time-date.js',
  'js/ui-components.js', 'js/validation.js', 'js/wa-exporter.js', 'js/wa-parser.js'
].sort());

function readPublicFile(root, name) {
  if (!FRONTEND_FILES.includes(name)) throw Object.assign(Error('Not public'), { code: 'EACCES' });
  let target = root;
  for (const segment of name.split('/')) {
    target = path.join(target, segment);
    if (fs.lstatSync(target).isSymbolicLink()) throw Object.assign(Error('Linked public path'), { code: 'EACCES' });
  }
  if (!fs.statSync(target).isFile()) throw Object.assign(Error('Not a file'), { code: 'EACCES' });
  return fs.readFileSync(target);
}

module.exports = { FRONTEND_FILES, readPublicFile };
