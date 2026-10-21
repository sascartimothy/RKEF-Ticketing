# Codex instructions — RKEF Ticketing

## Current phase
Full PWA implementation explicitly authorized by the owner on 21 October 2026, LOCAL ONLY. This authorization supersedes the former pre-build/HOLD instruction. Build and test the complete application locally while keeping real-device / Google integration as unverified release gates.

Do not run git add, commit, push, pull, reset, clean, or any deployment command. Do not change remotes, GitHub, Pages settings, or Apps Script deployments. The owner manages Git and deployment.

## Source of truth
- `PRD_RKEF_Ticketing_v0.9.md` and `CODEX_ONE_SHOT_PROMPT.md` define the approved local implementation scope, supplemented by the owner's explicit instructions.
- `apps-script/Code.gs` is a reference copy of the currently deployed Apps Script candidate. Do **not** assume editing it locally updates the /exec deployment. Script versions require redeployment by the owner.
- `docs/config.js` is PUBLIC non-secret configuration, holding the Apps Script URL. Do not place secrets in the GitHub Pages source.

## Firm scope decisions
- Exactly three application views: **Setup**, **Operasional**, **Report**.
- Frontend: HTML, CSS, vanilla JS PWA; GitHub Pages at `/RKEF-Ticketing/` (relative asset paths).
- NO Firebase and NO Google login for operators.
- Google Sheets is for **Destination** shared master only; anonymous Apps Script bridge must pass actual phone/browser tests before operational release. UI implementation may proceed locally and must show integration errors honestly.
- Ritase records, local stockpile & dome options, and session data are stored in **IndexedDB per phone**; no automatic multi-phone ritase sync.
- Operators paste WhatsApp report to initialize/verify the next shift and copy report text to hand over.
- Stockpile/Pile ID and product/dome mappings derive from the last approved WhatsApp report plus explicitly entered local options. Never silently invent master entries.
- Time defaults to device time when opening an input, and remains editable; preserve source time and edited time.
- WA TSV export has 11 columns in this order: Excel date serial (no trip suffix), DT No, source code, Stockpile, Pile ID, deliberately empty field, product code, Dome, Destination, HH.mm, scale name/code.
- Sublot (SL) logic is excluded from v1.

## Testing and release
- Avoid false sync success: after writing a Destination, read back and verify `request_id`.
- Add idempotent import behavior and deterministic data validation; flag bad source rows without silently editing them.
- Never claim Android/Chrome live tests passed on the basis of mocked Node tests.
- Keep a backup export of locally stored ritase. GitHub Pages files do not provide a database.
- Run `npm test` after changes to infrastructure files.
