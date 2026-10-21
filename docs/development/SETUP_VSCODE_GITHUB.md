# Setup lokal VS Code — RKEF Ticketing

**Status 21 Oktober 2026:** build PWA penuh lokal diizinkan dan tersedia. Instruksi pre-build/HOLD lama digantikan izin owner. Tidak ada tindakan Git, perubahan GitHub, Pages settings, atau deployment dalam pekerjaan ini.

## Menjalankan

```powershell
Set-Location 'D:\Workspace\RKEF-Ticketing'
$env:Path = 'D:\Workspace\Tool\nodejs;' + $env:Path
npm.cmd run build
npm.cmd test
npm.cmd run dev
```

Buka http://127.0.0.1:4173/RKEF-Ticketing/ di PC. Server loopback hanya untuk PC ini. Gunakan Ctrl+C untuk berhenti. Node.js minimum 22, tanpa dependency yang perlu diunduh. Dengan Chrome/Edge terpasang, `npm.cmd run test:browser` membangun ulang, lalu menguji UI, IndexedDB dan offline memakai server produksi pada port kosong, profil sementara, dan blokir request Google.

Edit `src/` sebagai source otoritatif. `dist/` adalah output build yang tetap dilacak Git; jangan diedit manual atau dipakai menyimpan data. `npm.cmd run dev` membangun ulang saat request; setelah menyimpan source, reload browser. Tidak ada watcher/live reload. Worker dev hanya memakai jaringan sehingga cache tidak menutupi perubahan, tanpa menghapus IndexedDB. Saat beralih dari worker preview lama ke dev, tunggu update worker lalu reload sekali. Untuk uji offline produksi gunakan `npm.cmd run preview` (build sekali saat mulai; restart setelah edit), atau tes browser otomatis. Rincian pipeline ada di [README.md](../../README.md).

## Konfigurasi editor

`.vscode/tasks.json` menyediakan task build, test dan dev. Gunakan server npm untuk base path serta rebuild yang konsisten. Jika Node Portable belum ada di PATH VS Code, jalankan perintah di atas dari terminal yang sama, atau tambahkan folder Node ke PATH pengguna secara manual. Jangan menyalin data Excel/WA pribadi, backup, atau kredensial ke sumber publik; `private-data/`, `exports/`, dan `backups/` diabaikan Git.

## Git dan publikasi

Repository rencana: https://github.com/sascartimothy/RKEF-Ticketing. Output build kini `dist/`; `docs/` khusus dokumentasi. Rencana lama Pages branch `main` + `/docs` belum disesuaikan. URL publik tetap `/RKEF-Ticketing/`; publikasi dist/ memerlukan tindakan owner secara terpisah. Semua tautan asset, scope PWA, dan server lokal mendukung subpath tersebut. Owner sendiri melakukan review, Git, dan pengaturan hosting; panduan ini tidak memberikan instruksi untuk menjalankannya dalam sesi lokal.

## Penerimaan sebelum operasi

Nama timbangan/checker, pasangan material dan daftar shift diisi/diperiksa operator di Setup; tidak ada timbangan kedua atau jam shift yang dikarang. Tes lokal bukan pengganti HP target. Lihat [laporan pengujian](../testing/LOCAL_TEST_RESULTS.md) untuk bukti tes lokal dan checklist pengujian Android/Sheets yang belum selesai.

## Dokumentasi proyek

Lihat [indeks dokumentasi](../README.md), [PRD](../requirements/PRD_RKEF_Ticketing_v0.9.md), dan [struktur serta batas hosting](../architecture/PROJECT_STRUCTURE.md#hosting). `npm.cmd run check:docs` memeriksa tautan lokal; `npm.cmd test` juga menjalankannya.
