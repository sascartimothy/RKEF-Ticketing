# Dokumentasi RKEF Ticketing

`docs/` hanya berisi dokumentasi proyek. Aplikasi frontend ada langsung di root (`index.html`, `styles.css`, `config.js`, manifest, worker, `js/`, `assets/`), backend di `apps-script/`, tes di `tests/`, dan tooling di `scripts/`. Tidak ada pipeline build atau folder output aplikasi. Path dalam code span adalah relatif terhadap root repository kecuali disebut lain.

[Spesifikasi operasional](requirements/RKEF_OPERATIONAL_SPEC.md) menjadi acuan utama keputusan operasional terbaru yang telah dikonfirmasi, mengungguli aturan lama yang bertentangan. AI agent dan developer wajib membacanya sebelum mengubah logic input, handover, numbering, atau export. Dokumen membedakan kontrak target, konflik implementasi, dan OPEN DECISION; bukan klaim fitur telah diterapkan atau diuji.

| Kategori | Dokumen | Fungsi |
|---|---|---|
| Requirements | [Spesifikasi operasional](requirements/RKEF_OPERATIONAL_SPEC.md) | Acuan utama keputusan operasional terbaru, acceptance criteria, konflik existing, dan OPEN DECISION |
| Requirements | [PRD v0.9](requirements/PRD_RKEF_Ticketing_v0.9.md) | Baseline kebutuhan; aturan operasional yang bertentangan digantikan spesifikasi terbaru |
| Development | [Instruksi implementasi Codex](development/CODEX_ONE_SHOT_PROMPT.md) | Scope dan batas implementasi lokal |
| Development | [Setup VS Code dan development](development/SETUP_VSCODE_GITHUB.md) | Perintah lokal dan konfigurasi editor |
| Development | [Apps Script dan hosting](development/SETUP_APPS_SCRIPT_GITHUB.md) | Kontrak bridge, konfigurasi publik, dan gate integrasi |
| Development | [API Checker](development/CHECKER_API.md) | Schema Checker_Crew, mutasi anonim dan read-back |
| Development | [Mapping material v1.1.2](development/MATERIAL_MAPPING.md) | Product Code kolom 8, popup mapping lokal dan kompatibilitas TSV |
| Testing | [Hasil pengujian lokal](testing/LOCAL_TEST_RESULTS.md) | Bukti tes otomatis, QA, dan batas verifikasi |
| Architecture | [Struktur proyek](architecture/PROJECT_STRUCTURE.md) | Aplikasi root, dokumentasi, storage, dan batas hosting |

[README repository](../README.md) tetap entry point GitHub. [AGENTS.md](../AGENTS.md) tetap instruksi coding agent di root. Tidak ada dokumen root lain yang perlu dipertahankan atau diduplikasi.

Jalankan `npm.cmd run check:docs` dari root untuk memeriksa target relatif, kapitalisasi path, dan anchor heading Markdown. Pemeriksaan tersebut tidak mengakses URL eksternal.
