# RKEF Ticketing

PWA HTML/CSS/vanilla JavaScript dengan tepat tiga halaman utama: **Setup**, **Operasional**, **Report**. Implementasi penuh lokal diizinkan owner pada **21 Oktober 2026**. Belum ada klaim penerimaan operasional Android atau integrasi Google Sheets live.

**LOCAL BUILD ONLY.** Tidak ada commit, push, perubahan remote/GitHub/Pages, atau deployment Apps Script yang dilakukan. Owner menangani Git dan deployment sendiri.

## Buka di localhost

Dari PowerShell pada workspace:

```powershell
Set-Location 'D:\Workspace\RKEF-Ticketing'
$env:Path = 'D:\Workspace\Tool\nodejs;' + $env:Path
npm.cmd run build
npm.cmd test
npm.cmd run dev
```

Buka **http://127.0.0.1:4173/RKEF-Ticketing/** (root `/` juga tersedia). Server hanya mendengarkan loopback PC; ini bukan alamat yang bisa diakses HP lain. Ctrl+C menghentikan server. Tidak ada dependency NPM yang perlu dipasang. Minimum Node.js 22; tes sesi ini menggunakan Node Portable v24 dan Edge lokal. Baris PATH di atas hanya diperlukan jika Node portable tersebut belum ada di PATH.

```powershell
npm.cmd run test:browser
```

Runner membangun ulang output, membuka server produksi sendiri pada port kosong serta profil Chrome/Edge sementara, memakai data sintetis, dan memblokir request Google. Ia menguji IndexedDB nyata, UI, serta offline app shell di subpath Pages. Server dev yang sedang berjalan tidak digunakan ulang. Screenshot lokal tersimpan di `private-data/qa/` yang diabaikan Git. Detail: [laporan pengujian](docs/testing/LOCAL_TEST_RESULTS.md).

## Workflow source dan build

**Edit aplikasi hanya di `src/`. `dist/` adalah production build; `docs/` khusus dokumentasi proyek.** URL aplikasi tetap `/RKEF-Ticketing/`. Rencana publikasi lama dari branch `main`, folder `/docs`, belum disesuaikan dengan struktur ini; konfigurasi hosting dan deployment tetap tindakan owner. Tidak ada bundler, framework, dependency eksternal, atau perubahan API/data operasional.

`/dist/` diabaikan Git; commit mencakup source, dokumentasi, dan tooling. [Workflow Pages manual](.github/workflows/deploy-pages.yml) tersedia hanya melalui `workflow_dispatch` pada branch `main`: Node.js 24 membangun dan menguji aplikasi, lalu official GitHub Pages Actions mengunggah isi `dist/` termasuk `.nojekyll`. Tidak ada trigger push/PR. Owner perlu memilih **GitHub Actions** sebagai publishing source Pages dan menjalankan workflow sendiri setelah review; pengaturan tersebut belum diubah atau diverifikasi dan workflow belum dijalankan. Rujukan: [dokumentasi resmi GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

| Perintah | Perilaku |
|---|---|
| `npm.cmd run build` | Salin file publik `src/` ke `dist/`, buat `.nojekyll`, buang output lama |
| `npm.cmd run dev` | Build saat mulai dan sebelum setiap request aset; reload browser untuk melihat perubahan |
| `npm.cmd test` | Build otomatis, kontrak Apps Script mock, tes domain dari `src/`, tes tooling, pemeriksaan output |
| `npm.cmd run test:browser` | Build otomatis dan tes worker produksi/UI/IndexedDB pada server dan profil terisolasi |
| `npm.cmd run preview` | Build sekali saat mulai, lalu layani output dengan service worker produksi untuk uji offline |
| `npm.cmd run check:docs` | Periksa target, kapitalisasi path, dan anchor tautan Markdown lokal |
| `npm.cmd run icons` | Buat ulang PNG di `src/assets/`; lanjutkan dengan build atau reload dev |

Build memakai Node built-in dan daftar publik eksplisit `FRONTEND_FILES` di `scripts/build.cjs`: enam file frontend utama, 16 modul JS, tiga ikon, ditambah `.nojekyll` yang dibuat build. Isi file disalin byte-for-byte tanpa timestamp/transformasi. Build berulang menghasilkan isi dan nama file yang sama; bila sudah cocok, file tidak ditulis ulang. Semua input dibaca sebelum output dibersihkan; symlink/junction pada input atau output ditolak. Pembersihan hanya berada dalam `dist/`. **Jangan simpan data/backup atau perubahan manual di `dist/` karena build menggantinya.** File non-allowlist di `src/` tidak dipublikasikan; jangan menyimpan rahasia di source publik. Jika menambah aset/modul publik, perbarui allowlist dan precache produksi sesuai kebutuhan.

Dev memakai rebuild saat request, tanpa file watcher atau live reload. Jika source wajib tidak dapat dibaca atau build gagal, server mengembalikan error 500, bukan output lama. Untuk menghindari cache worker menutupi perubahan, respons `sw.js` pada mode dev menggunakan worker jaringan saja yang langsung aktif; ini hanya respons server, tidak ditulis ke `src/` atau `dist/`, dan tidak menyentuh IndexedDB. Saat pertama berpindah dari preview/worker lama ke dev, tunggu update worker lalu reload sekali. Dev memerlukan server aktif dan tidak menguji offline. Gunakan `preview` atau `test:browser` untuk perilaku PWA produksi; restart preview setelah perubahan source. Jangan membuka `dist/index.html` lewat `file://` atau mengandalkan Live Server untuk workflow subpath/rebuild ini.

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

- `src/index.html`, `styles.css`: tiga halaman utama, label, fokus, dialog, feedback, layout 360px–desktop.
- `src/js/`: 16 modul aplikasi dengan pembagian tanggung jawab existing, tanpa reorganisasi internal.
- `src/config.js`: URL Apps Script existing yang tetap publik; tidak ada kredensial.
- `src/manifest.webmanifest`, `sw.js`, `assets/icon*`: PWA scope/asset relatif untuk `/RKEF-Ticketing/`. Icon SVG dan PNG dibuat lokal (`npm.cmd run icons`).
- `src/integration-test.html`: utility diagnostik terpisah, bukan halaman navigasi utama.
- `dist/`: production build dari allowlist source, termasuk `.nojekyll`; tanpa dokumentasi internal.
- `docs/`: dokumentasi requirements, development, testing, dan architecture; mulai dari [indeks dokumentasi](docs/README.md).
- Root: `README.md`, `AGENTS.md`, `package.json`, serta konfigurasi repository/editor.
- `apps-script/`: salinan backend existing, tidak diubah pada implementasi frontend ini. Mengedit file lokal tidak memperbarui deployment `/exec`.
- `tests/`, `scripts/`: tes domain/tooling/browser, build, server dev/preview, generator ikon tanpa dependency.

## Batas verifikasi dan rilis

Manifest/service worker tersedia dan app shell diuji offline di Edge desktop localhost. Instalasi Android/Chrome pada HP target, clipboard/download HP, akses anonim Google, POST lintas-origin dan read-back dua HP **belum diuji live**. Pemilik perlu menyelesaikan [uji terima](docs/testing/LOCAL_TEST_RESULTS.md) sebelum pemakaian operasional.

Pada perubahan isi app shell berikutnya, naikkan `VERSION` di `src/sw.js` dan daftar asset bila bertambah, lalu build. Refactoring ini menyalin worker produksi tanpa perubahan isi sehingga tidak menaikkan versi cache. Worker produksi baru menunggu tab versi lama ditutup; tidak memaksa refresh yang dapat mengganggu draft. Publikasi nanti tetap tindakan owner, bukan bagian build lokal ini.
