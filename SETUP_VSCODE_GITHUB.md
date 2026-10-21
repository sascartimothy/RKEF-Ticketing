# Setup lokal VS Code — RKEF Ticketing

**Status 21 Oktober 2026:** build PWA penuh lokal diizinkan dan tersedia. Instruksi pre-build/HOLD lama digantikan izin owner. Tidak ada tindakan Git, perubahan GitHub, Pages settings, atau deployment dalam pekerjaan ini.

## Menjalankan

```powershell
Set-Location 'D:\Workspace\RKEF Ticketing'
$env:Path = 'D:\Workspace\Tool\nodejs;' + $env:Path
npm.cmd test
npm.cmd run dev
```

Buka http://127.0.0.1:4173/RKEF-Ticketing/ di PC. Server loopback hanya untuk PC ini. Gunakan Ctrl+C untuk berhenti. Dengan Chrome/Edge terpasang, `npm.cmd run test:browser` menguji UI dan IndexedDB menggunakan profil sementara serta memblokir jaringan eksternal. Tidak ada dependency yang perlu diunduh.

## Konfigurasi editor

`.vscode/tasks.json` menyediakan task test dan dev. Jika Node Portable belum ada di PATH VS Code, jalankan perintah di atas dari terminal yang sama, atau tambahkan folder Node ke PATH pengguna secara manual. Jangan menyalin data Excel/WA pribadi, backup, atau kredensial ke sumber publik; `private-data/`, `exports/`, dan `backups/` diabaikan Git.

## Git dan publikasi

Repository rencana: https://github.com/sascartimothy/RKEF-Ticketing. Hosting rencana menggunakan folder `docs/` dengan base path `/RKEF-Ticketing/`. Semua tautan asset, scope PWA, dan server lokal mendukung subpath tersebut. Owner sendiri melakukan review, Git, dan pengaturan hosting; panduan ini tidak memberikan instruksi untuk menjalankannya dalam sesi lokal.

## Penerimaan sebelum operasi

Nama timbangan/checker, pasangan material dan daftar shift diisi/diperiksa operator di Setup; tidak ada timbangan kedua atau jam shift yang dikarang. Tes lokal bukan pengganti HP target. Lihat [LOCAL_TEST_RESULTS.md](LOCAL_TEST_RESULTS.md) untuk bukti tes lokal dan checklist pengujian Android/Sheets yang belum selesai.
