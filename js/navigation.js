import { $, $$ } from './ui-components.js';
export function initNavigation(onNavigate) {
  // Display-only keyboard handling, independent of the operational clock/draft.
  const viewport = window.visualViewport;
  let fullHeight = window.innerHeight, width = window.innerWidth;
  const keyboardLayout = () => {
    if (width !== window.innerWidth) { width = window.innerWidth; fullHeight = window.innerHeight; }
    const editing = document.activeElement?.matches('input:not([type=hidden]):not([type=checkbox]), textarea, [contenteditable=true]');
    if (!editing) fullHeight = window.innerHeight;
    const height = viewport?.height ?? window.innerHeight;
    const keyboard = editing && (!viewport || Math.abs(viewport.scale - 1) < .05) && Math.max(fullHeight, window.innerHeight) - height > 150;
    document.body.classList.toggle('keyboard-open', !!keyboard);
  };
  window.addEventListener('resize', keyboardLayout);
  viewport?.addEventListener('resize', keyboardLayout);
  document.addEventListener('focusin', keyboardLayout);
  document.addEventListener('focusout', () => requestAnimationFrame(keyboardLayout));
  keyboardLayout();
  const navigate = () => {
    const requested = location.hash.slice(1);
    const view = ['setup', 'operasional', 'report'].includes(requested) ? requested : 'setup';
    for (const section of $$('.view')) section.hidden = section.id !== 'view-' + view;
    for (const link of $$('[data-view]')) link.getAttribute('data-view') === view ? link.setAttribute('aria-current', 'page') : link.removeAttribute('aria-current');
    onNavigate(view);
    $('#title-' + view).focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  window.addEventListener('hashchange', navigate); navigate();
}
