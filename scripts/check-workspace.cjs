"use strict";
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const { FRONTEND_FILES }=require('./build.cjs');
const root=path.resolve(__dirname,'..');
const required=['README.md','AGENTS.md','docs/README.md','docs/requirements/PRD_RKEF_Ticketing_v0.9.md','docs/development/CODEX_ONE_SHOT_PROMPT.md','docs/development/SETUP_VSCODE_GITHUB.md','docs/development/SETUP_APPS_SCRIPT_GITHUB.md','docs/testing/LOCAL_TEST_RESULTS.md','docs/architecture/PROJECT_STRUCTURE.md','package.json','apps-script/Code.gs','apps-script/appsscript.json','dist/index.html','dist/integration-test.html','dist/config.js','dist/.nojekyll','tests/test_apps_script.cjs'];
for(const p of required){assert.ok(fs.existsSync(path.join(root,p)),`Missing ${p}`);}
function inventory(directory) {
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()
    ? inventory(path.join(directory,entry.name)).map(name=>entry.name+'/'+name) : [entry.name]).sort();
}
const rootMarkdown=fs.readdirSync(root).filter(name=>name.endsWith('.md')).sort();
assert.deepEqual(rootMarkdown,['AGENTS.md','README.md'],'root Markdown entry points only');
for(const name of inventory(path.join(root,'docs')))assert.ok(name.endsWith('.md'),`Non-documentation file in docs/: ${name}`);
assert.deepEqual(inventory(path.join(root,'dist')),[...FRONTEND_FILES,'.nojekyll'].sort(),'only allowlisted generated output');
assert.equal(fs.readFileSync(path.join(root,'dist/.nojekyll')).length,0);
for(const name of FRONTEND_FILES)assert.deepEqual(fs.readFileSync(path.join(root,'dist',name)),fs.readFileSync(path.join(root,'src',name)),`Stale output ${name}; run npm run build`);
console.log('PASS authoritative src matches generated dist byte-for-byte; docs is Markdown-only; public allowlist and .nojekyll');
const cfg=fs.readFileSync(path.join(root,'dist/config.js'),'utf8');
assert.match(cfg,/https:\/\/script\.google\.com\/macros\/s\/AKfycbw_UKTsxY6Pl2oaUnzr5K38usn2wGwcDG75xtvVIjADUugPp79QJdTAzZ6qIXjHJIAtBQ\/exec/);
const test=fs.readFileSync(path.join(root,'dist/integration-test.html'),'utf8');
assert.match(test,/RKEF_CONFIG/);
console.log('PASS workspace files and public Apps Script endpoint config (static check only)');
const frontend=['styles.css','manifest.webmanifest','sw.js','assets/icon.svg','assets/icon-192.png','assets/icon-512.png'];
for(const p of frontend)assert.ok(fs.existsSync(path.join(root,'dist',p)),`Missing frontend asset ${p}`);
const modules=fs.readdirSync(path.join(root,'src/js')).filter(f=>f.endsWith('.js'));
for(const directory of ['src','dist']){
  const base=path.join(root,directory);
  function publishedReference(file,reference) {
    const target=path.resolve(base,path.dirname(file),reference.split(/[?#]/)[0]);
    const name=path.relative(base,target).split(path.sep).join('/');
    assert.ok(FRONTEND_FILES.includes(name),`Unpublished reference ${directory}/${file}: ${reference}`);
    assert.ok(fs.existsSync(target),`Missing reference ${directory}/${file}: ${reference}`);
  }
  for(const module of modules){
    const src=fs.readFileSync(path.join(base,'js',module),'utf8');
    assert.ok(FRONTEND_FILES.includes('js/'+module),`Unpublished module: ${module}`);
    for(const match of src.matchAll(/(?:from\s+|import\s*\()['"](\.{1,2}\/[^'"]+)['"]/g))publishedReference('js/'+module,match[1]);
  }
  for(const file of ['index.html','integration-test.html']) {
    const html=fs.readFileSync(path.join(base,file),'utf8');
    for(const match of html.matchAll(/(?:src|href)=["'](\.\/[^"']+)["']/g))publishedReference(file,match[1]);
  }
}
const html=fs.readFileSync(path.join(root,'dist/index.html'),'utf8');
assert.equal((html.match(/class="view"/g)||[]).length,3,'exactly three main views');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'dist/manifest.webmanifest'),'utf8'));
assert.equal(manifest.scope,'./');assert.equal(manifest.start_url,'./#operasional');
for(const icon of manifest.icons)assert.ok(fs.existsSync(path.resolve(root,'dist',icon.src)));
const sw=fs.readFileSync(path.join(root,'dist/sw.js'),'utf8');
for(const asset of sw.matchAll(/['"]\.\/([^'"\s]+)['"]/g))assert.ok(fs.existsSync(path.resolve(root,'dist',asset[1])),`Missing precache ${asset[1]}`);
console.log(`PASS ${modules.length} frontend modules, relative imports, manifest icons, three views and offline asset inventory`);
