'use strict';
// Offline validation of the Markdown subset used by this repository.
const fs = require('node:fs');
const path = require('node:path');

function prose(markdown) {
  let fence = null;
  return markdown.split(/\r?\n/).map(line => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker && !fence) { fence = marker; return ''; }
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      return '';
    }
    return line;
  }).join('\n');
}

function anchors(markdown) {
  const ids = new Set();
  for (const match of prose(markdown).matchAll(/^ {0,3}#{1,6}\s+(.+?)(?:\s+#+\s*)?$/gm)) {
    const base = match[1].replace(/<[^>]*>/g, '').toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-');
    let id = base, suffix = 0;
    while (ids.has(id)) id = base + '-' + (++suffix);
    ids.add(id);
  }
  for (const match of markdown.matchAll(/<a\s+(?:id|name)=["']([^"']+)["']/g)) ids.add(match[1]);
  return ids;
}

function exactTarget(root, target) {
  const relative = path.relative(root, target);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw Error('Target leaves repository');
  let current = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    if (!fs.readdirSync(current).includes(part)) throw Error('Missing target or incorrect path case: ' + relative);
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) throw Error('Documentation target is a symbolic link/junction');
  }
  return current;
}

function checkDocs({ root = path.resolve(__dirname, '..') } = {}) {
  root = fs.realpathSync(root);
  const documents = [];
  function collect(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw Error('Documentation cannot contain symbolic links/junctions');
      if (entry.isDirectory()) collect(target);
      else if (entry.name.endsWith('.md')) documents.push(target);
    }
  }
  for (const name of fs.readdirSync(root).filter(name => name.endsWith('.md'))) documents.push(path.join(root, name));
  collect(path.join(root, 'docs'));
  let links = 0, external = 0;
  const errors = [];
  for (const file of documents.sort()) {
    const markdown = prose(fs.readFileSync(file, 'utf8'));
    const destinations = [
      ...[...markdown.matchAll(/!?\[[^\]\n]*\]\(\s*(<[^>\n]+>|[^\s)]+)(?:\s+["'][^\n]*?["'])?\s*\)/g)].map(match => match[1]),
      ...[...markdown.matchAll(/^ {0,3}\[[^\]]+\]:\s*(<[^>\n]+>|\S+)/gm)].map(match => match[1])
    ];
    for (let destination of destinations) {
      destination = destination.replace(/^<|>$/g, '');
      if (/^[a-z][a-z\d+.-]*:/i.test(destination) || destination.startsWith('//')) { external++; continue; }
      links++;
      try {
        if (destination.startsWith('/') || destination.includes('\\')) throw Error('Use portable relative paths for GitHub Markdown');
        const [pathname, fragment] = destination.split('#');
        const target = exactTarget(root, pathname ? path.resolve(path.dirname(file), decodeURIComponent(pathname.split('?')[0])) : file);
        if (fragment && path.extname(target) === '.md' && !anchors(fs.readFileSync(target, 'utf8')).has(decodeURIComponent(fragment))) throw Error('Missing Markdown heading anchor: #' + fragment);
      } catch (error) { errors.push(`${path.relative(root, file)} → ${destination}: ${error.message}`); }
    }
  }
  if (errors.length) throw Error(errors.join('\n'));
  return { documents: documents.length, links, external };
}

module.exports = { checkDocs };
if (require.main === module) {
  const result = checkDocs();
  console.log(`PASS docs: ${result.documents} Markdown files, ${result.links} local links (target/case/heading); ${result.external} external Markdown links not live-verified`);
}
