# Frontend MVP assessment

Date: 2026-11-13. Scope: assess the existing frontend and sibling Spring backend against the v2 MVP plan, then define a frontend implementation baseline. This assessment does not implement the application or modify the backend.

This is the pre-implementation assessment. The frontend has since been implemented; see [the README](../README.md) and [implementation log](IMPLEMENTATION_LOG.md) for current behavior and verification.

The 2026-11-14 Orvexa backend supersedes the older auth and domain assumptions below. Use [the Orvexa F0 audit](ORVEXA_F0_AUDIT.md) for current Bearer/membership contracts and the staged frontend plan.

## 1. Readiness and evidence

**The backend provides the main workflows needed to begin the frontend MVP. The frontend itself has not been started.** No backend rewrite is indicated by this review. Build a single application around the existing APIs and account for the integration limits below.

| Component | Observed state | Consequence |
| --- | --- | --- |
| Frontend | Placeholder console output; dependency-free package manifest; failing placeholder test script | Foundation, screens, API client, and browser verification all remain |
| Backend | Spring Boot 4.1.1, Java 24, Maven, JDBC, Spring Security, Flyway | Existing REST server is the authority for all business operations |
| Storage | SQLite MVP with V1-V6 migrations; separate PostgreSQL migrations and startup guard | Use SQLite for this local demo; PostgreSQL is not an alternate verified MVP runtime |
| Domain structure | Controllers, DTOs, services, repositories, models, config; service classes for tenancy, catalog, inventory, counts, imports, commerce, reports | Organize frontend features around these workflows |
| Employee access | Stateless HTTP Basic, BCrypt, server-derived business membership, role checks | No login POST, refresh token, or server logout endpoint to integrate |
| Public commerce | Anonymous storefront plus per-order capability token | Keep customer order access separate from employee credentials |
| Existing test evidence | Eight Surefire XML reports dated 2026-11-13 total 32 tests, zero failures/errors/skips | Useful backend baseline; these are existing results, not a fresh test run |

Sources inspected: backend README, MVP_PROGRESS, ARCHITECTURE_DECISIONS, pom.xml, all controllers and request DTOs, security/CORS configuration, relevant services/repository queries, migration inventory, and target/surefire-reports. Backend documentation also reports two passing Python backup tests and a restore drill; those were not independently rerun here. No running-server or browser integration was verified during this assessment.

## 2. Frontend structure

Use one React + TypeScript application, with a Vite development server on port 5173 and role-specific routes. This follows the architecture plan and avoids maintaining separate applications for the local demonstration. Exact package versions should be selected and verified when scaffolding, then locked in the repository.

Suggested organization (proposed, not yet created):

```text
src/
  app/                  # Router, providers, staff/operator/public layouts
  api/                  # HTTP transport, raw contracts, response adapters, errors
  auth/                 # Employee identity and route/action permissions
  components/           # Forms, tables, dialogs, pagination, status/error views
  features/
    platform/           # Business provisioning
    dashboard/
    catalog/            # Products, categories, verified fitment
    inventory/          # Balances, reasons, movements, thresholds
    counts/
    imports/
    pos/
    orders/
    storefront/
    employees/
    settings/
    reports/
    audit/
  lib/                  # Money, dates, downloads, command IDs
  styles/
```

Keep authoritative server data in a query/cache layer; keep unsent form values and carts in local UI state. Query keys must include employee/business context, location where relevant, and filters. Clear employee caches and carts on logout or account change. Never let the staff tenant be chosen through a client-supplied business ID.

Recommended route map:

| Routes | Purpose / audience |
| --- | --- |
| `/login` | Employee and operator login |
| `/platform/businesses` | Operator metadata list and tenant/owner provisioning |
| `/app` | Owner/manager dashboard; role-appropriate landing for clerks/cashiers |
| `/app/products`, `/app/products/:id` | Catalog and product detail/edit/fitment |
| `/app/inventory`, `/app/movements` | Location balances and ledger |
| `/app/counts`, `/app/counts/:id` | Draft counts, review, submit, reopen, approve |
| `/app/imports/opening` | Template, file reading, preview, commit |
| `/app/pos` | SKU/barcode cart and simulated sale |
| `/app/orders`, `/app/orders/:id` | Order lifecycle and receipts |
| `/app/employees`, `/app/settings` | Staff, categories, reasons, locations, business settings |
| `/app/reports`, `/app/audit` | Operational reports and filtered audit |
| `/store/:businessId`, `/store/:businessId/cart`, `/store/:businessId/orders/:id` | Public catalog, checkout, token-protected order/payment/receipt |

Use an operational landing screen for CLERK/CASHIER rather than issuing requests to the manager-only reports endpoints.

## 3. Endpoint inventory

Paths below are relative to the backend origin. `{id}` is a resource identifier; product, fitment, order, count, and import IDs are UUID strings. Business, employee, category, and location IDs are numeric. Preserve barcode/SKU values as strings, including leading zeros.

### Access and administration

| Method / path | Frontend use / contract |
| --- | --- |
| `GET /api/auth/me` | Validate Basic credentials and load camelCase employee identity, `businessId`, `role`, `status`, `operator` |
| `GET /api/platform/businesses` | Operator-only business metadata |
| `POST /api/platform/businesses` | Provision `{name, locationName, currency?, defaultThreshold?, owner}`; owner uses employee-create fields |
| `GET /api/business` | Current tenant settings; snake_case `default_threshold` |
| `PUT /api/business` | OWNER only; `{name, currency, defaultThreshold}`; currency locked after first order |
| `GET /api/locations` | Current tenant locations |
| `POST /api/locations` | OWNER/MANAGER; `{name}` |
| `GET /api/employees` | OWNER/MANAGER list; snake_case employee names/job title |
| `POST /api/employees` | `{firstName,lastName,email,password,jobTitle,role}`; camelCase response |
| `PUT /api/employees/{id}` | `{firstName,lastName,jobTitle,role,status}`; response omits role/job title, so refetch list |

There are no employee password-reset/email-edit endpoints. Status values are `ACTIVE`, `SUSPENDED`, `DEACTIVATED`. Password creation requires 12-72 characters and at most 72 UTF-8 bytes. Managers can create/edit CLERK/CASHIER accounts only and cannot edit OWNER/MANAGER accounts. Preserve at least one active owner.

### Catalog and compatibility

| Method / path | Frontend use / contract |
| --- | --- |
| `GET /api/categories` | Tenant categories |
| `POST /api/categories` | `{name}` |
| `GET /api/categories/{id}` | Category detail |
| `PUT /api/categories/{id}` | `{name}` |
| `DELETE /api/categories/{id}` | 204; fails if referenced |
| `GET /api/products` | Search/filter/paginate; includes staff costs and archive status |
| `POST /api/products` | Product create |
| `GET /api/products/{id}` | Product detail |
| `PUT /api/products/{id}` | Full product edit using ProductRequest fields |
| `DELETE /api/products/{id}` | 204; archives rather than deleting history |
| `POST /api/fitments` | Create verified vehicle configuration |
| `GET /api/products/{id}/fitments` | Linked configuration records |
| `POST /api/products/{id}/fitments/{fitmentId}` | Link configuration; empty response |
| `DELETE /api/products/{id}/fitments/{fitmentId}` | Unlink configuration; empty response |

Product request fields: `sku`, `barcode?`, `itemName`, `itemDescription`, `unitPrice`, `categoryId?`, `cost?`, `unitOfMeasure?`, `minStockThreshold?`. Name and description are required. Prices/costs are nonnegative major-unit decimals with at most two decimal places. Response uses `itemId`, not `id`; do not invent `name`/`price` request fields.

Product filters: `search`, `category` (category name, not ID), `barcode`, `make`, `model`, `year`, `engine`, `trim`, `includeInactive`, `limit`, `offset`. General search is substring matching across name/SKU/description and does not search barcode. For scanner input, attempt exact barcode lookup and exact-match the SKU among search results; do not automatically select the first partial result. Dedicated count-line entry already resolves SKU/barcode exactly on the server.

Fitment creation: `{make,model,yearFrom,yearTo,engine?,trim?,source,verified:true}`. A verified source is mandatory. The backend records the verifying employee. No global fitment list/edit endpoint exists: begin with create-and-link on a product and linked records available on product detail. A reusable configuration picker would require an additional discovery API or collecting known linked records. Configurations restricted to an engine/trim are excluded when those details are omitted from compatibility search.

### Inventory, counts, imports

| Method / path | Frontend use / contract |
| --- | --- |
| `GET /api/inventory` | `locationId`, `search`, `category`, `lowStock`, `outOfStock`, `limit`, `offset` |
| `GET /api/inventory/{productId}` | Balance at optional `locationId` |
| `POST /api/inventory/{productId}` | Initialize stock: `{quantityOnHand,reorderLevel?,reason,notes?,requestId}`; optional `locationId` query |
| `POST /api/inventory/{productId}/movements` | `{type,quantity,reason,notes?,requestId}`; optional `locationId` query |
| `PUT /api/inventory/{productId}/reorder-level` | `{reorderLevel}`; optional `locationId` query |
| `GET /api/inventory/movements` | `locationId`, `productId`, `limit`, `offset` |
| `GET /api/inventory/alerts` | Optional `locationId`; at most 200 low-stock rows |
| `GET /api/inventory/reasons` | Available reason codes/labels |
| `POST /api/inventory/reasons` | `{code,label}`; uppercase code matching backend pattern |
| `GET /api/counts` | Most recent 200 sessions; no offset/filter parameters |
| `POST /api/counts` | `{}` or `{locationId}` |
| `GET /api/counts/{id}` | Header and lines with expected/counted quantities and variance |
| `PUT /api/counts/{id}/lines` | `{code,quantity}`; replaces that product's counted total |
| `POST /api/counts/{id}/submit` | No body; freezes draft entry |
| `POST /api/counts/{id}/reopen` | No body; OWNER/MANAGER |
| `POST /api/counts/{id}/approve` | No body; OWNER/MANAGER; applies reviewed differences |
| `GET /api/imports/opening/template` | CSV download |
| `POST /api/imports/opening/preview` | JSON `{locationId?,csv}`; not multipart upload |
| `GET /api/imports/opening/{id}` | Preview header and row-level errors |
| `POST /api/imports/opening/{id}/commit` | No body; transactional commit with revalidation |

Inventory responses use `product_id`, `location_id`, `quantity_on_hand`, `quantity_reserved`, `available_quantity`, `reorder_level`, `low_stock`. Normalize database numeric boolean flags at the API boundary. Listings include initialized active-product balances, not every catalog product; absence of a stock row is different from an initialized zero balance.

Whole units only. `available = on_hand - reserved`. Opening creates a balance once; subsequent receipts/damage/corrections require movements. `RECEIPT` and `DAMAGE` accept positive quantities; `CORRECTION` accepts a signed nonzero delta. A damage quantity of 2 means remove 2, so do not send -2.

Counts follow `DRAFT -> SUBMITTED -> APPROVED`; a manager can reopen submitted counts to DRAFT. All submissions need approval, even with zero variance. Stock remains sellable. A changed on-hand snapshot causes 409 at approval: offer reopen, recount, save, resubmit. Saving the same code replaces the count, so a scanner must not accidentally treat the API as an increment command. Approved counts also cannot consume reserved stock.

Opening CSV header is exactly `sku,quantity,reorderLevel`, with at most 1000 data rows. Products must already exist and stock must be uninitialized at the selected location. Preview errors require a corrected file/new preview. Commit can still fail if stock changed after preview.

### Staff and public commerce

| Method / path | Frontend use / contract |
| --- | --- |
| `POST /api/orders/cart` | Authoritative cart prices/availability; no stock reservation |
| `GET /api/orders` | Paginated history (`limit`, `offset`); no server date/channel/status/location filters |
| `POST /api/orders` | Reserve a POS order |
| `GET /api/orders/{id}` | Order, immutable lines, payments, refunds, actor/events |
| `POST /api/orders/{id}/payment` | Simulated outcome |
| `POST /api/orders/{id}/cancel` | Eligible cancellation/release/restock |
| `POST /api/orders/{id}/fulfill` | Mark completed order fulfilled |
| `POST /api/orders/{id}/return` | Full physical return, with explicit resellable decision |
| `POST /api/orders/{id}/refund` | Full simulated funds refund, with no stock mutation |
| `GET /api/orders/{id}/receipt` | Downloadable `text/plain` receipt |
| `GET /api/storefront/{businessId}/products` | Public catalog/availability; catalog filters except `includeInactive`, plus `locationId` |
| `POST /api/storefront/{businessId}/cart` | Public cart preview |
| `POST /api/storefront/{businessId}/orders` | Reserve ONLINE order; returns `accessToken` once |
| `GET /api/storefront/{businessId}/orders/{id}` | Requires `X-Order-Token` |
| `POST /api/storefront/{businessId}/orders/{id}/payment` | Requires token; simulated outcome |
| `POST /api/storefront/{businessId}/orders/{id}/cancel` | Requires token |
| `GET /api/storefront/{businessId}/orders/{id}/receipt` | Requires token; text download |

Cart: `{locationId?,lines:[{productId,quantity}]}`. Checkout adds `requestId`. Combine duplicate products into one line; max 100 distinct lines, 1-100000 units per line. The client never supplies trusted prices, totals, channel, or tenant for a staff sale.

Payment: `{method:"CASH"|"CARD",successful:boolean,requestId}`. Action: `{reason,requestId}`. Return adds `resellable:boolean`. Do not send card numbers, customer bank data, or extra invented fields.

Public catalog fields differ from staff DTOs: `id`, `name`, `description`, `price`, `available`, `sku`, `barcode`, `unitOfMeasure`, `category`. Orders/cart use fields such as `total_cents` and `price_cents`. Public responses omit costs/staff events. Build separate raw contracts with adapters rather than sharing one assumed Product type.

Order behavior:

- Checkout reserves for five minutes; adding to a cart does not reserve.
- Successful payment: RESERVED -> COMPLETED and stock committed.
- Failed payment: RESERVED -> PAYMENT_FAILED and reservation released.
- Timeout: RESERVED -> EXPIRED, checked at payment/checkout and by a 30-second sweep.
- RESERVED cancellation releases stock. COMPLETED, unfulfilled cancellation restores all units and records a simulated refund.
- COMPLETED -> FULFILLED requires OWNER/MANAGER/CLERK.
- FULFILLED -> RETURNED requires OWNER/MANAGER; only resellable returns restore stock. Full return also records the simulated refund.
- Refund-only records funds reversal without changing inventory or the order's lifecycle status. Display refund state from `refunds` separately.

Retain one command ID and identical payload for retries of a supported command; use a new ID for a different action. Do not automatically retry every POST: product creation/count creation and other APIs lack request-ID protection. After a stock/order command, refresh affected balances, cart, alerts, order history/detail, and visible reports. Refresh on window focus and use modest polling where simultaneous POS/storefront activity needs to be visible; no push API exists.

Store the public token under its business/order context, for example in tab-scoped sessionStorage, and send it only in `X-Order-Token` to the corresponding backend route. Do not put it into URLs or attach employee Authorization headers to public requests. A lost initial checkout response can also lose the token: an initial checkout retry without the token returns 404 for the existing order. Present an uncertain checkout state; avoid blindly creating another reservation. Recovery is reservation expiry or staff assistance, not public token recovery.

### Reports and audit

| Method / path | Frontend use / contract |
| --- | --- |
| `GET /api/reports/summary` | Stock KPIs/value estimate; optional `locationId` |
| `GET /api/reports/low-stock` | `locationId`, `limit`, `offset` |
| `GET /api/reports/out-of-stock` | `locationId`, `limit`, `offset` |
| `GET /api/reports/sales` | Inclusive UTC `from`, `to` dates and `channel=POS|ONLINE` |
| `GET /api/reports/stock.csv` | Complete stock export for optional `locationId` |
| `GET /api/audit` | `entityType`, `entityId`, `limit`, `offset` |

Sales return gross, refunded, and net cents plus `byDate`, `byChannel`, `byProduct`. Product cost/profit estimates are gross figures before refunds. Refund totals follow the original sale cohort. Sales are tenant-wide; there is no location sales filter. Reports do not return currency, so read current business settings. Do not let the UI imply a location filter applies to sales.

Audit is for employee administration and other explicitly logged actions; the stock ledger and order lifecycle events remain separate views. Do not imply one endpoint contains every action.

## 4. Permissions to reflect in the UI

| Capability | OWNER | MANAGER | CLERK | CASHIER | OPERATOR |
| --- | --- | --- | --- | --- | --- |
| Tenant catalog/stock reads; order reads/cart preview | Yes | Yes | Yes | Yes | No |
| Product/category/fitment edits; stock movements/thresholds | Yes | Yes | No | No | No |
| Opening CSV | Yes | Yes | No | No | No |
| Start/save/submit counts | Yes | Yes | Yes | No | No |
| Reopen/approve counts | Yes | Yes | No | No | No |
| POS checkout/payment/cancellation | Yes | Yes | No | Yes | No |
| Fulfill completed orders | Yes | Yes | Yes | No | No |
| Return/refund | Yes | Yes | No | No | No |
| Reports/audit | Yes | Yes | No | No | No |
| Manage operational employees | Yes | Yes | No | No | No |
| Manage owners/managers | Yes | No | No | No | No |
| Business settings write | Yes | No | No | No | No |
| Create locations | Yes | Yes | No | No | No |
| Platform business list/provision | No | No | No | No | Yes |

Check `operator` explicitly: an operator's employee role value is not a grant of tenant access. UI guards aid navigation; server authorization remains authoritative. Always handle 403/404 even when buttons are hidden appropriately.

## 5. API client requirements

- Employee login calls `/api/auth/me` with Basic credentials. Keep employee credentials in memory for this local MVP, clear on logout/401, and require login after reload. Do not persist a Basic password in localStorage or assume JWT/cookie session endpoints exist. Encode credentials with UTF-8 support.
- Use separate employee and public request helpers so credentials cannot bleed into storefront calls. CORS allows Authorization, Content-Type and X-Order-Token; cookies are not part of this contract.
- Handle JSON, empty 204/void success, CSV, and plain-text receipts. Fetch downloads with the appropriate auth header, then create a blob URL; a bare anchor does not attach the public order token.
- Parse ProblemDetail `detail` and optional `errors`; tolerate non-JSON/empty security or network errors. Handle 400 field errors, 401 login expiry, 403 permission denial, 404 missing/inaccessible records, 409 state/stock conflicts, and server/network failures.
- Do not submit unknown JSON fields: the backend rejects them. Build explicit request objects instead of spreading response models into forms.
- Most paginated endpoints return plain arrays without a total. Use previous/next or load-more; do not invent a total page count. When a full page is returned, another request may be needed to discover the end.
- Preserve major-unit catalog decimals versus integer cents in commerce/reports. Never display `total_cents` as a major-unit amount. Use server totals and business currency; verify money conversions at boundaries and avoid floating-point arithmetic for totals.
- SQL-map timestamp strings lack an explicit offset in some responses; database-generated values are UTC. Normalize those deliberately, distinguish them from ISO DTO timestamps and `expires_at_ms`, and label report dates as UTC.
- Include location in reads/commands where supported and lock a checkout to its selected location. Changing location should trigger cart revalidation. Omitting location selects the first active location.

## 6. Integration limits and scope decisions

These are implementation constraints, not reasons to restart the backend.

| Finding | MVP approach | When a backend addition is needed |
| --- | --- | --- |
| Architecture mentions product CSV import; implemented CSV initializes stock only | Create demo products through catalog forms, then import opening quantities | If bulk product registration is required for acceptance, add a separate product-import workflow |
| No public business/location/category/fitment discovery API or public product-detail endpoint | Use configured demo storefront links/business IDs; default to first active location; use free-text fitment/category filters and product list data | Dynamic storefront branding, public location selectors, reliable category options, or public fitment detail need extra APIs |
| No global fitment discovery/edit | Create/link from product detail; show linked configurations | A global reusable fitment administration screen needs an endpoint |
| No exact SKU query parameter for product lists | Exact barcode query; filter SKU equality among paginated search matches | Add exact code lookup if catalog size makes this inefficient |
| Alerts capped at 200; counts list capped at 200 | Treat alerts as a bounded preview and use paginated stock listing for exhaustive results; adequate demo count history | Unbounded count history needs pagination |
| Order history has no server filters | Offer paginated history and detail; label any current-page filtering | Full-history search/filter needs new query support |
| No WebSocket/SSE | Invalidate/refetch after commands, refresh on focus, poll selected live views | Immediate push updates are later work |
| No public token recovery after lost creation response | Explain uncertain reservation and expiry; allow staff assistance | Seamless public checkout recovery needs a deliberately designed protocol change |

The original architecture's open policy questions are largely resolved in the backend: operator has no routine tenant access, five-minute reservations, all counts approved, stock sellable during counting, integer quantities, one seeded location per tenant, full-order returns/refunds. Adopt these existing rules for the frontend. The architecture document remains a historical working draft; do not treat its unresolved-question list as the current API contract.

## 7. Delivery order and acceptance

1. **Foundation and access:** scaffold React/TypeScript, environment-based API origin, routing/layouts, API client/adapters, login/logout, permissions, loading/error/empty states. Verify operator, owner, manager, clerk and cashier landing/navigation against actual accounts.
2. **Administration and catalog:** provisioning, business/location settings, employee creation/edit/status, category CRUD, product CRUD/archive, scanner lookup and verified fitment create/link/unlink. Verify tenant switches clear cached data and manager cannot edit privileged staff.
3. **Inventory onboarding and operations:** location selector, balance/low-stock views, opening quantities, reasons/movements/thresholds, opening CSV preview/commit, saved/resumed count sessions with submit/reopen/approve. Verify CSV error recovery and count conflict/recount behavior.
4. **POS and public commerce:** shared cart presentation with distinct API adapters; reservation/payment/outcome handling, token retention, order history/detail, fulfillment/cancellation/returns/refunds, text receipts. Verify failure/expiry and identical-command retries, then simultaneous POS/ONLINE final-unit checkout.
5. **Reporting and demo completion:** stock dashboard, date/channel sales summaries, stock CSV, audit and ledger/order event views, accessible keyboard/scanner workflows, responsive layouts, demonstration script and setup documentation.

Each increment should call the real backend and remain demonstrable. Mock data may support component development but must not stand in for completed backend integration.

Meaningful frontend checks:

- Type checking, production build, and linting once configured.
- API contract tests for mixed response names, money units, UTC parsing, void/download responses, ProblemDetail errors, and command retry identity.
- Permission navigation/action tests including the operator flag and manager limits.
- Integration/browser flows: login -> product -> opening/count approval -> POS sale -> storefront availability -> online payment -> cancellation/return -> reports/receipt.
- Two isolated tenants and account switching without stale data; missing/wrong public order token; count drift; insufficient stock; failed payment; duplicate submission; simultaneous final-unit allocation with the backend.
- Refresh/resume behavior for draft counts and public orders; keyboard scanner input, form labels, focus handling, loading and conflict recovery.

The backend already tests transactional concurrency and tenant isolation. Frontend checks verify that the UI uses those contracts correctly and represents the resulting state accurately.

## 8. Assessment outcome

Proceed with frontend foundation and API integration, then deliver the workflows in the order above. No additional product decision blocks starting that work. The only material scope mismatch to resolve before declaring full architecture-plan acceptance is whether product CSV registration is required beyond the backend's existing opening-stock CSV.

The MVP remains local, with simulated cash/card outcomes, structured compatibility, and in-app alerts. AI, live payments, SMTP, offline synchronization, subscriptions and public hosting remain outside this build. Real deployment still requires the backend's documented post-MVP review.
