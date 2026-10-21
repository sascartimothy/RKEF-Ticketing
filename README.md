# RKEF Ticketing

PWA HTML/CSS/vanilla JavaScript dengan tepat tiga halaman utama: **Setup**, **Operasional**, **Report**. Implementasi penuh lokal diizinkan owner pada **21 Oktober 2026**. Belum ada klaim penerimaan operasional Android atau integrasi Google Sheets live.

**LOCAL ONLY.** Aplikasi berjalan langsung dari root repository tanpa build. Owner menangani Git, pengaturan Pages, dan deployment sendiri.

[Spesifikasi operasional terbaru](docs/requirements/RKEF_OPERATIONAL_SPEC.md) adalah acuan utama keputusan operasional yang telah dikonfirmasi dan wajib dibaca sebelum mengubah logic input, handover, numbering, atau export. Setup **v1.1.0** kini memvalidasi laporan 11 kolom bersuffix, mendeteksi sesi berikutnya, dan mengaktifkannya otomatis setelah paste lengkap yang valid tanpa konflik. Operasional **v1.1.1** kini menyimpan nomor Opsi B berdasarkan waktu pada sesi aktif, koreksi via popup, input unit SAP, dan riwayat ringkas. Exporter memakai suffix nomor tersimpan; kontrak Report lengkap/filter dan finalisasi masih terbuka. OPEN DECISION tetap mengikuti spesifikasi.

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

Server Node built-in membaca hanya 26 file dalam `FRONTEND_FILES` di `scripts/public-files.cjs`. Server tidak membuat, menyalin, membersihkan, atau mengubah file aplikasi. Akses file lain, directory listing, traversal path, serta symlink/junction pada path publik ditolak. `private-data/`, `.env`, `.git/`, backend, dokumen, tes, dan tooling tidak dilayani localhost. Jika menambah aset/modul publik, perbarui inventaris server dan precache produksi sesuai kebutuhan.

Dev membaca file saat request, tanpa watcher atau live reload. Untuk menghindari cache worker menutupi perubahan, respons `sw.js` pada mode dev menggunakan worker jaringan saja yang langsung aktif; respons ini hanya di memori dan tidak menyentuh IndexedDB. Saat pertama berpindah dari preview/worker lama ke dev, tunggu update worker lalu reload sekali. Dev memerlukan server aktif. Gunakan `preview` atau `test:browser` untuk perilaku offline produksi; worker produksi dapat mempertahankan aset cache sampai pembaruan worker aktif. Buka URL localhost, bukan `index.html` lewat `file://`.

Allowlist server lokal **tidak membatasi publikasi GitHub Pages**. Saat root dipublikasikan, file repository yang dilacak dapat tersedia melalui hosting. `private-data/`, `backups/`, `exports/`, dan kredensial diabaikan Git; owner harus memastikan file privat tidak pernah dilacak atau diunggah sebelum publikasi. `config.js` adalah konfigurasi publik tanpa rahasia.

## Alur pemakaian

1. **Setup v1.1.0:** empat card vertikal pada HP dan desktop: **Handover manual → Sesi operasional → Master bersama (Destination) → Informasi versi aplikasi**. Card Pilihan Lokal dan Sebelum Mulai dihapus. Service master lokal, data, dan mapping tetap tersedia; editing master tidak dipindahkan ke Operasional.
2. Tempel **laporan lengkap satu shift**, tepat 11 kolom TAB, kolom keenam kosong, kolom pertama serial + suffix positif minimum tiga digit. Paste memicu parse, validasi penuh, simpan atomik, dan aktivasi tanpa tombol/checkbox/konfirmasi tambahan. Mengetik, reload, dan pemulihan draft tidak memicu impor. Status ringkas menampilkan hasil atau alasan penolakan. Awal `001`: DS → NS tanggal sama, nomor terakhir + 1; awal lain: NS → DS tanggal berikutnya, mulai `001`. Jam transaksi tidak menentukan shift. Waktu sumber `7.2`/`7.20` = `07.20`, `15` = `15.00`; satu digit menit berarti puluhan menit, rentang jam 00-23 dan menit 00-59. Nilai sumber asli dipertahankan. Campuran BDM/ONI menolak seluruh impor. Baris rusak, tanggal campuran, nomor ganda/gap/tidak urut, format lama, dan waktu di luar format/rentang yang disahkan ditampilkan tanpa diperbaiki atau diimpor sebagian. Pemulihannya menunggu keputusan owner.
   **Mulai Sesi Baru** pada card Handover manual melakukan reset penuh sesi aktif setelah satu popup **Batal / Hapus Sesi & Mulai Baru**. Ritase lokal sesi aktif (termasuk tombstone), audit transaksinya, draft dan counter sesi dihapus atomik. Penghapusan permanen dari database aktif; pemulihan memerlukan backup sebelumnya. Histori/receipt impor WA, master, cache Destination, konfigurasi dan transaksi sesi/timbangan/shift/tanggal lain tetap tersimpan. Aturan lama yang hanya mengakhiri sesi dan membersihkan draft **DIGANTIKAN**. Autosave dituntaskan; simpan/koreksi/handover berjalan menahan reset, tab stale ditolak. Identitas ambigu menolak penghapusan. Laporan yang sama dapat mengaktifkan sesi kembali tanpa duplikasi; nomor yang telah dibuang tidak menghalangi handover, tetapi konflik nyata di luar scope reset tetap diblokir. Checker sesi baru diisi manual.

3. Handover otomatis menyimpan histori sumber, nomor sumber, mapping, receipt, audit, dan sesi secara atomik. Impor identik tidak menggandakan histori, mapping, atau receipt; setelah Mulai Sesi Baru, laporan yang pernah dipakai tetap dapat mengaktifkan sesi aman dengan checker kosong. Operator memeriksa tanggal, shift, timbangan, dan nomor berikutnya di card Sesi Operasional. Paste ulang pada sesi sama tanpa konflik mempertahankan checker dan counter. Konflik nyata tetap diblokir tanpa overwrite; receipt bukan alasan penolakan tersendiri. Konflik identitas, draft aktif, input lokal pada sesi tujuan, atau kemunduran persiapan timbangan ditahan untuk OD-06. Tambahan master lokal tetap aktif; pilihan khusus handover lama yang tidak ada di laporan baru dinonaktifkan sesuai mekanisme existing. Checker tidak terdapat di TSV; operator mengisi namanya secara manual di Sesi operasional. Checker kosong boleh mengaktifkan sesi, tetapi ritase baru tetap memerlukan checker valid. Tidak ada checker/tanggal/shift bootstrap yang dibuat otomatis; sesi existing tetap tersimpan dan ditandai belum diverifikasi handover.
4. Refresh Destination untuk membaca snapshot Sheets. Tambah master bersama adalah tindakan eksplisit terpisah; hanya `action`, `name`, `request_id` dikirim. Status sukses membutuhkan GET read-back ID yang cocok. Permintaan tertunda bertahan setelah refresh; gunakan cek read-back atau retry ID yang sama.
5. **Operasional v1.1.1:** isi nomor unit (`820` → `SAP_820`) atau kode lengkap non-SAP, pilih pasangan material yang disahkan, waktu, note opsional. Source/Product/Destination mengikuti pasangan; konflik ditahan. Save sukses menyiapkan form berikutnya. Riwayat sesi aktif default lima, Lihat Semua mengembang inline, pencarian tersedia. Koreksi via popup mempertahankan draft baru dan UUID. Nomor tersimpan mengikuti urutan waktu Opsi B, mulai nomor handover; perubahan peer diaudit dan atomik. AUTO mengikuti jam perangkat setiap detik (`HH.mm.ss`) dan menangkap waktu/tanggal tepat saat Simpan dimulai, sebelum proses async. Ketik angka untuk MANUAL: `720`/`0720` → `07.20`, `72035`/`072035` → `07.20.35`, `142530` → `14.25.30`. Notasi `7.2` → `07.20` dan jam bulat `15` → `15.00` tetap diterima. Angka mentah dipertahankan selama mengetik agar kursor/backspace stabil; titik ditambahkan otomatis saat keluar field atau saat simpan. Jam AUTO terseleksi agar digit pertama langsung mengganti nilainya. Kosong/whitespace kembali AUTO. Popup Koreksi menerima angka yang sama, menampilkan waktu historis statis, dan menolak waktu kosong. Draft manual mentah/parsial dipulihkan tanpa ditimpa jam; nilai invalid tidak dapat disimpan sebagai ritase. Fokus tidak menghentikan jam dan tick tidak menulis draft. Reload mempertahankan mode; form berikutnya kembali AUTO. Nomor kronologis memakai detik bila tersedia; waktu menit tetap presisi menit, dengan tie-breaker `createdAt` lalu UUID. NS hanya memakai tanggal perangkat tertangkap saat Simpan AUTO; koreksi waktu/tanggal NS ambigu diblokir (OD-10). Data lama tanpa metadata numbering tidak dimigrasi dengan tebakan.
6. **Report:** UI/filter tetap; record bernomor menggunakan serial + suffix aktual tersimpan, tanpa nomor baru saat ekspor. Data lama tanpa nomor tetap serial saja dan belum valid untuk handover baru. Nomor sesi aktif dapat berubah setelah koreksi; aplikasi tidak mengetahui apakah laporan sudah dikirim WA. Finalisasi/penguncian, laporan lengkap saat filter, dan campuran timbangan masih kesenjangan; jangan mengklaim output final memenuhi seluruh kontrak. Default input lokal sesi aktif; histori impor tidak otomatis ikut. WA membuang detik tanpa pembulatan (`14.25.59` menjadi `14.25`, `23.59.59` menjadi `23.59`); detik database tetap utuh. Backup JSON mempertahankan semua metadata, termasuk presisi waktu; histori menit tidak dianggap memiliki detik teramati.
7. Unduh **backup JSON lengkap** berkala dan periksa file unduhan benar-benar ada. Restore memvalidasi struktur, mempertahankan ID, dan atomik. Mode gabung menolak ID berisi data berbeda; mode ganti menawarkan backup sebelum konfirmasi mengganti seluruh data.

## Penyimpanan dan pemulihan

- IndexedDB `rkef-ticketing`, schema v1: `records`, `masters`, `settings`, `cache`, `audit`, `imports`, `pending`. Transaksi, counter, perubahan nomor peer, dan audit disimpan atomik. Field additive memakai schema/store tetap; backup membawa semua metadata. Penghapusan satu ritase bernomor diblokir (OD-02); reset penuh sesi merupakan pengecualian eksplisit owner; tombstone lama tetap tersedia dalam backup.
- UUID mengidentifikasi ritase; DT No bukan ID unik. Dua baris identik ditandai sebagai kemungkinan duplikat, boleh disimpan setelah konfirmasi.
- Hanya Destination yang shared lewat Sheets. Dua HP tidak menyinkronkan ritase otomatis; handover manual lewat WA. Teks WA tidak membawa UUID, checker, shift, note, atau audit; JSON mempertahankan semuanya.
- IndexedDB terikat origin (scheme, host, port), profil browser, dan perangkat; path saja tidak memisahkan database. Refactoring ini mempertahankan origin/path hosting, nama database, schema, dan storage key. Pergantian host/port/profil menghasilkan penyimpanan terpisah; port acak runner browser sengaja terisolasi. Jangan mengandalkan incognito untuk data kerja. Browser cleanup/HP rusak dapat menghilangkan data; permintaan persistent storage tidak menggantikan backup.
- Jika IndexedDB atau validasi database gagal, input dinonaktifkan dan pesan tampil. Jika database masih bisa dibaca, tombol backup menyediakan JSON pemulihan mentah. Jangan menghapus data browser sebelum mengekspor dan meninjau backup.
- Cache Destination menentukan snapshot terakhir yang berhasil tersimpan di IndexedDB. Error network atau quota tidak memperbarui waktu sinkronisasi. Service worker hanya menyimpan app shell, bukan respons Sheets.

## Struktur

- `index.html`, `styles.css`: tiga halaman utama, label, fokus, dialog, feedback, layout 360px–desktop.
- `js/`: 16 modul aplikasi dengan pembagian tanggung jawab existing, tanpa reorganisasi internal.
- `config.js`: URL Apps Script existing yang tetap publik; tidak ada kredensial.
- `manifest.webmanifest`, `sw.js`, `assets/icon*`, `.nojekyll`: PWA scope/asset relatif untuk `/RKEF-Ticketing/`. Icon SVG dan PNG dibuat lokal (`npm.cmd run icons`).
- `integration-test.html`: utility diagnostik terpisah, bukan halaman navigasi utama.
- `docs/`: dokumentasi requirements, development, testing, dan architecture; mulai dari [indeks dokumentasi](docs/README.md).
- Root: `README.md`, `AGENTS.md`, `package.json`, serta konfigurasi repository/editor.
- `apps-script/`: salinan backend existing, tidak diubah pada implementasi frontend ini. Mengedit file lokal tidak memperbarui deployment `/exec`.
- `tests/`, `scripts/`: tes domain/tooling/browser, server dev/preview, generator ikon tanpa dependency.

## Batas verifikasi dan rilis

Manifest/service worker tersedia dan app shell diuji offline di Edge desktop localhost. Instalasi Android/Chrome pada HP target, clipboard/download HP, akses anonim Google, POST lintas-origin dan read-back dua HP **belum diuji live**. Pemilik perlu menyelesaikan [uji terima](docs/testing/LOCAL_TEST_RESULTS.md) sebelum pemakaian operasional.

Versi tampilan berasal dari `appVersion` di `config.js`; metadata paket v1.1.1 dan cache app shell `rkef-shell-v1.1.1-manual-digits` diselaraskan. Pada perubahan app shell berikutnya, perbarui versi cache `VERSION` di `sw.js` dan inventaris bila aset bertambah. Nama database, schema v1, storage key, dan identitas manifest tidak berubah. Draft lama tanpa mode: waktu sama dengan sumber dipulihkan AUTO, berbeda atau draft koreksi dipulihkan MANUAL; aksi mengetik ulang nilai sumber yang sama tidak tercatat pada format lama. Worker produksi baru menunggu tab versi lama ditutup; tidak memaksa refresh yang dapat mengganggu draft. Publikasi tetap tindakan owner.
