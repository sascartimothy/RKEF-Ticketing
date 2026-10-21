# Setup lokal VS Code — RKEF Ticketing

**Status 21 Oktober 2026:** build PWA penuh lokal diizinkan dan tersedia. Instruksi pre-build/HOLD lama digantikan izin owner. Tidak ada tindakan Git, perubahan GitHub, Pages settings, atau deployment dalam pekerjaan ini.

## Menjalankan

```powershell
Set-Location 'D:\Workspace\RKEF-Ticketing'
$env:Path = 'D:\Workspace\Tool\nodejs;' + $env:Path
npm.cmd test
npm.cmd run dev
```

Buka http://127.0.0.1:4173/RKEF-Ticketing/ di PC. Server loopback hanya untuk PC ini. Gunakan Ctrl+C untuk berhenti. Node.js minimum 22, tanpa dependency yang perlu diunduh. Dengan Chrome/Edge terpasang, `npm.cmd run test:browser` menguji file root, UI, IndexedDB dan offline memakai server dengan worker produksi pada port kosong, profil sementara, dan blokir request eksternal.

Edit frontend langsung di root: `index.html`, `styles.css`, `config.js`, `js/`, `assets/`, manifest, dan worker. Tidak ada `src/`, `dist/`, atau folder output lain. `npm.cmd run dev` membaca file saat request; simpan lalu refresh browser untuk melihat perubahan. Tidak ada build, copy pipeline, watcher, atau live reload. Worker dev hanya memakai jaringan, tanpa menghapus IndexedDB. Saat beralih dari worker preview lama ke dev, tunggu update worker lalu reload sekali. Untuk uji offline produksi gunakan `npm.cmd run preview` atau tes browser otomatis. Rincian ada di [README.md](../../README.md).

## Konfigurasi editor

`.vscode/tasks.json` menyediakan task test dan dev. Gunakan server npm yang membatasi file publik dan mendukung base path Pages; pengaturan Live Server lama sudah dihapus. Jika Node Portable belum ada di PATH VS Code, jalankan perintah di atas dari terminal yang sama, atau tambahkan folder Node ke PATH pengguna secara manual. Jangan menyalin data Excel/WA pribadi, backup, atau kredensial ke sumber publik; `private-data/`, `exports/`, dan `backups/` diabaikan Git dan tidak dilayani server lokal.

## Git dan publikasi

Repository: https://github.com/sascartimothy/RKEF-Ticketing. Keputusan final Pages adalah branch `main`, folder `/ (root)`, `.nojekyll` root, tanpa custom deployment Actions. URL publik tetap `/RKEF-Ticketing/`. Semua tautan asset, scope PWA, dan server lokal mendukung subpath tersebut. Owner sendiri melakukan review, Git, pengaturan hosting, dan publikasi. Allowlist localhost tidak mengatur akses Pages: file yang dilacak di repository harus aman untuk publikasi. Pengaturan hosting tidak diubah dalam sesi lokal.

## Penerimaan sebelum operasi

Nama timbangan/checker, pasangan material dan daftar shift diisi/diperiksa operator di Setup; tidak ada timbangan kedua atau jam shift yang dikarang. Tes lokal bukan pengganti HP target. Lihat [laporan pengujian](../testing/LOCAL_TEST_RESULTS.md) untuk bukti tes lokal dan checklist pengujian Android/Sheets yang belum selesai.

## Dokumentasi proyek

Lihat [indeks dokumentasi](../README.md), [PRD](../requirements/PRD_RKEF_Ticketing_v0.9.md), dan [struktur serta batas hosting](../architecture/PROJECT_STRUCTURE.md#hosting). `npm.cmd run check:docs` memeriksa tautan lokal; `npm.cmd test` juga menjalankannya.
