# Struktur proyek

## Pemisahan tanggung jawab

| Path root | Isi |
|---|---|
| `index.html` | Satu entry point aplikasi utama: Setup, Operasional, Report |
| `integration-test.html` | Utility diagnostik integrasi, terpisah dari navigasi aplikasi |
| `styles.css`, `config.js` | Styling dan konfigurasi endpoint publik |
| `js/`, `assets/` | Modul vanilla JavaScript dan ikon aplikasi |
| `manifest.webmanifest`, `sw.js`, `.nojekyll` | Identitas PWA, cache app shell, dan penanda Pages |
| `docs/requirements/` | PRD dan functional requirements |
| `docs/development/` | Setup, instruksi Codex, konfigurasi, dan panduan integrasi |
| `docs/testing/` | Laporan pengujian dan QA |
| `docs/architecture/` | Struktur proyek dan kontrak teknis |
| `tests/` | Automated tests Node dan browser |
| `scripts/` | Server dev/preview, pemeriksaan workspace/dokumentasi, generator ikon, runner browser |
| `apps-script/` | Salinan backend; perubahan lokal tidak memperbarui deployment |
| `private-data/` | Data operator dan artefak QA lokal, diabaikan Git |
| Root lainnya | README, AGENTS, package scripts, dan konfigurasi repository/editor |

Tidak ada `src/`, `dist/`, folder output pengganti, atau salinan kedua aplikasi. Lihat [indeks dokumentasi](../README.md) dan [README root](../../README.md).

## Development langsung dari root

`npm run dev` menjalankan `scripts/serve-app.cjs` pada loopback, membaca file root setiap request, dan mendukung `/RKEF-Ticketing/` serta alias `/`. Simpan HTML/CSS/JS lalu refresh browser. Tidak ada build, watcher, transformasi, atau copy pipeline. Server hanya membaca file; generator ikon menulis PNG langsung ke `assets/` bila dijalankan secara eksplisit.

`scripts/public-files.cjs` berisi inventaris eksplisit 26 file yang boleh dibaca server lokal. Semua path lain ditolak, termasuk file privat yang benar-benar ada di root atau subfolder, directory listing, traversal terenkode, serta symlink/junction pada path publik. Jangan menggantinya dengan server statis yang mengekspos seluruh repository.

Mode dev melayani worker jaringan dalam memori supaya refresh menampilkan source terbaru. Mode `npm run preview` memakai `sw.js` root tanpa modifikasi untuk uji cache/offline produksi; cache produksi dapat menahan versi lama sampai pembaruan worker aktif. Kedua mode tidak membersihkan IndexedDB.

Tes Node mengimpor root `js/`. Tes server menggunakan fixture sementara; tes browser memakai file root, server/profil terpisah, data sintetis, dan blokir request eksternal. Pemeriksaan workspace memvalidasi inventaris aset/module, path relatif pada URL target, tiga view, manifest dan precache. Tidak ada output aplikasi yang dihasilkan tes.

## Storage dan perilaku aplikasi

Restrukturisasi mempertahankan seluruh 25 file frontend byte-for-byte, tiga view, kontrak TSV 11 kolom, API Destination, dan read-back `request_id`. Nama IndexedDB `rkef-ticketing`, schema v1, store, storage key, URL worker, scope relatif, dan URL publik tetap sama. IndexedDB terikat origin dan profil browser; folder repository tidak mengubah identitas penyimpanan browser. Perubahan origin/port/profil membuat penyimpanan terpisah. Jangan menghapus data browser untuk migrasi folder ini.

Checksum sebelum migrasi diverifikasi pada file root sebelum sumber lama dihapus. Output lama juga diperiksa cocok dengan sumber. Inventaris SHA-256 hanya artefak lokal di `private-data/qa/root-migration-sha256.json`; tidak ada salinan kode kedua.

## Hosting

Keputusan final owner: **GitHub Pages branch `main`, folder `/ (root)`**, dengan `.nojekyll` di root dan tanpa custom deployment Actions. Ini menggantikan rencana `/docs` serta Actions/dist terdahulu. Workflow deployment lama dihapus secara lokal. Owner sendiri mengatur Pages dan melakukan publikasi; pengaturan hosting tidak diubah atau diverifikasi live dalam restrukturisasi ini.

URL target tetap **https://sascartimothy.github.io/RKEF-Ticketing/**. Aset, import module, manifest `id`/`scope`/`start_url`, dan service worker menggunakan path relatif. Keberhasilan localhost bukan bukti publikasi live.

Allowlist server lokal bukan aturan akses GitHub Pages. File repository yang dilacak dapat terpublikasi saat root menjadi sumber hosting, termasuk dokumentasi/tooling. `.gitignore` mencegah penambahan biasa file privat tetapi tidak menghapus file yang sudah dilacak. Data operator, backup dan kredensial harus tetap lokal serta tidak dilacak sebelum owner memublikasikan. `config.js` memang publik dan tidak memuat rahasia.

Kebutuhan operasional dalam [PRD](../requirements/PRD_RKEF_Ticketing_v0.9.md) tetap berlaku. [Laporan QA](../testing/LOCAL_TEST_RESULTS.md) membedakan tes lokal dengan gate Android/Google/Pages yang belum terverifikasi.

Pembaruan Setup/cache kini memakai [identitas hash aset dan lifecycle Update](PWA_UPDATE.md), tanpa metadata rilis manual atau perubahan IndexedDB.
