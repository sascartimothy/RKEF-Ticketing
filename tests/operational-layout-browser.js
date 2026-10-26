(async () => {
  const $ = s => document.querySelector(s);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const assert = (value, message) => { if (!value) throw Error(message); };
  const visible = () => $('#save-entry').checkVisibility();
  const navigate = async view => { location.hash = view; await wait(80); };
  await navigate('operasional');
  document.activeElement?.blur(); await wait(30);
  assert(visible(), 'Save missing on Operasional');
  assert(document.querySelectorAll('#save-entry').length === 1 && $('#save-entry').form === $('#entry-form'), 'Single original submit association');
  const stock = $('#entry-form [data-mapping=stock]'), product = $('#entry-form [data-mapping=product]');
  const a = stock.getBoundingClientRect(), b = product.getBoundingClientRect(), dt = $('#entry-form [name=dtNo]').getBoundingClientRect();
  assert(Math.abs(a.top - b.top) < 1 && a.right < b.left && Math.abs(a.width-b.width) < 1, 'Mappings must align in equal columns');
  assert(dt.width > a.width + b.width, 'DT must occupy full row');
  assert(product.closest('label').textContent.startsWith('Dome / Destination'), 'New visual product label');
  const oldText = stock.textContent;stock.textContent = 'LONG SYNTHETIC MAPPING '.repeat(15);
  assert(document.documentElement.scrollWidth <= innerWidth, 'Long pair label causes overflow');
  stock.textContent = oldText;
  assert(getComputedStyle($('.entry-save-bar')).position === 'fixed', 'Save is not fixed');
  const before = $('#save-entry').getBoundingClientRect();window.scrollTo(0, document.body.scrollHeight);await wait(30);
  const after = $('#save-entry').getBoundingClientRect(), nav = $('.bottom-nav').getBoundingClientRect();
  assert(Math.abs(before.top-after.top)<1, 'Save moves on scroll');
  assert(after.bottom < nav.top && nav.top-after.bottom < 24 && after.left >= 0 && after.right <= innerWidth, 'Save/nav geometry');
  assert(document.documentElement.scrollWidth <= innerWidth, 'Operational horizontal overflow');
  for (const view of ['setup','report','operasional']) {await navigate(view);assert(visible() === (view==='operasional'), 'Save visibility on '+view);}
  for (const id of ['correction-dialog','confirm-dialog','audit-dialog','checker-dialog','stock-dialog']) {
    const dialog = $('#'+id);dialog.showModal();assert(!visible(),'Save visible under '+id);dialog.close();await wait(20);assert(visible(),'Save not restored after '+id);
  }
  $('#confirm-dialog').showModal();await navigate('report');$('#confirm-dialog').close();await wait(20);assert(!visible(),'Dialog close resurrects save on Report');
  await navigate('operasional');
  const fieldset = $('#entry-fields'), oldDisabled = fieldset.disabled;fieldset.disabled = true;
  assert($('#save-entry').matches(':disabled'), 'Fixed save lost inherited disabled state');fieldset.disabled = oldDisabled;
  window.scrollTo(0,0);
  return `PASS v1.1.2 ${innerWidth}px aligned mappings, long options, full-width DT, fixed save/scroll/nav, single form submit, inherited disabled, navigation and all dialogs`;
})()
