import { state, uid, now } from './state.js';
import { $, escape, toast, busy, displayStamp, confirmAction } from './ui-components.js';
import { refreshDestinationCache } from './apps-script-api.js';
import { destinationName } from './validation.js';
let context, syncing = false, syncError = '', verifiedAt = '';
export function renderDestinations() {
  const values = state.cache?.values || [];
  $('#destination-count').textContent = values.length;
  $('#destination-list').innerHTML = values.map(d => `<span class="chip">${escape(d.destination_name)}</span>`).join('') || '<p class="hint">Belum ada cache. Pasangan dari handover tetap dapat dipakai secara lokal.</p>';
  const online = navigator.onLine;
  $('#sync-state').className = 'alert' + (syncError || !online ? ' warning' : verifiedAt ? ' success' : '');
  $('#sync-state').textContent = (syncing ? 'Membaca master… ' : syncError ? syncError + ' ' : !online ? 'Offline — memakai snapshot lokal. ' : verifiedAt ? 'Master berhasil dibaca. ' : 'Snapshot lokal; belum diperiksa pada pembukaan ini. ') + 'Sinkronisasi terakhir: ' + displayStamp(state.cache?.syncedAt) + '.';
  $('#destination-form button').disabled = !state.ready || !online || !!state.pending || syncing;
  $('#refresh-destination').disabled = !state.ready || !online || syncing;
  $('#health').disabled = !online || syncing;
  const p = state.pending;
  $('#pending-destination').hidden = !p;
  if (p) $('#pending-destination').innerHTML = `<strong>Belum terverifikasi: ${escape(p.name)}</strong><p class="hint">request_id: ${escape(p.requestId)}<br>Periksa kembali; refresh halaman tidak mengirim ulang otomatis.</p><div class="button-row"><button id="verify-pending" class="secondary" ${!online ? 'disabled' : ''}>Cek read-back</button><button id="retry-pending" class="button-quiet" ${!online ? 'disabled' : ''}>Kirim ulang ID yang sama</button><button id="dismiss-pending" class="button-quiet">Tutup permintaan</button></div>`;
}
async function cacheVerified(result) {
  // Keep pending until the verified cache and cleared request commit together.
  await context.db.transaction(['cache', 'pending'], 'readwrite', s => {
    s.cache.put({ id: 'destinations', values: result.values, syncedAt: now() });
    s.pending.delete('destination');
  });
  verifiedAt = now(); syncError = '';
  await context.changed();
  toast('Destination terverifikasi melalui request_id dan tersimpan di cache lokal.');
}
export async function syncDestinations() {
  if (syncing || !state.ready) return;
  if (!navigator.onLine) { syncError = 'Offline. Penambahan master bersama belum tersedia.'; renderDestinations(); return; }
  syncing = true; renderDestinations();
  try {
    const result = await refreshDestinationCache(context.db, context.bridge);
    syncError = result.error?.message || '';
    if (!result.stale) verifiedAt = now();
    await context.changed();
  } catch (e) { syncError = e.message; }
  finally { syncing = false; renderDestinations(); }
}
export function initDestinations(ctx) {
  context = ctx;
  $('#refresh-destination').onclick = () => syncDestinations();
  $('#health').onclick = () => busy($('#health'), async () => {
    try { const r = await ctx.bridge.health(); toast('Health merespons, versi ' + r.version + '. POST belum dibuktikan oleh health.'); }
    catch (e) { syncError = e.message; toast(e.message, true); }
  }).finally(renderDestinations);
  $('#destination-form').onsubmit = e => { e.preventDefault(); busy($('button', e.currentTarget), async () => {
    if (!navigator.onLine) return toast('Offline. Penambahan Destination ke Sheets belum tersedia.', true);
    if (state.pending) return;
    try {
      const raw = e.target.elements.name.value;
      const name = destinationName(raw);
      if (!await confirmAction('Tambah Destination bersama?', `Nama yang akan dikirim: ${name}\nPerubahan ini menambah master Google Sheets. Data ritase dan checker tidak dikirim.`, 'Tambah ke Sheets')) return;
      const pending = { id: 'destination', name, requestId: 'pwa_' + uid().replaceAll('-', ''), createdAt: now() };
      await ctx.db.put('pending', pending); await ctx.changed();
      await cacheVerified(await ctx.bridge.add(name, pending.requestId));
      e.target.reset();
    } catch (error) { syncError = error.message; toast(error.message, true); }
    finally { renderDestinations(); }
  }).catch(ctx.fail).finally(renderDestinations); };
  $('#pending-destination').onclick = async e => {
    const p = state.pending; if (!p) return;
    const button = e.target.closest('button'); if (!button) return;
    await busy(button, async () => {
      try {
        if (button.id === 'dismiss-pending') {
          if (!await confirmAction('Tutup permintaan?', 'Baris mungkin sudah ada di Google Sheets. Menutup permintaan tidak membatalkan penulisan. Periksa Sheet sebelum menambah ulang.', 'Tutup permintaan')) return;
          await ctx.db.transaction(['pending', 'audit'], 'readwrite', s => {
            s.pending.delete('destination'); s.audit.put({ id: uid(), action: 'dismiss-destination', at: now(), request: p });
          });
          await ctx.changed(); return;
        }
        if (!navigator.onLine) throw Error('Offline. Sambungkan jaringan untuk read-back.');
        if (button.id === 'retry-pending' && !await confirmAction('Kirim ulang?', 'Menggunakan request_id yang sama agar backend tetap idempoten.', 'Kirim ulang')) return;
        await cacheVerified(button.id === 'retry-pending' ? await ctx.bridge.add(p.name, p.requestId) : await ctx.bridge.verify(p.name, p.requestId));
      } catch (error) { syncError = error.message; toast(error.message, true); renderDestinations(); }
    });
  };
}
