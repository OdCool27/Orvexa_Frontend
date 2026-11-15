# Frontend decisions and implementation log

## 2026-11-14 - Demo password-only login verification

The Spring backend now exempts explicit seeded local demo identities from MFA enrollment/challenge and verification steps only when demo seeding is enabled under demo/test profiles; prod/production profiles disable the exception. Password checks, account status, session expiry and role/tenant permissions remain enforced. No credentials, existing data or MFA secrets were reset. All nine seeded fixture accounts were verified through password login plus authenticated session creation, including previously enrolled accounts. Backend DemoSeedTests (3) and existing IdentityB1Tests (22) pass: 25 tests total. The frontend continues to honor server-issued session purpose with no client-side security bypass. Restart the updated backend under sqlite,demo to apply the change.

## 2026-11-14 - Orvexa F5 and supplied logos

[F5 POS handoff](ORVEXA_F5_POS.md) replaces tenant checkout/order detail with scanner/keyboard baskets, exact sale-unit quantities, server-priced/taxed/discounted amounts, expiring reservations, cash confirmation and manual-terminal UNKNOWN holds with management reconciliation. Receipts support sandboxed print preview, server PDF/HTML/text and optional queued email. Partial/full return/refund/cancellation requests require separate management review and explicit confirmation of the original-method refund; stock restoration remains server controlled. Uncertain writes freeze the command, require a saved-state read and reuse the original request ID for any retry.

Brand uses the provided light image on dark authentication panels and dark image on light workspace/public/print surfaces. No theme selector or dependency was introduced; the provided favicon is retained.

164 tests across 12 files, TypeScript/build, formatting and diff checks pass. Disposable Spring/demo ports 18085/5185 with SMTP disabled verified barcode cash checkout, fulfillment, unchanged receipts after partial resellable return/refund, restored availability, manual-terminal UNKNOWN then verified reconciliation, receipt queueing, PDF download and the browser-print action. Desktop/390px layouts and dialog focus were checked. Real bank processing, physical printing and external email delivery remain unverified. Backend customer linkage and request-ID lookup reads are unavailable; the guide documents recovery limits. No backend source, existing database/key, dependency or migration changes. Stop at F5 for review; F9 is recommended next for the MVP release, while F6?F8 are post-MVP scope.

## 2026-11-14 - Orvexa F4

[F4 inventory handoff](ORVEXA_F4_INVENTORY.md) adds permitted-branch stock valuation display, suppliers, multi-line POs and partial receiving, explicitly approved valued adjustments, expiry/batch counts and request/dispatch/partial-receipt transfers. Existing aggregate counts show discrepancies and ledger reads show management value/reference fields. Unknown command outcomes freeze the draft and retain the exact idempotency command for explicit retry. Branch-scoped drafts reset on branch changes, while persisted operations keep their recorded branches.

134 tests across 11 files, TypeScript/build, formatting and diff checks pass. Live disposable SQLite/demo checks on 18084/5184 confirmed successive receipts, exact server value, transfer transit separation, branch switching, expired availability, batch/aggregate count approvals and over-receipt correction. Desktop/390px layouts and keyboard dialogs were checked. Supplier/receipt/average/provenance/zero-stock-batch/approval-queue API limitations are documented. Display averages use exact decimal ratios and are never authoritative COGS. No new dependency, migration or existing backend data/key changes. F5 POS/payments/receipts/refunds is next.

## 2026-11-14 - Orvexa F3

[F3 catalogue handoff](ORVEXA_F3_CATALOGUE.md) extends product creation/edit for parent/variants, exact scanner lookup, server unit conversion, internal labels, tax assignment reuse and explicit tracking. Guided CSV/XLSX import includes templates, source mapping/preview, row dispositions, duplicate policies, saved recovery and atomic commit. Stable command IDs cover uncertain retries; fresh confirmed preview/tracking actions get new IDs. Product creation uncertainty requires SKU reconciliation. Product read APIs omit the tracking flag and job discovery/source reads are unavailable, so these limits remain explicit.

117 tests across ten files, TypeScript/build, formatting and diff checks pass. Real browser tests used fresh SQLite/demo ports 18083/5183 with SMTP disabled, including XLSX multipart upload and transactional rollback after a concurrent product edit. Desktop/390px layouts and keyboard dialogs were checked. Added lazy-loaded `read-excel-file` 9.3.17; installation audit found zero vulnerabilities. No backend migration or existing data/key changes. Next: F4 inventory/purchasing; F5 updated payments remains outstanding.

## 2026-11-14 ? Orvexa F2

[F2 setup implementation](ORVEXA_F2_SETUP.md) adds illustrated, resumable onboarding, business/branch preferences, branch recovery, immutable tax policy/profile versions and existing-product classification. Progress uses server readiness and revisions; skipped or stale completed steps do not count as configured. Drafts survive revision conflicts until explicit reload. Business-wide authority requires the active membership's all-branch Owner/Administrator grant; Owner verification is distinct from an Administrator proposal. Example rates come from the backend and retain their illustrative status.

91 tests pass across nine files. Browser checks used ports 18082/5182 with a fresh SQLite demo database, ephemeral security key and SMTP disabled. Confirmed save/reload/resume, branch inheritance and lifecycle, effective versions and classification. Desktop/390px layouts and browser errors were checked. No new dependencies, migrations, production tax assertions or changes to the user's existing backend/data. Next: F3 catalogue/variants/barcodes/import; F4 receiving/costing and F5 updated payments remain outstanding.

## 2026-11-14 — Orvexa F1

[F1 identity implementation](ORVEXA_F1_IDENTITY.md) completes real account screens, MFA and one-time recovery codes, membership switching with token/cache isolation, invitation acceptance/issuance/revocation/reissue, and global session controls. The old employee-edit screen is replaced by membership-based editing; global names are no longer submitted through tenant administration. Tokens and security capabilities remain ephemeral. Account-link URLs are stripped from history and use a no-referrer document policy.

69 automated tests, TypeScript/production build, formatting and diff checks pass. Browser checks used an independently initialized SQLite/demo backend with SMTP disabled and separate frontend port, including owner MFA and both new/existing recipient acceptance. Existing backend data and its security key were untouched. No new dependency or database migration was introduced. The next phase is F2 onboarding and tax settings; later MVP phases remain incomplete.

## 2026-11-14 — Orvexa F0

The new staged implementation starts with [F0 audit and integration](ORVEXA_F0_AUDIT.md). Bearer sessions supersede the Basic authentication described in the historical entry below. Orvexa/company branding, permitted-branch shell loading, correlation/error/offline handling, restricted-session gates and navigation tests are implemented. No backend migrations or new dependencies were introduced. F1–F5 remain to complete the broader Orvexa frontend MVP; F0 stops for review under the supplied implementation prompts.

## 2026-11-13 — Local MVP frontend

### Previous and new behavior

The placeholder console script and failing test stub have been replaced by a React/TypeScript application. Employee/operator routes, catalog, settings, staff, inventory operations, counts/imports, POS/public checkout, order lifecycle, receipts, reports and audit now use the existing Spring APIs. The backend repository, its environment and existing database were not edited.

### Decisions

1. One local Vite application on localhost:5173, matching Spring CORS; configurable public API origin. No Sites registration/publication because the architecture requires local work.
2. Separate raw contracts for camelCase employee/product DTOs, SQL-map stock/orders and public catalog data. Transport handles JSON, empty successes, blobs, ProblemDetail and non-JSON security failures. Catalog major units, commerce cents, ISO timestamps and SQLite UTC strings have explicit boundaries.
3. Employee Basic credentials remain in memory; logout/401 clear identity/cache. Public calls never inherit employee Authorization. Operator checks use its explicit flag, independently of its employee role.
4. Tab-scoped carts/order capabilities are keyed by business/order. Public checkout persists its token before navigation. Lost response/token/storage cases explain expiry or staff assistance; public recovery is not invented.
5. Server stock/prices/totals remain authoritative. Supported retried commands retain an ID and payload. Non-idempotent product/count creation is not automatically retried. Commands invalidate caches; selected live views poll every 10–15 seconds.
6. Existing policies are retained: whole units, five-minute reservations, approval for every count, sellable stock during counts, conflict/recount handling, full returns/refunds, resellable-only return restocking and refund state separate from order status.
7. UI permissions match server capabilities. Nested guards propagate workspace/location context. Staff tenant membership comes from identity, never an arbitrary request body.
8. Backend limits remain visible: opening CSV is not product registration; no public business/location/currency discovery or fitment detail; no global fitment discovery; bounded histories and paginated arrays without totals. Sales are tenant-wide, not location-filtered.
9. Quiet green operational UI with responsive navigation and a lightweight storefront. SVG/icons are code-native. Google Fonts has system fallbacks; unavailable font delivery changes typography only.

### Problems resolved

- Dependency installation needed approved network access; installation succeeded and generated a lockfile.
- Windows browser CLI connection failed initially; restarting its isolated headless service enabled QA.
- Port 8080 was occupied. QA used a separate backend on 18080 with an independently seeded SQLite file under ignored `.local-demo`; the existing service/data remained untouched.
- Protected routes initially dropped location context. Guards now pass it through; an integrated test verifies selected-location POS and count payloads.
- Action loading originally ended before cache refresh released its submission lock. Pending now spans the entire command/refresh sequence, preventing ignored fast follow-up clicks.
- Public checkout briefly mounted an inline payment panel before navigation. Success now navigates directly after token storage.
- Order panels poll their own state so expiry does not leave stale POS payment controls.
- Shared brand/workspace modules were extracted to remove circular route/feature imports.

### Validation and its limits

- Production build and TypeScript pass.
- 20 tests pass: API authentication/header boundaries, empty/download/error responses, stable command IDs, money/UTC conversion, permissions, logout/401 cache clearing, guarded location propagation, and public checkout token/payment integration.
- Live Chrome: automotive login/dashboard; DEMO1001 barcode POS preview/reservation/payment; count save/resume/submit/approval; Honda/Civic/2009 storefront search; public checkout token storage, payment, cancellation/refund; product creation; opening CSV preview/commit; damage movement and low-stock status.
- Desktop dashboard and narrow mobile order layouts inspected. Wide tables scroll within their panels.
- Employee creation, settings and sales reports were verified in Chrome. Clerk/cashier/manager/owner/operator navigation and switching between automotive and grocery workspaces were checked with their real demo logins.

Not every admin/order branch has been exercised in a browser. The existing 32 Java test reports were inspected during assessment, not rerun for frontend work. Transactional concurrency and tenant tampering remain server-enforced and covered by its suite; the demo checklist includes front-to-back checks. No PostgreSQL or production-security readiness is inferred.

### Future integration additions

Bulk product CSV registration, richer public business/currency/location/category discovery, global fitment discovery, large-history pagination/filtering and seamless initial-token recovery require backend extensions. They do not prevent the implemented local demonstration. Production features remain deferred under the architecture plan.
