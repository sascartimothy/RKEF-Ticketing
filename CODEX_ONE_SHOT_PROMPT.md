# Codex one-pass implementation prompt — HOLD until integration gate passed

Read `AGENTS.md`, `PRD_RKEF_Ticketing_v0.9.md`, and `SETUP_VSCODE_GITHUB.md`. Before implementing, report any remaining blocking ambiguity instead of inventing values. The architecture is fixed: vanilla HTML/CSS/JS PWA on GitHub Pages, IndexedDB per phone for ritase, shared Destination-only Google Sheet via anonymously deployed Apps Script, and manual WhatsApp handover. No Firebase or user Google login.

When authorized to build, replace the diagnostic `docs/index.html` with a production mobile-first PWA providing exactly three user-facing views:

1. **Setup** — operation date, shift, scale, checker; import last-shift WhatsApp TSV; read/cached Destination master; add Destination with remote write-and-read-back confirmation; manage local stockpile/dome option overrides; clear offline/sync status. Do not presume scale/checker names that have not been specified.
2. **Operasional** — fast truck ritase entry, device-local current time default (editable), source/product and destination selectors using the approved mappings, local persistence with unique ID, robust validation, history and permitted correction with audit trail.
3. **Report** — filter records for operational shift/date/scale, preview and copy **exactly 11 tab-separated columns**, preserve deliberately empty column 6, serial-date first column without sequence, time HH.mm, scale last; manual import/handover with duplicate detection, error preview and confirmation; durable backup/export restore.

Engineering: test date-to-Excel serial conversion across time zones; IndexedDB schema and migrations; explicit recovery if storage unavailable, data corruption, or phone refresh; accessibility; PWA manifest/service worker (HTTPS and proper GitHub Pages subpath); responsive narrow-screen styling; strong error messages; no frameworks unless PRD explicitly authorizes them. Do not ship mock transactions or leak private sample WA reports into public repo. For Destination bridge use `docs/config.js` and preserve read-back by `request_id`; show 'pending' when not confirmed. For import, accept legacy 10-column numbered WA reports only after confirming mapping, and new 11-column report; never silently drop malformed data.

Deliver completed code, automated tests (format/parser/validation/store/date/duplicate handling), run all tests, inspect diff for unintended changes, list deployment steps, and distinguish mocked tests from tests that can only be done on real phones.
