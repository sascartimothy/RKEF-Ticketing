import { state } from './state.js';
import { $, escape, busy, toast } from './ui-components.js';
import { productPairs } from './master-data.js';
let context, changedDraft, flush, working = false;
const entry = () => $('#entry-form');
export function renderProductButton() {
  const form = entry();
  $('#product-summary').textContent = [form.elements.dome.value,form.elements.destination.value].filter(Boolean).join(' / ');
}
function apply(mapping) {
  for (const key of ['dome','destination']) entry().elements[key].value = mapping[key];
  entry().elements.productCode.value = '';
  return changedDraft();
}
function showList() {
  $('#product-title').textContent = 'Product Code / Destination';
  $('#product-error').hidden = true;
  $('#product-body').innerHTML = '<p>Mapping tersedia:</p>' + (productPairs(state.masters).map(m => `<div class="master-item"><button type="button" class="secondary product-choice" data-product-select="${escape(m.id)}">${escape(m.dome)} / ${escape(m.destination)}</button><button type="button" class="button-quiet" data-product-edit="${escape(m.id)}" aria-label="Edit ${escape(m.dome)} / ${escape(m.destination)}">Edit</button></div>`).join('') || '<p class="hint">Belum ada mapping lokal.</p>');
  $('#product-actions').innerHTML = '<button type="button" class="primary" id="product-add">+ Tambah Mapping</button><button type="button" class="secondary" id="product-close">Cancel</button>';
  $('#product-add').onclick = () => showForm();
  $('#product-close').onclick = () => $('#product-dialog').close();
}
function showForm(mapping = null) {
  const original = mapping ? structuredClone(mapping) : null;
  $('#product-title').textContent = `${mapping ? 'Edit' : 'Tambah'} Product Code / Destination`;
  $('#product-error').hidden = true;
  const destinations = (state.cache?.values || []).filter(d => d.is_active !== false);
  $('#product-body').innerHTML = `<form id="product-form" novalidate><fieldset><label>Product Code<input name="dome" maxlength="100" required value="${escape(mapping?.dome || '')}"></label><label>Destination<select name="destination" required><option value="">Pilih Destination...</option>${destinations.map(d => `<option value="${escape(d.destination_name)}">${escape(d.destination_name)}</option>`).join('')}</select></label>${mapping ? '<p class="hint">Edit memperbarui relasi Stockpile / Pile ID yang memakai mapping ini untuk input berikutnya. Histori ritase tetap.</p>' : ''}</fieldset></form>`;
  const form = $('#product-form'); form.elements.destination.value = mapping?.destination || '';
  $('#product-actions').innerHTML = '<button type="button" class="secondary" id="product-cancel">Cancel</button><button class="primary" type="submit" form="product-form" id="product-ok">OK</button>';
  $('#product-cancel').onclick = () => $('#product-dialog').close();
  form.onsubmit = e => {
    e.preventDefault(); if (working) return;
    $('#product-error').hidden = true;
    busy($('#product-ok'),async () => {
      working = true; form.querySelector('fieldset').disabled = true; $('#product-cancel').disabled = true;
      try {
        await flush();
        const sync = original && ['dome','destination'].every(k => entry().elements[k].value === original[k]);
        const saved = await context.db.saveProductPair({dome:form.elements.dome.value,destination:form.elements.destination.value},original);
        await context.changed();
        if (sync) await apply(saved);
        showList(); toast('Mapping tersimpan lokal.');
      } catch(error) {
        $('#product-error').textContent = error.message; $('#product-error').hidden = false;
        form.querySelector('fieldset').disabled = false; form.elements.dome.focus();
      } finally {
        working = false;
        if (form.isConnected) { form.querySelector('fieldset').disabled = false; $('#product-cancel').disabled = false; }
      }
    }).catch(context.fail);
  };
  form.elements.dome.focus();
}
export function initProductPopup(ctx,onDraftChange,flushDraft) {
  context = ctx; changedDraft = onDraftChange; flush = flushDraft;
  $('#choose-product').onclick = () => { showList(); $('#product-dialog').showModal(); };
  $('#product-dialog').addEventListener('cancel', e => { if (working) e.preventDefault(); });
  $('#product-body').onclick = async e => {
    const button = e.target.closest('button'); if (!button || working) return;
    const id = button.dataset.productSelect || button.dataset.productEdit;
    const mapping = state.masters.find(m => m.id === id && m.active !== false); if (!mapping) return;
    if (button.dataset.productEdit) showForm(mapping);
    else { const saved = apply(mapping); $('#product-dialog').close(); await saved; }
  };
}
