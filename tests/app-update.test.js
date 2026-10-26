import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../js/build-identity.js';
import { workerHarness } from './worker-harness.js';

test('content identities detect same-version asset changes without clocks or release metadata', async () => {
  const entry = text => [['./config.js', new Response(text, {headers:{'Content-Type':'text/javascript'}})]];
  const a = await RKEFBuild.fingerprint(entry('version="1.1.2"; // A'));
  assert.equal(a, await RKEFBuild.fingerprint(entry('version="1.1.2"; // A')));
  assert.notEqual(a, await RKEFBuild.fingerprint(entry('version="1.1.2"; // B')));
  assert.ok(RKEFBuild.validID(a)); assert.ok(!RKEFBuild.validID('v1.1.2'));
});
test('invalid inventory, server errors, empty bodies and HTML masquerading as JS fail closed', async () => {
  for (const source of ['', '<html>404</html>', "const ASSETS = ['./../secret'].map"]) assert.throws(() => RKEFBuild.paths(source));
  for (const response of [new Response('', {status:500}), new Response(''), new Response('<html>bad</html>', {headers:{'Content-Type':'text/html'}})]) {
    await assert.rejects(RKEFBuild.fingerprint([['./config.js',response]]));
  }
  await assert.rejects(RKEFBuild.snapshot('https://example.test/', async () => { throw Error('offline'); }));
});
test('snapshot bypasses legacy and current shell caches with bounded fixed URLs and no-store', async () => {
  const source = fs.readFileSync(new URL('../sw.js', import.meta.url),'utf8');
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push(String(url));
    assert.equal(options.cache,'no-store'); assert.equal(options.headers['X-RKEF-Build-Check'],'1');
    assert.equal(url.searchParams.get('rkef-build-check'),'1');
    return new Response(url.pathname.endsWith('sw.js') ? source : 'asset', {headers:{'Content-Type':url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript'}});
  };
  const a = await RKEFBuild.snapshot('https://example.test/RKEF-Ticketing/', fetcher);
  const count = requests.length;
  const b = await RKEFBuild.snapshot('https://example.test/RKEF-Ticketing/', fetcher);
  assert.equal(a.id,b.id); assert.deepEqual(requests.slice(0,count),requests.slice(count));
  assert.equal(new Set(requests).size,count);
});
test('candidate hash mismatch retains usable previous caches and never activates', async () => {
  const h = await workerHarness();
  h.stores.set('rkef-shell-prior',new Map()); h.breakRelease();
  await assert.rejects(h.run('install'), /changed during update/);
  assert.ok(h.stores.has('rkef-shell-prior')); assert.ok(!h.stores.has(h.cacheName));
  assert.equal((await h.message('BUILD_INFO')).ready,false);
  assert.equal((await h.message('ACTIVATE_BUILD',{target:h.id})).ok,false);
  assert.ok(!h.skipped());
});
test('only a verified explicit single-client update activates; multi-tab preserves previous caches', async () => {
  const h = await workerHarness(); await h.run('install');
  h.stores.set('rkef-shell-prior',new Map());
  h.setClients([{id:'current',url:h.base},{id:'peer',url:h.base+'#operasional'}]);
  assert.equal((await h.message('ACTIVATE_BUILD',{target:h.id})).blocked,true);
  assert.ok(!h.skipped());
  await h.run('activate'); assert.ok(h.stores.has('rkef-shell-prior'));
  h.setClients([{id:'current',url:h.base}]);
  assert.equal((await h.message('ACTIVATE_BUILD',{target:'bad'})).ok,false);
  assert.equal((await h.message('ACTIVATE_BUILD',{target:h.id})).ok,true); assert.ok(h.skipped());
  await h.run('activate'); assert.ok(!h.stores.has('rkef-shell-prior'));
});
