import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import './worker-harness.js';
import { workerHarness } from './worker-harness.js';

test('worker precaches exact manifest icon URLs and safely cleans obsolete shell caches', async () => {
  const h = await workerHarness();
  await h.run('install');
  const cache = h.stores.get(h.cacheName);
  const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.webmanifest', import.meta.url)));
  for (const icon of manifest.icons) {
    assert.ok(cache.has(new URL(icon.src, h.base).href));
    const png = fs.readFileSync(new URL('../' + icon.src.split('?')[0], import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
  assert.ok(![...cache.keys()].some(url => url.includes('icon.svg')));
  h.stores.set('rkef-shell-old', new Map()); h.stores.set('unrelated-cache', new Map());
  await h.run('activate');
  assert.ok(!h.stores.has('rkef-shell-old'));
  assert.ok(h.stores.has(h.cacheName) && h.stores.has('unrelated-cache'));
  assert.ok(h.claimed());
});
