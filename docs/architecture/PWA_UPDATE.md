# Pemeriksaan dan Update PWA v1.1.2

Setup menampilkan judul versi dan tombol **↻ Update** di satu baris, status di bawahnya, lalu kesiapan offline serta diagnostik existing. Tidak ada halaman baru atau tombol hapus cache. Diagnostik menampilkan Build aktif dan Server dalam SHA-256 lengkap.

## Identitas dan rilis

App Version tetap `1.1.2` pada config/paket. Build ID adalah SHA-256 dari daftar terurut `path:SHA-256(bytes)` seluruh aset pada array `ASSETS` di worker, termasuk worker itu sendiri. Identitas tidak berasal dari jam perangkat, Git HEAD, atau file metadata yang harus dihasilkan sebelum rilis. Perubahan satu byte aset otomatis menghasilkan build berbeda walaupun versi tampilan sama. Mengembalikan seluruh byte persis ke build sebelumnya menghasilkan identitas yang sama secara sengaja.

`js/build-identity.js` dipakai frontend dan worker. Pemeriksaan membaca `sw.js`, memvalidasi inventori literal (tanpa eval), mengambil seluruh aset publik dengan maksimal enam request bersamaan, lalu menghitung hash. Biaya pemeriksaan adalah satu shell lengkap, termasuk ikon; dipilih agar tidak memerlukan backend/build/deploy hook. Timeout pemeriksaan 30 detik. URL memakai satu parameter tetap `rkef-build-check=1`, `cache:no-store` serta header `X-RKEF-Build-Check`. Worker baru meneruskan header ini ke jaringan; query tetap juga melewati pencocokan URL exact worker legacy. Tidak ada pertumbuhan URL berdasarkan timestamp. Respons gagal/kosong dan tipe JS/CSS salah ditolak.

Untuk publikasi oleh owner: terbitkan seluruh aset root dalam satu revisi, pertahankan inventori publik/offline, jalankan tes, lalu cek Build aktif = Server setelah publikasi selesai. Tidak ada langkah bump Build ID. Perubahan file dokumentasi atau backend saja tidak mengubah build frontend. Byte dari hosting merupakan referensi pemeriksaan; aplikasi tidak dapat membuktikan bahwa CDN sudah menyajikan commit Git terbaru. Publikasi bertahap dapat membuat snapshot sementara berbeda; instalasi menghitung ulang seluruh hash dan menolak jika tidak cocok dengan target.

## Pemeriksaan dan konfirmasi

Saat membuka aplikasi, sistem memeriksa jaringan. Kembali online atau kembali dari background boleh memeriksa setelah lima menit sejak pemeriksaan terakhir; tidak ada polling interval. Tombol Update selalu bisa memeriksa ulang, kecuali selama satu proses/dialog sedang berjalan. Pemeriksaan bersamaan digabung menjadi satu promise.

Terbaru hanya ditampilkan setelah hash server berhasil dibaca dan sama dengan snapshot worker yang mengontrol dokumen saat mulai. Offline/error tidak menghasilkan status terbaru. Pemeriksaan gagal tidak menghapus cache atau reload. Tanpa Service Worker, UI menjelaskan bahwa pembaruan aman belum didukung. Dev memakai worker jaringan dan tidak menyediakan verifikasi snapshot produksi; gunakan preview.

Instalasi pertama mengambil snapshot ke cache tanpa reload. Dokumen yang pertama kali dimuat lewat jaringan belum mempunyai identitas snapshot terverifikasi: status meminta tutup/buka kembali; tombol Update juga dapat menawarkan pemasangan terverifikasi dengan konfirmasi. Worker legacy yang belum mendukung pesan identitas diperlakukan sama, bukan diklaim terbaru. Permintaan identitas mempunyai timeout delapan detik.

Popup native **Perbarui Aplikasi?** mempunyai judul/deskripsi aksesibel, fokus awal Cancel, pembatas fokus bawaan browser, dan Escape/Cancel. Peringatan: pekerjaan atau perubahan belum disimpan **dapat** hilang. Cancel tidak memasang atau mengaktifkan worker, menghapus cache, mengubah draft, atau reload. OK, Update mengizinkan pemasangan dan satu reload setelah verifikasi. UI tidak menulis/menghapus draft. Draft operasional yang sudah diautosave ke IndexedDB dipulihkan oleh mekanisme existing; teks WA belum diproses dan perubahan form/popup yang hanya di memori dapat hilang.

## Lifecycle dan cache

Registrasi kandidat memakai `sw.js?build=<SHA-256>` pada scope existing dan `updateViaCache:none`. URL worker berbeda membuat perubahan aset saja dapat dipasang walaupun byte worker tetap sama. `registration.update()` meminta pemeriksaan browser; keberhasilannya sendiri tidak dianggap sebagai aktivasi.

Install mengambil semua aset lewat jaringan, menghitung hash lagi, menolak target tidak cocok, menulis snapshot di `rkef-shell-v1.1.2-<hash>`, dan menulis marker selesai terakhir. Snapshot gagal tidak menghapus versi sebelumnya. Worker tidak menjalankan skipWaiting saat install. Kandidat waiting menjawab BUILD_INFO hanya jika marker dan semua aset tersedia. UI menangani installing/waiting/active, kegagalan atau redundant, dan timeout pemasangan 45 detik.

OK mengirim ACTIVATE_BUILD hanya setelah kandidat siap. Worker memeriksa target, cache dan client, lalu menjalankan skipWaiting. Activate memeriksa cache, membersihkan shell lama secara terbatas, dan claim client. Frontend menunggu controller benar-benar mempunyai hash target dan shell lengkap, kemudian menyimpan target pada sessionStorage dan reload sekali. Tidak ada listener yang memuat ulang otomatis saat controllerchange; event itu hanya memperbarui informasi kesiapan offline. Setelah reload, target dibandingkan dengan worker pengontrol dokumen baru, lalu pemeriksaan jaringan harus sukses lagi sebelum status terbaru ditampilkan. Target tidak cocok menghasilkan kegagalan tanpa reload ulang.

Cleanup hanya menghapus cache berprefix `rkef-shell-`, mempertahankan snapshot baru dan cache origin lain. Saat lebih dari satu jendela aplikasi terlihat, cleanup ditunda; cache lama yang ditahan akan dibersihkan pada aktivasi aman berikutnya. Tidak ada unregister rutin atau Clear-Site-Data.

## Multi-tab dan perlindungan data

ACTIVATE_BUILD ditolak bila `clients.matchAll` menemukan jendela scope aplikasi lain, termasuk yang belum dikontrol. UI meminta menutup tab/jendela RKEF Ticketing lain lalu mencoba Update kembali. Tidak ada reload paksa atau broadcast reset tab lain. Worker waiting boleh menyimpan aset; penyimpanan kandidat ini tidak mengganggu snapshot aktif. Lifecycle alami browser tetap dapat mengaktifkan worker setelah semua client lama ditutup.

Pemeriksaan client bukan lock global browser: client baru dapat dibuka selama transisi. Cleanup memeriksa ulang jumlah client dan menahan cache saat lebih dari satu terlihat. Pengguna tetap harus menutup jendela lain dan menghindari membuka jendela baru selama update; perilaku antarjendela PWA/Safari bergantung pada lifecycle browser dan perlu uji perangkat. Instalasi OS/ikon launcher dapat tertunda mengikuti cache OS meski aset web sudah baru.

Modul update dan worker tidak mengimpor database, memanggil reset operasional, menghapus database, mengubah schema, atau menulis store IndexedDB. Seluruh records/histori, audit, masters/mapping, settings/sesi/counter/draft, cache master Google, imports dan pending persisten tetap di database `rkef-ticketing` schema v1. CacheStorage shell berbeda dari store IndexedDB bernama cache. Update aplikasi bukan Mulai Sesi Baru. Penyimpanan browser yang dibersihkan pengguna/OS tetap merupakan risiko existing; UI tidak menyediakan pemulihan metadata lengkap.

## Verifikasi

Jalankan `npm.cmd test`, `npm.cmd run test:browser`, `npm.cmd run check:docs`, dan `git diff --check`. Tes update memakai dua snapshot sintetis pada server loopback allowlisted, profile sementara dan database sintetis; bukan origin produksi. Bukti hasil ada di [hasil pengujian lokal](../testing/LOCAL_TEST_RESULTS.md). Android Chrome, Safari iPhone, installed PWA dan publikasi/CDN GitHub Pages nyata tetap memerlukan verifikasi owner.

Rujukan lifecycle: [MDN updateViaCache](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/updateViaCache), [update()](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/update), dan [Clients.matchAll](https://developer.mozilla.org/en-US/docs/Web/API/Clients/matchAll).
