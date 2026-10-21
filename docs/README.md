# Dokumentasi RKEF Ticketing

`docs/` hanya berisi dokumentasi proyek. Source aplikasi ada di `src/`, production build di `dist/`, backend di `apps-script/`, tes di `tests/`, dan tooling di `scripts/`. Path dalam code span adalah relatif terhadap root repository kecuali disebut lain.

| Kategori | Dokumen | Fungsi |
|---|---|---|
| Requirements | [PRD v0.9](requirements/PRD_RKEF_Ticketing_v0.9.md) | Kebutuhan dan keputusan operasional yang disetujui |
| Development | [Instruksi implementasi Codex](development/CODEX_ONE_SHOT_PROMPT.md) | Scope dan batas implementasi lokal |
| Development | [Setup VS Code dan development](development/SETUP_VSCODE_GITHUB.md) | Perintah lokal dan konfigurasi editor |
| Development | [Apps Script dan hosting](development/SETUP_APPS_SCRIPT_GITHUB.md) | Kontrak bridge, konfigurasi publik, dan gate integrasi |
| Testing | [Hasil pengujian lokal](testing/LOCAL_TEST_RESULTS.md) | Bukti tes otomatis, QA, dan batas verifikasi |
| Architecture | [Struktur proyek](architecture/PROJECT_STRUCTURE.md) | Pemisahan source/build/docs, storage, dan batas hosting |

[README repository](../README.md) tetap entry point GitHub. [AGENTS.md](../AGENTS.md) tetap instruksi coding agent di root. Tidak ada dokumen root lain yang perlu dipertahankan atau diduplikasi.

Jalankan `npm.cmd run check:docs` dari root untuk memeriksa target relatif, kapitalisasi path, dan anchor heading Markdown. Pemeriksaan tersebut tidak mengakses URL eksternal.
