# Mapping material v1.1.2

Keputusan owner 26 Oktober 2026: label **Product Code** berarti nilai seperti `SCZ-1190`, yang sebelumnya disebut Dome. Legacy Product Code numerik adalah kolom 7 dan tidak digunakan lagi untuk ritase baru. [Spesifikasi operasional](../requirements/RKEF_OPERATIONAL_SPEC.md#16-popup-stockpile--pile-id-v112-26-oktober-2026) menjadi acuan kontrak.

## UI dan penyimpanan

Popup Stockpile/Pile existing tetap empat field: Stockpile, Pile ID, Product Code, Destination. Pola identitas dan pengecualian legacy tetap berlaku. Pemilihan pasangan mengisi Product Code/Destination otomatis. Kontrol kanan Ritase Baru berisi ringkasan dan Edit yang membuka popup mapping. Pilih satu ketukan menutup popup; operator tidak perlu memilih ulang auto-fill.

Tambah Mapping dan Edit per pasangan memakai dua field: Product Code teks aman existing (tanpa pola prefix baru) dan Destination aktif dari cache Google. Keduanya wajib, duplikat mengabaikan kapital/spasi ganda ditolak, input tidak diubah diam-diam. Cancel menutup tanpa menyimpan perubahan yang belum disahkan. Tidak tersedia Hapus Mapping baru.

Store `masters` existing tetap satu sumber aktif. `kind:product` memakai `dome` untuk Product Code kolom 8, `destination` untuk kolom 9 dan `productCode` untuk metadata legacy kolom 7. Tidak ada rename database/schema atau migrasi record. Add menyimpan `productCode:''`; Edit mempertahankan ID, memperbarui key, merangkum varian legacy pasangan sama dan mencatat audit. Kolom 7 berbeda tidak dianggap konflik material.

Edit master memperbarui relasi Stockpile/Pile yang mengarah ke pasangan lama (eksplisit maupun dari handover terakhir), dalam transaksi IndexedDB yang sama dengan master/audit. Form menjelaskan dampaknya. Record histori, UUID, nomor, sourceSnapshot/rawSource tidak disentuh. Pemilihan mapping berbeda untuk ritase hanya override draft; master Stockpile/Pile tetap. Override bertahan pada rerender dan edit mapping lain. Mapping yang sedang dipakai draft mengikuti hasil Edit mapping tersebut. Edit stale dan koneksi sebelum reset ditolak; kegagalan transaksi membatalkan seluruh penulisan.

Semua mutasi mapping lokal bekerja offline memakai cache Destination, tanpa POST Google. Reload mempertahankan mapping/draft. Mulai Sesi Baru menghapus semua mapping lokal dan hanya mempertahankan cache Destination/Checker. Cache service worker `rkef-shell-v1.1.2-product-popup` memasukkan modul baru `js/product-ui.js`.

## Kontrak TSV

Tepat 11 kolom, 10 TAB asli per baris, tanpa header. Kolom 3/6/7 kosong. Kolom 8 Product Code baru, kolom 9 Destination. Contoh berikut menggunakan TAB asli:

```text
46320-084	SAP_820		SS_14	S14_33			SCZ-1190	ZHN LINE 26	17.25	BDM
```

| Kolom | Nilai contoh |
|---|---|
| 1 | 46320-084 |
| 2 | SAP_820 |
| 3 | kosong |
| 4 | SS_14 |
| 5 | S14_33 |
| 6 | kosong |
| 7 | kosong |
| 8 | SCZ-1190 |
| 9 | ZHN LINE 26 |
| 10 | 17.25 |
| 11 | BDM |

Serializer menerapkan output baru juga untuk record existing secara read-only. Snapshot legacy tidak dimigrasi; impor tetap menerima Source Code kolom 3 dan kode numerik kolom 7. Validasi isi metadata legacy yang terisi tetap berlaku. Duplikat operasional mengabaikan metadata legacy yang tidak lagi diekspor; konflik identitas bisnis impor tetap diperiksa dengan raw source dan seluruh nilai record. Aturan suffix, waktu, Opsi B, timbangan dan session identity tetap.

## Verifikasi

[Hasil pengujian](../testing/LOCAL_TEST_RESULTS.md) mencatat Node, browser sintetis, clipboard/TXT, offline/reload, histori, reset dan layout. Android/Chrome fisik, keyboard/clipboard perangkat, tempel WhatsApp/Excel aktual serta integrasi Google live tetap belum terverifikasi. Tes otomatis memblokir trafik eksternal dan memakai profil/database sintetis terisolasi.
