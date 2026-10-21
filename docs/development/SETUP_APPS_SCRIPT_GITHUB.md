# Apps Script dan hosting — kontrak serta batas verifikasi

**Status 21 Oktober 2026:** PWA lengkap dibangun **hanya lokal**. Apps Script `/exec` existing tidak diubah atau di-redeploy. Instruksi lama yang menunda implementasi digantikan izin eksplisit owner; live integration tetap gate penerimaan operasional.

## Referensi existing

- Endpoint dipertahankan di `config.js` pada root aplikasi; file ini konfigurasi publik tanpa rahasia.
- Sheet referensi: https://docs.google.com/spreadsheets/d/1iTs3-TJT8xCXWVUANEtk6MOxP25HjqkH-JHdTKnY1kE/edit
- Tab `MASTER_DESTINATION`, kolom A:H: `destination_id`, `destination_name`, `is_active`, `source`, `created_at_utc`, `updated_at_utc`, `updated_by`, `request_id`.
- Salinan backend `apps-script/Code.gs` dan manifest tidak diubah oleh restrukturisasi frontend ini. Menyimpan file lokal tidak memperbarui versi deployment Google.
- Frontend berada langsung di root, dokumentasi di `docs/`, tanpa build. Keputusan Pages final: branch `main` + `/ (root)`, `.nojekyll` root, tanpa custom deployment Actions; lihat [batas hosting](../architecture/PROJECT_STRUCTURE.md#hosting).
- Hosting rencana: https://sascartimothy.github.io/RKEF-Ticketing/. Status live tidak diperiksa dalam sesi build lokal.

## Kontrak bridge yang digunakan

- GET health/list menggunakan elemen script JSONP dengan callback unik dan timeout.
- POST menggunakan form `application/x-www-form-urlencoded` ke iframe tersembunyi: hanya `action=addDestination`, `name`, `request_id`.
- Pesan iframe/keberhasilan submit bukan bukti simpan. Frontend membaca ulang list dan mencocokkan nama serta `request_id`. Tanpa kecocokan, hasil **BELUM TERVERIFIKASI**.
- Request pending disimpan sebelum POST. Pengiriman ulang memakai ID sama; tidak ada POST otomatis saat online/reload.
- Retry GET dan read-back dibatasi; cache IndexedDB tetap tersedia jika network/integrasi gagal. Penambahan master bersama dinonaktifkan offline.
- Tidak ada data ritase, checker, stockpile, dome, atau session yang dikirim ke Sheets.

## Uji live oleh owner/operator

Setelah owner menyiapkan hosting secara terpisah, buka `integration-test.html` dari origin hosting pada dua HP operasional tanpa login Google. Jalankan GET health/list dan penambahan Destination uji yang disetujui; tindakan tambah **menulis Sheet sungguhan**. Periksa `request_id` pada read-back dan Sheet; baca ulang dari HP kedua. Tangani baris uji lewat owner. Uji juga offline, timeout, duplikat nama, reload pending, serta clipboard/download/instalasi di perangkat target.

Pengujian localhost Chromium menggunakan blokir seluruh request eksternal dan **tidak menambah Destination live**. Belum ada bukti penerimaan untuk akses anonim, POST lintas-origin Android atau sinkronisasi Destination dua HP. Lihat [laporan pengujian](../testing/LOCAL_TEST_RESULTS.md).

Owner tetap bertanggung jawab atas setiap perubahan Apps Script deployment, izin akses anonim, dan GitHub Pages. Tidak ada perintah deployment yang dijalankan atau diperlukan untuk menjalankan aplikasi di localhost.
