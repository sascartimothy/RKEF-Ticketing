# RKEF Ticketing — PRD v0.9 (Pre-Build Integration Gate)

**Tanggal:** 21 Oktober 2026  
**Status:** DRAFT, arsitektur disepakati; Apps Script live/browser belum diuji.  
**Basis:** Workbook `Form-Daily_ROS_Production_Smartphone (Update 250826) v2.xlsx`, sheet `Name`, `Valid Data`, `Ritase`, `T.Ksng`, `Sum`, dan sampel 428 baris ritase WhatsApp. PRD ini meneruskan keputusan v0.8 tanpa mengubah kebutuhan operasional.

## 1. Keputusan final arsitektur v1

- PWA **HTML, CSS, JavaScript** murni; tiga halaman utama **Setup, Operasional, Report**.
- Hosting GitHub Pages dari repo `https://github.com/sascartimothy/RKEF-Ticketing`, rencana branch `main` folder `/docs`.
- Tidak ada Firebase atau backend ritase: dua HP menyimpan ritase pada **IndexedDB lokal masing-masing**.
- Sinkronisasi ritase **manual melalui teks WhatsApp** pada shift handover. Tidak ada live sharing ritase antar-HP.
- **Google Sheets hanya MASTER_DESTINATION**: pengguna menambah Destination dari PWA dan data muncul di kedua HP saat sinkronisasi berikutnya.
- Tidak wajib login Google bagi operator. Google Apps Script dijalankan sebagai akun deployer dengan akses anonim **jika tersedia**.
- Stockpile+Pile ID dan Product+Dome+Destination dibentuk dari laporan WA terakhir yang disahkan. Operator dapat menyimpan tambahan Stockpile dan Dome secara lokal di perangkat.
- Perhitungan SubLot/SL dikeluarkan dari v1.
- Format laporan WA **11 kolom tab-delimited**, tanpa suffix urutan tiket, dan kode timbangan sebagai kolom terakhir.

## 2. Referensi Destination resmi

Sheet dibuat dan diverifikasi berisi 24 master awal:
https://docs.google.com/spreadsheets/d/1iTs3-TJT8xCXWVUANEtk6MOxP25HjqkH-JHdTKnY1kE/edit

Tab `MASTER_DESTINATION` memakai kolom:

| Posisi | Nama kolom | Keterangan |
|---|---|---|
| A | destination_id | Identitas permanen, nilai baru UUID prefix DST- |
| B | destination_name | Nama tujuan unik tanpa perbedaan kapital/spasi ganda |
| C | is_active | Boolean aktif/nonaktif |
| D | source | EXCEL_NAME_SHEET / PWA |
| E | created_at_utc | ISO8601 UTC |
| F | updated_at_utc | ISO8601 UTC |
| G | updated_by | Anonymous untuk PWA |
| H | request_id | ID permintaan tambah dari browser; kosong pada data awal |

Kolom H ditambahkan v0.9, agar pengiriman form tidak salah diklaim sebagai penulisan sukses. Saat operator memilih tambah Destination, frontend membuat `request_id`, mengirim form dan melakukan GET ulang untuk mencari nama dan ID permintaan tersebut. Jika tidak ditemukan, status `BELUM TERVERIFIKASI`, bukan `SAVED`.

Tidak ada data ritase, nama DT, checker, stockpile, maupun dome disimpan di Google Sheet ini.

## 3. Jalur Apps Script tanpa login

- Backend di `apps-script/Code.gs` hanya menyediakan:
  - `GET ?action=health&callback=...`
  - `GET ?action=list&callback=...`
  - `POST application/x-www-form-urlencoded` dengan `action=addDestination`, `name`, `request_id`.
- GET dipanggil melalui elemen `script` (JSONP), bukan menjanjikan cross-origin JSON `fetch()` biasa.
- POST menggunakan form HTML cross-origin ke iframe tersembunyi. Penulisan dianggap berhasil **hanya setelah GET list menemukan request_id yang sama**.
- Apps Script menormalkan nama, menolak formula/cara injeksi, menolak duplikat case-insensitive, menjaga operasi tambah bersamaan dengan `LockService.getScriptLock()` dan menjadikan request_id idempoten.
- Dengan endpoint publik tanpa login, setiap orang yang menemukan endpoint dapat mencoba melakukan penambahan. Tidak ada proteksi identitas operator; user menerima trade-off ini.
- Perubahan kode script memerlukan pembaruan versi deployment, bukan hanya save editor.

Syarat nyata: aplikasi web `/exec` harus dapat diakses secara anonim dan desain lintas-origin di atas **harus lolos uji browser di HP operasional**. Hasil uji lokal tidak memenuhi syarat ini.

## 4. Halaman Setup

- Pilih tanggal operasi, shift, timbangan, checker.
- Nama timbangan/checker dan daftar shift perlu validasi operasional; jangan mengarang nilai yang belum diberikan.
- Pada pembukaan online, GET `MASTER_DESTINATION` → simpan snapshot di IndexedDB; bila gagal, gunakan cache sebelumnya dengan indikator tanggal sync terakhir. Tidak ada fake success.
- Tombol `Refresh Destination`; tambah Destination online dan `read-back` untuk konfirmasi. Offline: tidak boleh menandai Destination baru sebagai tersimpan di cloud; opsi draft lokal jika disetujui.
- Impor WA lama maupun baru; dry-run preview sebelum konfirmasi. Parse pasangan Stockpile/Pile dan Product/Dome/Destination tanpa menghapus tambahan lokal perangkat.
- Handover dapat mengimpor histori, tetapi laporan WA tidak membawa UUID sehingga beberapa duplikat identik harus diperiksa manual.

## 5. Halaman Operasional

- Input DT, pilihan Stockpile/Pile, kode Product/Dome/Destination, waktu, Note jika diperlukan.
- Time otomatis mengikuti jam HP pada saat form baru dibuka; boleh diedit; waktu manual tidak boleh ditimpa.
- Tanggal operasi mengikuti Setup, tidak otomatis berubah karena HP lewat tengah malam.
- Simpan transaksi ke IndexedDB dengan UUID lokal, snapshot field asli, shift, timbangan, checker, waktu dan timestamp perangkat.
- Historis transaksi tidak berubah ketika master Destination atau master lokal berubah.

## 6. Halaman Report

- Filter tanggal, shift, timbangan, checker dan Destination.
- Laporan 11 kolom TAB persis:

```text
46315\tSAP_1014\t6\tTS_13\tL20_S71\t\t5\tSCZ-1189\tZHN LINE 25\t06.59\tBDM
```

Kolom ke-6 sengaja kosong. Kode tanggal `46315` tanpa suffix `-001`. Nama timbangan `BDM` hanya contoh dari user, kode timbangan lain menunggu konfirmasi. Waktu format `HH.mm`.
- Copy WhatsApp TSV, download `.txt`, backup JSON lokal terpisah yang mempertahankan UUID, serta restore.
- Parser mendukung format lama 10 kolom dengan kode tanggal `46315-001`; melakukan pemeriksaan waktu tidak valid (`52.00,0` pada contoh) dan inkonsistensi waktu, tanpa diam-diam memperbaiki.
- Handover menerima salinan laporan sebelumnya secara eksplisit; kedua HP tidak otomatis berbagi ritase.

## 7. Pengujian yang sudah dan belum dilakukan

| Pengujian | Status 21 Okt 2026 |
|---|---|
| Google Sheets MASTER_DESTINATION tersedia | VERIFIED (koneksi Google Drive) |
| Kolom A:H dan 24 destination awal | VERIFIED pada koneksi Google Drive |
| Google Apps Script sintaks JavaScript | PASS di Node.js |
| Logika list/add/duplicate/idempotency read-back | PASS dalam 12 assertion local mocks |
| Apps Script live deployment `/exec` | BELUM |
| GET JSONP tanpa login dari GitHub Pages | BELUM |
| POST form + readback dari Android | BELUM |
| GitHub repository tersedia | VERIFIED |
| GitHub repository menerima commit dari connector | BELUM: error HTTP 403 |
| GitHub Pages aktif | BELUM DIVERIFIKASI |
| PWA operasional dibangun | BELUM, sesuai permintaan pre-build |

## 8. Release gates untuk satu kali Codex build

**GATE A — Infrastruktur**
- [ ] Deploy Apps Script anon dengan `execute as me`.
- [ ] Pengujian browser nyata GET dan POST berhasil dari GitHub Pages, termasuk dua HP dan mode tanpa login Google.
- [ ] Live readback dapat membedakan request berhasil dan gagal dengan jelas.
- [ ] Repository memiliki folder `/docs` dan GitHub Pages berjalan.

**GATE B — Operasional**
- [ ] Konfirmasi 2 nama/kode timbangan dan bagaimana checker dipilih (daftar offline lokal).
- [ ] Konfirmasi waktu shift, zona waktu dan tanggal operasi.
- [ ] Konfirmasi status T.Ksng/Gtg.Ksng pada v1, serta cara menghitung ritase laporan gabungan.
- [ ] Konfirmasi backup dan retensi lokal agar data ritase tidak hilang jika HP rusak atau browser dibersihkan.
- [ ] Uji data WA minimal: 10 kolom lama, 11 kolom baru, waktu invalid, identitas timbangan hilang, duplikat identik, format tab.

Setelah GATE A dan B disetujui, Codex akan menerima satu PRD beku + prompt lengkap, membangun semua modul dan test dalam satu perubahan. `Sekali build` berarti satu paket implementasi menyeluruh, **bukan** jaminan bebas bug/tidak perlu uji terima.

## 9. Rujukan implementasi

- https://developers.google.com/apps-script/guides/web
- https://developers.google.com/apps-script/guides/content
- https://developers.google.com/apps-script/reference/lock/lock-service
- https://developers.google.com/apps-script/reference/html/x-frame-options-mode
- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
