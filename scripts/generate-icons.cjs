'use strict';
// Resize the owner-supplied artwork locally; never redraw or modify the source.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File',
  path.join(__dirname, 'generate-icons.ps1')], { stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
