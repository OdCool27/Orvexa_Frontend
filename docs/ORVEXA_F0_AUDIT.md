# Orvexa F0 — repository audit, shell and API integration

Date: 2026-11-14. Product: Orvexa. Company: Osyntra.

Historical F0 record: F1 has since been implemented. See [F1 identity implementation](ORVEXA_F1_IDENTITY.md) for the delivered MFA, account-link, membership, invitation and session workflows and current limitations.

## Scope and delivery boundary

The [implementation prompts](../Orvexa_Frontend_Implementation_Prompts.md) say **“Do not implement every phase in one run”** and require stopping after each phase for review. No phase number was supplied with the new request, so work starts at F0. F1–F5 remain the next incremental MVP phases. The earlier local demo is retained; its completion is not proof of the broader Orvexa MVP.

No backend source, database, credentials, MFA enrollment or security key was changed. No database migrations or additional dependencies were needed. The package/lockfile name and HTML/visible product branding now identify Orvexa by Osyntra. Existing API/package names and public cart/order storage keys remain unchanged for compatibility.

## Current structure and changes

| Area | Existing foundation | F0 change |
| --- | --- | --- |
| Build | React 19, TypeScript, Vite, npm lockfile | Retained; package metadata updated |
| Routing | One BrowserRouter application, protected outlets, separate public storefront | Routes retained; denied platform role and branch/loading/error states made explicit |
| Design | Green CSS tokens, reusable tables/forms/dialogs, responsive sidebar | Orvexa/company branding, skip link, mobile expanded/control semantics, offline status and error references |
| Transport | Explicit credentials, JSON/empty responses, blobs, command IDs | Bearer support through identity service, correlation headers, multipart bodies, abort preservation, rate-limit metadata, robust ProblemDetail parsing, mixed-auth rejection, no offline writes |
| Authentication | HTTP Basic and old employee DTO | POST login + Bearer self response; raw identity adapter; limited sessions remain restricted; memory-only token, server logout and expiration/401 handling |
| Server state | TanStack Query and action helper | Identity/business/membership query keys, signal cancellation, query/cache clearing and stale-session 401 protection |
| Reliability | Per-action feedback | App error boundary; failed workspace fetches cannot appear as successful empty stock |
| Tests | Prior demo client/permission/workflow tests | New identity fixtures, session-purpose tests and navigation/loading/error/offline tests; old workflows retain new auth fixtures |

Primary files: `src/api/client.ts`, new `src/api/identity.ts`, `src/api/types.ts`, `src/auth/Auth.tsx`, `src/auth/permissions.ts`, `src/app/App.tsx`, `src/components/{Brand,ConnectionBanner,AppErrorBoundary,ui}.tsx`, `src/main.tsx`, `src/styles.css`, tests, README, package metadata and this audit. Small existing-screen corrections remove the obsolete no-email statement and explain that reorder thresholds are now global across branches.

## Audited backend and live evidence

Reviewed the sibling backend’s README, B1/B2/B3–B5 implementation guides, controller mappings, request DTOs, identity/session services, invitation/membership rules, exception handling and CORS/security configuration. Java 24/Spring Boot/JDBC/Flyway and SQLite remain its runtime foundation. The backend reports 122 passing Java tests; that suite was not rerun here.

Live read-only checks at localhost:8080 on 2026-11-14:

- `GET /v3/api-docs`: 200, Orvexa API metadata, **143 OpenAPI paths**, Bearer security scheme.
- `GET /api/v1/auth/me` without credentials: 401 with `WWW-Authenticate: Bearer`, request correlation and `Access-Control-Allow-Origin: http://localhost:5173`.
- The existing frontend server returned 200 with the Orvexa HTML title. Its service was reused, not restarted.

No live user login, signup, email, invitation, MFA operation, stock command or payment was submitted in F0. Authenticated integration tests use explicit mocked server responses; they are not claimed as real account verification.

## F0 endpoints consumed

| Method/path | Contract and handling |
| --- | --- |
| `POST /api/v1/auth/login` | JSON `{email,password}`; returns `{accessToken,tokenType,purpose,expiresAt,...}`; no Basic header or stored password |
| `GET /api/v1/auth/me` | Bearer; snake_case identity fields plus `memberships`, `activeMembershipId`, `businessId`, `role`, `operator`, `platformRole`, `purpose` |
| `POST /api/v1/auth/logout` | Bearer; 204; local logout stays effective if server revocation cannot be confirmed |
| `GET /api/business` | Retained current-business name/currency/settings for the shell |
| `GET /api/v1/branches` | Only permitted branches; active entries supply the header location context |

Purposes are FULL, VERIFY_EMAIL, MFA_ENROLL and MFA_CHALLENGE. Only FULL with an active selected tenant context, or valid separate platform context, becomes a workspace identity. The sign-in bridge is F0 integration work; complete identity UX remains F1. Tokens are opaque Bearer capabilities, not assumed JWTs. The server remains authoritative about permissions and MFA.

Every transport request gets a correlation ID. It is **not** the command idempotency key. Existing command IDs remain stable for retries. Public order tokens use `X-Order-Token` through public calls; the helper rejects combining employee Authorization with that header. FormData uploads leave Content-Type/boundaries to the browser. No automatic write retry was added.

## Frontend phases mapped to current backend contracts

Existing domain controllers generally retain `/api`; do not prepend `/v1` to every URL. The following map is a development contract inventory, not a claim that new screens have been delivered.

| Phase | Backend endpoints/contracts | Frontend work after F0 |
| --- | --- | --- |
| F1 identity | `/api/v1/auth/register`, `/login`, `/email-verification`, `/email-verification/confirm`, `/password-reset`, `/password-reset/confirm`; `/mfa/setup`, `/confirm`, `/verify`, `/recover`, `/disable`; `/sessions`, DELETE `/sessions/{id}`, `/logout`, `/logout-all`; `/security-events`, scoped `/mail-preview` | Verification/reset/registration/MFA/recovery/session screens and account-link routes |
| F1 tenancy | `GET /api/v1/memberships`; `POST /api/v1/auth/business` with membershipId, returning a replacement token; `POST /api/v1/businesses`; `GET/POST /api/v1/branches`, `PUT /branches/{id}` | Business creation/join/switching and explicit branch-grant UI; cancel old requests and clear tenant caches before applying replacement token |
| F1 staff | `GET/PUT /api/v1/business/memberships[/{id}]`; `GET/POST /api/v1/invitations`, DELETE `/invitations/{id}`, POST `/invitations/accept`; `/business/security-audit` | Owner/Admin/Manager grants, invitation status/revoke/accept, existing-account acceptance; no editing global names through membership updates |
| F2 settings/onboarding | `GET/PUT /api/v1/settings`; `GET/PUT /api/v1/branches/{id}/settings`; `GET /api/v1/onboarding`, `PUT /onboarding/{step}` | Resumable nonblocking checklist, inherited settings, revision conflicts and controlled overrides |
| F2 tax | `GET /api/v1/tax/templates`, `/policies`, `/profiles`; POST `/tax/policies`, `/tax/profiles/{code}/versions`; GET/POST `/api/v1/products/{id}/tax` | Versioned registration/classification, owner confirmation, effective dates, exempt/zero-rated/nonregistered distinctions; no client-authoritative tax |
| F3 products | Existing `/api/products`, `/api/categories`, `/api/fitments`, product-fitment links; ProductRequest adds productKind, parentId, variantKey | Extend existing forms for SIMPLE/PARENT/VARIANT; immutable relationships, sellable variants, central threshold |
| F3 units/labels | GET/POST `/api/v1/catalogue/products/{id}/units`; POST `.../convert`, `.../barcode`; GET `.../label?format=svg|png|pdf` | Exact decimal conversions, purchase/sale permissions and printable CODE128/internal labels, not GS1 issuance |
| F3 import | GET `/api/v1/catalogue/imports/template?format=csv|xlsx`; POST `/imports/csv`, `/imports/xlsx`; GET `/imports/{id}`; POST `/imports/{id}/commit` | Guided mapping, REJECT/SKIP/UPDATE, immutable preview/commit IDs and bounded atomic job recovery. XLSX multipart parts: file and application/json options |
| F4 stock | Existing `/api/inventory`, `/movements`, `/alerts`, `/reasons`, openings; `/api/counts` with save/submit/reopen/approve; `/api/imports/opening` | Preserve counts/ledger while adding branch acquisition values, global threshold wording, discrepancies and permissions |
| F4 purchasing | GET/POST `/api/v1/purchasing/suppliers`, `/orders`; GET `/orders/{id}`; POST `/orders/{id}/receive`, `/cancel` | Supplier/PO forms, partial receiving, server valuation, retry IDs |
| F4 batches/transfers | POST `/api/v1/inventory/adjustments`, `/products/{id}/tracking`, `/batches/{id}/count`; GET `/batches`; GET/POST `/transfers`, GET `/transfers/{id}`, POST `.../dispatch`, `/receive`, `/cancel` | Batch/expiry alerts, request/dispatch/receive and in-transit stock; no browser COGS calculation |
| F5 cart/order engine | Existing POST `/api/orders/cart`, `/api/orders`; GET order/history and fulfillment; lines accept base quantity or unitCode/unitQuantity; server discount/tax snapshots | Extend existing POS with unit/variant selection, server net/tax/gross and expiry; distinguish current authoritative amounts from historical unknown tax |
| F5 pricing/payment | GET `/api/v1/checkout/catalogue?locationId=...&code=...`; GET/POST `/prices`, `/promotions`, POST `/promotions/{id}/revoke`; GET/POST `/orders/{id}/payments`, POST `/payments/{id}/reconcile` | CASH, MANUAL_TERMINAL, explicitly enabled SIMULATOR; UNKNOWN holds and verified outcome/reference reconciliation; block unsafe repeats |
| F5 reversals/receipts | GET/POST `/api/v1/checkout/orders/{id}/reversals`; GET `/reversals/{id}`, POST `.../review`, `/complete`; GET `/orders/{id}/receipt?format=text|html|pdf`; POST `/orders/{id}/receipt-email` | Partial/full approved reversals, physical restock choices and immutable print/PDF/email receipt payloads |
| Retained public demo | `/api/storefront/{businessId}/products`, `/cart`, `/orders`; token-protected order/payment/cancel/receipt | Preserve separate customer access. The old simulated payment path is not proof of new real cash/manual-terminal support |
| Operational reporting | Existing `/api/reports/summary`, `/sales`, `/low-stock`, `/out-of-stock`, `/stock.csv`, `/api/audit` | Retain basic reports; later reflect weighted-average actual cost, tax snapshots, UTC filters and branch scope accurately |
| F6–F8 | Backend B6–B9 are deferred | Do not fabricate loyalty/CRM marketing, advanced report scheduling, external sync, subscriptions or support impersonation |

## Missing endpoints and integration constraints

- **Invitation resend:** no dedicated resend endpoint exists. F1 must explicitly revoke/reissue (and load/preserve the correct grants) or request a backend extension. Do not call an invented `/resend` path. Invitation lists expose limited grant metadata; membership grants are the canonical editor data.
- **Account-link pages:** the server creates `/verify-email`, `/reset-password`, `/accept-invitation` links. These are F1 frontend routes, currently not delivered. Verification/acceptance may revoke sessions; reauthenticate afterward.
- **Public discovery:** no public business/branch/category metadata or global fitment discovery API was found. Existing business-ID storefront links remain necessary. Do not fake company currency or attach staff credentials to discover public data.
- **Rate-limit visibility:** backend CORS exposes X-Request-ID and Content-Disposition, but not Retry-After. Error code/reference works in the browser; reading Retry-After cross-origin requires a backend CORS extension. F0 does not fabricate a precise retry countdown.
- **Health CORS:** actuator health exists, but `/api/**` is the CORS mapping. F0 does not use cross-origin actuator requests as a browser connection test. Live health can be checked by local tooling.
- **Identity changes:** ADMINISTRATOR and INVENTORY_CLERK are current canonical roles. Legacy CLERK is compatibility only. Owner and platform MFA are mandatory; no F0 toggle disables them. A full session without a selected membership is not automatically assigned a business.
- **Old screens needing semantic changes:** legacy staff editing cannot change global names, central reorder thresholds now affect all locations, product imports now exist, and old payment actions are simulator-oriented. F1/F3/F4/F5 must finish these adaptations before declaring the new MVP complete.
- **Runtime versus deployment target:** product requirements say cloud-first/online; the actual backend remains SQLite locally by explicit server-project direction. No infrastructure migration is inferred from a frontend prompt.

## Validation and review

Production build/type checking, formatting and automated tests are run for F0. Tests cover navigation/deep-link protection/not-found, loading versus empty-stock states, denied and missing branches, current role names, restricted authentication purposes, memory-only sessions/logout/revocation, stale-session failures, correlation/rate-limit/error handling, multipart/cancellation/offline writes and the retained staff/public workflows. Auth fixtures reflect the current server response; successful financial or stock actions are not mocked in the product itself.

Final results: `npm.cmd test` — **41 passed, 0 failed** across five test files; `npm.cmd run build` — TypeScript and production bundle passed; `npm.cmd run format:check` — passed; `git diff --check` — passed. These checks used the existing locked dependencies; no new library was added.

The Orvexa sign-in was inspected in Chrome at desktop/narrow widths; form labels and document title appear in the accessibility snapshot and no runtime console errors were present. Protected workspace behavior is covered by component/integration tests; live MFA/account mutation was intentionally not exercised. Formal contrast/screen-reader/keyboard POS auditing remains F9, with targeted accessibility checks continuing in each phase.

**Next phase: F1.** Implement the real verification/reset links, required MFA, membership/business switcher, invitations and session screens. Retain the server’s scope/token rotation rules. Stop here for the F0 review as required by the supplied prompts.
