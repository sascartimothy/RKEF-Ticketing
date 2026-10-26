import { state } from './state.js';
import { $, escape, busy, confirmAction, toast } from './ui-components.js';
import { stockPairs, stockTarget, resolveProduct, pairKey } from './master-data.js';
let context, changedDraft, flush, editing = null, working = false;
const entry = () => $('#entry-form');
const label = m => `${m.stockpile} / ${m.pileId}`;
export function renderStockButton() {
  const form = entry();
  $('#choose-stock').textContent = form.elements.stockpile.value ? label({stockpile:form.elements.stockpile.value,pileId:form.elements.pileId.value}) : 'Pilih...';
}
function selected(m) { return pairKey({stockpile:entry().elements.stockpile.value,pileId:entry().elements.pileId.value}) === pairKey(m); }
function apply(m) {
  const form = entry(), target = m && stockTarget(m,state.masters,state.records,state.lastHandover);
  const product = target && resolveProduct(target.dome,target.destination,state.masters);
  for (const k of ['stockpile','pileId']) form.elements[k].value = m?.[k] || '';
  form.elements.sourceCode.value = '';
  for (const k of ['dome','destination']) form.elements[k].value = target?.[k] || '';
  form.elements.productCode.value = product?.productCode || '';
  if (m && !target) toast('Mapping Dome / Destination belum lengkap atau ambigu. Gunakan Edit Daftar untuk menetapkan pasangan.',true);
  else if (m && !product) toast('Product Code belum dikenali secara unik. Pasangan tersimpan; ritase diblokir sampai mapping Product valid tersedia.',true);
  return changedDraft();
}
function actions(html) { $('#stock-actions').innerHTML = html; }
function showList(manage = false) {
  editing = null; $('#stock-error').hidden = true;
  $('#stock-title').textContent = manage ? 'Edit Stockpile / Pile ID' : 'Pilih Stockpile / Pile ID';
  const list = stockPairs(state.masters);
  $('#stock-body').innerHTML = list.map(m => manage ? `<div class="master-item"><span>${escape(label(m))}</span><div class="actions"><button class="secondary" data-stock-edit="${escape(m.id)}">Edit</button><button class="button-quiet text-danger" data-stock-delete="${escape(m.id)}">Hapus</button></div></div>` : `<button class="stock-choice secondary full" data-stock-select="${escape(m.id)}">${escape(label(m))}</button>`).join('') || '<p class="hint">Belum ada pasangan aktif. Tambahkan melalui Edit Daftar.</p>';
  actions(manage ? '<button class="primary" id="stock-add">+ Add Pile ID</button><button class="secondary" id="stock-back">Kembali</button>' : '<button class="secondary" id="stock-close">Tutup</button><button class="primary" id="stock-manage">Edit Daftar</button>');
  if (manage) { $('#stock-add').onclick = () => showForm(); $('#stock-back').onclick = () => showList(); }
  else { $('#stock-close').onclick = () => $('#stock-dialog').close(); $('#stock-manage').onclick = () => showList(true); }
}
function showForm(m = null) {
  editing = m ? structuredClone(m) : null;
  const target = m && stockTarget(m,state.masters,state.records,state.lastHandover);
  $('#stock-error').hidden = true; $('#stock-title').textContent = m ? 'Edit Stockpile / Pile ID' : 'Tambah Stockpile / Pile ID';
  const destinations = (state.cache?.values || []).filter(d => d.is_active !== false);
  const domes = [...new Set(state.masters.filter(m => m.active !== false).map(m => m.dome).filter(Boolean))].sort();
  $('#stock-body').innerHTML = `<form id="stock-form" novalidate><fieldset><label>Stockpile<input name="stockpile" maxlength="100" list="stock-options" required value="${escape(m?.stockpile || '')}"></label><label>Pile ID<input name="pileId" maxlength="100" required value="${escape(m?.pileId || '')}"></label><label>Dome<input name="dome" maxlength="100" list="stock-dome-options" required value="${escape(target?.dome || '')}"></label><datalist id="stock-dome-options">${domes.map(d => `<option value="${escape(d)}"></option>`).join('')}</datalist><label>Destination<select name="destination" required><option value="">Pilih Destination...</option>${destinations.map(d => `<option value="${escape(d.destination_name)}">${escape(d.destination_name)}</option>`).join('')}</select></label><p class="hint" id="stock-product-state" role="status"></p></fieldset></form>`;
  const form = $('#stock-form'); form.elements.destination.value = target?.destination || '';
  const status = () => { const p = resolveProduct(form.elements.dome.value,form.elements.destination.value,state.masters); $('#stock-product-state').textContent = p ? `Product Code: ${p.productCode}` : 'Product Code belum dikenali secara unik. Pasangan boleh disimpan; ritase memerlukan mapping Product valid dari handover.'; };
  form.oninput = status; form.onchange = status; status();
  actions('<button class="secondary" id="stock-cancel">Cancel</button><button class="primary" type="submit" form="stock-form" id="stock-ok">OK</button>');
  $('#stock-cancel').onclick = () => showList(true);
  form.onsubmit = e => { e.preventDefault(); if (working) return; busy($('#stock-ok'), async () => {
    working = true; form.querySelector('fieldset').disabled = true; $('#stock-cancel').disabled = true;
    try {
      await flush();
      const input = Object.fromEntries(['stockpile','pileId','dome','destination'].map(k => [k,form.elements[k].value]));
      const sync = !editing || selected(editing);
      const saved = await context.db.saveStockPair(input,editing);
      await context.changed();
      if (sync) await apply(saved);
      showList(true); toast('Pasangan dan mapping tersimpan lokal.');
    } catch(error) { $('#stock-error').textContent = error.message; $('#stock-error').hidden = false; }
    finally { working = false; if (form.isConnected) {form.querySelector('fieldset').disabled = false; $('#stock-cancel').disabled = false;} }
  }).catch(context.fail); };
  form.elements.stockpile.focus();
}
export function initStockPopup(ctx, onDraftChange, flushDraft) {
  context = ctx; changedDraft = onDraftChange; flush = flushDraft;
  $('#choose-stock').onclick = () => { showList(); $('#stock-dialog').showModal(); };
  $('#stock-dialog').addEventListener('cancel', e => { if (working) e.preventDefault(); });
  $('#stock-body').onclick = async e => {
    const button = e.target.closest('button'); if (!button || working) return;
    const id = button.dataset.stockSelect || button.dataset.stockEdit || button.dataset.stockDelete;
    const m = state.masters.find(m => m.id === id && m.active !== false); if (!m) return;
    if (button.dataset.stockSelect) { const saved = apply(m); $('#stock-dialog').close(); await saved; }
    else if (button.dataset.stockEdit) showForm(m);
    else {
      working = true;
      try {
        if (!await confirmAction('Hapus pasangan?', `${label(m)} tidak lagi tersedia dalam daftar aktif. Histori ritase tetap tersimpan.`, 'Hapus')) return;
        await flush(); const sync = selected(m);
        await ctx.db.saveStockPair(m,structuredClone(m),true); await ctx.changed(); if (sync) await apply(null);
        showList(true); toast('Pasangan dinonaktifkan. Pilih pasangan aktif untuk input baru.');
      } catch(error) { $('#stock-error').textContent = error.message; $('#stock-error').hidden = false; }
      finally { working = false; }
    }
  };
}
