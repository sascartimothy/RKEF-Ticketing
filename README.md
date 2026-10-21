# RKEF Ticketing

PWA HTML/CSS/vanilla JavaScript dengan tepat tiga halaman utama: **Setup**, **Operasional**, **Report**. Implementasi penuh lokal diizinkan owner pada **21 Oktober 2026**. Belum ada klaim penerimaan operasional Android atau integrasi Google Sheets live.

**LOCAL BUILD ONLY.** Tidak ada commit, push, perubahan remote/GitHub/Pages, atau deployment Apps Script yang dilakukan. Owner menangani Git dan deployment sendiri.

## Buka di localhost

Dari PowerShell pada workspace:

```powershell
Set-Location 'D:\Workspace\RKEF Ticketing'
$env:Path = 'D:\Workspace\Tool\nodejs;' + $env:Path
npm.cmd test
npm.cmd run dev
```

Buka **http://127.0.0.1:4173/RKEF-Ticketing/** (root `/` juga tersedia). Server hanya mendengarkan loopback PC; ini bukan alamat yang bisa diakses HP lain. Ctrl+C menghentikan server. Tidak ada dependency NPM yang perlu dipasang. Node.js Portable v24 digunakan untuk tes; runner browser memerlukan Node dengan WebSocket bawaan dan Chrome/Edge lokal.

```powershell
npm.cmd run test:browser
```

Runner tersebut memakai profil Chrome/Edge sementara, data sintetis, dan memblokir seluruh request eksternal. Ia menguji IndexedDB nyata, UI, serta offline app shell di subpath Pages. Screenshot lokal tersimpan di `private-data/qa/` yang diabaikan Git. Detail: [LOCAL_TEST_RESULTS.md](LOCAL_TEST_RESULTS.md).

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
- Origin PC, path hosting, profil browser, dan perangkat berbeda mempunyai penyimpanan masing-masing. Jangan mengandalkan incognito untuk data kerja. Browser cleanup/HP rusak dapat menghilangkan data; permintaan persistent storage tidak menggantikan backup.
- Jika IndexedDB atau validasi database gagal, input dinonaktifkan dan pesan tampil. Jika database masih bisa dibaca, tombol backup menyediakan JSON pemulihan mentah. Jangan menghapus data browser sebelum mengekspor dan meninjau backup.
- Cache Destination menentukan snapshot terakhir yang berhasil tersimpan di IndexedDB. Error network atau quota tidak memperbarui waktu sinkronisasi. Service worker hanya menyimpan app shell, bukan respons Sheets.

## Struktur

- `docs/index.html`, `styles.css`: tiga halaman utama, label, fokus, dialog, feedback, layout 360px–desktop.
- `docs/js/`: `database`, `master-data`, `wa-parser`, `wa-exporter`, `time-date`, `validation`, `apps-script-api`, `state`, `navigation`, `ui-components`, dan modul UI per tanggung jawab.
- `docs/config.js`: URL Apps Script existing yang tetap publik; tidak ada kredensial.
- `docs/manifest.webmanifest`, `sw.js`, `assets/icon*`: PWA scope/asset relatif untuk `/RKEF-Ticketing/`. Icon SVG dan PNG dibuat lokal (`npm.cmd run icons`).
- `docs/integration-test.html`: utility diagnostik terpisah, bukan halaman navigasi utama.
- `apps-script/`: salinan backend existing, tidak diubah pada implementasi frontend ini. Mengedit file lokal tidak memperbarui deployment `/exec`.
- `tests/`, `scripts/`: tes Node, suite Chrome/Edge lokal, server statis, generator icon tanpa dependency.

## Batas verifikasi dan rilis

Manifest/service worker tersedia dan app shell diuji offline di Chrome desktop localhost. Instalasi Android/Chrome pada HP target, clipboard/download HP, akses anonim Google, POST lintas-origin dan read-back dua HP **belum diuji live**. Pemilik perlu menyelesaikan [uji terima](LOCAL_TEST_RESULTS.md) sebelum pemakaian operasional.

Tidak ada bundling: `docs/` merupakan sumber statis siap direview. Pada perubahan app shell berikutnya, naikkan `VERSION` di `sw.js` dan daftar asset bila bertambah. Worker baru menunggu tab versi lama ditutup; tidak memaksa refresh yang dapat mengganggu draft. Publikasi nanti tetap tindakan owner, bukan bagian build lokal ini.
