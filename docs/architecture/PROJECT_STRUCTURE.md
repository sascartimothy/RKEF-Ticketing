# Struktur proyek

## Pemisahan tanggung jawab

| Path root | Isi |
|---|---|
| `src/` | Source HTML, CSS, JavaScript, manifest, service worker, dan ikon aplikasi |
| `dist/` | Production build generated: hanya file publik allowlist dan `.nojekyll` |
| `docs/requirements/` | PRD dan functional requirements |
| `docs/development/` | Setup, instruksi Codex, konfigurasi, dan panduan integrasi |
| `docs/testing/` | Laporan pengujian dan QA |
| `docs/architecture/` | Struktur source/build/docs serta kontrak teknis yang perlu dipertahankan |
| `tests/` | Automated tests Node dan browser |
| `scripts/` | Build, server dev/preview, pemeriksaan workspace/dokumentasi, generator ikon, runner browser |
| `apps-script/` | Salinan backend Apps Script; perubahan lokal tidak memperbarui deployment |
| `.github/workflows/deploy-pages.yml` | Workflow manual owner untuk build, tes, dan publikasi `dist/` via official Pages Actions |
| Root | README, AGENTS, package scripts, dan konfigurasi repository/editor |

Lihat [indeks dokumentasi](../README.md) untuk navigasi dan [README root](../../README.md) untuk menjalankan aplikasi.

## Build dan development

`scripts/build.cjs` memakai Node built-in dan allowlist publik. Build membaca seluruh input wajib dari `src/`, lalu membuat 25 file frontend dan `.nojekyll` di `dist/`. Isi frontend disalin tanpa transformasi; build berulang menghasilkan nama dan isi file yang sama. Symlink/junction ditolak. Build hanya membersihkan `dist/`, tidak menulis atau menghapus `docs/`. Dokumentasi, backup, dan tooling tidak masuk output produksi.

`scripts/serve-app.cjs` melayani `dist/` di loopback dengan base path `/RKEF-Ticketing/`. Mode dev rebuild saat request dan melayani worker jaringan dalam memori; mode preview build saat mulai dan memakai worker produksi. Tes Node mengimpor source, sedangkan tes browser membangun output baru pada server/profil sementara dan memblokir request eksternal. Tidak ada deployment otomatis.

## Storage dan perilaku aplikasi

Refactoring folder tidak mengubah tiga view Setup/Operasional/Report, kontrak TSV 11 kolom, API Destination, maupun read-back `request_id`. Nama IndexedDB `rkef-ticketing`, schema v1, store, storage key, URL worker, scope relatif, dan URL publik dipertahankan. IndexedDB terikat origin dan profil browser; path folder repository tidak mengubah identitas penyimpanan browser. Jangan mengubah origin atau menghapus data browser untuk restrukturisasi ini.

## Hosting

PRD mencatat rencana awal GitHub Pages branch `main` + folder `/docs`. Instruksi restrukturisasi terbaru memisahkan `src/`, `dist/`, dan `docs/`; karena itu folder dokumentasi tidak lagi dapat dipakai sebagai output aplikasi.

Pengaturan Pages tidak diubah atau diverifikasi live. Build lokal menghasilkan `dist/` dengan URL relatif yang tetap mendukung `/RKEF-Ticketing/`; keberhasilan localhost bukan bukti publikasi live. `dist/` diabaikan Git. [Workflow manual Pages](../../.github/workflows/deploy-pages.yml) ditambahkan atas permintaan owner saat pemeriksaan pascarestrukturisasi: hanya `workflow_dispatch` dari `main`, build dan tes sebelum upload isi `dist/` termasuk `.nojekyll`, lalu deploy menggunakan official Pages Actions. Workflow belum dijalankan. Owner perlu menyiapkan publishing source **GitHub Actions** sebelum menjalankannya; tidak ada trigger push/PR atau perubahan pengaturan hosting dalam sesi lokal ini.

Kebutuhan operasional dalam [PRD](../requirements/PRD_RKEF_Ticketing_v0.9.md) tetap berlaku. [Laporan QA](../testing/LOCAL_TEST_RESULTS.md) membedakan pengujian lokal dengan gate Android/Google/Pages yang belum terverifikasi.
