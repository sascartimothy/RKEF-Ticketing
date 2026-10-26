(async () => {
  const $ = s => document.querySelector(s);
  const assert = (v, m) => { if (!v) throw Error(`${innerWidth}px: ${m}`); };
  const wait = () => new Promise(r => setTimeout(r, 80));
  const {state} = await import('./js/state.js');
  const {renderSetup} = await import('./js/setup-ui.js');
  const mode = state.session ? 'active' : 'inactive';
  const summary = $('#session-summary');
  assert(document.querySelectorAll('#session-summary').length === 1, 'Duplicated session status');
  assert(state.session ? summary.textContent.includes(state.session.operationDate) : summary.textContent.startsWith('Belum ada sesi aktif.'), 'Actual session status');
  const noOverflow = () => assert(document.documentElement.scrollWidth <= innerWidth, 'Page horizontal overflow');
  const focusFields = async root => {
    for (const field of root.querySelectorAll('input:not([type=hidden]),select,textarea')) {
      if (!field.checkVisibility() || field.matches(':disabled')) continue;
      assert(parseFloat(getComputedStyle(field).fontSize) >= 16, `Small focus font: ${field.name || field.id}`);
      field.focus(); await wait();
      const rect = field.getBoundingClientRect();
      assert(rect.left >= 0 && rect.right <= innerWidth, 'Focused field outside viewport');
      noOverflow(); field.blur();
    }
  };
  for (const view of ['setup', 'operasional', 'report']) {
    location.hash = view; await wait(); window.scrollTo(0, 0); await wait();
    const section = $('#view-' + view);
    assert(!section.hidden, 'Navigation failed');
    assert($('.brand').getBoundingClientRect().top >= 0 && $('#network').checkVisibility(), 'Full brand/network missing at top');
    assert(!$('.session-bar').classList.contains('is-mini'), 'Mini remained at top');
    const status = summary.textContent;
    if (view === 'operasional') {
      assert(!section.querySelector('.page-heading'), 'Operational introduction remains');
      assert(!/02 \/ PENCATATAN LAPANGAN|Input ritase|Catat transaksi dan periksa/.test(section.textContent), 'Old introduction text');
      assert(section.querySelector('.stack').firstElementChild.matches('.entry-card'), 'Entry card is not first');
      assert($('#no-session').hidden === !!state.session, 'Inactive warning');
      if (!state.session) assert($('#save-entry').matches(':disabled'), 'Inactive session can save');
      const keypad = $('#dt-keypad'), keys = [...keypad.querySelectorAll('button')];
      const rects = keys.map(b=>b.getBoundingClientRect());
      assert(keys.length===11 && keys.map(b=>b.dataset.dtKey).join(',')==='1,2,3,4,5,6,7,8,9,0,backspace', 'Keypad count/order');
      assert(rects.every(r=>Math.abs(r.top-rects[0].top)<1 && Math.abs(r.width-rects[0].width)<1 && r.width>0 && r.height>=44), 'Keypad single row/equal columns/height');
      const bounds=keypad.getBoundingClientRect();
      const card=$('.entry-card').getBoundingClientRect();
      assert(bounds.left>=0 && bounds.right<=innerWidth, 'Keypad outside card/viewport');
      assert(keypad.scrollWidth<=keypad.clientWidth && keypad.scrollLeft===0 && !['auto','scroll','hidden','clip'].includes(getComputedStyle(keypad).overflowX), 'Keypad scroll or clipping fallback');
      rects.forEach((r,i)=>{
        assert(r.left>=bounds.left && r.right<=bounds.right+.1 && r.top>=bounds.top && r.bottom<=bounds.bottom, 'Key outside keypad');
        assert(r.left>=card.left && r.right<=card.right && r.left>=0 && r.right<=innerWidth, 'Key outside card/viewport');
        if(i)assert(r.left>=rects[i-1].right, 'Overlapping keypad buttons');
      });
      const dt=$('#entry-dt').getBoundingClientRect(), mappings=$('.entry-mappings').getBoundingClientRect();
      assert(dt.left>=card.left && dt.right<=card.right && dt.bottom<=bounds.top && mappings.top>=bounds.bottom, 'Input/keypad/mapping order or clipping');
    }
    if (view === 'report' && state.session) $('#report-preview').open = true;
    await focusFields(section);
    // Short empty Report also needs a scroll surface to exercise sticky boundaries.
    const spacer = document.createElement('div'); spacer.style.height = '1600px'; section.append(spacer);
    try {
      window.scrollTo(0, 240); await wait();
      assert($('.session-bar').classList.contains('is-mini'), 'Mini not activated');
      assert($('.app-header').getBoundingClientRect().bottom <= 0, 'Brand/network still in viewport');
      assert(Math.abs($('.session-bar').getBoundingClientRect().top) < 1, 'Status not at viewport top');
      assert(getComputedStyle($('.local-label')).visibility === 'hidden' || !$('.local-label').checkVisibility(), 'Extra label in mini');
      assert(summary.textContent === status, 'Status changed while scrolling');
      const firstY = scrollY, firstHeight = $('.session-bar').getBoundingClientRect().height;
      await wait(); await wait();
      assert(scrollY === firstY && $('.session-bar').getBoundingClientRect().height === firstHeight, 'Repeated layout shift');
      window.scrollTo(0, 1100); await wait();
      assert(Math.abs($('.session-bar').getBoundingClientRect().top) < 1, 'Sticky lost on deep scroll');
      window.scrollTo(0, 0); await wait();
      assert(!$('.session-bar').classList.contains('is-mini') && $('.brand').getBoundingClientRect().top >= 0, 'Full header not restored');
      // Crossing the boundary never changes document height or scroll position.
      const height = document.documentElement.scrollHeight, edge = $('.app-header').offsetHeight;
      for (const y of [edge - 1, edge + 1, edge - 1, edge + 1]) {
        window.scrollTo(0, y); await wait();
        assert(Math.abs(scrollY - y) < 1 && document.documentElement.scrollHeight === height, 'Threshold scroll jump');
      }
    } finally { spacer.remove(); window.scrollTo(0, 0); await wait(); }
    noOverflow();
    const nav = $('.bottom-nav').getBoundingClientRect();
    assert(nav.left >= 0 && nav.right <= innerWidth && nav.bottom <= innerHeight, 'Navbar outside viewport');
  }
  // Exercise real popup rendering and field focus, without submitting any data.
  location.hash = 'operasional'; await wait();
  const popupCheck = async dialog => {
    await wait();
    const r = dialog.getBoundingClientRect();
    assert(r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, 'Popup exceeds viewport');
    assert(dialog.scrollWidth <= dialog.clientWidth, 'Popup internal horizontal overflow');
    assert(!$('#save-entry').checkVisibility(), 'Fixed save above modal');
    assert(document.elementFromPoint(r.left + r.width / 2, r.top + 5)?.closest('dialog') === dialog, 'Modal below header');
    await focusFields(dialog); noOverflow();
  };
  if (state.session) {
    $('#choose-stock').click(); $('#stock-manage').click(); $('#stock-add').click();
    await popupCheck($('#stock-dialog'));
    $('#stock-cancel').click(); $('#stock-back').click(); $('#stock-close').click();
    $('#choose-product').click(); $('#product-add').click();
    await popupCheck($('#product-dialog'));
    $('#product-cancel').click();
  }
  for (const id of ['correction-dialog', 'checker-dialog', 'confirm-dialog']) {
    const dialog = $('#' + id); dialog.showModal(); await popupCheck(dialog); dialog.close();
  }
  // Render-only state change proves both full and mini use the same live node.
  if (state.session) {
    const original = state.session;
    try {
      window.scrollTo(0, 240); await wait();
      state.session = {...original, checker: 'SYNTHETIC HEADER UPDATE'}; renderSetup();
      assert(summary.textContent.includes('SYNTHETIC HEADER UPDATE') && Math.abs($('.session-bar').getBoundingClientRect().top) < 1, 'Mini session status did not update');
    } finally { state.session = original; renderSetup(); }
  }
  document.activeElement?.blur(); window.scrollTo(0, 0); await wait();
  return `PASS mobile shell ${innerWidth}px ${mode}: all views, full/mini/deep/return header, stable threshold, fonts/focus, popup bounds/layer, navbar and inactive guard`;
})()
