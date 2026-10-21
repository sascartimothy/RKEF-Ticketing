# RKEF Ticketing

PWA HTML/CSS/vanilla JavaScript dengan tepat tiga halaman utama: **Setup**, **Operasional**, **Report**. Implementasi penuh lokal diizinkan owner pada **21 Oktober 2026**. Belum ada klaim penerimaan operasional Android atau integrasi Google Sheets live.

**LOCAL ONLY.** Aplikasi berjalan langsung dari root repository tanpa build. Owner menangani Git, pengaturan Pages, dan deployment sendiri.

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

1. **Setup:** isi tanggal operasi, shift, timbangan, checker. Day/Night dapat dikoreksi atau ditambah tanpa asumsi jam. Tidak ada nama timbangan/checker resmi yang diisi otomatis. Teks timbangan/checker yang Anda isi secara eksplisit menjadi pilihan lokal.
2. Tempel laporan WA sebelumnya, periksa setiap baris dan mapping, lengkapi shift/checker asal, lalu sahkan baris terpilih. Impor menjadi **histori terpisah** dan membentuk pilihan material dari handover terbaru. Dialog merinci jumlah pilihan khusus handover lama yang akan dinonaktifkan; tambahan/koreksi lokal tetap aktif. Baris salah tetap ditampilkan; keputusan mengecualikannya dicatat. Laporan persis sama tidak diimpor dua kali. Untuk memasukkan baris yang sebelumnya dikecualikan, periksa lalu impor laporan yang dikoreksi secara eksplisit; sumber master mengikuti baris laporan terakhir yang disahkan.
3. Tambahkan/koreksi pasangan Stockpile/Pile/Source dan Product/Dome/Destination di pilihan lokal. Mapping bertentangan ditandai; koreksi atau nonaktifkan pilihan yang salah. Mengedit master tidak mengubah snapshot transaksi.
4. Refresh Destination untuk membaca snapshot Sheets. Tambah master bersama adalah tindakan eksplisit terpisah; hanya `action`, `name`, `request_id` dikirim. Status sukses membutuhkan GET read-back ID yang cocok. Permintaan tertunda bertahan setelah refresh; gunakan cek read-back atau retry ID yang sama.
5. **Operasional:** pilih pasangan cepat atau autocomplete, isi DT dan waktu HH.mm, simpan. Waktu awal mengikuti perangkat ketika form baru dibuka. Edit manual tidak ditimpa; tanggal tetap tanggal sesi. Draft, record, snapshot asli, dan log koreksi disimpan di IndexedDB. Koreksi memakai sesi asli transaksi.
6. **Report:** filter tanggal/shift/timbangan/checker/stockpile/dome/destination dan sumber data. Default input lokal sesi aktif; histori impor tidak otomatis ikut. Salin atau unduh TSV tanpa header, persis 11 kolom, kolom ke-6 kosong. Ringkasan hanya jumlah ritase.
7. Unduh **backup JSON lengkap** berkala dan periksa file unduhan benar-benar ada. Restore memvalidasi struktur, mempertahankan ID, dan atomik. Mode gabung menolak ID berisi data berbeda; mode ganti menawarkan backup sebelum konfirmasi mengganti seluruh data.

## Penyimpanan dan pemulihan

- IndexedDB `rkef-ticketing`, schema v1: `records`, `masters`, `settings`, `cache`, `audit`, `imports`, `pending`. Transaksi ritase dan audit disimpan atomik. Penghapusan menggunakan tombstone agar jejak tetap tersedia dalam backup.
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

Pada perubahan isi app shell berikutnya, naikkan `VERSION` di `sw.js` dan daftar asset bila bertambah. Restrukturisasi ini memindahkan semua file frontend byte-for-byte tanpa menaikkan versi cache. Worker produksi baru menunggu tab versi lama ditutup; tidak memaksa refresh yang dapat mengganggu draft. Publikasi tetap tindakan owner.
