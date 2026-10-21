# Setup VS Code + GitHub untuk RKEF Ticketing

**Target folder Windows**: `D:\Workspace\RKEF Ticketing`  
**Repository yang SUDAH ada**: https://github.com/sascartimothy/RKEF-Ticketing  
**Apps Script yang Anda deploy**: https://script.google.com/macros/s/AKfycbw_UKTsxY6Pl2oaUnzr5K38usn2wGwcDG75xtvVIjADUugPp79QJdTAzZ6qIXjHJIAtBQ/exec  
**Master Destination Google Sheet**: https://docs.google.com/spreadsheets/d/1iTs3-TJT8xCXWVUANEtk6MOxP25HjqkH-JHdTKnY1kE/edit  

## A. Persiapan editor (sekali saja)

1. Instal **Visual Studio Code**, **Git for Windows**, dan **Node.js LTS** bila belum tersedia. Restart VS Code setelah instalasi.
2. Buka VS Code → **File → Open Folder** → `D:\Workspace\RKEF Ticketing`.
3. Ekstrak **seluruh isi** ZIP workspace ke folder tersebut, sehingga `package.json` berada tepat di root dan `docs/index.html` berada di subfolder `docs/`. Jangan membuat folder ganda `RKEF_Ticketing_VSCode_Workspace_v1.0` di dalam folder root.
4. Di Extensions (Ctrl+Shift+X), instal **Codex** resmi dari OpenAI (extension ID `OpenAI.chatgpt`) dan masuk memakai akun ChatGPT. Jangan minta Codex coding PWA dulu; ini baru integration gate.
5. Buka Terminal VS Code: **Terminal → New Terminal**. Pastikan PowerShell berjalan pada root folder.

## B. Uji folder sebelum GitHub

```powershell
Set-Location 'D:\Workspace\RKEF Ticketing'
node --version
git --version
npm test
npm run dev
```

Buka `http://127.0.0.1:4173/` di PC untuk tes *read-only*; URL Apps Script sudah otomatis terisi. `npm test` menguji kontrak Apps Script terhadap Google Sheets tiruan dan memeriksa file workspace. Tidak ada penulisan Google Sheets dalam tes mock ini.

Stop server dengan Ctrl+C.

## C. Hubungkan folder ke repository GitHub yang SUDAH dibuat

Gunakan langkah ini **hanya jika folder belum menjadi Git repository** (cek: `git status`).

```powershell
Set-Location 'D:\Workspace\RKEF Ticketing'
git init -b main
git remote add origin https://github.com/sascartimothy/RKEF-Ticketing.git
git remote -v
git status
```

Jika `git init -b main` mengatakan repo sudah ada, jangan reset. Jika `git remote add origin` mengatakan remote sudah ada, jalankan `git remote -v` dan cocokkan dengan URL di atas; jangan menimpa remote lain tanpa memeriksa.

Atur identitas commit Git bila belum ada (gunakan nama dan email GitHub Anda sendiri, bukan nilai contoh):

```powershell
git config --global user.name 'NAMA GITHUB ANDA'
git config --global user.email 'EMAIL GITHUB ANDA'
```

Commit dan push:

```powershell
git add .
git commit -m 'chore: bootstrap RKEF Ticketing integration gate'
git push -u origin main
```

Jika push membuka jendela login browser GitHub, selesaikan autentikasi. **Jangan memakai `Publish to GitHub`** dari VS Code karena repository sudah ada (itu membuat repository baru). VS Code memiliki alur login GitHub bawaan ketika clone/push membutuhkan autentikasi.

Jika push menolak karena repository ternyata sudah berisi commit baru, hentikan dan periksa Git history sebelum pull/rebase (jangan force-push).

## D. Aktifkan GitHub Pages

Buka https://github.com/sascartimothy/RKEF-Ticketing/settings/pages → **Build and deployment** → **Deploy from a branch** → `main` → `/docs` → Save. Tunggu GitHub menampilkan URL site.

Target halaman uji (bukan klaim bahwa sudah aktif):

`https://sascartimothy.github.io/RKEF-Ticketing/`

Untuk memvalidasi akses anonim, buka dari HP *tanpa login Google* atau tab incognito:

1. Tekan **Tes akses anonim**; hasil harus `ok: true` dengan versi layanan.
2. Tekan **Baca Destination**; baseline awal berisi 24 record aktif, kecuali sudah diubah.
3. Dengan persetujuan untuk menambah baris uji nyata, tekan **Kirim tambah Destination**. Pastikan read-back menunjukkan `PASS` dan periksa baris Google Sheets.
4. Ulang baca dari HP kedua, pastikan Destination baru terlihat.
5. Setelah itu hapus/nonaktifkan record uji dari Google Sheets.

`POST` dari browser lintas-origin **belum terverifikasi berhasil**, sehingga tes nomor 3 adalah langkah wajib sebelum implementasi utama. Jika hanya GET yang bekerja, jangan mengklaim integrasi siap; laporkan error browser/Apps Script Executions agar desain disesuaikan.

## E. Mengubah Apps Script setelah deployment

Mengedit `apps-script/Code.gs` lokal **tidak mengubah Apps Script online**. Perubahan perlu ditempel ke editor online dan deploy ulang versi: **Deploy → Manage deployments → Edit → New version**. Setelah redeploy, uji GET dan POST lagi.

## F. Sebelum prompt Codex

- Kunci nama timbangan dan daftar checker, batas shift dan zona waktu operasional, aturan jika laporan WA terpotong, serta backup data lokal.
- Pastikan setidaknya satu HP nyata lulus uji GET/POST dan read-back, lalu uji cross-device.
- Baru jalankan `CODEX_ONE_SHOT_PROMPT.md` pada Codex di VS Code.

## Peringatan kapasitas dan akses

Endpoint Apps Script memakai hak owner Google Sheets dan bisa ditulis secara anonim oleh siapa pun yang mengetahui URL. Anda telah memilih tanpa login; jaga agar hanya Destination yang dapat ditambahkan, tetap pakai validasi nama, lock, duplicate check, rate/abuse monitoring, dan backup master. Backup ritase lokal perlu dirancang karena GitHub Pages bukan tempat menyimpan data lokal HP.
