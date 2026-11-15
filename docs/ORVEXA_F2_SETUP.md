# Orvexa F2 — Progressive setup and tax settings

F2 extends the existing React application and Spring B2 contracts. No dependency, backend change or data migration is introduced. F3–F5 remain necessary for the full frontend MVP.

## Screens and authority

| Route                    | Workflow                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/app`                   | Nonblocking saved-progress card; dashboard remains accessible without active branches.                                                                                                |
| `/app/onboarding`        | Seven illustrated steps, server readiness, notes, complete/in-progress/reset/skip controls, explicit revision reload.                                                                 |
| `/app/settings`          | Existing business details/categories/reasons, plus shared receipt, notification and branch-price preferences.                                                                         |
| `/app/settings/branches` | Create, rename, deactivate/reactivate permitted branches; effective settings and explicit inheritance. Inactive branches remain discoverable; Spring protects the last active branch. |
| `/app/settings/tax`      | Seller registration and pricing policies, profile versions, illustrative templates, Owner review, product classification history.                                                     |
| `/app/pos`               | Targeted tax setup guidance for authorized setup administrators; backend errors remain authoritative.                                                                                 |

Business-wide writes, onboarding and tax history require an Owner or Administrator whose active membership has all-branch access. Permitted branch preference writes require Owner/Administrator, including restricted administrators. Managers retain read-only business/branch preferences and existing catalogue utilities. Only an Owner can submit a verified tax version. Route visibility and controls are convenience gates; Spring enforces authorization.

## Persistence and conflicts

Save checklist notes/status to resume after reload and fresh authentication. Restricted/inactive prerequisites do not force completion. Skipped steps remain resumable and are counted separately. A previously completed step whose server prerequisites no longer hold needs review and is excluded from valid completion. The server checks readiness again on completion.

Preferences and checklist commands submit the loaded revision. A 409 preserves the draft; **Discard draft and reload** explicitly replaces it. Background query refreshes do not adopt a new revision into an unsaved preferences form. Confirmed saves replace the draft with the server response. Unsaved drafts do not survive page reloads. Progress is not stored in browser storage.

Branch inheritance preserves `null` versus empty footer versus notification `false`. Price overrides appear only when the business permits them. A disabled dormant price override is explained before saving clears it. Registration and tax rates have no branch override. Notification preference storage does not imply configured email delivery.

## Tax behavior

- No percentage is hardcoded in the frontend. Templates are loaded from the backend only on explicit selection and remain illustrative even after Owner review. A custom profile starts without a rate.
- Nonregistered seller status is distinct from zero-rated and exempt product classifications. Zero-rated/exempt profiles require zero; taxable rates support decimal text with up to four fractional places. No browser tax totals are calculated.
- Owner confirmation requires a review reference/note. Administrators create unverified proposals. An unverified registered policy or missing/unverified effective product classification prevents registered checkout on the server. The baseline nonregistered policy is explicitly unreviewed.
- Policies, rates and product assignments are immutable. Create a new version to change or verify a rule; prior receipts keep their snapshots. Effective dates display browser timezone and a UTC preview, then submit ISO instants. The backend clock decides when versions apply.
- Lists read all 200-row pages to avoid hiding a current rule behind future versions; histories refresh every 30 seconds. This is a browser-clock view, not an authoritative checkout preview or a transactionally consistent export.
- An unchanged tax command retains its request ID while its form remains mounted, including after a lost response. Writes are never automatically retried. After closing/reloading, inspect history before creating another version. Revision-protected settings retries may require explicit reload to reconcile a successful write whose response was lost.
- Confirm actual registration, rates and eligibility with TAJ/accountants before production. Imported-goods acquisition costs remain separate from sales tax. Owner review records a business decision; it is not legal certification.

## Endpoints consumed

| Endpoint                                                       | Methods                                  |
| -------------------------------------------------------------- | ---------------------------------------- |
| `/api/business`                                                | GET, PUT (existing profile)              |
| `/api/v1/settings`                                             | GET, PUT                                 |
| `/api/v1/branches`, `/api/v1/branches/{id}`                    | GET/POST list/create; PUT branch details |
| `/api/v1/branches/{id}/settings`                               | GET, PUT                                 |
| `/api/v1/onboarding`, `/api/v1/onboarding/{step}`              | GET list, PUT progress                   |
| `/api/v1/tax/templates`                                        | GET                                      |
| `/api/v1/tax/policies`                                         | GET, POST                                |
| `/api/v1/tax/profiles`, `/api/v1/tax/profiles/{code}/versions` | GET history, POST version                |
| `/api/products`                                                | GET paginated existing-product selection |
| `/api/v1/products/{id}/tax`                                    | GET, POST                                |

No missing endpoint blocks F2. Existing category/reason endpoints are retained. There is no current-policy endpoint, editable tax version, history total or branch-specific registration/rate endpoint; the frontend does not invent one.

## Validation and walkthrough

Run `npm.cmd test`, `npm.cmd run build`, `npm.cmd run format:check` and `git diff --check`. F2 has **91 passing tests across nine files**, including 22 new configuration tests: all-branch authority, skip/stale progress, decimal/date rules, pagination, no-active-branch navigation, revision conflicts, null/false/empty inheritance, dormant overrides, Administrator proposals, Owner review, illustrative provenance and stable retry IDs.

Browser QA on 2026-11-14 used a fresh SQLite/demo backend on 18082 and Vite on 5182. SMTP was disabled and its security key was ephemeral; existing 8080/5173 services and data were preserved. Tests confirmed shared preferences, inclusive branch override and notifications off, completed/skipped notes, reload/sign-in/resume, Owner policy/example-rate creation, effective product classification, and branch creation/deactivation/reactivation. The server rejected deactivating the last active branch with its expected 409; the permitted lifecycle passed with a second branch. No-permitted-active-branch dashboard/recovery behavior is covered by the frontend integration test. The saved classification was re-opened to verify the server history after query refresh. Desktop 1280px and mobile 390px layouts, labels, native dialogs, keyboard dismissal, contained table scrolling and browser console errors were checked; only the deliberate last-active-branch 409 appeared, with no unexpected JavaScript errors. QA assets stay under ignored `.local-demo/f2`.

To review: sign in as an all-branch Owner, open **Setup checklist**, save notes or skip a step, configure shared and branch preferences, then open tax setup. Review a new dated policy, choose a template or custom profile, explicitly confirm Owner review and assign an existing product. Return to the checklist and complete only server-ready steps. Reload, authenticate again and confirm saved progress.

Catalogue import/variants are F3, purchasing/valued receiving are F4, and updated provider-independent payment/receipt/refund screens are F5. The checklist labels these boundaries. Existing legacy simulator orders may not satisfy the server's successful-payment-record prerequisite; F2 never fabricates a first sale or bypasses that check. Browser QA is a development integration check, not production tax or accessibility certification.

## Main changes and next phase

New source: `api/configuration.ts`, `lib/configuration.ts`, `components/ConfigurationUI.tsx`, `features/onboarding.tsx`, `features/settings.tsx`, `features/tax.tsx`, `test/configuration.test.tsx`. Integration extends the existing app routes, dashboard, checkout guidance, product DTO, badges/styles and administration utilities. README and implementation log reflect F2.

Next review: **F3 — catalogue, variants, units, barcodes/labels and guided CSV/XLSX import**, using the updated Spring catalogue contracts. Stop after F2 under the supplied phase instructions.
