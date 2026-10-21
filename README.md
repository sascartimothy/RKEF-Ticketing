# RKEF Ticketing — VS Code Bootstrap

**Status**: Persiapan infrastruktur; bukan PWA operasional.  
**Target Windows**: `D:\Workspace\RKEF Ticketing`  
**Repository**: https://github.com/sascartimothy/RKEF-Ticketing  
**Deployment Apps Script**: URL disimpan pada `docs/config.js` (publik, tidak mengandung kredensial).  

## Mulai

Baca [SETUP_VSCODE_GITHUB.md](SETUP_VSCODE_GITHUB.md) untuk instalasi VS Code, GitHub, dan GitHub Pages. Lalu jalankan:

```powershell
npm test
npm run dev
```

Buka halaman uji lokal di `http://127.0.0.1:4173/`; deploy `docs/` ke GitHub Pages untuk tes browser HP. **Belum ada aplikasi produksi di dalam ZIP ini.**

## Folder

- `docs/` — halaman tes anonimitas + Destination GET/POST read-back. `index.html` masih halaman diagnostic, bukan aplikasi produksi.
- `docs/config.js` — Apps Script `/exec`, sheet dan repo URL (semua publik).
- `apps-script/` — salinan Apps Script yang perlu diselaraskan manual dengan deployment Google.
- `tests/` — pengujian kontrak Apps Script mock.
- `scripts/` — dev server dan pemeriksaan workspace Node, tanpa dependensi NPM.
- `.vscode/` — rekomendasi extension Codex dan tugas test/dev.
- `AGENTS.md` — guardrail untuk Codex.
- `CODEX_ONE_SHOT_PROMPT.md` — instruksi build final, **jangan jalankan sebelum gate lulus**.
- `PRD_RKEF_Ticketing_v0.9.md` — spesifikasi saat ini (draft sampai seluruh keputusan terkunci).

**Catatan:** Ritase tersimpan di HP (IndexedDB) dan ditransfer manual lewat WA, bukan di Google Sheets dan bukan Firebase. Google Sheets hanya master Destination bersama.
