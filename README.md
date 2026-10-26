# RKEF Ticketing

PWA HTML/CSS/vanilla JavaScript dengan tepat tiga halaman utama: **Setup**, **Operasional**, **Report**. Implementasi penuh lokal diizinkan owner pada **21 Oktober 2026**. Belum ada klaim penerimaan operasional Android atau integrasi Google Sheets live.

**LOCAL ONLY.** Aplikasi berjalan langsung dari root repository tanpa build. Owner menangani Git, pengaturan Pages, dan deployment sendiri.

[Spesifikasi operasional terbaru](docs/requirements/RKEF_OPERATIONAL_SPEC.md) adalah acuan utama keputusan operasional yang telah dikonfirmasi dan wajib dibaca sebelum mengubah logic input, handover, numbering, atau export. Setup **v1.1.0** kini memvalidasi laporan 11 kolom bersuffix, mendeteksi sesi berikutnya, dan mengaktifkannya otomatis setelah paste lengkap yang valid tanpa konflik. Operasional **v1.1.1** kini menyimpan nomor Opsi B berdasarkan waktu pada sesi aktif, koreksi via popup, input unit SAP, dan riwayat ringkas. Report v1.1.1 otomatis memakai seluruh ritase lokal sesi aktif, rekap Pile ID + TOTAL, dan WA lengkap dengan suffix tersimpan. Filter serta Backup/Restore JSON di UI dihapus atas keputusan owner; finalisasi tetap OD-09. OPEN DECISION tetap mengikuti spesifikasi.

## Buka di localhost

Dari PowerShell pada workspace:

```powershell
Set-Location 'D:\Workspace\RKEF-Ticketing'
$env:Path = 'D:\Workspace\Tool\nodejs;' + $env:Path
npm.cmd test
npm.cmd run dev
```

Buka **http://127.0.0.1:4173/RKEF-Ticketing/** (root `/` juga tersedia). Server hanya mendengarkan loopback PC; ini bukan alamat yang bisa diakses HP lain. Ctrl+C menghentikan server. Tidak ada dependency NPM yang perlu dipasang. Minimum Node.js 22; tes sesi ini menggunakan Node Portable v24 dan Edge lokal. Baris PATH di atas hanya diperlukan jika Node portable tersebut belum ada di PATH.

```powershell
npm.cmd run test:browser
```

Runner membaca file aplikasi root, membuka server dengan worker produksi pada port kosong serta profil Chrome/Edge sementara, memakai data sintetis, dan memblokir request eksternal. Ia menguji IndexedDB nyata, UI, serta offline app shell di subpath Pages. Server dev yang sedang berjalan tidak digunakan ulang. Screenshot lokal tersimpan di `private-data/qa/` yang diabaikan Git. Detail: [laporan pengujian](docs/testing/LOCAL_TEST_RESULTS.md).

## Workflow development

**Edit aplikasi langsung di root: `index.html`, `styles.css`, `config.js`, `js/`, `assets/`, manifest, dan worker.** `docs/` khusus dokumentasi proyek. Tidak ada `src/`, `dist/`, folder output pengganti, bundler, framework, atau dependency eksternal. Satu entry point aplikasi utama adalah `/index.html`; `integration-test.html` tetap utility diagnostik terpisah.

Keputusan hosting final: **GitHub Pages dari branch `main`, folder `/ (root)`**, dengan `.nojekyll` di root dan tanpa custom deployment Actions. URL target tetap **https://sascartimothy.github.io/RKEF-Ticketing/**. Pengaturan Pages belum diubah atau diverifikasi live dalam pekerjaan lokal ini; owner menerapkan pengaturan dan publikasi sendiri.

| Perintah | Perilaku |
|---|---|
| `npm.cmd run dev` | Layani file root langsung; simpan perubahan lalu refresh browser |
| `npm.cmd test` | Kontrak Apps Script mock, tes domain dari `js/`, tes server, pemeriksaan workspace dan dokumentasi |
| `npm.cmd run test:browser` | Tes worker produksi/UI/IndexedDB dari root pada server dan profil terisolasi |
| `npm.cmd run preview` | Layani file root dengan service worker produksi untuk uji offline |
| `npm.cmd run check:docs` | Periksa target, kapitalisasi path, dan anchor tautan Markdown lokal |
| `npm.cmd run icons` | Buat ulang PNG langsung di `assets/`; refresh dev untuk melihat perubahan |

Server Node built-in membaca hanya 28 file dalam `FRONTEND_FILES` di `scripts/public-files.cjs`. Server tidak membuat, menyalin, membersihkan, atau mengubah file aplikasi. Akses file lain, directory listing, traversal path, serta symlink/junction pada path publik ditolak. `private-data/`, `.env`, `.git/`, backend, dokumen, tes, dan tooling tidak dilayani localhost. Jika menambah aset/modul publik, perbarui inventaris server dan precache produksi sesuai kebutuhan.

Dev membaca file saat request, tanpa watcher atau live reload. Untuk menghindari cache worker menutupi perubahan, respons `sw.js` pada mode dev menggunakan worker jaringan saja yang langsung aktif; respons ini hanya di memori dan tidak menyentuh IndexedDB. Saat pertama berpindah dari preview/worker lama ke dev, tunggu update worker lalu reload sekali. Dev memerlukan server aktif. Gunakan `preview` atau `test:browser` untuk perilaku offline produksi; worker produksi dapat mempertahankan aset cache sampai pembaruan worker aktif. Buka URL localhost, bukan `index.html` lewat `file://`.

Allowlist server lokal **tidak membatasi publikasi GitHub Pages**. Saat root dipublikasikan, file repository yang dilacak dapat tersedia melalui hosting. `private-data/`, `backups/`, `exports/`, dan kredensial diabaikan Git; owner harus memastikan file privat tidak pernah dilacak atau diunggah sebelum publikasi. `config.js` adalah konfigurasi publik tanpa rahasia.

## Alur pemakaian

1. **Setup v1.1.0:** empat card vertikal pada HP dan desktop: **Handover manual → Sesi operasional → Master bersama (Destination) → Informasi versi aplikasi**. Card Pilihan Lokal dan Sebelum Mulai dihapus. Service master lokal, data, dan mapping tetap tersedia; pengelolaan material lokal memakai popup Operasional v1.1.2.
2. Tempel **laporan lengkap satu shift**, tepat 11 kolom TAB, kolom keenam kosong, kolom pertama serial + suffix positif minimum tiga digit. Paste memicu parse, validasi penuh, simpan atomik, dan aktivasi tanpa tombol/checkbox/konfirmasi tambahan. Mengetik, reload, dan pemulihan draft tidak memicu impor. Status ringkas menampilkan hasil atau alasan penolakan. Awal `001`: DS → NS tanggal sama, nomor terakhir + 1; awal lain: NS → DS tanggal berikutnya, mulai `001`. Jam transaksi tidak menentukan shift. Waktu sumber `7.2`/`7.20` = `07.20`, `15` = `15.00`; satu digit menit berarti puluhan menit, rentang jam 00-23 dan menit 00-59. Nilai sumber asli dipertahankan. Campuran BDM/ONI menolak seluruh impor. Baris rusak, tanggal campuran, nomor ganda/gap/tidak urut, format lama, dan waktu di luar format/rentang yang disahkan ditampilkan tanpa diperbaiki atau diimpor sebagian. Pemulihannya menunggu keputusan owner.
   **Mulai Sesi Baru** menghapus permanen SEMUA data operasional lokal BDM dan ONI, seluruh sesi, ritase/impor/receipt, draft/counter/audit/tombstone, mapping, metadata dan pending setelah satu popup **Batal / Hapus Sesi & Mulai Baru**. Hanya dua cache Google master `checkers` dan `destinations` dipertahankan utuh; Google Sheets tidak diubah. Reset satu transaksi atomik, rollback bila gagal. Penanda teknis `resetGeneration` menolak seluruh write koneksi/tab lama sampai reload. UI kembali Setup Belum aktif, textarea WA kosong, Operasional/Report kosong; reload tetap bersih. Tidak ada pemrosesan ulang WA lama atau pemulihan metadata lengkap melalui UI. Keputusan final ini menggantikan reset yang mempertahankan histori/sesi lain.

3. Paste WA baru setelah reset membentuk histori, receipt, mapping dan sesi dari nol. Format 11 kolom, duplikat internal, campuran timbangan, suffix/shift/tanggal dan waktu tetap divalidasi penuh. Impor identik selama pekerjaan berjalan tidak menggandakan histori atau memajukan counter; konflik data yang masih ada tetap ditolak. Checker dipilih manual melalui checklist, tidak berasal dari TSV. Tanggal/shift/nomor hanya berasal dari laporan valid; tidak ada bootstrap otomatis.

4. Refresh Destination untuk membaca snapshot Sheets. Tambah master bersama adalah tindakan eksplisit terpisah; hanya `action`, `name`, `request_id` dikirim. Status sukses membutuhkan GET read-back ID yang cocok. Permintaan tertunda bertahan setelah refresh; gunakan cek read-back atau retry ID yang sama.
5. **Operasional v1.1.1:** isi nomor unit (`820` → `SAP_820`) atau kode lengkap non-SAP, pilih pasangan material yang disahkan, waktu, note opsional. Product Code/Destination mengikuti pasangan aktif; Source dan kode numerik legacy tidak digunakan untuk ritase baru. Save sukses menyiapkan form berikutnya. Riwayat sesi aktif default lima, Lihat Semua mengembang inline, pencarian tersedia. Koreksi via popup mempertahankan draft baru dan UUID. Nomor tersimpan mengikuti urutan waktu Opsi B, mulai nomor handover; perubahan peer diaudit dan atomik. AUTO mengikuti jam perangkat setiap detik (`HH.mm.ss`) dan menangkap waktu/tanggal tepat saat Simpan dimulai, sebelum proses async. Ketik angka untuk MANUAL: `720`/`0720` → `07.20`, `72035`/`072035` → `07.20.35`, `142530` → `14.25.30`. Notasi `7.2` → `07.20` dan jam bulat `15` → `15.00` tetap diterima. Angka mentah dipertahankan selama mengetik agar kursor/backspace stabil; titik ditambahkan otomatis saat keluar field atau saat simpan. Jam AUTO terseleksi agar digit pertama langsung mengganti nilainya. Kosong/whitespace kembali AUTO. Popup Koreksi menerima angka yang sama, menampilkan waktu historis statis, dan menolak waktu kosong. Draft manual mentah/parsial dipulihkan tanpa ditimpa jam; nilai invalid tidak dapat disimpan sebagai ritase. Fokus tidak menghentikan jam dan tick tidak menulis draft. Reload mempertahankan mode; form berikutnya kembali AUTO. Nomor kronologis memakai detik bila tersedia; waktu menit tetap presisi menit, dengan tie-breaker `createdAt` lalu UUID. NS hanya memakai tanggal perangkat tertangkap saat Simpan AUTO; koreksi waktu/tanggal NS ambigu diblokir (OD-10). Data lama tanpa metadata numbering tidak dimigrasi dengan tebakan.
6. **Report v1.1.1:** **Informasi Sesi → Rekap Ritase per Pile ID + TOTAL → Laporan WhatsApp**. Tidak ada filter manual. Tanggal operasi, DS/NS, BDM/ONI dan checker berasal dari sesi aktif; checker hanya identitas petugas, bukan pengelompokan/filter. Sumbernya seluruh transaksi aktif `origin=local` dengan tanggal/shift/timbangan, `numberingSession` dan identitas aktivasi sesuai. Histori impor, sesi lama/reset dan transaksi terhapus tidak masuk. Rekap dihitung dari transaksi tersimpan, satu record satu ritase walaupun DT berulang; urut jumlah menurun, lalu nama Pile ID deterministik, TOTAL paling bawah. Save/koreksi/renumbering memperbarui Report tanpa counter rekap terpisah.
7. **WA lengkap:** Salin Laporan WhatsApp dan Unduh TXT memakai seluruh transaksi sesi, urut `ritaseNumber` tersimpan. Tepat 11 kolom TAB asli tanpa header/Markdown, kolom keenam kosong, serial Excel + suffix aktual, satu timbangan, `HH.mm` dengan detik dibuang tanpa pembulatan. TOTAL = jumlah transaksi = jumlah baris WA. Preview lengkap dapat dibuka dengan tinggi terbatas/scroll; isi clipboard/TXT tidak dipotong. Nomor hilang/duplikat/gap, counter tidak konsisten, identitas ambigu, collision histori atau data invalid memblokir Salin/Unduh dengan alasan; nomor tidak dibuat ulang saat export. Snapshot sesi dan record dibaca atomik sebelum aksi agar data lama tidak tersalin setelah perubahan di tab lain. Status Salin berhasil/gagal terlihat; fallback copy browser atau seleksi seluruh teks untuk salin manual. Tidak ada kirim WA/backend otomatis.
8. Tanpa sesi aktif: “Belum ada sesi aktif. Lakukan handover di halaman Setup.”, tanpa laporan sesi lama. Sesi aktif kosong: “Belum ada ritase pada sesi ini.”, TOTAL 0, Salin/Unduh nonaktif. Nomor dapat berubah setelah koreksi Opsi B; aplikasi tidak mengetahui status kirim WA. Finalisasi tetap OD-09; shift kosong tidak menghasilkan handover palsu (sisa OD-04).
9. **Backup/Restore JSON di UI dihapus atas keputusan owner.** Tidak ada card Cadangan Perangkat, tombol backup, upload, preview, merge/replace, dialog restore, atau jalur recovery JSON pengguna. API database internal tetap untuk kompatibilitas/tes; penghapusan UI tidak menghapus IndexedDB atau metadata. Pemulihan seluruh metadata lokal setelah kehilangan perangkat/browser tidak lagi tersedia melalui antarmuka aplikasi. TXT/WA bukan backup UUID, audit, draft, master, counter atau cache.

## Penyimpanan dan pemulihan

- IndexedDB `rkef-ticketing`, schema v1: `records`, `masters`, `settings`, `cache`, `audit`, `imports`, `pending`. Transaksi, counter, perubahan nomor peer, dan audit disimpan atomik. Field additive memakai schema/store tetap; backup membawa semua metadata. Penghapusan satu ritase bernomor diblokir (OD-02); reset total operasional merupakan pengecualian eksplisit owner; seluruh tombstone turut dihapus saat reset.
- UUID mengidentifikasi ritase; DT No bukan ID unik. Dua baris identik ditandai sebagai kemungkinan duplikat, boleh disimpan setelah konfirmasi.
- Master Destination dan Checker_Crew shared lewat Sheets; pilihan Checker shift tetap lokal. Dua HP tidak menyinkronkan ritase otomatis; handover manual lewat WA. Teks WA tidak membawa UUID, checker, shift, note, atau audit; JSON mempertahankan semuanya.
- IndexedDB terikat origin (scheme, host, port), profil browser, dan perangkat; path saja tidak memisahkan database. Refactoring ini mempertahankan origin/path hosting, nama database, schema, dan storage key. Pergantian host/port/profil menghasilkan penyimpanan terpisah; port acak runner browser sengaja terisolasi. Jangan mengandalkan incognito untuk data kerja. Browser cleanup/HP rusak dapat menghilangkan data; persistent storage bukan jaminan data tetap tersedia dan UI tidak menyediakan pemulihan metadata lengkap.
- Jika IndexedDB atau validasi database gagal, input dinonaktifkan dan pesan tampil. Tidak ada tombol backup/recovery JSON dalam UI. Jangan menghapus data browser; pemulihan metadata memerlukan penanganan teknis di luar antarmuka aplikasi.
- Cache Destination menentukan snapshot terakhir yang berhasil tersimpan di IndexedDB. Error network atau quota tidak memperbarui waktu sinkronisasi. Service worker hanya menyimpan app shell, bukan respons Sheets.

## Struktur

- `index.html`, `styles.css`: tiga halaman utama, label, fokus, dialog, feedback, layout 360px–desktop.
- `js/`: 18 modul aplikasi dengan pembagian tanggung jawab existing, tanpa reorganisasi internal.
- `config.js`: URL Apps Script existing yang tetap publik; tidak ada kredensial.
- `manifest.webmanifest`, `sw.js`, `assets/icon*`, `.nojekyll`: PWA scope/asset relatif untuk `/RKEF-Ticketing/`. Icon SVG dan PNG dibuat lokal (`npm.cmd run icons`).
- `integration-test.html`: utility diagnostik terpisah, bukan halaman navigasi utama.
- `docs/`: dokumentasi requirements, development, testing, dan architecture; mulai dari [indeks dokumentasi](docs/README.md).
- Root: `README.md`, `AGENTS.md`, `package.json`, serta konfigurasi repository/editor.
- `apps-script/`: salinan backend kandidat lokal dengan API Checker tambahan, belum diterbitkan. Mengedit file lokal tidak memperbarui deployment `/exec`.
- `tests/`, `scripts/`: tes domain/tooling/browser, server dev/preview, generator ikon tanpa dependency.

## Batas verifikasi dan rilis

Manifest/service worker tersedia dan app shell diuji offline di Edge desktop localhost. Instalasi Android/Chrome pada HP target, clipboard/download HP, akses anonim Google, POST lintas-origin dan read-back dua HP **belum diuji live**. Pemilik perlu menyelesaikan [uji terima](docs/testing/LOCAL_TEST_RESULTS.md) sebelum pemakaian operasional.

Versi tampilan berasal dari `appVersion` di `config.js`; metadata paket v1.1.2 dan cache app shell `rkef-shell-v1.1.2-operational-layout` diselaraskan. Pada perubahan app shell berikutnya, perbarui versi cache `VERSION` di `sw.js` dan inventaris bila aset bertambah. Nama database, schema v1, storage key, dan identitas manifest tidak berubah. Draft lama tanpa mode: waktu sama dengan sumber dipulihkan AUTO, berbeda atau draft koreksi dipulihkan MANUAL; aksi mengetik ulang nilai sumber yang sama tidak tercatat pada format lama. Worker produksi baru menunggu tab versi lama ditutup; tidak memaksa refresh yang dapat mengganggu draft. Publikasi tetap tindakan owner.

Layout Operasional **v1.1.2** mempertahankan DT, waktu dan Note satu baris penuh; Stockpile / Pile ID dan Product Code / Destination sejajar dua kolom sampai 360px. Kontrol Edit membuka popup mapping lokal dengan pilih satu ketukan, Tambah dan Edit. Satu tombol Simpan ritase existing tetap di dalam form/fieldset, fixed di atas navbar, mengikuti batas konten desktop dan safe area. Tombol hilang di Setup/Report, selama dialog aplikasi terbuka, dan saat viewport menyusut karena keyboard pada input teks; kembali setelah kondisi tersebut selesai. Ruang scroll bawah ditambah. Deteksi keyboard berbasis resize/VisualViewport merupakan penanganan UI, bukan bukti uji keyboard Android fisik. Lihat [hasil pengujian lokal](docs/testing/LOCAL_TEST_RESULTS.md).

## Multi-Checker v1.1.1

Pada card Sesi operasional, tekan Nama Checker untuk checklist beberapa petugas, lalu OK atau Cancel. Pilihan lokal tidak menulis ke Sheets, mengganti sesi atau nomor, dan tidak menimpa snapshot transaksi sebelumnya. Nama lama satu Checker tetap kompatibel. Report menampilkan seluruh nama sesi, rekap tetap per Pile ID, WA tetap 11 kolom.

Edit Checker menyediakan Add/Edit/Hapus master bersama `Checker_Crew`; Sync List Checker mengambil snapshot terbaru dari Sheets. Semua pengguna dapat mengelola master tanpa login, password atau kode akses sesuai keputusan owner terbaru. Endpoint anonim dapat diubah oleh siapa pun yang mengetahuinya; validasi nama, lock, request_id, versi daftar dan soft delete tetap berlaku.

Offline tetap dapat memilih cache. Kegagalan jaringan/read-back mempertahankan cache lama. Request mutasi disimpan di IndexedDB sebelum POST; hasil yang belum pasti tetap memakai request_id semula setelah reload, melalui Cek read-back/Kirim ulang ID sama pada popup Edit Checker. Tidak ada POST otomatis saat reload/online. Konflik meminta peninjauan ulang atas data terbaru; perubahan master tidak mengubah pilihan sesi atau histori.

Respons GET live sudah dibaca pada 26 Oktober 2026: 17 Checker, field `revision`, `list_version`, serta status datar. Tab existing A:F: `Nama`, `checker_id`, `is_active`, `updated_at_utc`, `revision`, `request_id`. Tidak ada inisialisasi ulang atau penggantian ID. Owner telah mengonfirmasi bahwa Add/Edit/Hapus memakai hash list_version sebagai expected_version; implementasi lokal sudah sesuai. Kesamaan seluruh kode deployment belum diverifikasi dari source live. POST Google serta Android tetap **NOT VERIFIED**. Perubahan backend lokal tidak memperbarui deployment. Lihat [kontrak Checker](docs/development/CHECKER_API.md).

### Popup material lokal v1.1.2

Di Operasional, tekan Stockpile / Pile ID untuk memilih satu pasangan. Edit Daftar menyediakan Add/Edit empat field (Stockpile, Pile ID, Product Code, Destination) dan Hapus dengan konfirmasi. Pile baru boleh dibuat tanpa Source Code atau laporan sebelumnya. Destination memakai cache Google; Product Code boleh memakai nilai lokal baru. Perubahan pasangan hanya tersimpan lokal, tidak dikirim ke Google.

Product Code/Destination otomatis mengikuti pasangan; override manual per transaksi tetap tersedia dan bertahan pada rerender. Popup kanan menyediakan pilih/Tambah/Edit mapping lokal; edit master mempertahankan ID dan memperbarui relasi Stockpile/Pile terkait untuk input berikutnya. Pasangan belum lengkap boleh disimpan, tetapi ritase memerlukan mapping aktif. Product Code baru adalah nilai sebelumnya disebut Dome (`SCZ-1190`), tetap kolom 8; Product Code numerik legacy kolom 7 tidak wajib. Export WA tepat 11 kolom TAB dengan kolom 3, 6 dan 7 kosong. Impor kolom 3/7 lama tetap diterima tanpa mengubah snapshot histori. Lihat [mapping material dan TSV](docs/development/MATERIAL_MAPPING.md). Edit/Hapus master tidak mengubah histori; Mulai Sesi Baru tetap menghapus semua pasangan lokal dan hanya menyisakan cache Checker/Destination. Lihat [kontrak operasional](docs/requirements/RKEF_OPERATIONAL_SPEC.md#16-popup-stockpile--pile-id-v112-26-oktober-2026).
