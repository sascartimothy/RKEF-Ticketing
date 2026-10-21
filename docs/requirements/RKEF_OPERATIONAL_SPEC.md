# RKEF Ticketing — Spesifikasi Operasional

**Tanggal keputusan:** 21 Oktober 2026.  
**Status:** kontrak kebutuhan operasional terbaru yang dikonfirmasi owner; bukan pernyataan bahwa aplikasi telah memenuhi kontrak atau lulus uji terima.  
**Pembaruan 21 Oktober 2026:** owner mengizinkan perbaikan lokal automatic handover Setup v1.1.0, normalisasi waktu, input checker manual, serta pengujian. Git dan deployment tetap owner-only.

Dokumen ini menjadi **acuan utama untuk keputusan operasional terbaru yang sudah dikonfirmasi**, menggantikan ketentuan lama yang bertentangan dalam [PRD v0.9](PRD_RKEF_Ticketing_v0.9.md), [instruksi implementasi](../development/CODEX_ONE_SHOT_PROMPT.md), dan uraian perilaku existing di [README](../../README.md). Ketentuan arsitektur dan keselamatan yang tidak bertentangan tetap berlaku. PRD lama tidak ditulis ulang dalam tugas ini.

**Wajib dibaca oleh AI agent dan developer sebelum mengubah logic input, handover, numbering, atau export.** OPEN DECISION bukan izin memilih kebijakan sendiri. Perbedaan implementasi dicatat di bagian 14; kode dan tes existing bukan pengganti keputusan owner.

## 1. Visi Produk (Product Vision)

RKEF-Ticketing adalah PWA untuk operator timbangan yang mencatat ritase Dump Truck dalam operasional RKEF. Deliverable utama adalah laporan plain-text dengan delimiter TAB asli yang dapat disalin ke WhatsApp, lalu ditempel ke Microsoft Excel menjadi tabel 11 kolom yang sesuai.

Prioritas produk: integritas data, kesinambungan shift, ketepatan nomor ritase, dan penggunaan sederhana di HP. Output Report harus dapat dipakai sebagai handover lengkap untuk shift berikutnya. Backup JSON terpisah mempertahankan histori lengkap untuk pemulihan; teks WA bukan pengganti backup.

## 2. Alur Operasional Inti (Core Operational Workflow)

1. Operator menerima dan menyalin laporan WhatsApp **lengkap dari satu shift sebelumnya**, untuk satu timbangan.
2. Operator menempelkan laporan ke Setup. Aplikasi melakukan parsing dan validasi sebelum mengubah data operasional.
3. Aplikasi menentukan tanggal operasi, identitas timbangan, shift asal, sesi berikutnya, serta nomor ritase berikutnya berdasarkan laporan valid.
4. Setelah paste lengkap, laporan valid tanpa konflik otomatis disimpan dan mengaktifkan sesi berikutnya, tanpa tombol atau konfirmasi tambahan. Tampilkan status singkat. Mengetik, reload halaman, dan pemulihan draft tidak memicu impor. Laporan tidak valid tidak mengubah sesi.
5. Pilihan material operasional disiapkan dari laporan terakhir yang disahkan dan tambahan lokal yang dimasukkan secara eksplisit.
6. Operator mencatat transaksi di Operasional. Sistem membuat nomor ritase otomatis dan menyimpan transaksi secara lokal.
7. Setelah shift selesai, operator membuka Report, memeriksa transaksi sesi, dan menghasilkan laporan lengkap sesuai kontrak 11 kolom.
8. Operator menekan Copy, menempelkan teks ke grup WhatsApp, lalu mengirimnya sendiri.
9. Operator shift berikutnya mengimpor laporan tersebut untuk meneruskan siklus.

Keutuhan satu shift merupakan asumsi operasional yang dikonfirmasi owner. Struktur yang valid saja tidak membuktikan laporan benar-benar lengkap. Jangan menggunakan potongan hasil filter sebagai dasar handover tanpa kebijakan yang disahkan; lihat OPEN DECISION OD-04.

## 3. Kontrak Data Laporan WhatsApp (WhatsApp Report Data Contract)

- Plain text dengan **TAB asli (U+0009)** sebagai delimiter; newline memisahkan transaksi.
- Tepat 11 kolom per baris transaksi; kolom ke-6 benar-benar kosong.
- Teks yang disalin tidak mempunyai header, pembungkus Markdown, literal escape tambahan, atau backslash di akhir baris.
- Kolom pertama berisi **Excel date serial + suffix nomor ritase**, dipisahkan tanda `-`.
- Satu laporan hanya memuat transaksi satu timbangan; laporan handover mewakili satu shift lengkap dan satu tanggal operasi.

| Kolom | Field | Contoh sintetis | Ketentuan |
|---|---|---|---|
| 1 | Excel Date Serial + Ritase | `46315-001` | Tanggal operasi dan nomor ritase permanen |
| 2 | DT Number | `SAP_820` | DT bukan identitas unik transaksi |
| 3 | Source Code | `4` | Berdasarkan mapping yang disahkan |
| 4 | Stockpile | `TS_15` | Tidak dibuat otomatis dari asumsi |
| 5 | Pile ID | `S6B_40` | Pasangan Stockpile/Pile yang disahkan |
| 6 | Reserved / Empty | kosong | Dua TAB berurutan antara kolom 5 dan 7 |
| 7 | Product Code | `1` | Berdasarkan mapping yang disahkan |
| 8 | Dome | `SCZ-1190` | Berdasarkan mapping yang disahkan |
| 9 | Destination | `ZHN LINE 26` | Pilihan yang disahkan |
| 10 | Transaction Time | `7.20` | Normalisasi internal `HH.mm`; sumber asli dipertahankan |
| 11 | Weighbridge Location | `BDM` | Sama untuk seluruh baris laporan |

Contoh sintetis berikut menggunakan TAB asli. Code fence hanya untuk penyajian dokumentasi dan tidak ikut disalin oleh aplikasi. Contoh bukan master data hardcoded atau bukti pengujian:

```text
46315-001	SAP_820	4	TS_15	S6B_40		1	SCZ-1190	ZHN LINE 26	7.20	BDM
46315-002	SAP_817	4	TS_15	S6B_40		1	SCZ-1190	ZHN LINE 26	7.23	BDM
46315-003	SAP_1039	4	TS_15	S6B_40		1	SCZ-1190	ZHN LINE 26	7.24	BDM
```

Aturan waktu final owner (OD-01 selesai): jam satu atau dua digit (00-23), menit satu atau dua digit (00-59). Satu digit menit berarti puluhan menit; tanpa separator berarti menit `00`. Contoh: `7.2` dan `7.20` menjadi `07.20`, `7.23` menjadi `07.23`, `8.2` menjadi `08.20`, `10.3` menjadi `10.30`, `13.3` menjadi `13.30`, `15` dan `15.00` menjadi `15.00`, `16.4` menjadi `16.40`. Separator sumber adalah titik; normalisasi internal boleh `HH.mm`. Nilai sumber asli wajib disimpan untuk audit. Tolak waktu di luar rentang atau representasi lain yang tidak disahkan; jangan menebak koreksi. Normalisasi format valid tidak menghalangi handover.

## 4. Serial Tanggal Excel (Excel Date Serial)

Gunakan sistem tanggal Excel 1900 secara benar, tanpa pergeseran akibat timezone. Untuk tanggal modern, perhitungan hari kalender dapat menggunakan epoch 1899-12-30; anomali tahun kabisat Excel 1900 tetap harus ditangani. Serial 60 mewakili tanggal fiktif 1900-02-29 dan bukan tanggal kalender valid. Serial tanggal operasi adalah bilangan hari, bukan timestamp lokal atau nomor pecahan waktu.

| Tanggal operasi | Serial | Contoh identitas tampilan |
|---|---|---|
| 20 Oktober 2026 | `46315` | `46315-001`, `46315-083`, `46315-084` |
| 21 Oktober 2026 | `46316` | `46316-001` |

Tanggal operasi tidak selalu sama dengan tanggal kalender saat input. Pergantian tengah malam pada perangkat tidak boleh otomatis memindahkan transaksi ke tanggal operasi berikutnya. Pergantian NS ke DS menaikkan tanggal operasi satu hari kalender sesuai aturan handover.

## 5. Independensi Timbangan (Weighbridge Independence)

Timbangan yang dikonfirmasi saat ini adalah **BDM** dan **ONI**, pada lokasi berbeda. Pencatatan dan counter ritase keduanya independen.

- BDM terakhir `46315-083` → BDM berikutnya `46315-084`.
- ONI terakhir `46315-050` → ONI berikutnya `46315-051`.
- Nomor BDM tidak menaikkan, mereset, atau mengubah counter ONI.
- Identitas timbangan dibaca dari kolom ke-11 dan wajib sama pada seluruh baris laporan.

Identitas bisnis konseptual adalah **Operation Date + Weighbridge Location + Ritase Number**. UUID internal tetap dipertahankan sesuai arsitektur database. Dua transaksi dengan tanggal dan nomor sama pada timbangan berbeda adalah identitas bisnis berbeda; UUID tidak menggantikan kebutuhan mencegah nomor bisnis ganda.

**Campuran timbangan membatalkan seluruh impor**, termasuk 82 baris BDM ditambah satu baris ONI. Tidak boleh mengimpor subset BDM dengan membuang ONI. Tampilkan kesalahan beserta baris terkait, dan jangan mengubah data/sesi operasional melalui impor tersebut.

Counter independen tidak berarti ada koordinasi otomatis antar-HP. Dua HP tetap memiliki data lokal terpisah; penanganan input bersamaan untuk timbangan yang sama memerlukan OD-07.

## 6. Aturan Serah Terima Shift (Shift Handover Rules)

Aturan deteksi berikut adalah konvensi handover owner dan berlaku untuk **laporan lengkap**. Jangan menggantinya dengan inferensi jam transaksi.

| Awal laporan lengkap | Shift asal | Sesi berikutnya | Tanggal berikutnya | Nomor berikutnya |
|---|---|---|---|---|
| Suffix `001` | DS (Day Shift) | NS (Night Shift) | Tetap | Nomor terakhir + 1 |
| Suffix selain `001` | NS (Night Shift) | DS (Day Shift) | Tambah satu hari operasi | `001` |

**Skenario A:** laporan BDM `46315-001` sampai `46315-083` → sesi tanggal 20 Oktober 2026, serial `46315`, NS, BDM, nomor berikutnya `46315-084`. Pergantian DS ke NS tidak mereset counter.

**Skenario B:** laporan BDM `46315-084` sampai `46315-150` → sesi tanggal 21 Oktober 2026, serial `46316`, DS, BDM, nomor berikutnya `46316-001`.

Setelah seluruh validasi lulus dan penyimpanan atomik selesai, tampilkan tanggal operasi, shift, timbangan, dan nomor berikutnya. Konflik sesi aktif atau draft belum tersimpan menghentikan handover; jangan menimpanya diam-diam. Nama checker sesi baru diisi manual oleh operator yang sedang bertugas, bukan ditebak dari TSV. Checker kosong tidak menghalangi aktivasi handover valid, tetapi penyimpanan ritase baru tetap mensyaratkan checker valid. Nomor awal/akhir dan urutan sumber harus diperiksa; penanganan urutan acak atau gap historis belum diputuskan (OD-03). Batas jam DS/NS bukan dasar deteksi ini.

## 7. Penomoran Ritase Otomatis (Automatic Ritase Numbering)

1. Operator tidak mengetik nomor urut ritase di Operasional.
2. Nomor berikutnya bersumber dari sesi dan laporan handover valid yang tersimpan.
3. Pada tanggal operasi yang sama, lanjutkan nomor terakhir; setelah NS ke DS tanggal berikutnya, mulai `001`.
4. Nomor ditetapkan permanen hanya setelah transaksi berhasil disimpan. Kegagalan penyimpanan tidak boleh menghabiskan nomor atau menaikkan counter.
5. Penyimpanan transaksi dan penetapan nomor harus konsisten: tidak boleh ada transaksi tanpa nomor permanen atau counter bertambah tanpa transaksi berhasil.
6. Koreksi transaksi existing mempertahankan nomor ritase. Sorting, filtering, dan pembuatan report tidak menghitung ulang nomor historis.
7. Cegah nomor ganda dalam cakupan tanggal operasi dan timbangan yang sama, termasuk retry penyimpanan.
8. Gunakan minimum tiga digit: `001`, `002`, `084`. Nilai di atas `999` tidak dipotong atau diulang; misalnya `1000`.
9. Operasi normal tidak boleh menghasilkan gap. Kebijakan pembatalan/penghapusan setelah nomor diberikan belum diputuskan; jangan membuat renumbering atau penggunaan ulang nomor sendiri (OD-02).

Ini adalah kontrak perilaku, bukan instruksi mengubah schema dalam tugas dokumentasi ini. Pemulihan setelah crash, retry, serta tab bersamaan perlu memenuhi kontrak saat implementasi nanti diuji.

## 8. Validasi Impor (Import Validation)

Validasi harus deterministik, menampilkan baris sumber yang bermasalah, dan selesai sebelum perubahan operasional disimpan secara atomik.

| Pemeriksaan | Kontrak |
|---|---|
| Struktur baris | Tepat 11 kolom, delimiter TAB asli, kolom keenam kosong; baris rusak tidak dibuang diam-diam |
| Kolom pertama | Serial Excel valid dan suffix nomor ritase valid dengan minimum tiga digit |
| Tanggal operasi | Konsisten untuk seluruh laporan handover satu shift |
| Timbangan | Kolom 11 konsisten; campuran BDM/ONI menolak seluruh impor tanpa partial import |
| Penomoran | Periksa awal, akhir, nomor ganda, urutan, dan gap sebelum menentukan sesi; kebijakan laporan historis bermasalah menunggu OD-03 |
| Waktu | Terapkan aturan final OD-01 di bagian 3, pertahankan nilai sumber asli, tolak format/rentang tidak valid tanpa tebakan |
| Keutuhan | Laporan diasumsikan lengkap satu shift; jangan menganggap subset sebagai laporan lengkap |
| Pengulangan | Impor ulang harus idempoten dan tidak menggandakan transaksi; konflik isi pada identitas bisnis sama menunggu OD-06 |
| Pemrosesan otomatis | Paste lengkap memicu parse dan validasi penuh sebelum menyimpan histori, master, receipt, audit dan sesi secara atomik. Tidak ada tombol/checkbox/konfirmasi. Gagal simpan tidak mengaktifkan sesi. Cegah paste bertumpuk; impor identik tidak menggandakan histori atau mengaktifkan ulang sesi lama. Konflik ditahan tanpa overwrite. |

Periksa integritas seluruh laporan sebelum menentukan sesi. Jangan melanjutkan diam-diam dari laporan tidak valid. Penolakan total laporan campuran timbangan sudah final; kebijakan pemulihan untuk jenis laporan rusak lainnya belum ditentukan. Dukungan format lama 10 kolom atau 11 kolom tanpa suffix tidak boleh diasumsikan sebagai handover otomatis yang valid; lihat OD-05.

## 9. Tiga Halaman Utama (Three Main Application Pages)

| Halaman | Tanggung jawab |
|---|---|
| **Setup** | Import WA sebelumnya, validasi handover, deteksi tanggal operasi/DS atau NS/BDM atau ONI/nomor berikutnya, persiapan master operasional, pemrosesan otomatis setelah paste dan status singkat |
| **Operasional** | Input Dump Truck, pemilihan material dan lokasi, waktu otomatis atau edit, penomoran otomatis, penyimpanan lokal, koreksi dengan audit trail, pencegahan duplikasi tidak disengaja |
| **Report** | Tampilan ritase sesi, filter dan pemeriksaan, preview, teks 11 kolom, Copy to Clipboard, larangan mencampur timbangan, serta pemeliharaan nomor dan urutan |

Tetap tepat tiga view utama. Report merupakan deliverable utama produk. Filter tidak boleh mengubah identitas/nomor transaksi. Urutan keluaran final dan perlindungan agar hasil filter tidak disalahgunakan sebagai handover lengkap menunggu OD-04.

## 10. Integritas dan Keselamatan Data (Data Integrity & Safety)

- Frontend tetap HTML, CSS, vanilla JavaScript PWA untuk HP, langsung di root repository; tidak ada salinan `src/` atau `dist/` dan tidak ada build pengganti.
- GitHub Pages tetap menargetkan `/RKEF-Ticketing/`, branch `main`, folder root; Git dan deployment tetap dikelola owner.
- Ritase, opsi lokal, dan sesi disimpan di IndexedDB per perangkat. Tidak ada automatic sharing/sync ritase antar-HP, Firebase, atau login Google operator.
- Google Sheets hanya shared master Destination melalui Apps Script. Sukses penambahan Destination memerlukan read-back `request_id`; mock lokal bukan bukti integrasi live.
- Stockpile/Pile serta mapping Product/Dome berasal dari laporan terakhir yang disahkan dan tambahan lokal eksplisit. Jangan mengarang master dari contoh sintetis.
- Pertahankan UUID, snapshot transaksi, sumber waktu dan waktu hasil edit, serta audit koreksi. Perubahan master tidak diam-diam mengubah histori.
- Waktu awal mengikuti jam perangkat saat membuka input dan tetap dapat diedit. Tanggal operasi mengikuti sesi, bukan perubahan tanggal kalender perangkat.
- Simpan data sumber dan temuan validasi; jangan mengoreksi atau membuang baris bermasalah secara diam-diam. Impor ulang harus idempoten.
- Backup JSON terpisah diperlukan untuk pemulihan UUID dan histori lengkap. Teks WA tidak membawa seluruh metadata; file GitHub Pages bukan database atau backup ritase.
- Sublot (SL) tetap di luar v1. Kebijakan baru untuk penghapusan, gap, dan migrasi data tidak ditetapkan oleh dokumen ini.
- Uji HP/Android/Chrome, clipboard/Excel aktual, serta Google anonim tetap gate yang harus diverifikasi langsung sebelum klaim penerimaan operasional.

## 11. Kriteria Penerimaan (Acceptance Criteria)

Seluruh baris berikut adalah **kontrak kebutuhan**, bukan hasil tes. Sebagian kontrak Setup sudah diuji lokal pada v1.1.0; lihat [hasil pengujian](../testing/LOCAL_TEST_RESULTS.md). Kelulusan tes Setup tidak membuktikan seluruh kontrak Operasional/Report atau uji HP/live lulus.

| ID | Skenario | Hasil yang diwajibkan |
|---|---|---|
| AC-01 | Impor laporan lengkap DS BDM `46315-001`–`46315-083` | Aktifkan NS BDM tanggal 20 Oktober 2026 setelah paste valid tersimpan; ritase baru mulai `46315-084` |
| AC-02 | Impor laporan lengkap NS BDM `46315-084`–`46315-150` | Aktifkan DS BDM tanggal 21 Oktober 2026 setelah paste valid tersimpan; ritase baru mulai `46316-001` |
| AC-03 | BDM terakhir `083`, ONI terakhir `050` pada serial `46315` | BDM berikutnya `084`, ONI `051`; masing-masing tidak memengaruhi counter lainnya |
| AC-04 | 82 baris BDM dan satu baris ONI | Seluruh impor ditolak; baris terkait ditunjukkan; tidak ada partial import atau perubahan sesi melalui impor itu |
| AC-05 | Simpan ritase berikutnya `084` gagal | Tidak ada nomor permanen terpakai; counter tetap; simpan berhasil berikutnya menggunakan `084` |
| AC-06 | Koreksi transaksi bernomor `46315-084` | Nomor tetap; perubahan tercatat dalam audit |
| AC-07 | Copy Report satu sesi | Plain-text, TAB asli, 11 kolom per baris, kolom keenam kosong, tanpa header/Markdown/backslash; kolom pertama menyertakan suffix |
| AC-08 | Tempel hasil Copy melalui WA ke Excel | Setiap baris dapat dipisahkan menjadi 11 kolom memakai TAB; verifikasi di lingkungan aktual diperlukan |
| AC-09 | Filter mengizinkan transaksi BDM dan ONI terlihat bersamaan | Tidak menghasilkan satu laporan WA gabungan BDM/ONI |
| AC-10 | Sorting/filtering kemudian ekspor | Nomor ritase historis tetap; kebijakan urutan output final menunggu OD-04 |
| AC-11 | Ritase melewati `999` | Nomor berikutnya `1000`, tidak terpotong atau kembali ke `001` |
| AC-12 | Impor ulang laporan identik | Tidak menggandakan transaksi atau memajukan counter secara tidak sah |
| AC-13 | Nilai waktu sumber `7.2` | Normalisasi menjadi `07.20` (07:20), simpan sumber `7.2` untuk audit |
| AC-14 | Perangkat melewati tengah malam saat sesi masih sama | Tanggal operasi tidak berubah otomatis; konversi serial konsisten lintas timezone |
| AC-15 | Dua penyimpanan mencoba nomor sama pada tanggal/timbangan sama | Tidak ada dua transaksi tersimpan dengan identitas bisnis sama; retry tidak menghabiskan nomor tambahan |

Belum ada klaim penerimaan seluruh kontrak baru, uji tempel Excel, uji Android, atau integrasi Google live. Bukti pengujian terdahulu berada di [hasil pengujian lokal](../testing/LOCAL_TEST_RESULTS.md) dengan cakupannya sendiri.

## 12. Keputusan Terkonfirmasi (Confirmed Decisions)

1. Output utama adalah plain-text WhatsApp yang dapat ditempel sebagai tabel Excel.
2. Output terdiri dari 11 kolom TAB tanpa header, kolom keenam kosong, dan kolom pertama serial tanggal **dengan suffix ritase**.
3. Serial `46315` = 20 Oktober 2026, `46316` = 21 Oktober 2026; tanggal tersebut adalah tanggal operasi dan harus bebas pergeseran timezone.
4. BDM dan ONI adalah timbangan independen, dibaca dari kolom ke-11; satu laporan hanya satu timbangan. Campuran menolak seluruh impor.
5. Identitas bisnis adalah tanggal operasi + timbangan + nomor ritase; UUID internal tetap digunakan.
6. Handover berasal dari satu laporan lengkap shift sebelumnya. Awal `001` menandakan DS → NS tanggal sama, lanjut nomor; awal selain `001` menandakan NS → DS tanggal berikutnya, reset `001`. Jam transaksi bukan dasar deteksi.
7. Nomor otomatis, minimum tiga digit, tidak dipotong setelah `999`; permanen hanya saat simpan berhasil. Gagal simpan tidak menaikkan counter; edit/filter/sort tidak mengubah nomor; cegah nomor ganda dan gap pada operasi normal.
8. Setelah paste lengkap, validasi penuh mendahului simpan atomik dan aktivasi sesi otomatis tanpa konfirmasi. Status singkat menggantikan preview baris/master. Data invalid atau konflik tidak mengubah sesi, baris sumber tidak dibuang atau diperbaiki dengan tebakan. Impor ulang idempoten; cegah proses bertumpuk dan kemunduran sesi.
9. Tetap tiga view Setup, Operasional, Report; root vanilla JS PWA, IndexedDB per HP, Destination-only Sheets/Apps Script, tanpa sinkronisasi ritase otomatis atau login operator. Backup JSON terpisah tetap diperlukan.
10. Master berasal dari handover disahkan dan input lokal eksplisit; jam default perangkat tetap editable dengan waktu sumber/hasil edit terpelihara; audit koreksi dipertahankan; SL di luar v1.

11. OD-01 selesai: format waktu mengikuti bagian 3; sumber asli tetap tersimpan. Checker sesi baru diisi manual; checker kosong boleh mengaktifkan handover, tetapi tidak boleh menyimpan ritase baru. Keputusan lain pada bagian 13 tetap terbuka.

## 13. Keputusan Terbuka (Open Decisions)

| ID | Keputusan yang perlu dikonfirmasi owner | Konsekuensi sebelum keputusan |
|---|---|---|
| OD-01 (SELESAI) | Owner mengonfirmasi aturan waktu pada bagian 3 untuk perbaikan Setup v1.1.0 | `7.2` = 07:20; normalisasi `HH.mm`, simpan sumber, tolak nilai invalid tanpa tebakan |
| OD-02 | Pembatalan/penghapusan transaksi bernomor: status, gap, kemungkinan reuse, serta penanganan nomor terakhir | Jangan menambah kebijakan renumbering atau reuse; tombstone existing tidak otomatis menjawab kebijakan counter |
| OD-03 | Laporan historis bergap, nomor ganda/tidak urut, baris rusak; definisi awal/akhir jika urutan sumber salah; prosedur koreksi | Deteksi dan laporkan masalah; jangan menyortir ulang, mengisi gap, membuang subset, atau mengaktifkan sesi diam-diam. Penolakan total campuran timbangan tetap final |
| OD-04 | Urutan output final dan cara memastikan laporan handover lengkap saat filter aktif; shift tanpa transaksi | Potongan laporan dapat salah dideteksi sebagai NS; laporan kosong tidak menyediakan suffix awal. Jangan membuat aturan deteksi pengganti |
| OD-05 | Dukungan/migrasi 10 kolom lama dan 11 kolom tanpa suffix; pemberian nomor bagi histori yang belum memilikinya | Format existing tidak memenuhi kontrak baru; jangan menghasilkan nomor historis dari sorting atau menebak shift |
| OD-06 | Impor dengan identitas bisnis sama tetapi isi berbeda; konflik dengan sesi aktif/draft, impor lama yang diulang setelah ada transaksi baru | Idempotensi wajib, tetapi prioritas/merge/overwrite/aktivasi ulang belum ditentukan; jangan menimpa data atau memundurkan counter diam-diam |
| OD-07 | Penggunaan lebih dari satu HP untuk timbangan yang sama secara bersamaan dan rekonsiliasi backup antarperangkat | IndexedDB lokal tidak dapat menjamin keunikan global tanpa koordinasi; jangan mengklaim counter global tersinkronisasi |
| OD-08 | Bootstrap tanpa laporan sebelumnya, pemulihan perangkat baru, checker asal laporan dan pembatasan koreksi field identitas | Checker sesi baru sudah diputuskan: input manual operator. Checker asal tidak ditebak. Jangan mengarang tanggal awal, shift, nomor awal, atau metadata hilang untuk bootstrap/pemulihan; butuh prosedur owner yang eksplisit |

Jam batas shift, zona waktu operasional resmi, status T.Ksng/Gtg.Ksng, dan kebijakan retensi/backup yang belum diselesaikan pada PRD tetap terbuka sepanjang tidak dijawab oleh keputusan terbaru ini. Deteksi shift berbasis suffix sudah final dan tidak menunggu keputusan jam batas tersebut.

## 14. Konflik yang Diketahui dengan PRD dan Implementasi Existing (Known Conflicts with Existing PRD)

Tabel berikut adalah catatan historis sebelum implementasi Setup v1.1.0, bukan uraian seluruh perilaku aplikasi saat ini. Parser bernomor, deteksi sesi, penolakan campuran dan automatic handover, aturan waktu OD-01, serta checker manual telah diperbaiki dan diuji lokal; lihat [hasil pengujian](../testing/LOCAL_TEST_RESULTS.md). Penomoran permanen saat simpan dan exporter/Report masih memiliki kesenjangan yang dicatat di bawah.

| Area / sumber | Perilaku atau ketentuan existing | Kontrak terbaru / kesenjangan |
|---|---|---|
| [PRD](PRD_RKEF_Ticketing_v0.9.md), bagian 1 dan 6; [prompt implementasi](../development/CODEX_ONE_SHOT_PROMPT.md) | Laporan 11 kolom tanpa suffix; numbered serial dianggap format lama 10 kolom | Kolom pertama 11 kolom wajib serial + suffix ritase |
| [Exporter](../../js/wa-exporter.js), `exportLine` | Mengeluarkan `excelSerial(operationDate)` saja | Belum mengeluarkan nomor ritase permanen pada kolom pertama |
| [Parser](../../js/wa-parser.js), `parseWA` | 11 kolom hanya menerima serial angka; suffix diterima untuk 10 kolom dan tidak disimpan sebagai nomor terstruktur di record hasil parsing | Laporan 11 kolom bernomor terbaru ditolak existing; belum mempertahankan suffix untuk deteksi/counter |
| [Setup](../../js/setup-ui.js), [import UI](../../js/import-ui.js) | Sesi diisi manual; shift/checker asal impor dimasukkan manual; konfirmasi impor menyatakan sesi aktif tidak diganti | Belum ada deteksi otomatis sesi berikutnya dari suffix awal dan konfirmasi hasil deteksi |
| PRD bagian 4, 6, dan 8 | Timbangan kedua dan nama shift belum dikonfirmasi; tidak mengasumsikan jam shift | BDM/ONI serta DS/NS kini dikonfirmasi. Jam batas tetap terbuka; suffix menjadi aturan deteksi |
| [Import UI](../../js/import-ui.js), [database](../../js/database.js), `importHandover` | Mengimpor baris valid terpilih; baris invalid dapat dikecualikan; tidak memeriksa keseragaman seluruh laporan untuk tanggal/timbangan | Campuran timbangan wajib menolak seluruh impor; laporan lengkap dan konsistensi tanggal perlu divalidasi sebelum sesi |
| [Operasional](../../js/operational-ui.js), [database](../../js/database.js), `saveRecord` | UUID, draft, revisi, snapshot dan audit tersedia; belum ada penetapan nomor urut bisnis/counter | Perlu nomor otomatis unik per tanggal/timbangan, tetap saat edit, ditetapkan bersama simpan berhasil |
| [Report UI](../../js/report-ui.js), [exporter](../../js/wa-exporter.js) | Filter timbangan dapat dikosongkan; export tidak menolak campuran. Urutan berdasarkan tanggal, waktu, createdAt, lalu UUID | Belum menjamin report satu timbangan; urutan final bernomor menunggu OD-04, tanpa renumbering |
| PRD bagian 6; [time-date](../../js/time-date.js), [validation](../../js/validation.js) | Validasi ketat `HH.mm` lima karakter; `7.20`/`7.2` ditolak | Konvensi contoh owner berbeda; OD-01 kini selesai; normalisasi parser telah diterapkan sesuai bagian 3 |
| [Domain tests](../../tests/domain.test.js) | Mengharapkan 11 kolom tanpa suffix, menolak suffix pada 11 kolom, menerima konversi lama; waktu wajib lima karakter | Menguji kontrak lama; kelulusan tidak membuktikan kontrak baru terpenuhi |
| [Browser suite](../../tests/browser-suite.js) | Menguji sesi manual, import pilihan baris, ekspor serial saja, tombstone, audit dan atomic abort | Belum membuktikan handover otomatis/counter bisnis/penolakan campuran sesuai kontrak terbaru |
| [Database](../../js/database.js), `deleteRecord` | Penghapusan bertombstone dengan audit dan dikeluarkan dari report | Perilaku existing bukan keputusan owner tentang gap/reuse/renumbering setelah nomor bisnis diterapkan (OD-02) |

[README](../../README.md) tetap memuat uraian workflow aplikasi existing. Untuk perilaku target operasional yang bertentangan, gunakan spesifikasi ini. Jangan menyatakan seluruh kesenjangan selesai hanya karena referensi dokumentasi telah diperbarui.
