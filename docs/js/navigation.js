import { $, $$ } from './ui-components.js';
export function initNavigation(onNavigate) {
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
