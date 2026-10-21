# Hasil pengujian lokal

Tanggal laporan: **21 Oktober 2026 (Asia/Makassar)**. Restrukturisasi root lokal saja; Git, GitHub, Pages settings, dan Apps Script deployment tidak diubah. Data browser sintetis; tidak ada penulisan Sheets live.

## Migrasi root

- **PASS** — 25 file frontend dipindahkan dari sumber lama ke root, termasuk enam file utama, 16 modul JS, dan tiga ikon. SHA-256 setiap file root cocok dengan sumber sebelum direktori lama dihapus. Tidak ada perubahan isi frontend, business logic, endpoint, worker, manifest, atau storage key.
- **PASS** — output lama diperiksa cocok dengan sumber sebelum dihapus; tidak ada file berbeda atau file tak dikenal yang dibuang. `.nojekyll` kosong tersedia di root. Inventaris checksum lokal ada di `private-data/qa/root-migration-sha256.json` dan diabaikan Git.
- Tidak ada `src/`, `dist/`, folder output pengganti, build script, pretest build, atau workflow deployment Pages. Aplikasi utama hanya `/index.html`; `integration-test.html` utility diagnostik terpisah.
- Server, generator ikon, runner browser, impor tes Node, checker workspace, task VS Code, README, AGENTS, PRD hosting, dan panduan development mengikuti aplikasi root.

## Verifikasi struktur final

Lingkungan: Node.js Portable **v24.16.0**, npm **11.13.0**, Windows, Chromium Microsoft Edge headless. Semua hasil berikut berasal dari struktur root, bukan hasil struktur lama.

| Validasi | Hasil |
|---|---|
| `npm.cmd test` | **PASS** — 22 tes Node (17 domain/bridge, 4 server/tooling, 1 checker dokumentasi), 12 assertion kontrak Apps Script mock, checker workspace dan dokumentasi |
| `npm.cmd run test:browser` | **PASS** — UI/IndexedDB, TSV, backup/restore, pending bridge mock, offline reload, scope Pages, transisi worker; viewport 360px dan 1280px |
| `npm.cmd run icons` | **PASS** — PNG ditulis langsung ke `assets/`; checksum seluruh 25 file frontend masih cocok dengan sumber sebelum migrasi |
| `npm.cmd run check:docs` | **PASS** — 9 Markdown, 33 tautan lokal valid; target, kapitalisasi path dan anchor heading |
| CLI `node scripts/serve-app.cjs` | **PASS** — loopback port dinamis, subpath aplikasi, modul dan worker HTTP 200; data privat dan `.env` HTTP 404; proses uji dihentikan |
| Penolakan junction/symlink | **PASS** untuk junction; uji file symlink tidak tersedia karena izin Windows `EPERM`, sehingga bagian file symlink tidak diverifikasi runtime di mesin ini |
| `git diff --check` | **PASS** — branch tetap `main`; tanpa Git mutation atau deployment |
| Android/Google Sheets/Pages live | **NOT VERIFIED** — gate owner tetap terbuka |

Pemeriksaan daftar file terlacak untuk direktori data/backup/export serta pola kredensial yang diabaikan tidak menemukan kecocokan. Ini bukan audit seluruh rahasia repository atau verifikasi hosting. Artefak checksum/screenshot tetap di `private-data/` yang diabaikan Git.

## Cakupan otomatis

- Server membaca edit HTML/CSS/JS langsung setelah refresh, tidak menulis file aplikasi, dan tidak menghasilkan folder output. Mode preview melayani seluruh byte aplikasi root dengan worker produksi dan MIME yang sesuai. Redirect subpath, HEAD, metode HTTP, dan URL rusak diuji.
- Dev dan preview menolak file privat yang benar-benar ada, `.env`, `.git/`, backend, dokumentasi, tooling, backup, file non-inventaris di `assets/`/`js/`, directory listing, dan traversal terenkode. Junction pada path publik ditolak; file symlink diuji bila izin Windows mendukungnya.
- Checker workspace memeriksa satu aplikasi root, dokumen Markdown, `.nojekyll`, inventaris publik/offline, path relatif pada URL Pages, tiga view, dan identitas manifest. Checker dokumentasi memeriksa target, kapitalisasi path, dan anchor Markdown lokal tanpa request jaringan.
- Parser format 11 kolom dan format lama 10 kolom bernomor, raw source, invalid count/blank TAB/time/date/whitespace, preview dan konfirmasi pemetaan format lama.
- Export/import round-trip, kolom ke-6 kosong, serial **46315 = 20 Oktober 2026**, tanpa suffix; timezone UTC, Asia/Makassar dan America/Los_Angeles memberi hasil sama.
- Jam HH.mm, tanggal kabisat, field wajib, potensi duplikat seluruh 11 kolom, filter local/import, dan konflik mapping.
- Bridge Destination mock: GET, payload terbatas, bounded retry/timeout, matching request_id, wrong-ID bukan sukses, retry idempoten, cache dan kegagalan penulisan cache.
- Browser desktop: IndexedDB nyata, rollback, snapshot/audit/revision conflict/tombstone, import idempoten, pilihan handover terbaru dan tambahan lokal, backup/restore atomik serta konflik ID.
- UI tiga view, report TSV, koreksi, quota gagal mempertahankan draft, dan pending bridge dengan read-back mock. Scope worker `/RKEF-Ticketing/`, app shell offline, session/record/draft jam manual setelah reload, serta peralihan worker produksi ke dev tanpa kehilangan IndexedDB.
- Screenshot desktop dan viewport 360px disimpan hanya di `private-data/qa/` yang diabaikan Git.

## Belum terverifikasi

- [ ] Android/Chrome nyata pada HP operasional, instalasi PWA dan kebijakan penyimpanan.
- [ ] Akses anonim Apps Script dari hosting target dan health/list live.
- [ ] POST iframe Android menambah Destination nyata, read-back request_id cocok, refresh HP kedua.
- [ ] Timeout nyata, berpindah koneksi, kuota layanan, reload cloud pending.
- [ ] Clipboard WhatsApp, download TXT/JSON, dan pemilihan file restore pada HP.
- [ ] Pemulihan backup antarperangkat, kapasitas data, retensi, dan kebiasaan backup operator.
- [ ] Operator memeriksa master/mapping, timbangan/checker, shift, dan tanggal operasi.
- [ ] Owner meninjau file repository untuk publikasi root, mengatur Pages branch `main` + `/ (root)`, dan memverifikasi URL live serta penerimaan operasional.

`apps-script/Code.gs` tetap salinan existing. Perubahan file lokal tidak memperbarui deployment Google. Tidak ada Git mutation atau deployment yang dijalankan. Lihat [struktur dan batas hosting](../architecture/PROJECT_STRUCTURE.md#hosting).
