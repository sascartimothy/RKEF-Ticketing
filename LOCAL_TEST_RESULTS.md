# Hasil build dan pengujian lokal

Tanggal laporan: **21 Oktober 2026 (Asia/Makassar)**. Build lokal saja; Git, GitHub, Pages settings, dan Apps Script deployment tidak diubah. Tidak ada data operasi pribadi yang digunakan.

## Lingkungan dan hasil

- Node.js Portable **v24.22.0**, `D:\Workspace\Tool\nodejs`.
- `npm.cmd test`: **PASS** — tes kontrak Apps Script existing dengan Google services mock, 17 tes Node frontend, dan pemeriksaan workspace/asset.
- `npm.cmd run dev`: **PASS** — sumber statis dilayani pada http://127.0.0.1:4173/RKEF-Ticketing/ dan root localhost.
- `npm.cmd run test:browser`: **PASS** — Chrome desktop headless lokal melalui CDP, profil sementara, viewport 360×800 dan 1280×900. Seluruh request eksternal diblokir. Ini bukan tes Android atau Google Sheets live.

## Cakupan otomatis

- Parser format baru 11 kolom dan lama 10 kolom bernomor; raw source dipertahankan, invalid count/blank TAB/time/date/whitespace ditolak, preview dan konfirmasi pemetaan format lama.
- Export/import round-trip, kolom ke-6 kosong, contoh serial **46315 = 20 Oktober 2026**, tanpa suffix; timezone UTC, Asia/Makassar dan America/Los_Angeles memberi hasil sama.
- Jam HH.mm, tanggal kabisat, field wajib, potensi duplikat seluruh 11 kolom (DT saja tidak dianggap unik), pemisahan filter sumber local/import, konflik mapping tanpa overwrite otomatis.
- Bridge Destination: preflight GET, field form yang terbatas, bounded retry/timeout, matching request_id, wrong-ID tidak sukses, retry idempoten, fallback cache dan kegagalan penulisan cache.
- IndexedDB asli di Chrome: transaksi abort rollback, snapshot tidak berubah setelah koreksi, source/edited time, audit atomik, revision conflict, tombstone penghapusan, impor receipt idempoten.
- Pilihan handover mengikuti laporan terakhir yang disahkan: master handover lama dinonaktifkan setelah konfirmasi; tambahan/koreksi lokal dipertahankan. ID retry simpan tidak boleh menimpa isi yang telah tersimpan berbeda.
- Backup/restore JSON mempertahankan ID, restore berulang tidak menggandakan, merge conflict membatalkan transaksi, replacement atomik.
- UI tiga view: sesi, pilihan lokal, input, koreksi dengan konfirmasi, preview handover dan impor, report TSV persis dan isolasi histori.
- Simulasi kegagalan quota tidak menampilkan sukses dan mempertahankan draft. Simulasi bridge belum terverifikasi menyimpan pending request; read-back mock dengan ID cocok memperbarui cache dan menutup pending atomik. Semua simulasi ini tetap bukan penulisan Google live.
- Service worker scope `/RKEF-Ticketing/`, app shell offline, session/record/draft jam manual bertahan setelah offline reload. Respons Sheets tidak berada dalam Cache Storage.
- Pemeriksaan screenshot desktop dan 360px. Screenshot hanya artefak lokal di `private-data/qa/` yang diabaikan Git.

## Belum terverifikasi

- [ ] Android/Chrome nyata pada HP operasional, termasuk kemampuan instalasi PWA dan kebijakan penyimpanan.
- [ ] Akses anonim Apps Script dari origin hosting target dan health/list live.
- [ ] POST iframe Android menambah Destination nyata, read-back request_id cocok, lalu refresh dari HP kedua.
- [ ] Timeout nyata, berpindah koneksi, kuota layanan dan reload saat permintaan cloud tertunda.
- [ ] Clipboard WhatsApp serta download TXT/JSON dan pemilihan file restore pada HP.
- [ ] Uji pemulihan backup antarperangkat, kapasitas data kerja, kebijakan retensi dan kebiasaan backup operator.
- [ ] Operator memeriksa master/mapping, identitas timbangan/checker, pilihan shift dan tanggal operasi.
- [ ] GitHub Pages live, penerimaan operasional, dan persetujuan rilis owner.

Tidak ada penulisan live ke Google Sheets selama tes ini. `apps-script/Code.gs` tetap salinan existing; tidak ada klaim bahwa modifikasi lokal memperbarui deployment online.
