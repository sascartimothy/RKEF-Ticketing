# Kontrak API Checker — anonim v1.1.1

Keputusan final owner 26 Oktober 2026 menggantikan persyaratan kode akses pada implementasi sebelumnya. Semua pengguna boleh membaca, memilih, Add/Edit/Hapus dan Sync tanpa login/password/write key/Script Properties otorisasi. Endpoint anonim dapat dimutasi oleh siapa pun yang mengetahuinya. Validasi dan pengendalian konflik tetap berlaku.

[Code.gs](../../apps-script/Code.gs) adalah kandidat lokal; perubahan file tidak memperbarui `/exec`. URL Web App, ID spreadsheet, tab Destination dan kontraknya tidak berubah. Owner melaporkan deployment Checker sudah diperbarui. GET live dibaca langsung tanpa mutasi pada 26 Oktober 2026 dan mengonfirmasi 17 Checker serta bentuk respons di bawah. Tidak ada nama/ID real yang disalin menjadi seed atau fixture publik.

## Schema existing

Checker_Crew A:F: `Nama | checker_id | is_active | updated_at_utc | revision | request_id`.

ID existing dipertahankan. Tidak ada initializer, spreadsheet baru, auto-migration atau penggantian ID. Add menetapkan ID baru CHK-UUID pada backend; Edit/Delete memakai ID yang sama. Revision integer positif, naik saat mutasi; Delete menonaktifkan baris. Header/data rusak ditolak tanpa perbaikan diam-diam.

## Transport dan payload

| Transport | action | Field / respons |
|---|---|---|
| GET JSONP | listCheckers | `{ok:true,version:"0.9.0",list_version,count,checkers:[{checker_id,name,revision,request_id}]}`; hanya aktif |
| GET JSONP | checkerStatus | Query `checker_id` dan/atau `request_id`; respons datar `{ok:true,checker_id,name,is_active,revision,request_id,list_version}` atau `{ok:false,code:"NOT_FOUND"}` |
| POST form ke iframe | addChecker | `action`, `name`, `request_id`, `expected_version`; tanpa checker_id client |
| POST form ke iframe | editChecker | `action`, `checker_id`, `name`, `request_id`, `expected_version` |
| POST form ke iframe | deleteChecker | `action`, `checker_id`, `request_id`, `expected_version` |

Tidak ada field credential pada transport, konfigurasi, popup atau backend. GET lain health/list dan POST addDestination mempertahankan perilaku existing.

Frontend memperlakukan list_version sebagai token opaque 64 karakter heksadesimal. **Owner mengonfirmasi: expected_version memakai hash list_version untuk semua operasi Add/Edit/Hapus. Implementasi lokal sudah sesuai; revision bukan token expected_version.** Konfirmasi ini menetapkan semantik kontrak, bukan bukti POST live sudah lulus. Source backend live tidak diberikan dalam tugas ini. Algoritme hash lokal adalah SHA-256 JSON baris terurut ID (ID/nama/aktif/revision/request_id), bukan klaim algoritme byte-identik dengan deployment existing.

Frontend menormalkan is_active=true yang tidak dikirim pada baris list; revision tetap revision. Cache lama dengan field version masih dibaca non-destruktif untuk pilihan offline; mutasi memerlukan token baru dari Sync. Data sesi/record lama tidak diubah.

## Validasi, konflik dan retry

Nama 2–80 karakter, tolak kosong/formula-prefix/HTML/TAB/control/Unicode line separators. Nama unik case/spasi-insensitive; kandidat lokal juga mencegah pemakaian ulang nama nonaktif. Request ID 12–100 alfanumerik/underscore/hyphen. Seluruh mutasi memakai LockService; expected token diperiksa di dalam lock. Satu row setValues/appendRow menyimpan nama, ID stabil, status, timestamp, revision dan request_id.

Receipt adalah request_id mutasi terakhir pada baris. Retry payload identik yang masih menjadi mutasi terakhir mengembalikan ALREADY_APPLIED, tanpa append/kenaikan revision. ID sama dengan isi berbeda ditolak REQUEST_ID_REUSE. Setelah row dimutasi lagi, receipt lama tidak menjadi ledger permanen; token stale menolak penerapan ulang. Tidak ada klaim ledger global permanen.

Sebelum POST, client menyimpan payload/ID/waktu ke pending IndexedDB, memeriksa receipt ID semula dan snapshot terbaru. Receipt yang cocok diverifikasi tanpa mengirim POST lagi. Konflik token dan duplikat yang terlihat ditolak sebelum write. POST hanya dikirim atas aksi operator; tidak ada retry otomatis, termasuk pada reload/online.

Respons POST tidak membuktikan sukses. Frontend mem-poll GET status maksimum lima kali, mencocokkan ID/request_id/nama/status/revision yang valid, lalu membaca list terbaru dengan token sama dan mengecek kehadiran/ketiadaan baris. Cache dan penghapusan pending commit bersama. Respons sukses iframe tanpa bukti GET tetap belum terverifikasi.

Kandidat backend mengirim postMessage kind RKEF_CHECKER_RESULT dengan payload/request_id untuk penolakan. Frontend hanya menerima error dari origin Google yang sesuai dan request_id sama; sukses tetap harus GET. Bentuk postMessage deployment belum diuji live. Jika respons ini tidak tersedia, hasil ambigu tetap pending; client tidak menebak penolakan sebagai keberhasilan.

- VERSION_CONFLICT: ambil snapshot terbaru, tampilkan konflik, operator meninjau ulang; tidak ada overwrite/retry otomatis.
- DUPLICATE_NAME / INVALID_NAME: tampilkan alasan penolakan.
- REQUEST_ID_REUSE: tampilkan penolakan; tidak membuat request pengganti otomatis.
- Network, timeout, schema atau read-back tidak cocok: pertahankan cache/payload/ID pending; Cek read-back atau Kirim ulang ID sama tersedia dalam popup Edit Checker.

Pending bertahan setelah reload dan menghalangi mutasi baru sampai hasil semula ditentukan. Dua tab tidak boleh mengganti pending berbeda diam-diam. Sync hanya membaca server dan tidak menimpa master menggunakan cache lama. Session checker selection, histori, nomor, Report/Pile ID dan WA 11 kolom tetap terpisah dari mutasi master.

## Batas verifikasi

GET listCheckers dan checkerStatus existing: VERIFIED read-only dari proses lokal. Semantik expected_version: CONFIRMED oleh owner. POST Add/Edit/Delete live, format error iframe live, akses browser lintas-origin/Android dan dua HP: **NOT VERIFIED**. Automated tests memakai Google mock dan database/profil sintetis; tidak melakukan live write. Tidak ada deployment/Git mutation dilakukan.
