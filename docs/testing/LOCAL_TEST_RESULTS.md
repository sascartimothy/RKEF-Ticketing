# Hasil build dan pengujian lokal

Tanggal laporan: **21 Oktober 2026 (Asia/Makassar)**. Build lokal saja; Git, GitHub, Pages settings, dan Apps Script deployment tidak diubah. Tidak ada data operasi pribadi yang digunakan.

## Lingkungan dan hasil

- Struktur lokal terbaru: source aplikasi `src/`, production build `dist/`, dokumentasi proyek `docs/`. Rencana Pages awal `main` + `/docs` belum disesuaikan; pengaturan hosting tetap tindakan owner.
- Lingkungan terukur sesi refactoring: Node.js Portable **v24.16.0**, npm **11.13.0**, `D:\Workspace\Tool\nodejs`; Microsoft Edge **155.0.4283.62**. Angka Node v24.22.0 pada catatan sebelumnya tidak berlaku untuk lingkungan sesi ini.
- `npm.cmd run build`: **PASS** — 26 file publik termasuk `.nojekyll`; isi output sama dengan source, build berulang identik. File frontend produksi tidak berubah isi, hanya placeholder `.gitkeep` yang tidak dibawa ke output.
- Hasil sebelum konsolidasi: **PASS** — 12 assertion kontrak Apps Script mock dan **22 tes Node**. Hasil pengujian struktur terbaru dicatat pada bagian konsolidasi di bawah.
- Server dev/preview: **PASS** pada tes HTTP loopback — root dan `/RKEF-Ticketing/`, redirect subpath, rebuild saat source berubah, worker dev jaringan, MIME type, penolakan akses file nonpublik, dan error 500 saat source wajib hilang. Pengujian source hilang sengaja memunculkan log ENOENT dalam fixture sementara; bukan kegagalan suite.
- Entry point CLI dev sebelum konsolidasi: **PASS** pada port default 4173; script server kini bernama `scripts/serve-app.cjs`. Pengujian ulang dicatat di bawah.
- `npm.cmd run test:browser`: **PASS** — Edge desktop headless melalui CDP, profil sementara dan server produksi milik runner pada port kosong, viewport 360×800 dan 1280×900. Request Google diblokir. Ini bukan tes Android atau Google Sheets live.
- `git diff --check`: **PASS**. Branch tetap `main`; tidak ada Git mutation atau deployment.

## Validasi struktural

- Build deterministik tanpa dependency: daftar file publik eksplisit, pembersihan output usang hanya dalam `dist/`, dan tidak ada backup/dev file dari source yang ikut disalin. Fixture membuktikan `docs/`, `private-data/`, `apps-script/`, `backups/`, dan `tests/` di luar output tetap utuh.
- Symlink/junction pada output root, isi output, dan direktori input ditolak. Semua input wajib dibaca sebelum output disentuh; input hilang tidak mengubah deployment output yang sebelumnya valid.
- Node domain tests mengimpor `src/js/`; pemeriksaan statis memastikan seluruh file `dist/` persis cocok dengan source serta hanya berisi allowlist. HTML links, module imports, icon manifest, dan inventory precache tersedia. `docs/` diperiksa hanya berisi Markdown.
- Preview membangun saat mulai dan melayani semua 26 file output byte-for-byte lewat HTTP di subpath Pages. Tes browser selalu membuka build baru pada server sendiri sehingga tidak memakai dev server/output lama.
- Worker, manifest, endpoint, modul aplikasi, database `rkef-ticketing` schema v1 dan storage key tidak diubah. Perubahan origin/port/profil bukan migrasi database; runner port/profil sementara terisolasi dari data operasional.
- Dev rebuild terjadi ketika browser meminta file; tidak ada watcher/live reload. Worker jaringan khusus dev disajikan dalam memori saja untuk mencegah cache menutupi source; offline produksi diuji melalui runner/preview.
- Peralihan worker produksi ke dev pada origin yang sama: **PASS** di Edge, worker jaringan mengambil alih dan ritase serta draft jam manual tetap tersedia di IndexedDB. Runner hanya mengizinkan request ke origin loopback pengujian; request HTTP/HTTPS eksternal diblokir.

## Konsolidasi dokumentasi dan dist

Pemindahan file, tanpa duplikasi dokumen lama:

| Sebelum (root) | Lokasi sekarang |
|---|---|
| `PRD_RKEF_Ticketing_v0.9.md` | [docs/requirements/PRD_RKEF_Ticketing_v0.9.md](../requirements/PRD_RKEF_Ticketing_v0.9.md) |
| `CODEX_ONE_SHOT_PROMPT.md` | [docs/development/CODEX_ONE_SHOT_PROMPT.md](../development/CODEX_ONE_SHOT_PROMPT.md) |
| `SETUP_VSCODE_GITHUB.md` | [docs/development/SETUP_VSCODE_GITHUB.md](../development/SETUP_VSCODE_GITHUB.md) |
| `SETUP_APPS_SCRIPT_GITHUB.md` | [docs/development/SETUP_APPS_SCRIPT_GITHUB.md](../development/SETUP_APPS_SCRIPT_GITHUB.md) |
| `LOCAL_TEST_RESULTS.md` | [docs/testing/LOCAL_TEST_RESULTS.md](LOCAL_TEST_RESULTS.md) |

Root Markdown yang tersisa hanya [README](../../README.md) dan [AGENTS](../../AGENTS.md). Ditambahkan [indeks dokumentasi](../README.md) serta [struktur proyek dan batas hosting](../architecture/PROJECT_STRUCTURE.md). PRD dibandingkan dengan checksum sebelum pemindahan: isi identik selain penggantian satu rujukan dokumentasi menjadi dua tautan relatif; keputusan operasional tidak diubah.

Seluruh output aplikasi lama dipindahkan dari `docs/` ke `dist/`. `scripts/serve-docs.cjs` diganti nama menjadi `scripts/serve-app.cjs`. Referensi output diperbarui di build, server, runner browser, checker workspace, tes tooling, package scripts, task VS Code, README, AGENTS, dan panduan development. Referensi dokumen diperbarui pada indeks, README, AGENTS, instruksi Codex, setup, PRD, dan laporan ini. Checker tautan baru `scripts/check-docs.cjs` dijalankan oleh `npm run check:docs` serta `npm test`; tes checker ada di `tests/documentation.test.js`.

| Validasi setelah konsolidasi | Hasil |
|---|---|
| `npm.cmd run check:docs` | **PASS** — 9 file Markdown, 42 tautan lokal; target, kapitalisasi path, dan anchor heading valid |
| `npm.cmd run build` dan build berulang | **PASS** — 26 file publik di `dist/`, output identik dengan source |
| `npm.cmd test` | **PASS** — 23 tes Node (17 domain/bridge, 5 tooling, 1 checker dokumentasi), 12 assertion Apps Script mock, pemeriksaan workspace dan tautan |
| Pemisahan `docs/` dan `dist/` | **PASS** — docs hanya Markdown, root Markdown hanya README/AGENTS, production output hanya allowlist frontend; fixture docs tetap utuh setelah build |
| `npm.cmd run test:browser` | **PASS** — Edge desktop 360px/1280px, IndexedDB, TSV, backup/restore, offline reload, scope `/RKEF-Ticketing/`, dan transisi worker dev |
| CLI `node scripts/serve-app.cjs` | **PASS** — port 4173, HTTP 200 pada root/subpath aplikasi; `/docs/README.md` HTTP 404; proses uji dihentikan |
| `git diff --check` | **PASS** — branch tetap main; tanpa Git mutation/deployment |
| Android/Google Sheets/Pages live dan URL eksternal | **NOT VERIFIED** — tetap gate owner; tidak ada request tulis Sheets live |

Pemeriksaan tautan lokal tidak melakukan request jaringan. Rencana hosting lama `/docs` tidak sesuai dengan struktur terbaru; lihat [batas hosting](../architecture/PROJECT_STRUCTURE.md#hosting). Semua source runtime, storage key, backend, dan konfigurasi endpoint dipertahankan.

## Riwayat refactoring awal sebelum konsolidasi

Path `docs/` dan nama file root pada inventaris historis berikut mencatat struktur sebelum konsolidasi, bukan lokasi source/output yang berlaku sekarang.

- Dialihkan dari source `docs/` ke `src/` tanpa perubahan isi: `index.html`, `integration-test.html`, `styles.css`, `config.js`, `manifest.webmanifest`, `sw.js`; `assets/icon.svg`, `assets/icon-192.png`, `assets/icon-512.png`; serta `js/app.js`, `js/apps-script-api.js`, `js/database.js`, `js/destinations-ui.js`, `js/import-ui.js`, `js/master-data.js`, `js/navigation.js`, `js/operational-ui.js`, `js/report-ui.js`, `js/setup-ui.js`, `js/state.js`, `js/time-date.js`, `js/ui-components.js`, `js/validation.js`, `js/wa-exporter.js`, `js/wa-parser.js`.
- Baru: `scripts/build.cjs`, `tests/tooling.test.js`.
- Tooling diperbarui: `package.json`, `scripts/serve-docs.cjs`, `scripts/browser-test.cjs`, `scripts/check-workspace.cjs`, `scripts/generate-icons.cjs`, `tests/bridge.test.js`, `tests/domain.test.js`, `tests/browser-suite.js`, `.vscode/tasks.json`, `.vscode/settings.json`.
- Dokumentasi diperbarui: `README.md`, `AGENTS.md`, `LOCAL_TEST_RESULTS.md`, `SETUP_VSCODE_GITHUB.md`, `SETUP_APPS_SCRIPT_GITHUB.md`, dan referensi path dalam `CODEX_ONE_SHOT_PROMPT.md`. PRD operasional dan backend tidak berubah.
- Placeholder `src/.gitkeep` dan `docs/assets/.gitkeep` dihapus karena direktori telah berisi file nyata. `docs/` diregenerasi berisi 25 file frontend identik + `.nojekyll`, tanpa file development/data operator.

## Cakupan otomatis

- Parser format baru 11 kolom dan lama 10 kolom bernomor; raw source dipertahankan, invalid count/blank TAB/time/date/whitespace ditolak, preview dan konfirmasi pemetaan format lama.
- Export/import round-trip, kolom ke-6 kosong, contoh serial **46315 = 20 Oktober 2026**, tanpa suffix; timezone UTC, Asia/Makassar dan America/Los_Angeles memberi hasil sama.
- Jam HH.mm, tanggal kabisat, field wajib, potensi duplikat seluruh 11 kolom (DT saja tidak dianggap unik), pemisahan filter sumber local/import, konflik mapping tanpa overwrite otomatis.
- Bridge Destination: preflight GET, field form yang terbatas, bounded retry/timeout, matching request_id, wrong-ID tidak sukses, retry idempoten, fallback cache dan kegagalan penulisan cache.
- IndexedDB asli di Edge: transaksi abort rollback, snapshot tidak berubah setelah koreksi, source/edited time, audit atomik, revision conflict, tombstone penghapusan, impor receipt idempoten.
- Pilihan handover mengikuti laporan terakhir yang disahkan: master handover lama dinonaktifkan setelah konfirmasi; tambahan/koreksi lokal dipertahankan. ID retry simpan tidak boleh menimpa isi yang telah tersimpan berbeda.
- Backup/restore JSON mempertahankan ID, restore berulang tidak menggandakan, merge conflict membatalkan transaksi, replacement atomik.
- UI tiga view: sesi, pilihan lokal, input, koreksi dengan konfirmasi, preview handover dan impor, report TSV persis dan isolasi histori.
- Simulasi kegagalan quota tidak menampilkan sukses dan mempertahankan draft. Simulasi bridge belum terverifikasi menyimpan pending request; read-back mock dengan ID cocok memperbarui cache dan menutup pending atomik. Semua simulasi ini tetap bukan penulisan Google live.
- Service worker scope `/RKEF-Ticketing/`, app shell offline, session/record/draft jam manual bertahan setelah offline reload. Respons Sheets tidak berada dalam Cache Storage.
- Pemeriksaan screenshot desktop dan 360px. Screenshot hanya artefak lokal di `private-data/qa/` yang diabaikan Git.

## Belum terverifikasi

- [ ] Android/Chrome nyata pada HP operasional, termasuk kemampuan instalasi PWA dan kebijakan penyimpanan.
- [ ] Akses anonim Apps Script dari origin hosting target dan health/list live.
- [ ] POST iframe Android menambah Destination nyata, read-back request_id cocok, lalu refresh dari HP kedua.
- [ ] Timeout nyata, berpindah koneksi, kuota layanan dan reload saat permintaan cloud tertunda.
- [ ] Clipboard WhatsApp serta download TXT/JSON dan pemilihan file restore pada HP.
- [ ] Uji pemulihan backup antarperangkat, kapasitas data kerja, kebijakan retensi dan kebiasaan backup operator.
- [ ] Operator memeriksa master/mapping, identitas timbangan/checker, pilihan shift dan tanggal operasi.
- [ ] GitHub Pages live, penerimaan operasional, dan persetujuan rilis owner.

Tidak ada penulisan live ke Google Sheets selama tes ini. `apps-script/Code.gs` tetap salinan existing; tidak ada klaim bahwa modifikasi lokal memperbarui deployment online.
