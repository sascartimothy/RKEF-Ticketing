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
