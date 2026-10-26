# RKEF Ticketing — Spesifikasi Operasional

**Tanggal keputusan:** 21 Oktober 2026.  
**Status:** kontrak kebutuhan operasional terbaru yang dikonfirmasi owner; bukan pernyataan bahwa aplikasi telah memenuhi kontrak atau lulus uji terima.  
**Pembaruan 21 Oktober 2026:** Setup v1.1.0 disusul otorisasi lokal Operasional v1.1.1 dan Opsi B pada bagian 7. Report v1.1.1 kini memakai seluruh ritase lokal sesi aktif, rekap Pile ID + TOTAL, tanpa filter maupun Backup/Restore JSON pengguna. Git dan deployment tetap owner-only.

Dokumen ini menjadi **acuan utama untuk keputusan operasional terbaru yang sudah dikonfirmasi**, menggantikan ketentuan lama yang bertentangan dalam [PRD v0.9](PRD_RKEF_Ticketing_v0.9.md), [instruksi implementasi](../development/CODEX_ONE_SHOT_PROMPT.md), dan uraian perilaku existing di [README](../../README.md). Ketentuan arsitektur dan keselamatan yang tidak bertentangan tetap berlaku. PRD lama tidak ditulis ulang dalam tugas ini.

**Wajib dibaca oleh AI agent dan developer sebelum mengubah logic input, handover, numbering, atau export.** OPEN DECISION bukan izin memilih kebijakan sendiri. Perbedaan implementasi dicatat di bagian 14; kode dan tes existing bukan pengganti keputusan owner.

## 1. Visi Produk (Product Vision)

RKEF-Ticketing adalah PWA untuk operator timbangan yang mencatat ritase Dump Truck dalam operasional RKEF. Deliverable utama adalah laporan plain-text dengan delimiter TAB asli yang dapat disalin ke WhatsApp, lalu ditempel ke Microsoft Excel menjadi tabel 11 kolom yang sesuai.

Prioritas produk: integritas data, kesinambungan shift, ketepatan nomor ritase, dan penggunaan sederhana di HP. Output Report harus dapat dipakai sebagai handover lengkap untuk shift berikutnya. Backup/Restore JSON di UI dihapus berdasarkan keputusan owner task Report v1.1.1. Teks WA bukan backup metadata lengkap; pemulihan setelah kehilangan perangkat tidak tersedia melalui UI.

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

Keutuhan satu shift merupakan asumsi operasional yang dikonfirmasi owner. Struktur yang valid saja tidak membuktikan laporan benar-benar lengkap. Report tidak menyediakan filter/subset; seluruh ritase lokal sesi aktif dipakai. Ini tidak membuktikan shift selesai atau laporan belum dikirim (OD-09); handover shift kosong tetap sisa OD-04.

## 3. Kontrak Data Laporan WhatsApp (WhatsApp Report Data Contract)

- Plain text dengan **TAB asli (U+0009)** sebagai delimiter; newline memisahkan transaksi.
- Tepat 11 kolom per baris transaksi; output kolom ke-3, ke-6 dan ke-7 benar-benar kosong (keputusan popup material v1.1.2, 26 Oktober 2026). Impor tetap menerima Source Code historis di kolom ke-3 dan mempertahankan sumber audit.
- Teks yang disalin tidak mempunyai header, pembungkus Markdown, literal escape tambahan, atau backslash di akhir baris.
- Kolom pertama berisi **Excel date serial + suffix nomor ritase**, dipisahkan tanda `-`.
- Satu laporan hanya memuat transaksi satu timbangan; laporan handover mewakili satu shift lengkap dan satu tanggal operasi.

| Kolom | Field | Contoh sintetis | Ketentuan |
|---|---|---|---|
| 1 | Excel Date Serial + Ritase | `46315-001` | Tanggal operasi dan nomor ritase tersimpan (Opsi B bagian 7) |
| 2 | DT Number | `SAP_820` | DT bukan identitas unik transaksi |
| 3 | Empty / legacy Source Code | kosong | Output selalu kosong; impor menerima Source Code lama sebagai metadata audit |
| 4 | Stockpile | `TS_15` | Tidak dibuat otomatis dari asumsi |
| 5 | Pile ID | `S6B_40` | Pasangan Stockpile/Pile yang disahkan |
| 6 | Reserved / Empty | kosong | Dua TAB berurutan antara kolom 5 dan 7 |
| 7 | Empty / legacy Product Code | kosong | Output kosong; impor menerima kode numerik lama sebagai metadata audit |
| 8 | Product Code (sebelumnya Dome) | `SCZ-1190` | Nilai material dari mapping aktif atau override yang valid |
| 9 | Destination | `ZHN LINE 26` | Pilihan yang disahkan |
| 10 | Transaction Time | `7.20` | Output `HH.mm`; sumber asli dipertahankan |
| 11 | Weighbridge Location | `BDM` | Sama untuk seluruh baris laporan |

Contoh sintetis berikut menggunakan TAB asli. Code fence hanya untuk penyajian dokumentasi dan tidak ikut disalin oleh aplikasi. Contoh bukan master data hardcoded atau bukti pengujian:

```text
46315-001	SAP_820		TS_15	S6B_40			SCZ-1190	ZHN LINE 26	7.20	BDM
46315-002	SAP_817		TS_15	S6B_40			SCZ-1190	ZHN LINE 26	7.23	BDM
46315-003	SAP_1039		TS_15	S6B_40			SCZ-1190	ZHN LINE 26	7.24	BDM
```

Aturan waktu final owner (OD-01 selesai): jam satu atau dua digit (00-23), menit satu atau dua digit (00-59). Satu digit menit berarti puluhan menit; tanpa separator berarti menit `00`. Contoh: `7.2` dan `7.20` menjadi `07.20`, `7.23` menjadi `07.23`, `8.2` menjadi `08.20`, `10.3` menjadi `10.30`, `13.3` menjadi `13.30`, `15` dan `15.00` menjadi `15.00`, `16.4` menjadi `16.40`. Separator sumber adalah titik; normalisasi internal boleh `HH.mm`. Nilai sumber asli wajib disimpan untuk audit. Tolak waktu di luar rentang atau representasi lain yang tidak disahkan; jangan menebak koreksi. Normalisasi format valid tidak menghalangi handover.

### Live clock dan presisi detik v1.1.1

Keputusan owner 21 Oktober 2026: Ritase Baru default **AUTO**, mengikuti jam perangkat terkini setiap detik dalam `HH.mm.ss`. Fokus/tap tidak menghentikan jam. Tick hanya memperbarui field waktu, tanpa dirty/autosave IndexedDB atau render ulang field lain. Satu timer dipakai sepanjang halaman; kembali dari background membaca jam perangkat lagi.

Input nyata yang tidak kosong memilih **MANUAL**; `HH.mm` dan `HH.mm.ss` diterima dengan jam 00-23, menit/detik 00-59. Nilai manual tidak ditimpa. Kosong atau whitespace langsung kembali AUTO. Saat submit Simpan dimulai, AUTO menangkap waktu **dan tanggal perangkat pada saat itu**, sebelum validasi, flush draft, konfirmasi duplikat, atau await database. MANUAL memakai input operator. Validasi/commit gagal tidak membuat ritase atau menghabiskan nomor. Save sukses menyiapkan draft AUTO baru.

Keputusan input manual v1.1.1: operator cukup mengetik angka. `Hmm`/`HHmm` menjadi `HH.mm` (`720`/`0720` → `07.20`); `Hmmss`/`HHmmss` menjadi `HH.mm.ss` (`72035`/`072035` → `07.20.35`). Jam bulat `15` → `15.00`, notasi bertitik `7.2` → `07.20` tetap diterima. Jam 00–23, menit/detik 00–59; nilai invalid tidak ditebak. Aturan tambahan ini hanya untuk input lokal dan popup Koreksi, bukan perluasan grammar sumber handover WA.

Saat AUTO, seleksi seluruh jam memudahkan digit pertama menggantikannya; fokus/tap tanpa perubahan tetap AUTO. Selama edit, angka mentah dipertahankan agar pengetikan bertahap, backspace, paste, komposisi dan posisi kursor tidak diganggu formatter. Pemisah ditambahkan otomatis saat keluar field untuk nilai valid; saat submit, normalisasi juga dilakukan sebelum validasi/persistensi record. Draft boleh menyimpan input manual mentah/parsial dan memulihkannya setelah reload; nilai invalid tetap MANUAL dan gagal disimpan sebagai ritase. Kosong/spasi mengembalikan jam AUTO terkini. Popup Koreksi memakai normalisasi yang sama tetapi waktu historis tidak berjalan dan kosong tetap invalid. Presisi menit tidak diberi detik pengamatan tambahan, internal tetap menyimpan detik bila diinput, dan WA tetap `HH.mm` tanpa pembulatan.

Record baru menyimpan `time`, `sourceTime`, `editedTime`, `timePrecision` (`minute`/`second`) dan mode jika diketahui. `openedTime`/`openedDate` menyimpan provenance pembukaan draft baru. Sumber AUTO adalah waktu tertangkap saat Simpan; sumber draft saat dibuka tersedia selama draft aktif. Koreksi mempertahankan sumber dan snapshot asli serta mencatat perubahan waktu/nomor dalam audit atomik. Histori tanpa detik tetap presisi menit; tidak diisi detik perangkat. Nilai menit dipetakan sementara ke `.00` **hanya sebagai kunci urut**, lalu `createdAt` dan UUID bila sama. Nilai asli tidak diubah dan tidak diklaim sebagai pengamatan detik.

Draft membawa `timeMode`; reload AUTO membaca jam terkini, reload MANUAL mempertahankan input. Draft lama tanpa mode: nilai sama dengan `sourceTime` dianggap AUTO; nilai berbeda atau draft koreksi dianggap MANUAL. Format lama tidak mencatat tindakan mengetik ulang nilai yang sama, sehingga tindakan itu tidak dapat dipulihkan secara pasti. Popup Koreksi selalu menampilkan waktu historis tanpa live clock dan tidak mengganti draft Ritase Baru.

WA tetap tepat 11 kolom TAB; kolom 10 `HH.mm` dengan **membuang detik, tanpa pembulatan**. `14.25.59` menjadi `14.25`; `23.59.59` menjadi `23.59`, tanpa pergantian tanggal. Serialisasi tidak mengubah database. Parser handover tetap menerima notasi menit OD-01 di atas; teks WA tidak mempertahankan detik/mode/presisi/UUID, sehingga teks WA tidak menyediakan pemulihan metadata lengkap. Backup/Restore JSON tidak lagi tersedia pada UI; API internal tetap kompatibel. Nama database, schema v1 dan format backup v1 tetap; metadata tambahan kompatibel tanpa migrasi destruktif.

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

### Mulai Sesi Baru (v1.1.1)

Keputusan final owner 26 Oktober 2026: **Mulai Sesi Baru = reset TOTAL seluruh data operasional lokal semua sesi dan timbangan BDM maupun ONI.** Kontrak reset sebelumnya yang mempertahankan histori impor, receipt, mapping atau transaksi sesi lain **DIGANTIKAN**. Versi tetap v1.1.1.

Tombol di card Handover manual menampilkan satu popup **Mulai Sesi Baru?**, **Batal / Hapus Sesi & Mulai Baru**. Peringatan menyebut penghapusan permanen semua histori/transaksi lokal termasuk timbangan lain. Batal tidak mengubah database maupun teks WA. Tidak ada konfirmasi kedua atau reset otomatis saat reload.

Satu transaksi IndexedDB meliputi seluruh store schema v1: `records`, `masters`, `settings`, `cache`, `audit`, `imports`, `pending`. Hapus semua ritase lokal/impor, tombstone, audit, sesi/draft/counter, receipt/fingerprint, lastHandover/handoverCycle, mapping dan tambahan lokal, metadata serta pending lama, bahkan tanpa sesi aktif. Hanya entri cache `checkers` (Checker_Crew) dan `destinations` (MASTER_DESTINATION) dipertahankan utuh dengan ID, isi dan metadata sync. Jangan mempertahankan seluruh cache/masters. Tidak memakai deleteDatabase, mengubah Google Sheets, atau mengubah konfigurasi statis frontend.

`settings.resetGeneration` adalah UUID teknis baru tanpa histori operasional. Setiap transaksi tulis mengunci settings dan memeriksa generasi koneksi. Koneksi/tab sebelum reset ditolak sampai reload, termasuk write generik, autosave dan handover terlambat. Generasi hanya berubah setelah commit sukses; abort mengembalikan seluruh store/cache. Perbandingan sesi/draft/persiapan tetap mencegah reset terhadap sesi pengganti yang belum dilihat operator. Autosave dituntaskan sebelum popup; simpan/koreksi/handover berjalan menahan reset.

Setelah commit: kosongkan textarea WA, draft/runtime, sesi, status kerja dan Report; kembali Setup **Belum aktif**. Teks sebelumnya tidak diproses ulang. Reload tetap kosong dan tidak mengisi ulang master lokal default atau memulihkan histori. Cache Checker dan Destination tetap tersedia offline. Tab lain membersihkan UI saat menerima broadcast reset; write fence tetap berlaku meskipun broadcast belum diterima.

### Handover setelah reset total

Operator wajib paste laporan baru. Parser tetap memvalidasi 11 kolom TAB, waktu sumber, suffix, tanggal, satu timbangan dan duplikat internal tanpa perubahan algoritma nomor. Laporan valid membuat histori impor, receipt, mapping dan sesi dari nol; histori sebelum reset tidak mungkin menimbulkan konflik OD-06 karena telah dihapus. Contoh 83 BDM `46315-001` sampai `083` menghasilkan NS 20/10/2026, next `46315-084`, checker kosong untuk dipilih manual. NS ke tanggal berikutnya DS mulai 001 tetap berlaku.

Dalam pekerjaan sesudah reset, impor identik tetap idempoten/no-op bila aman dan mempertahankan checker/counter. Integritas receipt, konflik record nyata, draft dirty, mapping dan kemunduran persiapan tetap diperiksa untuk data yang ada sekarang. Reset total tidak melemahkan validasi impor. Tidak tersedia pemulihan metadata lengkap melalui UI; teks WA bukan backup metadata lengkap.

## 7. Penomoran Ritase Otomatis (Automatic Ritase Numbering)

**Keputusan owner v1.1.1, 21 Oktober 2026: Opsi B menggantikan aturan nomor tidak berubah setelah koreksi.** Aturan lama: “Koreksi transaksi existing mempertahankan nomor ritase”; aturan ini **DIGANTIKAN**, bukan berlaku bersamaan dengan Opsi B. UUID tetap permanen; nomor bisnis dapat berubah dalam scope di bawah.

1. Operator tidak mengetik nomor. Awal sesi berasal dari handover valid; minimum tiga digit, di atas `999` lanjut `1000` tanpa pemotongan. Counter BDM/ONI independen.
2. Nomor disimpan bersama record saat simpan sukses. Record, counter/session, audit, dan penghapusan draft terkait berjalan dalam satu transaksi IndexedDB. Gagal/abort tidak menghabiskan nomor; retry UUID/draft yang sama tidak membuat transaksi baru. Lock read/write store yang sama menserialisasi tab pada origin/perangkat sama, bukan koordinasi antar-HP.
3. Transaksi lokal **sesi aktif** diurutkan berdasarkan waktu operasional; koreksi waktu atau penyisipan lebih awal dapat mengubah nomor seluruh transaksi lokal terkait. Contoh `084/15.20`, `085/15.25`, `086/15.30`; koreksi transaksi ketiga ke `15.22` menghasilkan UUID ketiga bernomor `085`, UUID kedua `086`.
4. Scope ditentukan oleh tanggal operasi, timbangan, shift, origin lokal, dan `numberingSession` yang menunjuk receipt handover aktif. `startNumber` disimpan pada save pertama dan tidak bergeser. Histori impor, timbangan/tanggal berbeda, dan sesi sebelumnya tidak diubah. Koreksi di luar scope aktif diblokir. Data lama tanpa nomor atau tanpa identitas sesi yang bertumpang tindih diblokir untuk OD-05/06; tidak dinomori secara retroaktif.
5. Waktu diurutkan sampai detik bila tersedia (lihat bagian 3). Waktu sama memakai tie-breaker `createdAt`, lalu UUID, stabil setelah reload. Sorting/filter/export tidak menghitung nomor ulang. Suffix exporter memakai `ritaseNumber` tersimpan. Report aktif memblokir ritase tanpa nomor; serializer internal tetap mendukung histori legacy untuk kompatibilitas, bukan alur handover baru.
6. Cegah nomor bisnis ganda untuk tanggal/timbangan sama, termasuk terhadap histori beku dan tombstone. Urutan aktif harus utuh; tab stale ditolak lewat revisi. Peer yang nomornya berubah mendapat kenaikan revisi dan audit `renumber` berisi before/after; transaksi yang dikoreksi memakai audit `correct` berisi perubahan nomor dan field. Snapshot asli dipertahankan. Abort membatalkan semua perubahan.
7. **NS lewat tengah malam:** tanggal operasi tetap sesi. Untuk AUTO baru, tanggal kalender perangkat ditangkap bersamaan dengan waktu saat Simpan dan diteruskan ke `actualDate`; tanggal pembukaan draft tidak dipakai sebagai tanggal transaksi AUTO. Record lama mempertahankan provenance `clockDate`/`actualDate` existing. NS dengan tanggal perangkat pada tanggal operasi atau hari kalender berikutnya diurutkan berdasarkan tanggal aktual lalu waktu. Tidak ada tebakan batas shift atau zona waktu resmi. Input MANUAL NS tanpa tanggal aktual tepercaya, koreksi waktu NS, metadata tanggal hilang atau di luar dua tanggal tersebut **BLOCKED (OD-10)**. Data device clock adalah provenance perangkat, bukan bukti jam perangkat benar; uji dan verifikasi jam HP tetap gate operasional.
8. Aplikasi **tidak mengetahui laporan sudah dikirim di WhatsApp**. Scope aktif bukan bukti laporan belum dikirim. Perubahan nomor dapat membuat laporan lama berbeda; periksa dan koordinasikan laporan yang pernah dikirim. Penguncian/finalisasi belum tersedia (OD-09); jangan mengklaim laporan sudah aman difinalisasi. Histori di luar sesi aktif diblokir dan tab dengan sesi/revisi lama ditolak.
9. Penghapusan satu ritase bernomor diblokir sampai kebijakan gap/reuse OD-02 disahkan; reset total operasional pada bagian 6 adalah pengecualian eksplisit owner. Pembatalan draft dengan konfirmasi hanya menghapus draft, bukan transaksi.

Schema database tetap v1, nama `rkef-ticketing` tetap. Field additive `ritaseNumber`, `numberingSession`, `actualDate`, `startNumber` memakai store existing; tidak ada migrasi destruktif. Backup/restore membawa field dan audit serta memeriksa collision nomor bisnis, juga saat merge.

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
| Pemrosesan otomatis | Paste lengkap memicu parse dan validasi penuh sebelum menyimpan histori, master, receipt, audit dan sesi secara atomik. Tidak ada tombol/checkbox/konfirmasi. Gagal simpan tidak mengaktifkan sesi. Cegah paste bertumpuk; impor identik tidak menggandakan histori dan boleh mengaktifkan sesi kembali jika pemeriksaan integritas lulus. Konflik ditahan tanpa overwrite. |

Periksa integritas seluruh laporan sebelum menentukan sesi. Jangan melanjutkan diam-diam dari laporan tidak valid. Penolakan total laporan campuran timbangan sudah final; kebijakan pemulihan untuk jenis laporan rusak lainnya belum ditentukan. Dukungan format lama 10 kolom atau 11 kolom tanpa suffix tidak boleh diasumsikan sebagai handover otomatis yang valid; lihat OD-05.

## 9. Tiga Halaman Utama (Three Main Application Pages)

| Halaman | Tanggung jawab |
|---|---|
| **Setup** | Import WA sebelumnya, validasi handover, deteksi tanggal operasi/DS atau NS/BDM atau ONI/nomor berikutnya, persiapan master operasional, pemrosesan otomatis setelah paste dan status singkat |
| **Operasional** | Input Dump Truck, pemilihan material dan lokasi, waktu otomatis atau edit, penomoran otomatis, penyimpanan lokal, koreksi dengan audit trail, pencegahan duplikasi tidak disengaja |
| **Report** | Informasi sesi aktif, rekap Pile ID + TOTAL, preview terbatas, Salin/Unduh WA lengkap 11 kolom; tanpa filter dan Backup/Restore JSON pengguna |

Tetap tepat tiga view utama. Keputusan owner task Report v1.1.1 menggantikan desain filter lama:

- Susunan: **Informasi Sesi → Rekap Ritase per Pile ID + TOTAL → Laporan WhatsApp**. Tanggal operasi, shift, timbangan, checker dan total berasal dari sesi/data tersimpan. Checker hanya identitas petugas, tidak memfilter/mengelompokkan transaksi.
- Sumber otomatis: `origin=local`, belum dihapus, tanggal operasi/shift/timbangan sesi aktif, `numberingSession=handoverId`, identitas aktivasi sama jika tersedia. Sesi/tanggal/timbangan/shift lain, histori impor dan reset tidak masuk. Identitas yang tidak cukup membedakan aktivasi memblokir export tanpa menebak. Tidak ada delapan filter atau tombol Gunakan Sesi Aktif/Kosongkan Filter.
- Satu record dihitung satu ritase, bukan DT unik. Rekap per `pileId` tersimpan dihitung ulang saat save/koreksi/renumbering/reload, tanpa counter terpisah. Urut jumlah terbanyak, lalu nama Pile ID deterministik; baris **TOTAL** selalu paling bawah.
- TOTAL = jumlah transaksi lokal aktif sesi = penjumlahan Pile ID = jumlah baris WA. Output urut nomor tersimpan Opsi B, tepat 11 kolom TAB/kolom keenam kosong/suffix aktual/HH.mm tanpa pembulatan. Export tidak menomori ulang. Nomor hilang/duplikat/gap, counter tidak konsisten, collision histori, kronologi atau identitas/data invalid memblokir Salin/Unduh dengan alasan.
- Preview lengkap dapat dibuka, tinggi dibatasi dengan scroll internal; clipboard/TXT selalu seluruh transaksi, tanpa batas 500 baris. Status Salin berhasil/gagal ditampilkan; fallback copy browser atau seleksi teks lengkap jika clipboard ditolak. Tidak ada kirim otomatis WA/backend. Snapshot sesi+record dibaca atomik sebelum aksi; sesi berubah meminta operator memeriksa identitas terbaru sebelum aksi berikutnya.
- Tanpa sesi aktif: “Belum ada sesi aktif. Lakukan handover di halaman Setup.”, tanpa sesi lama sebagai aktif. Sesi aktif kosong: “Belum ada ritase pada sesi ini.”, TOTAL 0, Salin/Unduh nonaktif, tanpa baris palsu.
- Card Cadangan Perangkat dan seluruh alur Backup/Restore JSON pengguna dihapus, termasuk recovery pada error penyimpanan; tidak dipindahkan ke view lain. API internal tetap untuk kompatibilitas/validasi/tes; database/schema v1 tidak berubah dan penghapusan UI tidak menghapus data. Pemulihan seluruh metadata setelah kehilangan perangkat tidak tersedia melalui antarmuka. TXT/WA tidak membawa UUID, audit, draft, master, counter dan cache.
- Penghapusan filter menyelesaikan bagian urutan/subset OD-04. Handover shift kosong tetap terbuka; penguncian/finalisasi dan rekonsiliasi laporan pernah dikirim tetap OD-09. Semua record tersedia bukan bukti seluruh ritase lapangan sudah dicatat atau shift selesai.

### Operasional v1.1.1

Keputusan UI mobile v1.1.2 (26 Oktober 2026): Operasional langsung menampilkan card **Ritase baru**, tanpa eyebrow/heading/deskripsi pembuka. Peringatan belum ada sesi berada di dalam card; validasi simpan tidak berubah. Setup, Operasional dan Report memakai satu baris status sesi dinamis yang sticky di atas viewport. Pada posisi atas, brand/logo/tagline/status koneksi lengkap tersedia; setelah brand tergulir keluar, mode mini hanya menampilkan status sesi. Kembali ke atas memulihkan header penuh. Brand tetap dalam alur dokumen agar perubahan mode tidak menggeser tinggi konten; observer hanya mengatur visibilitas label penyimpanan tambahan. Modal native tetap di atas header.

Viewport tetap `width=device-width,initial-scale=1,viewport-fit=cover`, tanpa melarang zoom manual aksesibilitas. Field input/select/textarea, termasuk laporan readonly dan Koreksi, minimal 16px untuk mencegah pemicu auto-zoom iOS akibat font kecil. Batas lebar grid/flex, pembungkusan teks, scroll internal TSV dan safe area diperbaiki langsung tanpa menyembunyikan overflow horizontal global. Navbar/Simpan fixed dan perilaku keyboard existing dipertahankan. Ini kontrak dan perbaikan lokal; zoom/keyboard Safari iPhone dan Chrome Android fisik masih memerlukan verifikasi perangkat.

Input utama: nomor DT, popup pasangan Stockpile/Pile, Product Code/Destination, waktu, note opsional. Popup memilih dengan satu ketukan dan menutup langsung; Edit Daftar menyediakan Add/Edit/Hapus lokal. Form Add/Edit hanya Stockpile, Pile ID, Product Code dan Destination. Pile ID baru tidak memerlukan laporan sebelumnya atau Source Code. Lihat bagian 16 untuk kontrak mapping. Layout dua kolom pada 360px dan tombol Simpan fixed tetap dipertahankan.

Penyederhanaan card v1.1.2 (26 Oktober 2026): metadata tanggal/shift/timbangan/checker dan panel abu-abu di dalam card Ritase baru dihapus dari tampilan; status sticky existing tetap. Nomor berikutnya menjadi teks kecil tepat di bawah judul, memakai `session.nextRitase` existing dan tersembunyi bila tidak tersedia/tanpa sesi. Tidak mengubah algoritme nomor atau metadata tersimpan.

Di bawah Nomor Dump Truck tersedia keypad satu baris `1 2 3 4 5 6 7 8 9 0 ⌫`. Keputusan layout terbaru owner v1.1.2 menggantikan scroll internal: seluruh 11 tombol wajib terlihat tanpa scroll/clipping pada viewport 320px ke atas. Grid 11 kolom fleksibel setara memakai gap 2px, tanpa min-width tombol tetap. Tinggi tombol 46 CSS px; lebar mengikuti ruang card dan kurang dari 44px pada HP sempit, sehingga tidak diklaim memenuhi target 44 × 44px. Tidak ada scrollbar atau indikator arah keypad. Setiap tombol bertipe button, hapus memiliki nama aksesibel Hapus satu karakter. Digit ditambahkan ke akhir nilai aktual; hapus membuang karakter terakhir termasuk pada kode lengkap manual, kosong adalah no-op dan batas panjang input tetap berlaku. Keypad melepas fokus editor yang terbuka tanpa memfokuskan input DT, sehingga aksinya tidak sengaja membuka keyboard virtual. Ketuk field tetap mendukung input manual dan tombol tetap dapat diaktifkan keyboard fisik. Perubahan memicu event input yang sama dengan pengetikan untuk autosave draft; normalisasi SAP dan validasi tetap pada handler simpan existing. Sesi nonaktif tetap menonaktifkan fieldset termasuk keypad/Simpan. Keyboard virtual iPhone/Android fisik tetap perlu verifikasi langsung.

Unit numerik `820` menjadi `SAP_820`; `SAP_820` tidak diprefix ulang. Kode lengkap non-SAP tetap diterima; identitas historis yang tidak diubah tetap utuh. Keyboard numerik diprioritaskan; kode lengkap dapat ditempel/dipilih dari riwayat. Identitas DT bukan UUID.

Tidak ada + Form Baru. Save sukses membuka draft baru dengan waktu perangkat; draft gagal save tetap utuh. Batalkan input meminta konfirmasi bila dirty. Riwayat Ritase menampilkan lima lokal sesi aktif terbaru, pencarian dapat dibuka, Lihat Semua mengembang inline dan Tampilkan Lebih Sedikit kembali ke lima. Detail memperlihatkan snapshot/audit.

Koreksi memakai dialog terpisah dengan scroll internal, Simpan Koreksi dan Batal. Form/draft baru tidak diganti atau dihapus, termasuk jika save koreksi gagal. Sukses menutup dialog dan memperbarui daftar. UUID dan snapshot asli tetap, revisi stale ditolak, perubahan dan nomor peer diaudit atomik.

## 10. Integritas dan Keselamatan Data (Data Integrity & Safety)

- Frontend tetap HTML, CSS, vanilla JavaScript PWA untuk HP, langsung di root repository; tidak ada salinan `src/` atau `dist/` dan tidak ada build pengganti.
- GitHub Pages tetap menargetkan `/RKEF-Ticketing/`, branch `main`, folder root; Git dan deployment tetap dikelola owner.
- Ritase, opsi lokal, dan sesi disimpan di IndexedDB per perangkat. Tidak ada automatic sharing/sync ritase antar-HP, Firebase, atau login Google operator.
- Google Sheets membagikan master Destination dan Checker_Crew melalui Apps Script (keputusan Multi-Checker 26 Oktober 2026). Sukses penambahan Destination memerlukan read-back `request_id`; mock lokal bukan bukti integrasi live.
- Stockpile/Pile serta mapping Product/Dome berasal dari laporan terakhir yang disahkan dan tambahan lokal eksplisit. Jangan mengarang master dari contoh sintetis.
- Pertahankan UUID, snapshot transaksi, sumber waktu dan waktu hasil edit, serta audit koreksi. Perubahan master tidak diam-diam mengubah histori.
- Waktu AUTO berjalan mengikuti perangkat dan ditangkap saat Simpan; input manual memiliki prioritas dan kosong/spasi mengembalikan AUTO. Tanggal operasi mengikuti sesi, bukan perubahan tanggal kalender perangkat.
- Simpan data sumber dan temuan validasi; jangan mengoreksi atau membuang baris bermasalah secara diam-diam. Impor ulang harus idempoten.
- Tidak ada fasilitas Backup/Restore JSON pengguna setelah redesign Report. Teks WA tidak membawa seluruh metadata; file GitHub Pages bukan database atau backup ritase. Pemulihan metadata lengkap setelah kehilangan perangkat/browser tidak tersedia melalui UI.
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
| AC-06 | Koreksi waktu transaksi lokal sesi aktif | Nomor mengikuti posisi kronologis Opsi B; UUID tetap, semua perubahan nomor diaudit dan atomik; scope ambigu diblokir |
| AC-07 | Copy Report satu sesi | Plain-text, TAB asli, 11 kolom per baris, kolom keenam kosong, tanpa header/Markdown/backslash; kolom pertama menyertakan suffix |
| AC-08 | Tempel hasil Copy melalui WA ke Excel | Setiap baris dapat dipisahkan menjadi 11 kolom memakai TAB; verifikasi di lingkungan aktual diperlukan |
| AC-09 | Ada transaksi BDM dan ONI di perangkat | Report otomatis hanya sesi aktif satu timbangan; tidak ada filter campuran |
| AC-10 | Rekap dan ekspor sesi aktif | Seluruh ritase lokal aktif sesi masuk; TOTAL = rekap Pile ID = baris WA; urut nomor Opsi B tersimpan, tanpa renumbering saat export; data invalid memblokir |
| AC-11 | Ritase melewati `999` | Nomor berikutnya `1000`, tidak terpotong atau kembali ke `001` |
| AC-12 | Impor ulang laporan identik | Tidak menggandakan transaksi atau memajukan counter secara tidak sah; setelah Mulai Sesi Baru, laporan 83 BDM yang sama mengaktifkan NS 20/10/2026 dengan `46315-084`, bertahan setelah reload |
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
7. Nomor otomatis disimpan saat simpan berhasil; Opsi B menggantikan permanensi nomor setelah koreksi: kronologi sesi aktif dapat menomori ulang, UUID tetap, audit atomik. Filter/sort/export tidak menomori ulang. Cegah nomor ganda dan gap; lihat bagian 7.
8. Setelah paste lengkap, validasi penuh mendahului simpan atomik dan aktivasi sesi otomatis tanpa konfirmasi. Status singkat menggantikan preview baris/master. Data invalid atau konflik tidak mengubah sesi, baris sumber tidak dibuang atau diperbaiki dengan tebakan. Impor ulang idempoten; cegah proses bertumpuk dan kemunduran sesi.
9. Tetap tiga view Setup, Operasional, Report; root vanilla JS PWA, IndexedDB per HP, Destination + Checker_Crew Sheets/Apps Script, tanpa sinkronisasi ritase otomatis atau login operator. Backup/Restore JSON pengguna dihapus; API internal tetap kompatibel, pemulihan metadata lengkap tidak tersedia melalui UI.
10. Master berasal dari handover disahkan dan input lokal eksplisit; jam default perangkat tetap editable dengan waktu sumber/hasil edit terpelihara; audit koreksi dipertahankan; SL di luar v1.

11. OD-01 selesai: format waktu mengikuti bagian 3; sumber asli tetap tersimpan. Checker sesi baru diisi manual; checker kosong boleh mengaktifkan handover, tetapi tidak boleh menyimpan ritase baru. Keputusan lain pada bagian 13 tetap terbuka.

## 13. Keputusan Terbuka (Open Decisions)

| ID | Keputusan yang perlu dikonfirmasi owner | Konsekuensi sebelum keputusan |
|---|---|---|
| OD-01 (SELESAI) | Owner mengonfirmasi aturan waktu pada bagian 3 untuk perbaikan Setup v1.1.0 | `7.2` = 07:20; normalisasi `HH.mm`, simpan sumber, tolak nilai invalid tanpa tebakan |
| OD-02 | Pembatalan/penghapusan transaksi bernomor: status, gap, kemungkinan reuse, serta penanganan nomor terakhir | Penghapusan individual bernomor diblokir; reset total operasional bagian 6 sudah disahkan. Opsi B bagian 7 hanya untuk kronologi sesi aktif, bukan izin reuse/penghapusan |
| OD-03 | Laporan historis bergap, nomor ganda/tidak urut, baris rusak; definisi awal/akhir jika urutan sumber salah; prosedur koreksi | Deteksi dan laporkan masalah; jangan menyortir ulang, mengisi gap, membuang subset, atau mengaktifkan sesi diam-diam. Penolakan total campuran timbangan tetap final |
| OD-04 (SEBAGIAN SELESAI) | Report memakai seluruh ritase lokal sesi aktif tanpa filter, urut nomor tersimpan. Handover shift tanpa transaksi masih terbuka | TOTAL 0 tanpa baris/Salin/Unduh; laporan kosong tidak menyediakan suffix awal. Jangan membuat aturan deteksi pengganti |
| OD-05 | Dukungan/migrasi 10 kolom lama dan 11 kolom tanpa suffix; pemberian nomor bagi histori yang belum memilikinya | Format existing tidak memenuhi kontrak baru; jangan menghasilkan nomor historis dari sorting atau menebak shift |
| OD-06 | Impor dengan identitas bisnis sama tetapi isi berbeda; konflik dengan sesi aktif/draft, impor lama yang diulang setelah ada transaksi baru | Penggunaan ulang laporan tanpa konflik sudah disahkan pada bagian 6. Konflik isi, draft aktif, transaksi lokal tujuan, atau persiapan mundur dalam siklus berjalan tetap diblokir; seluruh histori/receipt sebelum reset total dihapus; prioritas/merge/overwrite dan rekonsiliasi konflik belum ditentukan |
| OD-07 | Penggunaan lebih dari satu HP untuk timbangan yang sama secara bersamaan dan rekonsiliasi backup antarperangkat | IndexedDB lokal tidak dapat menjamin keunikan global tanpa koordinasi; jangan mengklaim counter global tersinkronisasi |
| OD-09 | Penguncian/finalisasi laporan, penanganan laporan WA yang sudah dikirim, dan rekonsiliasi perbedaan nomor | Tidak mengetahui status kirim WA. Opsi B terbatas sesi aktif; perlindungan laporan terkirim belum dijamin |
| OD-10 | Tanggal aktual koreksi/input waktu manual NS, zona waktu dan batas shift resmi | Jangan mengarang tanggal dari HH.mm; edit NS ambigu diblokir. Device date hanya provenance, jam HP harus diverifikasi |
| OD-11 (SEBAGIAN SELESAI) | Popup tambah/edit/hapus Stockpile/Pile disahkan pada v1.1.2; input Product Code kolom 8 disahkan melalui popup lokal; aturan prefix tambahan belum disahkan | Empat field lokal, Product Code/Destination mengikuti pasangan aktif; kode numerik legacy tidak wajib. Angka unit memakai SAP; prefix lain dimasukkan lengkap, tidak ditebak |
| OD-08 | Bootstrap tanpa laporan sebelumnya, pemulihan perangkat baru, checker asal laporan dan pembatasan koreksi field identitas | Checker sesi baru sudah diputuskan: input manual operator. Checker asal tidak ditebak. Jangan mengarang tanggal awal, shift, nomor awal, atau metadata hilang untuk bootstrap/pemulihan; butuh prosedur owner yang eksplisit |

Jam batas shift, zona waktu operasional resmi, status T.Ksng/Gtg.Ksng, dan kebijakan retensi/backup yang belum diselesaikan pada PRD tetap terbuka sepanjang tidak dijawab oleh keputusan terbaru ini. Deteksi shift berbasis suffix sudah final dan tidak menunggu keputusan jam batas tersebut.

## 14. Konflik yang Diketahui dengan PRD dan Implementasi Existing (Known Conflicts with Existing PRD)

Tabel berikut adalah catatan historis sebelum implementasi Setup v1.1.0, bukan uraian seluruh perilaku aplikasi saat ini. Parser bernomor, deteksi sesi, penolakan campuran dan automatic handover, aturan waktu OD-01, serta checker manual telah diperbaiki dan diuji lokal; lihat [hasil pengujian](../testing/LOCAL_TEST_RESULTS.md). Tabel historis berikut dipertahankan. **Status v1.1.1 menggantikan baris Operasional/Exporter:** nomor tersimpan Opsi B kini diimplementasikan lokal; suffix memakai nomor aktual dan sorting nomor tersimpan. Task Report v1.1.1 menggantikan desain historis: tanpa filter, hanya lokal sesi aktif/aktivasi, rekap Pile ID + TOTAL dan WA lengkap; data tanpa nomor/identitas diblokir tanpa migrasi. Backup/Restore pengguna dihapus. OD-04 tersisa shift kosong; OD-05/09/10 tetap relevan. Tabel di bawah adalah catatan perilaku lama, bukan instruksi UI saat ini.

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

## 15. Multi-Checker dan master bersama (26 Oktober 2026)

Keputusan owner terbaru menggantikan input satu Checker dan ketentuan Destination-only. Versi aplikasi tetap v1.1.1. Satu shift dapat memilih beberapa Checker melalui popup checklist pada Sesi operasional, tanpa card baru. OK menyimpan pilihan lokal atomik; Cancel membatalkan checklist. Tidak membuat sesi, mengubah counter, menghapus ritase, atau menulis master. Pilihan kosong tetap menghalangi ritase baru.

Master aktif berasal dari tab `Checker_Crew` pada spreadsheet existing. Edit Checker membuka daftar dengan Edit/Hapus dan Add Checker paling bawah. Keputusan final owner terbaru menggantikan persyaratan key: semua pengguna boleh Add/Edit/Hapus tanpa login, password, kode akses, write key atau Script Properties otorisasi. Mutasi tetap memakai request_id, optimistic version, locking dan GET read-back. Hapus adalah soft delete berdasarkan ID stabil. Cache diperbarui setelah verifikasi, bukan berdasarkan respons POST. Sync List Checker hanya membaca server; kegagalan mempertahankan cache lama. Pemilihan cache tetap tersedia offline; mutasi memerlukan online. Master berubah tidak menghapus pilihan sesi atau mengubah snapshot histori.

Sesi dan transaksi baru membawa `checkers: [{checker_id,name}]`. Urut ID secara leksikografis deterministik; field kompatibilitas `checker` adalah nama terurut tersebut digabung `; `. Maksimum 50 pilihan, nama master 2–80 karakter, field turunan maksimum 4100 karakter. Data lama hanya `checker` tetap dibaca tanpa migrasi destruktif; pilihan legacy dipertahankan sebagai snapshot lokal sampai operator menggantinya. Draft input dipertahankan saat pilihan diganti; identitas sesi draft dan sesi disimpan bersama. Tab stale ditolak. Koreksi mempertahankan Checker asli transaksi walau pilihan sesi kini berbeda. Report menampilkan seluruh pilihan sesi; rekap tetap Pile ID. TSV WA tetap 11 kolom tanpa Checker.

Skema IndexedDB v1, database dan API backup internal tetap. Tidak ada JSON backup/restore pengguna. Owner melaporkan backend sudah diterbitkan; GET live dibaca ulang pada 26 Oktober 2026 (17 Checker, revision/list_version/status datar). POST Google dan Android tetap NOT VERIFIED; kode lokal tidak mengubah `/exec`. Lihat [kontrak Checker](../development/CHECKER_API.md).

### Integrasi anonim Checker — keputusan owner terbaru

Tab existing Checker_Crew tetap A:F: `Nama`, `checker_id`, `is_active`, `updated_at_utc`, `revision`, `request_id`. Tidak ada inisialisasi ulang/ID pengganti. Baris list aktif mengandung ID/nama/revision/request_id tanpa is_active; status datar membawa is_active. Frontend menerima format tersebut dan tetap dapat membaca cache lama version untuk pilihan offline.

POST Add hanya action/name/request_id/expected_version; ID baru ditetapkan backend. Edit menambah checker_id; Delete memakai action/checker_id/request_id/expected_version. Cache baru membawa token list_version. Owner telah mengonfirmasi bahwa hash list_version dipakai sebagai expected_version untuk semua operasi Add/Edit/Hapus; implementasi lokal sudah sesuai. Revision tetap metadata baris; token dianggap opaque oleh frontend.

Request tertunda disimpan di store pending existing sebelum POST dan dipertahankan pada kegagalan ambigu. Reload/online tidak mengirim POST otomatis. Operator memeriksa read-back atau mengirim ulang ID/payload yang sama dari popup existing. Setelah verifikasi, cache dan penghapusan pending commit bersama. VERSION_CONFLICT mengambil snapshot terbaru dan meminta operator meninjau ulang; DUPLICATE_NAME/INVALID_NAME/REQUEST_ID_REUSE menampilkan penolakan, tanpa membuat request pengganti otomatis. Kesalahan jaringan tidak menghapus cache atau pilihan sesi. Tanpa otorisasi khusus, siapa pun yang mengetahui endpoint dapat mengubah master; ini konsekuensi keputusan anonim owner, bukan perlindungan identitas operator.

## 16. Popup Stockpile / Pile ID v1.1.2 (26 Oktober 2026)

Keputusan owner menggantikan kewajiban Source Code dan penundaan UI pasangan lokal. Pilihan menampilkan hanya `Stockpile / Pile ID`, unik tanpa membedakan kapital/spasi ganda, terurut konsisten dan dapat di-scroll. Edit Daftar berada di bawah; mode pengelolaan menyediakan Edit/Hapus setiap pasangan, Add Pile ID dan Kembali. Cancel membatalkan perubahan. Hapus memerlukan konfirmasi dan menonaktifkan seluruh varian identitas pasangan aktif; tidak menyentuh histori/import.

Add/Edit menyimpan empat field dan hubungan Product Code/Destination bersama audit dalam satu transaksi IndexedDB existing. Stockpile dan Pile ID boleh baru. Product Code memakai pilihan lokal atau input baru yang divalidasi. Destination wajib berasal dari cache master Google existing; jika belum tersedia, Sync Destination di Setup. Pengelolaan pasangan tidak mengirim tulisan ke Google. Duplikat dan edit stale ditolak. Schema v1/nama database tetap.

Pemilihan atau penambahan pasangan mengisi Product Code/Destination otomatis. Edit pilihan aktif menyinkronkan draft; hapus pilihan aktif mengosongkan pasangan/target. Rerender yang tidak terkait mempertahankan override Product Code/Destination manual yang sah. Pasangan lama memakai hubungan dari histori impor pasangan yang sama dan provenance master; target ambigu tetap kosong sampai operator menetapkannya melalui Edit Daftar. Tidak mengambil target dari Stockpile lain.

Keputusan terbaru owner v1.1.2 menggantikan kewajiban Product Code numerik: **Legacy Product Code = kolom 7, tidak digunakan lagi untuk ritase baru; Product Code baru = nilai sebelumnya disebut Dome, tetap kolom 8.** Nama field internal `productCode` (legacy) dan `dome` dipertahankan demi kompatibilitas schema v1. Source Code dan Product Code numerik baru kosong. Pasangan Product Code/Destination aktif yang persis cocok cukup untuk menyimpan ritase; variasi kode numerik lama pada pasangan yang sama tidak memblokir mapping. Impor menerima kolom 3/7 lama yang terisi atau kosong dan tidak mengubah sumber/snapshot histori. Serializer mengosongkan kolom 3/6/7 juga saat memproyeksikan record existing, tanpa menulis ulang record.

Kontrol kanan Ritase Baru membuka popup **Product Code / Destination**, menampilkan ringkasan aktif dan aksi Edit. Daftar mendukung pilih satu ketukan, Tambah Mapping, Edit per pasangan dan Cancel. Add/Edit dua field memakai Product Code teks aman dan Destination aktif dari cache Google; kosong/duplikat/stale ditolak. ID mapping dipertahankan; varian legacy pasangan yang sama dirangkum. Edit mapping master secara eksplisit memperbarui relasi Stockpile/Pile terkait bersama audit atomik; UI menjelaskan dampaknya. Memilih override per ritase hanya mengubah draft, tidak mengubah master. Cancel form tidak menyimpan draft maupun master. Perubahan tersedia setelah reload/offline; tidak ada store/schema baru atau tulisan Google. Reset total tetap menghapus seluruh mapping lokal. Lihat [panduan mapping](../development/MATERIAL_MAPPING.md).

Modal native memblokir interaksi form/navbar dan menyembunyikan Simpan fixed. Penutupan mengikuti view aktif. Reset Mulai Sesi Baru tetap menghapus seluruh master/pasangan lokal dan hanya mempertahankan cache Destination dan Checker Google. Perubahan master tidak mengubah UUID, nomor, snapshot atau audit transaksi tersimpan. Penerimaan Android/Chrome HP dan Google live tetap belum terverifikasi.

### Validasi penamaan Add/Edit v1.1.2

Keputusan owner 26 Oktober 2026: identitas baru melalui popup memakai pola berikut, bukan whitelist kode yang sudah terdaftar.

- Stockpile: `BR-C_` + dua digit; `DS-C_` + dua digit + opsional satu huruf kapital; `LS_` atau `SS_` + dua digit. Contoh: `BR-C_05`, `DS-C_05B`, `LS_46`, `SS_14`.
- Pile ID: awalan `BR-C`, `DS-C`, `C`, `L`, atau `S` + satu/dua digit + opsional satu huruf kapital; `GT` + satu/dua digit; atau literal `SLNC` / `Eppe`. Lanjut underscore, lalu opsional `PL`, `S`, atau `L` dan dua/tiga digit. Contoh: `S14_38`, `L6_308`, `BR-C2_S02`, `S6_PL01`, `Eppe_S01`.
- Kapitalisasi persis, termasuk `Eppe`. Tidak mengganti minus/underscore atau kapitalisasi saat mengetik. Hanya whitespace awal/akhir identitas yang dibuang saat simpan. Kedua pola berdiri sendiri; tidak menebak hubungan Stockpile–Pile dari awalan.
- Keluar field atau OK memvalidasi format, menampilkan pesan spesifik terkait field melalui `aria-describedby` / `aria-invalid`; submit invalid memfokuskan field pertama yang perlu diperbaiki dan tidak menulis master/audit. Duplikat pasangan tetap ditolak oleh transaksi atomik.

Aturan ini hanya untuk penambahan dan perubahan identitas lewat Add/Edit. Master handover legacy seperti `TS_14`, `TS_15`, dan `C_02` tetap tersedia serta dapat dipilih. Pada Edit, setiap field identitas yang tidak berubah boleh mempertahankan nilai lama; mengganti Product Code/Destination tidak mewajibkan rename. Field identitas yang diubah harus valid sendiri, sedangkan field legacy lain yang tetap sama boleh dipertahankan. Impor, histori, ekspor, dan validasi record umum tidak memakai pola popup ini. Tidak ada migrasi, rename massal, perubahan schema atau Source Code wajib.
