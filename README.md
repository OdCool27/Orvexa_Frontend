# Orvexa 2.0 Frontend — Osyntra

Orvexa is Osyntra’s retail, inventory and POS application. This repository retains the existing React + TypeScript dashboard and storefront while integrating the updated Spring backend incrementally.

## Current delivery status

**Orvexa phases F0?F5 are implemented. F9 production-readiness review remains before release.** The [implementation prompts](Orvexa_Frontend_Implementation_Prompts.md) require one phase per review. See the [F0 API map](docs/ORVEXA_F0_AUDIT.md), [F1 implementation and walkthrough](docs/ORVEXA_F1_IDENTITY.md), [F2 setup, settings and tax walkthrough](docs/ORVEXA_F2_SETUP.md), [F3 catalogue and import handoff](docs/ORVEXA_F3_CATALOGUE.md), [F4 inventory and purchasing handoff](docs/ORVEXA_F4_INVENTORY.md), and [F5 POS, payments and refunds handoff](docs/ORVEXA_F5_POS.md).

F0 updates branding, the sign-in/session integration foundation, permission-aware navigation, permitted branches, workspace loading/retry states, connectivity status, request correlation and tests. It preserves existing feature screens rather than rebuilding them.

F1 completes registration, verification/reset links, MFA enrollment/challenges/recovery, one-time recovery-code acknowledgement, business creation/switching, staff invitations and membership grants, and active-session management. Owner/platform accounts complete required MFA before entering their workspace; enrollment is initiated explicitly by the user. Setup supports manual authenticator keys and an installed-app `otpauth` link without sending secrets to an external QR service.

F2 adds an illustrated, server-saved setup checklist at `/app/onboarding`, business receipt/notification preferences at `/app/settings`, permitted active/inactive branches and inheritance at `/app/settings/branches`, and immutable tax policy/profile/product-classification versions at `/app/settings/tax`. Dashboard access remains available without an active branch. Tax examples are server-supplied and stay illustrative; Owner review is explicit and does not certify legal compliance. Configuration conflicts retain drafts until explicit reload. No new dependency or database migration is required.

F3 extends products with simple/parent/variant forms, immutable identity, purchase/sale unit conversions, internal barcode generation and authenticated label previews/downloads. A guided CSV/XLSX catalogue importer adds mapping, row validation, duplicate policies and saved atomic commits. It uses a lazy-loaded `read-excel-file` browser dependency; Spring remains authoritative. Tracking configuration is explicit because the product read DTO does not expose its current flag. No backend migration is needed.

F4 adds suppliers, multi-line purchase orders, partial valued receiving, direct management-approved stock changes, positive-stock batch/expiry alerts and counts, and request/dispatch/partial-receipt transfers. Existing counts gain discrepancy summaries; inventory/ledger show management valuation fields with a clearly derived display average. Branch changes clear operational drafts; saved PO/transfer details retain their own branches. No new dependency or migration is required.

F5 replaces the tenant POS/order detail with scanner/keyboard checkout, sale-unit selection, server pricing/tax/discounts, reservation expiry, cash confirmation, manual-terminal UNKNOWN holds and management reconciliation. It adds saved receipt print/PDF/HTML/text/email and manager-reviewed partial/full sale reversals. Writes with uncertain outcomes retain the original command until saved state is checked. Walk-in checkout is supported; the backend has no customer-link field. No dependency or migration is added.

Brand placement uses `public/assets/orvexa-light.png` on dark sign-in panels and `orvexa-dark.png` on light workspace, storefront, business-picker and printable-receipt surfaces. The provided favicon remains in use. Logo shade follows placement; there is no theme control.

Use `/login` for tenant accounts and `/platform/login` for Osyntra staff. Accounts without an active selected membership choose or create a business. The header’s business switcher clears previous forms/cart/cache and replaces the Bearer token before loading another business. Account/security pages are available even before selecting a business.

## Run locally

Requires Node 24 (verified with 24.13.0) and the running backend in `../OsyntraInventoryManagement`.

```powershell
npm.cmd ci
npm.cmd run dev
```

Open **http://localhost:5173**. Spring defaults to **http://localhost:8080**. Use `localhost` consistently to match the backend's default CORS origin. `npm.cmd` avoids PowerShell's restriction on `npm.ps1`; no execution-policy change is required.

For a different API origin, copy `.env.example` to `.env.local`, set `VITE_API_BASE_URL`, and restart Vite. This is public configuration, never a place for passwords. `VITE_DEMO_BUSINESS_IDS` optionally supplies comma-separated IDs on `/store`. `VITE_SHOW_PAYMENT_SIMULATOR=false` hides the tenant development simulator by default; explicitly enabling it also requires the backend?s development/demo simulator configuration. Neither manual terminal nor the simulator integrates with a bank.

Start Spring using the backend README. Its opt-in `sqlite,demo` profile seeds independent automotive/grocery businesses after you set `OSYNTRA_DEMO_PASSWORD` locally. The frontend has no built-in passwords. Demo account emails include:

- `automotive.owner@demo.osyntra.local`
- `automotive.manager@demo.osyntra.local`
- `automotive.clerk@demo.osyntra.local`
- `automotive.cashier@demo.osyntra.local`
- Equivalent `grocery.*` accounts
- `operator@demo.osyntra.local` when the demo profile creates the operator; an existing operator keeps its credentials

With the updated backend running in `sqlite,demo`, seeded demo accounts use email/password only. They do not require MFA enrollment, authenticator/login codes or email verification, including previously enrolled demo accounts. Normal accounts retain their security requirements. Restart/rebuild an older backend to apply this policy; existing demo passwords are preserved.

Business IDs are assigned by the database. Obtain them from the operator workspace or an employee's storefront link; do not assume automotive is always business 2.

## Retained screens from the earlier demo

The public storefront retains its explicitly simulated demo checkout. Tenant checkout and sale detail now use F5 payment, receipt and reversal contracts. The team screen uses current membership/invitation workflows.

- Employee login/logout and permissions; operator business/first-owner provisioning.
- Managed team accounts, roles/statuses; business settings, categories, locations and reasons.
- Product create/edit/archive, SKU/barcode search and verified fitment create/link/unlink.
- Location-based on-hand/reserved/available balances, opening stock, reason-coded movements, thresholds and low-stock indicators.
- Resumable scanner-assisted counts, variance review, submission, reopening and approval.
- Opening CSV template, file/paste preview, row errors, saved-preview lookup and commit.
- POS scanning, sale units, server-priced carts, reservations, cash/manual-terminal outcomes and optional development simulation.
- Public catalog/vehicle search, saved cart, token-protected orders, payment/cancellation and receipts.
- Order history, fulfillment, physical returns, refunds and lifecycle events.
- Stock/revenue dashboard, UTC date/channel/product sales summaries, stock CSV, ledger and audit.
- Responsive layouts, keyboard-friendly forms, loading/empty/error states and conflict feedback.

See [demo instructions](docs/DEMO.md), [decisions and validation](docs/IMPLEMENTATION_LOG.md), [the original assessment](docs/FRONTEND_MVP_ASSESSMENT.md) and [the architecture plan](Osyntra_MVP_Architecture_and_Phases_v2.md).

## Checks

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run format:check
```

The build type-checks before producing `dist/`. `npm.cmd run preview` serves the build on localhost:5173; `npm.cmd run format` formats source.

F5 verification on 2026-11-14: **164 tests pass** across 12 files; TypeScript/production build, formatting and diff checks pass. Thirty focused F5 tests cover logo shades, payloads, keyboard checkout, insufficient stock, expiry, offline behavior, lost payment responses, exact retries, refund permissions/completion and escaped receipts. Disposable Spring/Chrome checks confirmed cash and terminal flows, partial resellable return approval/completion, restored availability, unchanged receipt, PDF download, print action and email queueing. Desktop and 390px layouts/dialog focus were checked. Physical printing, real terminals and external email delivery were not exercised. See the F5 handoff for endpoints and remaining limits.

Historical F4 verification on 2026-11-14: **134 tests pass** across 11 files; TypeScript/production build, formatting and diff checks pass. Live isolated Spring/Chrome checks covered supplier/PO creation, successive partial receipts, acquisition value, transfers and transit values, branch switching, expired versus saleable stock, batch/aggregate count approvals, movement values and over-receipt correction. Desktop/390px layouts and dialog keyboard behavior were checked. The F4 handoff lists exact endpoints and limitations, including immediate adjustment approval and unavailable average/provenance/zero-stock-batch reads.

Historical F3 verification on 2026-11-14: **117 tests pass** across ten files; TypeScript, production build, formatting and diff checks pass. Isolated Spring/Chrome checks confirmed variant creation/edit, server unit conversion and rejection, tracking, barcode labels/PDF, CSV and actual XLSX imports, leading-zero lookup, duplicate policies, saved-job recovery, successful UPDATE and atomic rollback on concurrent-edit conflict. Desktop/390px mobile layouts and dialog keyboard behavior were checked. Details, endpoints and limitations are in the F3 handoff.

Historical F2 verification on 2026-11-14: **91 tests pass** across nine files; TypeScript, production build, formatting and diff checks pass. An isolated Spring/demo backend confirmed preferences, branch overrides, saved/skip/resume progress after a reload and fresh authentication, Owner-reviewed tax policy/example versions, product classification, and permitted branch deactivation/reactivation with the last-active-branch guard. Frontend integration tests also cover dashboard access when no permitted active branch exists. Desktop and 390px mobile layouts were checked. See the F2 guide for scope and limitations.

Historical F1 verification on 2026-11-14: **69 tests pass** across eight files; TypeScript, production build, formatting and diff checks pass. Chrome workflows against a separate backend/database verified owner MFA, recovery codes, business creation/switching, new and existing-account invitation acceptance with branch limits, registration, verification/reset, login with the reset password and revoking all sessions. Desktop/narrow registration layout and browser errors were checked. The existing backend/database/security key was not changed; SMTP was disabled in the isolated tests.

Historical F0 verification: 41 tests and live read-only Bearer/CORS/correlation checks passed before F1.

Historical evidence on 2026-11-13: the previous 20-test demo suite and live checks against an isolated older SQLite backend covered POS/counts/storefront/import/damage workflows. That evidence does not certify the updated Orvexa F1–F5 behavior; see the F0 audit for the remaining work.

## Integration behavior

Employee sign-in uses `POST /api/v1/auth/login`, followed by `GET /api/v1/auth/me` with the returned Bearer token. The backend has disabled HTTP Basic. Tokens stay in memory, restricted sessions cannot call tenant APIs, and logout/401/expiry clear identity and query caches. Logout also requests server revocation and explains any unconfirmed revocation. Reloading requires sign-in; passwords, employee tokens, MFA setup keys and recovery codes are not persisted in browser storage. Public calls do not inherit employee authentication. Account-link tokens are read into component memory and removed from browser history; confirmation is always explicit.

Verification/reset/acceptance and new-business creation may revoke sessions. Successful operations require a fresh sign-in. Uncertain responses prompt reconciliation rather than claiming completion. MFA/token rotations clear old queries first; stale responses cannot populate a replacement workspace. Newly issued recovery codes remain available for acknowledgement even if fetching the replacement identity fails.

Invitations are queued through the configured backend provider; queueing does not prove email delivery. Development mode exposes an explicit, server-scoped **Local email preview** when the backend allows loopback preview. Real email delivery requires the backend’s SMTP configuration; it was not exercised against an external provider. The backend has no invitation resend endpoint, so **Reissue invitation** explicitly revokes/reissues and reports partial failure. Other staff’s existing branch IDs are not returned, so edits require a confirmed complete replacement grant set.

Public order tokens live in `sessionStorage`, keyed by business/order, and are sent in `X-Order-Token`. Keep the same tab and hostname to resume. A lost initial checkout response can leave a reservation without delivering its token; the UI explains expiry/staff assistance rather than blindly creating another order.

The existing opening CSV screen initializes stock for existing products. The updated backend also supports **catalogue CSV/XLSX import**; its mapping/duplicate-policy wizard is now available at `/app/imports/catalogue`. Public storefront discovery remains limited: business-ID URLs, free-text filters and the first active location are retained. The authoritative public cart confirms currency.

Branches come from `GET /api/v1/branches` and are filtered by the server’s membership grants. UI gating recognizes Owner, Administrator, Manager, Cashier and Inventory Clerk; historical `CLERK` remains compatible. Platform provisioning requires a separate SUPER_ADMIN/PROVISIONER platform role. General API query keys include identity, business and membership; pending workspace loads and denied branches do not show misleading empty-stock success.

Requests attach a correlation `X-Request-ID`, distinct from business command `requestId`. Error views preserve the backend’s ProblemDetail code/reference; multipart and file downloads use the same transport. Writes are not automatically retried. The browser’s offline indication blocks writes and warns that displayed data may be stale; network uncertainty requires explicit saved-state reconciliation before an F5 write can be retried with its original command ID.

Inventory/order views refresh after actions and poll selected views every 10–15 seconds. No push API exists. Most lists have no total count. Sales reports cover every business location even when the header selects one location for stock.

The current runtime remains local SQLite, following the backend’s explicit configuration. The new release target is online POS; offline operation is deferred. The backend supports cash/manual-terminal recordkeeping and an explicitly enabled simulator, and F5 now consumes those contracts in tenant POS/order detail. No bank API integration or production hosting is implied. Identity email preview/opt-in SMTP now exists on the server; advanced notifications, integrations and subscriptions remain later work. Follow the backend’s setup/security-key instructions and post-MVP review before real deployment.

## Source layout

```text
src/api/          HTTP transport and backend contracts
src/app/          Routes, layouts and workspace context
src/auth/         Employee sessions and permissions
src/components/   Shared UI, queries and asynchronous actions
src/features/     Catalog, inventory/counts/imports, commerce, admin, reporting
src/lib/          Money and timestamp formatting
src/test/         API, permission, session and workflow tests
```

Stack guidance: [Vite](https://vite.dev/guide/) and [React Router](https://reactrouter.com/start/declarative/routing). Exact dependency versions are locked in `package-lock.json`.
