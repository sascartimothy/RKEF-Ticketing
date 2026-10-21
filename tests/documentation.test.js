import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const { checkDocs } = createRequire(import.meta.url)('../scripts/check-docs.cjs');

test('documentation checker validates repository targets, exact path case, anchors, and skips fenced examples', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rkef-docs-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('rkef-docs-test-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, 'README.md'), '[Guide](docs/Guide.md#setup)\n[Duplicate](docs/Guide.md#setup-1)\n```md\n[Example](missing.md)\n```\n[External](https://example.invalid)');
  fs.writeFileSync(path.join(root, 'docs', 'Guide.md'), '# Guide\n## Setup\n## Setup\n[Home](../README.md)');
  assert.deepEqual(checkDocs({ root }), { documents: 2, links: 3, external: 1 });
  for (const bad of ['docs/Missing.md', 'docs/guide.md', 'docs/Guide.md#missing', '../outside.md', '/docs/Guide.md']) {
    fs.writeFileSync(path.join(root, 'README.md'), `[Bad](${bad})`);
    assert.throws(() => checkDocs({ root }), /README\.md/);
  }
});
