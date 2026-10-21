# RKEF Ticketing — Setup Google Apps Script dan GitHub Pages

**Tanggal:** 21 Oktober 2026  
**Dokumen:** Panduan pre-build v0.9  
**Status:** Script telah lolos tes lokal (mock); deployment dan pengujian HP **belum** dilakukan.

## 0. Yang sudah tersedia

- Master: https://docs.google.com/spreadsheets/d/1iTs3-TJT8xCXWVUANEtk6MOxP25HjqkH-JHdTKnY1kE/edit
- Tab: `MASTER_DESTINATION`; 24 Destination bawaan.
- Kolom A:H: `destination_id`, `destination_name`, `is_active`, `source`, `created_at_utc`, `updated_at_utc`, `updated_by`, `request_id`.
- Repository sudah ada: https://github.com/sascartimothy/RKEF-Ticketing (dilihat sebagai Public, branch `main`, masih kosong pada pemeriksaan terakhir).
- PWA operasional belum dibuat; hanya halaman pengujian infrastruktur di `/docs`.

## 1. Pasang Apps Script pada spreadsheet

1. Buka tautan Google Sheets di atas menggunakan akun pemilik yang memiliki akses edit.
2. Klik **Extensions → Apps Script**.
3. Hapus kode template `myFunction()` dari `Code.gs`; salin seluruh isi `apps-script/Code.gs` ke editor; simpan.
4. (Opsional) Aktifkan `Project Settings → Show appsscript.json manifest file in editor`, lalu tinjau `apps-script/appsscript.json`. **Jangan** menimpa manifest jika ada setting proyek lain yang harus dipertahankan; nilai akses web app diatur pada deployment juga.
5. Di dropdown fungsi, pilih `verifyInstallation`, lalu klik **Run**. Izinkan Apps Script menggunakan Google Sheets bila diminta oleh Google.
6. Lihat **Execution log**. Hasil awal yang diharapkan adalah `version 0.9.0` dan `count 24`. Jika berbeda, hentikan dan periksa kolom A:H serta data yang sudah ada.
7. Jangan menjalankan fungsi `addDestination_` secara manual; pengujian penambahan dilakukan melalui halaman tes setelah deploy.

## 2. Deploy web app tanpa login operator

1. Di Apps Script pilih **Deploy → New deployment → Web app**.
2. **Execute as:** Me / pemilik akun yang men-deploy.
3. **Who has access:** Anyone (termasuk akses anonim jika tersedia pada akun). Jika pilihan anonim tidak tersedia, kebijakan akun bisa membatasi deployment tanpa login; jangan klaim setup berhasil.
4. Klik **Deploy** dan selesaikan persetujuan izin Google untuk pemilik/deployer.
5. Salin URL yang berakhir dengan `/exec`. URL ini dipakai pada halaman uji; jangan memakai `/dev` sebagai endpoint operasional.
6. Saat kode diubah, gunakan **Deploy → Manage deployments → Edit → New version → Deploy**. Menyimpan script saja tidak otomatis memperbarui deployment versi yang dilayani `/exec`.

Referensi resmi: https://developers.google.com/apps-script/guides/web

## 3. Masukkan paket ini ke repository GitHub

Repository terkonfirmasi tetapi integrasi GitHub ChatGPT sempat memberi `403 Resource not accessible by integration` saat mencoba menulis file. Karena itu lakukan unggah dari PC/VS Code, bukan menganggap repo telah diisi.

Buka terminal VS Code, lalu:

```bash
git clone https://github.com/sascartimothy/RKEF-Ticketing.git
cd RKEF-Ticketing
# Salin seluruh ISI folder RKEF_Ticketing_Integration_v0.9 ke folder repo ini,
# sehingga docs/index.html berada di <repo>/docs/index.html.
git add .
git commit -m "chore: prepare Apps Script destination integration gate"
git push -u origin main
```

Jika autentikasi GitHub belum tersedia di Git, masuk melalui Git Credential Manager / VS Code GitHub account. Jangan menaruh password/token di file.

Pada GitHub, buka **Settings → Pages → Build and deployment → Deploy from a branch → `main` → `/docs` → Save**. Dokumen GitHub: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

Alamat uji yang **diharapkan setelah berhasil deploy**, belum terverifikasi live:

`https://sascartimothy.github.io/RKEF-Ticketing/`

Halaman index yang dipublikasikan saat ini khusus tes integrasi. Ketika Codex membangun PWA, halaman tersebut diganti dengan app `index.html` final.

## 4. Uji integrasi dari browser smartphone tanpa akun Google

Di HP A dan HP B buka URL GitHub Pages dari mode incognito/privat (tidak login Google):

1. Tempel URL Apps Script `/exec` pada field di halaman tes.
2. Klik **1. Tes akses anonim**. Harus menampilkan `{ "ok": true, "version": "0.9.0" }` (atribut lain dapat ikut muncul).
3. Klik **2. Baca Destination**. Harus menampilkan `count: 24` selama belum ada perubahan lain pada master.
4. Klik **3. Kirim tambah Destination** dengan nama contoh `TEST-RKEF-...` yang otomatis dibuat oleh halaman tes. Ini **benar-benar menambah baris** pada Google Sheets, jadi setelah uji hapus atau nonaktifkan baris tersebut.
5. Tunggu status `PASS` dengan `request_id` yang sama. Jika tidak muncul, hasilnya **BELUM TERVERIFIKASI**: cek Google Sheets dan **Executions** Apps Script. Jangan tambah berulang kali sebelum memeriksa.
6. Buka tab `MASTER_DESTINATION`, periksa baris baru: `PWA`, status `TRUE`, ada UUID `destination_id`, dan `request_id` sesuai.
7. Di HP B, klik **Baca Destination**: baris baru harus muncul. Setelah tes, hapus atau nonaktifkan baris uji; periksa jumlah kembali.
8. Coba mengetik nama duplikat yang sudah ada (misalnya `ZHN LINE 25`) untuk memeriksa tidak ada baris ganda. Halaman tes akan menolak sebelum mengirim; duplikasi serentak dilindungi server dan telah diuji secara unit, tetapi tes multi-device live belum dilakukan.
9. Bila operator memakai Safari iPhone, Firefox, atau browser lain, lakukan tes tambahan. Uji harus dilakukan pada browser yang benar-benar akan dipakai saat operasi.

## 5. Checklist sebelum satu kali implementasi Codex

- [ ] Script `verifyInstallation()` sukses dengan jumlah Destination yang benar.
- [ ] Web app `/exec` dapat dipanggil tanpa login operator.
- [ ] GET JSONP dari **origin GitHub Pages** sukses pada 2 HP target.
- [ ] POST form lintas-origin sukses dan *read-back* cocok `request_id`.
- [ ] Duplikasi dan error jaringan ditangani tanpa label sukses palsu.
- [ ] Record Destination ditambah oleh HP A dapat dilihat HP B melalui refresh.
- [ ] Konfirmasi nama dua timbangan, daftar checker, timezone/jam shift, dan kebutuhan T.Ksng.
- [ ] Konfirmasi mekanisme backup periodik data ritase lokal HP.
- [ ] Baru setelah semua lulus, kunci PRD dan jalankan satu prompt Codex.

## Catatan penting

- Endpoint yang bisa ditulis tanpa login **terbuka bagi siapa pun yang mengetahui URL**, bukan hanya pengguna UI PWA. Ini adalah konsekuensi permintaan anonymous access. Validasi, penolakan duplikat, dan LockService menjaga konsistensi dasar tetapi **bukan autentikasi**.
- JSONP dilakukan **hanya untuk GET data Destination**, tidak untuk operasi tulis. Google mendokumentasikan JSONP sebagai mekanisme baca lintas-origin tetapi mengingatkan agar tidak menggunakannya untuk informasi sensitif: https://developers.google.com/apps-script/guides/content
- POST menggunakan form HTML ke iframe dan dikonfirmasi melalui GET berikutnya; ini adalah **desain yang harus dibuktikan pada browser target** sebelum digunakan.
- Ritase dan data master lokal tetap berada di IndexedDB HP masing-masing dan **tidak tersinkronisasi secara live**. Handover hanya terjadi saat pengguna mengimpor/mengekspor WA.
