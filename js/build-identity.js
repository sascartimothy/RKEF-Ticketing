/* Shared by the classic worker and ES-module frontend. No generated release metadata. */
(() => {
  const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
  const digest = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes));
  const validID = id => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id);
  function paths(source) {
    const section = source.match(/const ASSETS = (\[[\s\S]*?\])\.map/);
    if (!section) throw Error('Inventori build tidak valid.');
    const result = [...section[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
    if (result.length < 10 || result.length > 100 || new Set(result).size !== result.length ||
        result.some(p => !/^\.\/(?:[a-zA-Z0-9_./-]+(?:\?v=[a-zA-Z0-9-]+)?)?$/.test(p) || p.includes('..')) ||
        !result.includes('./index.html') || !result.includes('./js/build-identity.js')) throw Error('Inventori build tidak valid.');
    return [...result, './sw.js'];
  }
  async function fingerprint(entries) {
    const lines = await Promise.all(entries.map(async ([path, response]) => {
      if (!response?.ok || response.type === 'opaque') throw Error('Aset build tidak tersedia: ' + path);
      const bytes = await response.arrayBuffer();
      if (!bytes.byteLength) throw Error('Aset build kosong: ' + path);
      const type = response.headers.get('content-type') || '';
      if ((/\.js$/.test(path) && !/javascript/.test(type)) || (/\.css$/.test(path) && !/text\/css/.test(type))) throw Error('Tipe aset build salah: ' + path);
      return path + ':' + await digest(bytes);
    }));
    return digest(new TextEncoder().encode(lines.sort().join('\n')));
  }
  async function snapshot(base, fetcher = fetch, signal) {
    const get = path => {
      const url = new URL(path, base);
      // Fixed query also bypasses the pre-update legacy worker's exact-URL allowlist.
      url.searchParams.set('rkef-build-check', '1');
      return fetcher(url, {cache:'no-store', headers:{'X-RKEF-Build-Check':'1'}, signal});
    };
    const workerResponse = await get('./sw.js');
    if (!workerResponse.ok) throw Error('Worker server tidak tersedia.');
    const workerText = await workerResponse.text();
    const worker = new Response(workerText, {headers:workerResponse.headers});
    const inventory = paths(workerText);
    const entries = [];
    // Bound concurrency; fixed URLs, no timestamp/cache-busting URL growth.
    for (let i = 0; i < inventory.length; i += 6) {
      entries.push(...await Promise.all(inventory.slice(i, i + 6).map(async path => {
        if (path === './sw.js') return [path, worker];
        const response = await get(path);
        if (!response.ok) throw Error('Aset build tidak tersedia: ' + path);
        return [path, new Response(await response.arrayBuffer(), {headers:response.headers})];
      })));
    }
    const id = await fingerprint(entries.map(([path, response]) => [path, response.clone()]));
    return {id, entries};
  }
  globalThis.RKEFBuild = Object.freeze({digest, validID, paths, fingerprint, snapshot});
})();
