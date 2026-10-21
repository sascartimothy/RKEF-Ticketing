# Hasil pengujian lokal

## Report Pile ID dan Laporan WhatsApp v1.1.1 — 21 Oktober 2026

Keputusan owner: **Informasi Sesi → Rekap Ritase per Pile ID + TOTAL → Laporan WhatsApp**, tanpa delapan filter dan tanpa card/alur Backup/Restore JSON pengguna (termasuk recovery UI). Checker hanya identitas sesi. Sumber Report seluruh ritase lokal aktif dengan tanggal/shift/timbangan, handover dan aktivasi sesuai; tidak menghitung histori impor, sesi lain/reset atau transaksi terhapus. API database internal tetap kompatibel; tidak ada perubahan schema v1, penghapusan data operator, Git mutation atau deployment.

| Verifikasi | Hasil lokal |
|---|---|
| `npm.cmd test` | **PASS** — 41 tes Node, 12 assertion Apps Script mock, static workspace dan inventaris offline |
| `npm.cmd run test:browser` | **PASS** — Edge headless lokal, origin/port/profil baru dan IndexedDB nyata dengan data sintetis; seluruh request eksternal diblokir |
| `npm.cmd run check:docs` | **PASS** — target/case/anchor Markdown lokal; bukan verifikasi link eksternal |
| `git diff --check` | **PASS** |
| Rekap/domain | **PASS** — satu record satu ritase meskipun DT sama; isolasi tanggal/shift/timbangan/origin/handover/aktivasi; urut jumlah menurun lalu nama deterministik; TOTAL sama dengan transaksi dan baris WA; koreksi Pile ID dan nomor Opsi B tanpa counter rekap |
| Kontrak/data invalid | **PASS** — 11 kolom TAB asli, kolom keenam kosong, suffix tersimpan, detik dibuang tanpa pembulatan/tanggal bergeser; NS lintas tengah malam, suffix 999/1000; nomor hilang/duplikat/gap, counter/UUID/kronologi rusak, provenance ambigu dan collision histori memblokir output |
| UI Salin/TXT | **PASS** — 605 ritase DT sama pada IndexedDB sintetis; preview expandable tidak memangkas clipboard/TXT. Clipboard API dan fallback copy/seleksi diuji dengan mock; status berhasil/gagal sesuai hasil. TXT blob sama dengan seluruh teks clipboard. Ini bukan uji clipboard OS/HP atau folder unduhan aktual |
| Data berubah di tab lain | **PASS** — aksi membaca snapshot sesi+record lagi, duplikat tersimpan sebelum refresh memblokir Salin/Unduh dan mengosongkan teks lama; pergantian aktivasi tidak menampilkan hasil sesi sebelumnya |
| Empty/reset/reload | **PASS** — sesi kosong TOTAL 0, tanpa sesi tidak ada laporan; reset penuh lalu reload tidak mengaktifkan Report lama; reload offline mempertahankan total/WA terbaru dan data/koreksi/audit/draft |
| UI/regresi | **PASS** — kontrol filter dan Backup/Restore tidak tersedia; Report tanpa overflow pada 360px dan screenshot diperiksa. Setup/Operasional, handover/reuse, reset atomik, koreksi popup, Opsi B, offline produksi serta transisi worker ke dev tetap lulus |

Versi tetap **v1.1.1**; cache `rkef-shell-v1.1.1-report-piles`. Screenshot lokal di `private-data/qa/report-360.png` (ignored). File utama: `index.html`, `styles.css`, `js/report-ui.js`, `js/wa-exporter.js`; integrasi refresh pada `js/app.js`, `js/setup-ui.js`, `js/import-ui.js`; arahan backup usang dibersihkan dari `js/operational-ui.js`. API/implementasi `js/database.js` tidak berubah. Tes baru: `tests/report.test.js`, `tests/report-browser.js`; runner/regresi dan dokumentasi ikut diselaraskan.

**Risiko/batasan:** Backup/Restore JSON di UI dihapus atas keputusan owner. Pemulihan seluruh metadata lokal setelah perangkat hilang/browser dibersihkan tidak tersedia melalui antarmuka. WA/TXT bukan backup metadata lengkap. OD-04 tersisa handover shift kosong; finalisasi/penguncian laporan terkirim tetap OD-09, serta OD-02/05/06/07/08/10/11 tetap sesuai spesifikasi. Semua record tersedia dan nomor konsisten bukan bukti operator telah menyelesaikan shift atau semua ritase lapangan telah dicatat.

**NOT VERIFIED:** Android/Chrome HP, clipboard/download perangkat nyata, paste WhatsApp ke Excel, Google anonim/POST/read-back dua HP, Pages live. Hasil bagian lama di bawah adalah catatan historis; uraian filter/Backup UI sebelumnya telah digantikan keputusan Report ini.

## Input Waktu Manual Angka v1.1.1 — 21 Oktober 2026

Penyebab: jam AUTO tidak diseleksi untuk penggantian langsung dan input manual hanya lolos sebagai waktu bertitik lengkap. Perbaikan memakai seleksi pada fokus/tap, sebelum edit/paste dan awal komposisi; fallback `input` untuk digit pertama. Fokus tanpa perubahan tetap AUTO. Formatter mempertahankan teks/kursor selama edit, lalu menormalkan nilai valid pada blur atau saat save sebelum validasi record. Nilai invalid dipertahankan; kosong/whitespace Ritase Baru langsung AUTO. Popup Koreksi memakai aturan angka yang sama, tidak menjalankan jam, dan menolak kosong. Draft manual mentah/parsial tetap disimpan sebagai draft, bukan transaksi valid.

| Verifikasi lokal | Hasil |
|---|---|
| `npm.cmd test` | PASS — 36 tes Node, 12 assertion Apps Script mock, workspace dan docs |
| `npm.cmd run test:browser` | PASS — Edge headless, server/profil baru, data sintetis dan IndexedDB nyata; request eksternal diblokir |
| `npm.cmd run check:docs` | PASS — target, case dan anchor lokal |
| `git diff --check` | PASS |
| Angka/format | PASS — `720`, `0720`, `72035`, `072035`, `142530`, `235959`, notasi bertitik dan jam bulat; rentang invalid ditolak |
| Input native Chromium | PASS — digit pertama mengganti AUTO, pengetikan bertahap, backspace, edit tengah/kursor, hapus dan penggantian numerik sekaligus |
| Paste/komposisi | PASS terbatas — simulasi event `insertFromPaste` dengan data null dan komposisi; bukan clipboard OS atau keyboard Android fisik |
| Clock/draft/save/koreksi | PASS — tick tanpa write, fokus tetap AUTO, kosong/spasi AUTO, capture sebelum delay async, normalisasi manual saat save, raw manual pulih setelah reload, popup statis dan draft utama tetap |
| Integritas/regresi | PASS — UUID/audit/Opsi B atomik, NS ambigu diblokir, backup/restore, reset/reuse/handover, WA 11 TAB/kolom 6 kosong dan detik dibuang, offline, 360px/1280px |
| Android/Chrome HP dan keyboard OEM/IME aktual | **NOT VERIFIED** |
| Google anonim, Pages live, WhatsApp/Excel dan clipboard HP | **NOT VERIFIED** |

Versi tetap **v1.1.1**; cache menjadi `rkef-shell-v1.1.1-manual-digits`, tanpa aset/modul baru. Database/schema/storage identity dan logika penomoran tidak diubah. Formatter sengaja tidak menambahkan titik setiap ketukan: panjang tiga digit bisa berlanjut menjadi empat/lima/enam digit, sehingga format akhir ditampilkan saat blur/save. Grammar parser handover WA tetap. Keputusan tanggal NS OD-10 dan finalisasi OD-09 tetap terbuka. Worker baru mengikuti mekanisme update existing, tanpa paksa reload.

File yang disentuh tugas ini: `index.html`, `js/operational-ui.js`, `js/time-date.js`, `sw.js`, `tests/operational.test.js`, `tests/live-clock-browser.js`, `tests/browser-suite.js`, `scripts/browser-test.cjs`, README, spesifikasi operasional dan laporan ini. Seluruh perubahan lokal sebelumnya dipertahankan. Branch tetap `main`; tidak ada operasi Git yang mengubah repository, deployment, atau akses data operasional nyata.

## Full Session Reset v1.1.1 - 21 Oktober 2026

Keputusan terbaru owner menggantikan reset historis yang hanya menghapus sesi/draft: **Mulai Sesi Baru menghapus permanen semua ritase lokal milik sesi aktif setelah satu konfirmasi eksplisit.** Pemulihan memerlukan backup sebelumnya. Histori/receipt WA, master lokal, cache Master Bersama/Destination, konfigurasi, transaksi sesi/shift/timbangan/tanggal lain tetap tersimpan. Tidak ada penghapusan seluruh IndexedDB. Nomor sesi yang dibuang bebas untuk hasil handover baru; konflik di luar scope tetap diblokir.

Akar benturan: implementasi sebelumnya meninggalkan record lokal (termasuk nomor bisnis) setelah menghapus penanda sesi. Reset sekarang memakai satu transaksi `records/settings/audit`: cek sesi/draft terbaru, identifikasi scope tanggal/shift/timbangan/handover/aktivasi, hapus record termasuk tombstone dan audit terkait, hapus draft/counter/sesi, lalu simpan audit ringkas `session-reset`. Identitas ambigu ditolak. Kegagalan setelah seluruh write dijadwalkan membatalkan semuanya; UI sukses hanya sesudah commit. Tab/koneksi stale ditolak oleh identitas aktivasi/revisi. Koreksi sekarang mempertahankan activationId, dan refresh antar-tab membuang draft memori dari aktivasi yang berakhir.

| Pemeriksaan akhir | Hasil |
|---|---|
| `npm.cmd test` | PASS: 35 tes Node, 12 assertion Apps Script mock, static workspace dan docs |
| `npm.cmd run test:browser` | PASS: Edge desktop, UI/IndexedDB nyata, skenario 83 + 3, reload dan offline |
| `npm.cmd run check:docs` | PASS: 10 dokumen Markdown, 61 tautan lokal |
| `git diff --check` | PASS |

Bukti tes browser menggunakan profil/server baru, data sintetis dan IndexedDB nyata; request eksternal diblokir:

- Skenario wajib: paste 83 BDM, isi checker manual, simpan melalui UI tiga lokal 084/085/086, Batal mempertahankan snapshot, konfirmasi menghapus tiga lokal beserta auditnya. 83 histori impor dan receipt tetap sama. Paste ulang mengaktifkan NS 20/10/2026, next `46315-084`, checker kosong, tanpa duplikasi; isi checker manual dan save UI baru berhasil di nomor 084. Reload aktual mempertahankan sesi/data baru.
- Scope: ONI, shift lain, tanggal lain dan aktivasi sebelumnya tetap utuh; tombstone aktif dihapus. Konfigurasi, master, receipt, cache Destination tetap sama. Konflik lokal yang dipertahankan masih menolak handover. Identitas ambigu menolak seluruh reset.
- Atomik: injeksi kegagalan setelah write record/audit/settings mengembalikan seluruh snapshot. Draft ikut dihapus, stale autosave dan koreksi dari koneksi kedua ditolak. Tanpa sesi aktif, histori tidak dihapus.
- UI: satu popup per tindakan, judul dan tombol destruktif sesuai permintaan, peringatan permanen dan backup; status proses, textarea kosong, input nonaktif, riwayat kosong, Report kini tidak menampilkan histori impor setelah reset (hasil/desain Report lama digantikan task Report di atas). Reload aktual setelah reset tidak mengaktifkan sesi/draft lama atau memunculkan lokal yang dibuang.
- Backup versi 1 mendukung audit baru dan restore snapshot yang sama, tetap menerima audit `session-end` lama. Opsi B, popup koreksi, DT SAP, live clock, presisi detik, master material, WA HH.mm tanpa pembulatan, offline dan viewport 360px/1280px diuji oleh rangkaian regresi.
- Runner reload menunggu main keluar dari status inert setelah load database selesai; sebelumnya pemeriksaan bisa terlalu dini. Assertion tie waktu di tes clock diperbaiki untuk memakai aturan createdAt lalu UUID; jam sintetis dapat memberi timestamp identik, sehingga urutan insert bukan jaminan urutan nomor.

Versi tetap **v1.1.1**, cache worker `rkef-shell-v1.1.1-session-reset`, schema/nama database/storage identity tetap. Android/Chrome HP, WhatsApp/Excel, clipboard/download HP dan Google anonim live belum diverifikasi. Data lama tanpa provenance aktivasi yang cukup sengaja memblokir reset dan memerlukan peninjauan; tidak ditebak atau dihapus massal.

File tugas reset: `js/database.js`, `js/setup-ui.js`, `js/app.js`, `styles.css`, `sw.js`, `tests/handover-reuse-browser.js`, `tests/browser-suite.js`, `tests/live-clock-browser.js`, `scripts/browser-test.cjs`, README, spesifikasi operasional dan dokumen ini. Perubahan lokal existing dipertahankan; branch main, tidak ada Git mutation/deployment.

## Live Transaction Clock dan Second-Precision Ordering v1.1.1

Verifikasi lokal 21 Oktober 2026, Node portable v24 / Edge Chromium headless, profil/server baru dan data sintetis. Semua request eksternal diblokir. Bagian ini memperbarui perilaku waktu; hasil historis di bawah tetap memiliki scope/versinya sendiri.

Akar masalah: `ensureDraft` menangkap waktu pembukaan form sekali dan `fillDraft` menampilkannya tanpa clock. Validasi dan kunci urut sebelumnya hanya mendukung menit. Sekarang satu timer display membaca waktu perangkat, mode draft eksplisit, capture waktu/tanggal pada awal submit sebelum `flushDraft`, validasi dan await database. Metadata presisi bersifat additive; schema/database/UUID tetap. AUTO menyimpan waktu capture dan provenance pembukaan draft; koreksi mempertahankan sumber/snapshot asli.

| Pemeriksaan | Hasil |
|---|---|
| `npm.cmd test` | **PASS**: 35 tes Node, 12 assertion Apps Script mock, workspace dan dokumentasi |
| `npm.cmd run test:browser` | **PASS**: IndexedDB nyata, UI, worker produksi, offline dan reload pada Edge desktop |
| `npm.cmd run check:docs` | **PASS**: target/path case/anchor Markdown lokal |
| `git diff --check` | **PASS** |
| 1-5: AUTO tick, fokus/tap, MANUAL, kosong dan whitespace | **PASS**: clock terkontrol pada browser nyata, interval membaca device time termasuk loncatan jam; MANUAL tidak ditimpa |
| 6-8: capture saat submit, delay async, simpan manual | **PASS**: draft flush ditahan, waktu perangkat digeser sebelum DB; tersimpan tetap `14.27.38`; manual `14.25` tetap presisi menit |
| 9-10: tanpa draft write tiap tick, mode setelah reload | **PASS**: spy `saveDraft` dan perbandingan draft; reload browser aktual untuk AUTO dan MANUAL |
| 11: koreksi tidak mengganti draft baru | **PASS**: field/modal historis statis, snapshot draft baru tetap sama setelah koreksi |
| 12-16: tiga transaksi satu menit, koreksi detik, UUID, audit, tie stabil | **PASS**: `14.25.12/.38/.51` menjadi `084/085/086`, koreksi `.51` ke `.20` menukar nomor peer secara atomik; equal seconds memakai createdAt/UUID; restore mempertahankan nomor |
| 17: validasi/save gagal tidak menghabiskan nomor | **PASS**: input invalid tanpa record/counter baru; injeksi abort setelah penulisan peer/counter/audit mengembalikan snapshot utuh |
| 18-19: WA tanpa pembulatan | **PASS**: `14.25.59` menjadi `14.25`, `23.59.59` menjadi `23.59`; 11 kolom, kolom 6 kosong, serial tanggal tetap, database tidak dimutasi |
| 20-21: histori menit dan backup/restore | **PASS**: record/snapshot lama menit tetap diterima; restore IndexedDB mempertahankan detik, presisi, mode, UUID, nomor, sumber dan audit |
| 22: ambiguitas NS | **PASS** guard: tanggal aktual sebelum/sesudah tengah malam dihormati; waktu manual NS/koreksi waktu ambigu **BLOCKED OD-10**, tanpa perubahan snapshot |
| 23-25: Setup, riwayat/modal, versi | **PASS**: regresi automatic handover/reuse, lima riwayat/expand/search/modal, versi tetap `1.1.1` |
| Layout | **PASS**: tanpa horizontal overflow 360px; screenshot Operasional dan popup ditinjau; desain existing dipertahankan |
| Android/Chrome HP, jam HP aktual, Google, WA/Excel, Pages live | **NOT VERIFIED**: belum diuji langsung |
| Kebijakan NS manual/tanggal, finalisasi, laporan lengkap/filter, migrasi historis | **BLOCKED BY OPEN DECISION**: OD-10/09/04/05 tetap berlaku; bukan dituntaskan oleh perubahan clock |

Tes khusus: `tests/live-clock-browser.js`, `tests/operational.test.js`, tambahan `tests/domain.test.js`; runner `scripts/browser-test.cjs`. Test receipt existing kini memilih record milik receipt yang diuji, menggantikan pemilihan row pertama dengan urutan UUID acak. Worker cache menjadi `rkef-shell-v1.1.1-live-clock`; versi tampilan tetap v1.1.1. Tidak ada modul/aset publik baru sehingga inventaris publik/offline tidak bertambah.

Batas kompatibilitas draft lama tanpa mode: nilai sama dengan `sourceTime` dianggap AUTO, berbeda atau draft koreksi dianggap MANUAL. Mengetik ulang nilai yang sama tidak tercatat pada format lama; tidak ada cara memulihkan niat tersebut secara pasti. Waktu historis menit tidak diberi detik pengamatan palsu. WA hanya membawa menit; gunakan JSON untuk mempertahankan detik.

File tugas ini: `index.html`, `js/operational-ui.js`, `js/time-date.js`, `js/database.js`, `js/validation.js`, `js/wa-parser.js`, `js/wa-exporter.js`, `sw.js`, tes/runner di atas serta `tests/browser-suite.js`, README, spesifikasi dan laporan ini. Perubahan lokal yang sudah ada dipertahankan. Branch `main`; tidak ada add/commit/push/reset/clean/deploy atau perubahan setting hosting. Pengujian memakai storage sintetis terisolasi; IndexedDB operator tidak dihapus.


## Handover reuse v1.1.1 — 21 Oktober 2026

Keputusan terbaru menggantikan aturan historis di bawah yang menyebut replay tidak boleh mengaktifkan sesi. Receipt hanya mencegah duplikasi histori; laporan yang sama boleh mengaktifkan sesi kembali setelah reset bila aman. Versi aplikasi/paket tetap **v1.1.1**, cache produksi `rkef-shell-v1.1.1-handover-reuse`; database/schema/storage identity tidak berubah.

- **PASS skenario wajib, UI + IndexedDB nyata:** impor sintetis 83 BDM `46315-001`–`46315-083`, NS 20/10/2026 aktif, satu konfirmasi Mulai Sesi Baru, sesi nonaktif, paste laporan sama, NS BDM aktif kembali dengan `46315-084` dan checker kosong. Tidak ada konfirmasi tambahan setelah paste.
- **PASS integritas:** seluruh 83 record termasuk UUID/snapshot sama persis; satu receipt; mapping tidak berubah/bertambah. Paste berulang menjadi no-op. Audit aktivasi ulang tersimpan dan valid untuk backup/restore. Injeksi gagal setelah write aktivasi ulang membatalkan seluruh transaksi; UI tetap nonaktif dan menampilkan gagal.
- **PASS reload browser aktual:** sesi aktif beserta nomor, records, receipt, dan mapping tetap sama; checker manual berhasil disimpan. ID aktivasi baru menolak draft tab lama walaupun laporan sama.
- **PASS guard regresi:** draft dirty, sesi stale, histori bertumpang tindih, transaksi lokal pada sesi tujuan, persiapan mundur dan campuran BDM/ONI ditahan tanpa overwrite. BDM/ONI independen; NS → DS tanggal berikutnya tetap `001`.
- **PASS regresi:** Opsi B, koreksi popup, UUID dan audit peer, backup/restore, tampilan 360px/1280px, riwayat expandable, pending Destination mock, offline produksi dan perpindahan worker produksi → dev.

**Seluruh perintah PASS:** `npm.cmd test` (32 tes Node, 12 assertion Apps Script mock, workspace/docs), `npm.cmd run test:browser` (Edge headless terisolasi), `npm.cmd run check:docs`, dan `git diff --check`. Semua data sintetis, request eksternal browser diblokir; bukan bukti Android/Chrome HP, clipboard WA/Excel, atau Google live. OD-06 untuk rekonsiliasi konflik nyata tetap terbuka; tidak ada overwrite otomatis. Git/deployment tetap owner-only.

File pada tugas reuse: `js/database.js`, `js/import-ui.js`, `sw.js`, `tests/handover-reuse-browser.js` (baru), `tests/browser-suite.js`, `scripts/browser-test.cjs`, `README.md`, `docs/requirements/RKEF_OPERATIONAL_SPEC.md`, dan laporan ini. Perubahan lokal sebelum tugas dipertahankan. Status Git akhir: branch `main`, working tree belum bersih (21 modified, 2 untracked termasuk tes Operasional existing); tidak ada staging, commit, push, atau deployment.

## Mulai Sesi Baru v1.1.1 — 21 Oktober 2026 (catatan historis)

Implementasi dan verifikasi lokal tombol Setup → Handover manual → **Mulai Sesi Baru**, setelah ringkasan sesi dan sebelum textarea. Versi aplikasi/paket tetap v1.1.1; cache app shell kini `rkef-shell-v1.1.1-session` agar perubahan lokal dapat diterima worker baru.

- **PASS `npm.cmd test`:** 32 tes Node, 12 assertion Apps Script mock, checker workspace dan dokumentasi.
- **PASS `npm.cmd run test:browser`:** Edge desktop headless, IndexedDB nyata, data sintetis dan request eksternal diblokir. Tombol/urutan DOM, satu popup Batal/Lanjutkan, tanpa mutasi sebelum konfirmasi, pembatalan tanpa perubahan, klik berulang, serta popup tanpa overflow pada 360px.
- **PASS:** reset atomik menghapus hanya penanda sesi/draft; records, masters, imports, cache, pending dan audit lama tetap utuh. Audit `session-end` lolos validasi backup. Injeksi kegagalan setelah write membuktikan rollback sesi/draft dan state memori.
- **PASS:** autosave yang sengaja ditunda dituntaskan sebelum konfirmasi; autosave dari koneksi dengan sesi lama ditolak setelah commit. Sesi/draft yang berubah pada koneksi kedua menolak reset tanpa perubahan. Reset saat simpan ritase masih pending ditolak. Tanpa sesi/draft tidak ada popup atau write reset.
- **PASS:** paste valid setelah reset mengaktifkan NS dengan nomor `46315-084`, checker kosong lalu diisi manual. Campuran BDM/ONI tetap ditolak; impor identik setelah reset tetap idempoten tanpa aktivasi ulang. Regresi Operasional Opsi B, koreksi, numbering, riwayat, backup/restore dan offline tetap lulus. Reload browser setelah reset tidak memulihkan sesi/draft lama dan tetap memuat ritase tersimpan.
- **PASS `npm.cmd run check:docs` dan `git diff --check`.**

Screenshot lokal di `private-data/qa/`; viewport 360px dan 1280px. Hasil ini bukan uji Android/Chrome HP, clipboard WhatsApp/Excel, atau Google Sheets live. Perlindungan konflik historis/receipt tetap berlaku; reset tidak memberi izin overwrite atau aktivasi ulang laporan yang sudah diproses. Git dan deployment tetap owner-only; perubahan lokal existing dipertahankan.


Tanggal laporan: **21 Oktober 2026 (Asia/Makassar)**. Restrukturisasi root lokal saja; Git, GitHub, Pages settings, dan Apps Script deployment tidak diubah. Data browser sintetis; tidak ada penulisan Sheets live.

## Operasional v1.1.1 — 21 Oktober 2026

Hasil di bagian ini menggantikan status Operasional/nomor/exporter v1.1.0 di catatan historis berikut. Seluruh perubahan lokal; branch `main`, tanpa staging, commit, push, perubahan GitHub, atau deployment.

| Pemeriksaan | Hasil dan batas bukti |
|---|---|
| `npm.cmd test` | **PASS** — 32 tes Node, 12 assertion Apps Script mock, static inventory/server/version alignment dan checker dokumentasi |
| `npm.cmd run test:browser` | **PASS** — Edge headless, server/profil baru, IndexedDB nyata, data sintetis, seluruh request eksternal diblokir |
| `npm.cmd run check:docs` / `git diff --check` | **PASS** — target/case/anchor lokal dan whitespace diff; bukan verifikasi link eksternal |
| Input 360px | **PASS** — dua selector material mengisi Source/Product/Destination, input `820` menyimpan `SAP_820`, kode SAP lengkap tidak diprefix ulang, kode non-SAP lengkap dipertahankan; waktu/note dan simpan; tidak ada + Form Baru |
| Draft & popup | **PASS** — koreksi memakai dialog terpisah, draft baru beserta nilai form/IndexedDB tidak diganti. Simulasi gagal simpan modal tetap terbuka, rows/draft tetap; retry berhasil. Save baru menyiapkan form kosong dengan waktu perangkat |
| Riwayat | **PASS** — default lima transaksi sesi aktif, count dinamis, expand tujuh inline/collapse kembali lima, pencarian numerik DT. Dataset sintetis 300 baris dirender inline lalu collapse; pengukuran lokal sekitar 5ms, bukan benchmark HP |
| Opsi B | **PASS** — `084/15.20`, `085/15.25`, `086/15.30`; koreksi UUID ketiga ke `15.22` menghasilkan `084/085/086` sesuai kronologi; UUID/snapshot tetap. Penyisipan lebih awal dan tie-breaker createdAt/UUID stabil diuji; nomor >999 didukung |
| Audit/counter | **PASS** — audit `correct` membawa nomor before/after kandidat, `renumber` membawa nomor peer before/after; revisi peer naik. Seluruh penulisan diuji dalam satu transaksi atomik |
| Rollback | **PASS** — abort disuntik setelah record/peer/counter/audit diantrekan: snapshot semua store identik sebelum/sesudah. Kegagalan tidak menghabiskan nomor |
| Tab/retry | **PASS** — dua koneksi IndexedDB bersamaan menulis scope sama tanpa nomor ganda/gap; retry payload asli mempertahankan UUID/counter. Ini membuktikan serialisasi store antar-koneksi origin sama, bukan sinkronisasi antar-HP |
| Scope beku | **PASS** — histori impor, tanggal lain, timbangan lain tidak berubah; koreksi sesi sebelumnya ditolak. Collision nomor bisnis, histori tanpa metadata aman dan tombstone/gap diblokir. Penghapusan bernomor ditolak OD-02 |
| Reload/backup | **PASS** — reload browser offline mempertahankan koreksi `SAP_826`, waktu `08.01`, nomor `003`, serta audit renumber; backup/restore snapshot lengkap numbering/audit identik, UUID tetap; merge konflik atomik |
| NS midnight | **PASS (cakupan terbatas)** — metadata tanggal kalender perangkat yang tersedia bersama waktu default tidak diedit mengurutkan `23.50` tanggal operasi sebelum `00.30` tanggal berikutnya, nomor `089/090`; tanggal operasi tidak berubah |
| NS manual/ambigu | **BLOCKED (OD-10)** — waktu manual berbeda dari default, koreksi jam NS, tanggal aktual hilang/di luar tanggal operasi dan hari berikutnya ditolak tanpa perubahan DB; tidak menebak shift boundary |
| Setup v1.1.0 | **PASS regresi lokal** — empat card, auto paste valid, checker manual, aturan waktu owner, campuran ditolak, idempotensi, rollback handover, master lokal tetap, pending/read-back mock tetap |
| Report | **PASS integrasi terbatas** — exporter memakai suffix aktual tersimpan, duplicate fingerprint mengabaikan suffix, sorting memakai nomor tersimpan; format lama tanpa nomor tetap legacy. UI/filter tidak didesain ulang |
| PWA/version | **PASS** — tampilan/config/paket/cache v1.1.1, schema DB v1 dan storage identity tetap, offline shell/reload serta produksi → dev mempertahankan data |
| Screenshot | **PASS visual lokal** — `private-data/qa/operasional-360.png` (form dan riwayat penuh), `correction-360.png` (modal), Setup 360px/1280px; semua artefak diabaikan Git |
| Android/Chrome HP / WA → Excel / Google live | **NOT VERIFIED** — emulasi viewport desktop dan mock bukan pengujian perangkat/layanan aktual |
| Finalisasi/kiriman WA | **OPEN OD-09** — aplikasi tidak mengetahui laporan sudah dikirim; sesi aktif tidak membuktikan belum terkirim. Perubahan nomor dapat berbeda dari laporan lama. Tidak ada klaim perlindungan/finalisasi laporan terkirim |
| Report final lengkap | **OPEN OD-04/05** — filter/subset, laporan campuran, data lama tanpa nomor belum memenuhi seluruh kontrak handover; perlu task Report berikutnya |
| Mapping/prefix lanjutan | **OPEN OD-11** — UI resmi tambah/koreksi mapping lokal dan prefix otomatis selain SAP belum ditetapkan; konflik tidak ditebak, kode lengkap non-SAP tetap didukung |

Tidak ada FAIL yang tersisa pada suite akhir. File baru: `tests/operational.test.js`. Perubahan: `index.html`, `styles.css`, `config.js`, `package.json`, `sw.js`, `js/operational-ui.js`, `js/database.js`, `js/validation.js`, `js/wa-exporter.js`, `js/report-ui.js`, `scripts/browser-test.cjs`, `scripts/check-workspace.cjs`, `tests/browser-suite.js`, `tests/domain.test.js`, `README.md`, `AGENTS.md`, spesifikasi operasional, dan laporan ini. Tidak ada perubahan backend atau aset/module publik baru; inventaris publik/offline tetap dan sudah diperiksa.

## Automatic handover v1.1.0 - 21 Oktober 2026

Pembaruan terbaru menggantikan perilaku preview/konfirmasi dan status OD-01/checker pada laporan historis di bawah. Versi aplikasi tetap **v1.1.0**.

- **PASS** `npm.cmd test`: 26 tes Node, 12 assertion Apps Script mock, inventaris workspace dan dokumentasi.
- **PASS** `npm.cmd run test:browser`: Edge headless, IndexedDB nyata, server/profil baru, data sintetis, request eksternal diblokir. Paste 83 baris dengan variasi waktu owner otomatis mengaktifkan sesi, status ringkas tanpa preview/checkbox/tombol konfirmasi; mengetik nilai textarea tidak mengimpor. Retry paste dan transaksi bersamaan tidak menggandakan histori atau memundurkan sesi. Campuran timbangan dan draft aktif ditolak.
- **PASS** abort setelah write handover diantrekan: snapshot records, masters, imports, audit dan settings seluruhnya tetap; sesi tidak aktif palsu.
- **PASS** checker sesi baru kosong, kemudian diisi dan tersimpan manual; draft bersih memakai checker terbaru, backup/restore termasuk audit checker lulus.
- **PASS** regresi simpan/koreksi Operasional, TSV Report existing, backup/restore, pending/read-back Destination mock, offline reload dan draft manual, layout 360px/1280px serta transisi worker produksi ke dev.
- **PASS** `npm.cmd run check:docs` dan `git diff --check`.
- **BELUM DIVERIFIKASI** Android/HP, clipboard WA ke Excel aktual, Google/Apps Script live. Report masih serial tanpa suffix dan penomoran permanen baru saat simpan belum diimplementasikan; nomor berikutnya Setup tetap informasi persiapan. Konflik master ditahan tanpa overwrite; prosedur penyelesaiannya tetap terbuka.

Cache worker memakai revisi `rkef-shell-v1.1.0-handover-auto` agar aset baru terpasang; versi aplikasi tetap v1.1.0 dan identitas IndexedDB tetap.

File pada perbaikan ini: `sw.js`, `index.html`, `js/import-ui.js`, `js/setup-ui.js`, `js/time-date.js`, `js/wa-parser.js`, `js/database.js`, kedua suite tes, README, AGENTS, spesifikasi operasional, dan laporan ini. Perubahan lain yang telah ada di workspace dipertahankan.

## Setup v1.1.0 — 21 Oktober 2026

Perubahan lokal setelah laporan migrasi di bawah. Bagian migrasi dan cakupan lama adalah bukti historis; bukan klaim seluruh kontrak spesifikasi operasional terbaru sudah terpenuhi.

| Pemeriksaan | Status / bukti |
|---|---|
| `npm.cmd test` | **PASS** — 25 tes Node, 12 assertion Apps Script mock, checker workspace dan dokumentasi |
| `npm.cmd run test:browser` | **PASS** — Edge/Chromium headless dengan IndexedDB nyata dan data sintetis; seluruh request eksternal diblokir |
| `npm.cmd run check:docs` | **PASS** — target, kapitalisasi path, dan anchor Markdown lokal |
| `git diff --check` | **PASS** — tanpa mutation Git / deployment |
| Setup empat card | **PASS** — Handover manual → Sesi operasional → Master bersama → Versi; vertikal pada 360px dan 1280px, tanpa overflow halaman; card lama dan referensi listener UI dihapus |
| Validasi handover | **PASS** — 11 kolom TAB, suffix terstruktur, kolom keenam kosong, tanggal/scale seragam, urutan/gap/duplikat diperiksa, raw source dipertahankan |
| DS → NS / NS → DS | **PASS** — `001`–`083` → `46315-084` NS; `084`–`150` → `46316-001` DS pada tes domain; kedua arah juga diuji di IndexedDB/UI |
| BDM/ONI independen | **PASS** — receipt persiapan BDM `084` tetap setelah ONI `051`; satu sesi aktif dipilih melalui konfirmasi. Ini bukan tes counter permanen saat simpan |
| Laporan campuran | **PASS** — 82 BDM + satu ONI menandai semua baris; tidak ada konfirmasi parsial. Database menolak sumber campuran tanpa mengubah snapshot |
| Preview / konfirmasi | **PASS** — paste/preview/cancel tidak mengubah sesi; konfirmasi atomik menyimpan histori, master, receipt, audit dan sesi |
| Data safety | **PASS** — retry receipt bersamaan tidak menggandakan record; replay tidak mengaktifkan sesi lama; konflik isi/preview stale/kemunduran sesi ditahan; rollback atomik diuji setelah penulisan mulai; draft tidak ditimpa |
| Master / backup | **PASS** — tambahan lokal dipertahankan; service master lokal tetap ada; backup schema v1 lama dan sesi baru tanpa checker dapat divalidasi/restore; UUID, nomor sumber, snapshot/audit dipertahankan |
| Master bersama | **PASS (MOCK)** — transport form, pending, error, cache, read-back `request_id`; backend Apps Script tidak diubah |
| PWA / offline | **PASS (DESKTOP)** — cache baru, scope Pages tetap, reload offline mempertahankan sesi/record/draft; transisi production → dev tidak menghapus IndexedDB |
| Screenshot | **PASS** — ditinjau secara visual: `private-data/qa/setup-360.png` dan `setup-desktop.png` (lokal, diabaikan Git) |
| Android / Google / WA → Excel aktual | **NOT VERIFIED** — tidak diuji pada perangkat/layanan live |
| Waktu ambigu / format lama / gap / konflik | **BLOCKED BY OPEN DECISION** — OD-01/03/05/06: sumber tidak dinormalisasi, disortir, atau diimpor sebagian; prosedur pemulihan belum diputuskan |
| Checker / bootstrap | **BLOCKED BY OPEN DECISION** — OD-08: TSV tidak memuat checker; sesi baru menampilkan status belum dikonfirmasi. Penyimpanan ritase existing masih mensyaratkan checker |

Batas lingkup: nomor berikutnya pada Setup hanya persiapan dari laporan terkonfirmasi. Tidak ada nomor permanen baru atau counter yang dialokasikan oleh Setup. Penomoran saat simpan, pembatalan bernomor (OD-02), urutan/keutuhan output (OD-04), dan koordinasi HP (OD-07) belum diselesaikan. Exporter/Report masih menghasilkan serial tanpa suffix sesuai implementasi sebelumnya; hasilnya belum memenuhi kontrak handover baru. Tidak ada klaim regresi bebas bug atau rilis operasional siap.

File implementasi: `index.html`, `styles.css`, `config.js`, `js/setup-ui.js`, `js/import-ui.js`, `js/wa-parser.js`, `js/database.js`, `js/validation.js`, `sw.js`, `package.json`. Verifikasi: `tests/domain.test.js`, `tests/browser-suite.js`, `scripts/browser-test.cjs`; dokumentasi: README dan laporan ini. Perubahan AGENTS, indeks dokumentasi, dan spesifikasi operasional sudah ada sebelum tugas ini dan dipertahankan.

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
- [ ] Clipboard WhatsApp, download TXT dan paste Excel pada HP aktual. Backup/Restore JSON pengguna sudah dihapus; bukan gate UI yang masih harus diuji.
- [ ] Prosedur pemulihan metadata di luar UI dan koordinasi antarperangkat, kapasitas data dan retensi; tidak ada fasilitas restore pengguna saat ini.
- [ ] Operator memeriksa master/mapping, timbangan/checker, shift, dan tanggal operasi.
- [ ] Owner meninjau file repository untuk publikasi root, mengatur Pages branch `main` + `/ (root)`, dan memverifikasi URL live serta penerimaan operasional.

`apps-script/Code.gs` tetap salinan existing. Perubahan file lokal tidak memperbarui deployment Google. Tidak ada Git mutation atau deployment yang dijalankan. Lihat [struktur dan batas hosting](../architecture/PROJECT_STRUCTURE.md#hosting).
