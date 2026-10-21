"use strict";
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const required=['README.md','AGENTS.md','CODEX_ONE_SHOT_PROMPT.md','package.json','apps-script/Code.gs','apps-script/appsscript.json','docs/index.html','docs/integration-test.html','docs/config.js','docs/.nojekyll','tests/test_apps_script.cjs'];
for(const p of required){assert.ok(fs.existsSync(path.join(root,p)),`Missing ${p}`);}
const cfg=fs.readFileSync(path.join(root,'docs/config.js'),'utf8');
assert.match(cfg,/https:\/\/script\.google\.com\/macros\/s\/AKfycbw_UKTsxY6Pl2oaUnzr5K38usn2wGwcDG75xtvVIjADUugPp79QJdTAzZ6qIXjHJIAtBQ\/exec/);
const test=fs.readFileSync(path.join(root,'docs/integration-test.html'),'utf8');
assert.match(test,/RKEF_CONFIG/);
console.log('PASS workspace files and public Apps Script endpoint config (static check only)');
const frontend=['styles.css','manifest.webmanifest','sw.js','assets/icon.svg','assets/icon-192.png','assets/icon-512.png'];
for(const p of frontend)assert.ok(fs.existsSync(path.join(root,'docs',p)),`Missing frontend asset ${p}`);
const modules=fs.readdirSync(path.join(root,'docs/js')).filter(f=>f.endsWith('.js'));
for(const module of modules){
  const src=fs.readFileSync(path.join(root,'docs/js',module),'utf8');
  for(const match of src.matchAll(/(?:from\s+|import\s*\()['"](\.\/[^'"]+)['"]/g))assert.ok(fs.existsSync(path.resolve(root,'docs/js',match[1])),`Missing import ${module}: ${match[1]}`);
}
const html=fs.readFileSync(path.join(root,'docs/index.html'),'utf8');
assert.equal((html.match(/class="view"/g)||[]).length,3,'exactly three main views');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/manifest.webmanifest'),'utf8'));
assert.equal(manifest.scope,'./');assert.equal(manifest.start_url,'./#operasional');
for(const icon of manifest.icons)assert.ok(fs.existsSync(path.resolve(root,'docs',icon.src)));
const sw=fs.readFileSync(path.join(root,'docs/sw.js'),'utf8');
for(const asset of sw.matchAll(/['"]\.\/([^'"\s]+)['"]/g))assert.ok(fs.existsSync(path.resolve(root,'docs',asset[1])),`Missing precache ${asset[1]}`);
console.log(`PASS ${modules.length} frontend modules, relative imports, manifest icons, three views and offline asset inventory`);
