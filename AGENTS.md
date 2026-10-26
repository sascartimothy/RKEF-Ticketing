# Codex instructions — RKEF Ticketing

## Current phase
Full PWA implementation and final root-based restructuring explicitly authorized by the owner on 21 October 2026, LOCAL ONLY. This authorization supersedes the former pre-build/HOLD and src-to-dist instructions. Develop and test the complete application locally while keeping real-device / Google integration as unverified release gates.

Do not run git add, commit, push, pull, reset, clean, or any deployment command. Do not change remotes, GitHub, Pages settings, or Apps Script deployments. The owner manages Git and deployment.

## Source of truth
- Read [Operational Specification](docs/requirements/RKEF_OPERATIONAL_SPEC.md) before changing input, handover, numbering, or export logic. It is the primary reference for the latest confirmed operational decisions and supersedes conflicting older PRD/prompt/README rules. Open decisions require owner clarification, not assumptions. Documentation alignment does not mean the existing application implements the new contract.
- [PRD](docs/requirements/PRD_RKEF_Ticketing_v0.9.md) and [Codex implementation instructions](docs/development/CODEX_ONE_SHOT_PROMPT.md) define the approved local implementation scope, supplemented by the owner's explicit instructions.
- `apps-script/Code.gs` is a reference copy of the currently deployed Apps Script candidate. Do **not** assume editing it locally updates the /exec deployment. Script versions require redeployment by the owner.
- Repository root is the sole authoritative frontend source: `index.html`, `integration-test.html`, `styles.css`, `config.js`, `manifest.webmanifest`, `sw.js`, `assets/`, and `js/`. There is no `src/`, `dist/`, build command, or replacement output directory. Do not create duplicate application copies.
- `docs/` contains project documentation only: requirements, development, testing, and architecture. Keep `README.md` and `AGENTS.md` at root; see the [documentation index](docs/README.md).
- Root `config.js` is PUBLIC non-secret configuration. Do not place secrets in frontend files.
- `scripts/public-files.cjs` explicitly allowlists files for the local dev/preview server; it is not a build or a GitHub Pages access rule. Add new public assets/modules to this inventory and the service worker inventory when needed. Keep operator data and backups in ignored local directories such as `private-data/`. Never serve the repository using an unrestricted static server.
- Final hosting decision: GitHub Pages branch `main`, folder `/ (root)`, with root `.nojekyll` and no custom deployment workflow. This supersedes the earlier `/docs` and Actions/dist plans. Do not change Pages settings or deploy; the owner handles publication. Root hosting can publish tracked repository files; gitignore and the local server allowlist do not restrict Pages access to tracked files. Preserve the public URL `/RKEF-Ticketing/` and storage identity.
- Keep branch `main`; do not create branches. Git mutations and deployment remain owner-only.

## Firm scope decisions
- Exactly three application views: **Setup**, **Operasional**, **Report**.
- Frontend: HTML, CSS, vanilla JS PWA; GitHub Pages at `/RKEF-Ticketing/` (relative asset paths).
- NO Firebase and NO Google login for operators.
- Google Sheets is for shared **Destination and Checker_Crew** masters; anonymous Apps Script bridge must pass actual phone/browser tests before operational release. UI implementation may proceed locally and must show integration errors honestly.
- Owner decision 26 October 2026: Checker management is anonymous for every user, without login, password, access code, write key or Script Properties authorization. Preserve validation, locking, request idempotency, version conflicts, soft delete and verified read-back. Never reinitialize Checker_Crew or replace existing IDs.
- Ritase records, local stockpile & dome options, and session data are stored in **IndexedDB per phone**; no automatic multi-phone ritase sync.
- Operators paste WhatsApp report to initialize/verify the next shift and copy report text to hand over.
- Stockpile/Pile ID and product/dome mappings derive from the last approved WhatsApp report plus explicitly entered local options. Never silently invent master entries.
- Time defaults to device time when opening an input, and remains editable; preserve source time and edited time.
- Latest WA TSV contract: 11 columns in this order: Excel date serial + ritase suffix, DT No, source code, Stockpile, Pile ID, deliberately empty field, product code, Dome, Destination, transaction time, scale code. Owner-confirmed time rule: `7.2` means `07.20`; one minute digit denotes tens of minutes, bare hours mean `00` minutes, preserve source time for audit. Valid conflict-free handover automatically saves and activates after complete paste, without confirmations; the operator enters the current checker manually. BDM/ONI counters are independent; mixed-scale reports reject the entire import. Complete reports starting at `001` hand over DS → NS on the same operation date; other starting suffixes hand over NS → next-date DS at `001`. See the Operational Specification for numbering guarantees and existing implementation conflicts; owner task v1.1.1 now authorizes local Operational redesign and Option B time-based numbering within the active local session. UUID stays permanent; imported/prior-session history stays frozen. Read section 7 for NS ambiguity blocks and finalization risks.
- Sublot (SL) logic is excluded from v1.

## Testing and release
- Avoid false sync success: after writing a Destination, read back and verify `request_id`.
- Add idempotent import behavior and deterministic data validation; flag bad source rows without silently editing them.
- Never claim Android/Chrome live tests passed on the basis of mocked Node tests.
- Owner Report v1.1.1 decision removes all user-facing JSON backup/restore, including recovery UI. Preserve internal database APIs and all stored data; document that complete metadata recovery after device loss is unavailable through the UI. GitHub Pages files do not provide a database.
- Run `npm test` after changes to infrastructure files.
- Run `npm run check:docs` for local Markdown targets, exact path case, and heading anchors. External links are not live-verified by this check.
- `npm test` runs without a build; Node domain tests import root `js/`, and static checks verify root files, relative paths, and the public/offline inventories. Browser tests use root files on a fresh server/profile with synthetic data; never write live Sheets in automated tests.
- `npm run dev` reads root application files on each request and serves a network-only development worker in memory. Save and refresh to see edits; there is no watch/build/copy pipeline. Use `npm run preview` or browser tests for the unchanged root production offline worker. Neither mode clears IndexedDB.
