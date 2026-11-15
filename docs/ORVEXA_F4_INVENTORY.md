# Orvexa F4 — Branch inventory, purchasing, batches and transfers

F4 extends the existing stock, movement, opening-import and physical-count screens. F5 updated POS/payments remains necessary for the broader frontend MVP. No backend source, migration, existing database or security configuration was changed, and no dependency was added.

## Screens and workflows

| Route                            | Implemented behavior                                                                                                                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/app/inventory`                 | Active-branch on-hand/reserved/saleable balances, low/out-of-stock filters, recorded stock value, clearly derived display average, valued receiving/adjustments, retained opening/threshold/export/quantity-only actions.         |
| `/app/purchasing`                | Paginated supplier directory/create and permitted-branch PO list; create up to 100 unique-product lines with purchase units, decimal quantities and acquisition costs.                                                            |
| `/app/purchasing/:id`            | Fixed receiving branch, snapshotted units/factors/value, cumulative base-unit receipts/remainders, partial receiving with optional batch/expiry, receipt IDs/dates, cancellation of completely unreceived OPEN orders.            |
| `/app/batches`                   | Active-branch positive physical batch stock, reserved/unreserved quantities, UTC expiry dates, server past-due/soon-due filter, advisory browser expiry labels, explicitly approved batch discrepancies and stale-balance errors. |
| `/app/transfers`                 | Paginated permitted-branch transfer list and requests between different active permitted branches. Requests do not move or reserve stock.                                                                                         |
| `/app/transfers/:id`             | Explicit dispatch and whole-base-unit partial receipt; server in-transit quantity/value separate from destination stock. Cancellation only before dispatch.                                                                       |
| `/app/counts`, `/app/counts/:id` | Existing scanner/save/submit/reopen/approve flow retained; added shortage/overage and changed-line summaries, batch-count guidance and preserved conflict feedback.                                                               |
| `/app/movements`                 | Existing immutable quantity ledger with management value delta/after and reference IDs.                                                                                                                                           |

Inventory operation links respect role capabilities. Branch-scoped outlets remount on branch changes, clearing old filters/modal drafts and preventing a draft from silently targeting another branch. PO/transfer detail actions keep their persisted branches; a header change never rewrites the target. The setup checklist now links stock receiving to purchasing.

Owner/Administrator/Manager can manage purchasing, transfers, valued adjustments and batch-count approvals. Administrators inherit Manager authority in Spring's resolver. Inventory Clerks retain physical-count capabilities and read permitted stock/batches, with management actions and cost columns hidden. Guards are convenience checks; the server enforces membership/branch authority. Transfers require permission for both branches, including reads.

## Valuation and approvals

The inventory API exposes `stock_value` and quantity but does not expose `StockLedger.average()`. Management sees the recorded value and a **display ratio** calculated using exact BigInt decimal arithmetic: value divided by on-hand, rounded to six places. Zero or missing balances show no invented average. This is explicitly not authoritative posted COGS and is never submitted to an API. Spring alone posts stock, movement values and historical sale costs.

Existing stock can contain migrated/catalogue-cost estimates. No per-balance provenance read field or valuation-history endpoint is available, so the UI warns about estimates rather than presenting every balance as actual acquisition history. Legacy opening and quantity-only receipt actions remain clearly distinguished from valued receiving. Product reference cost is not used to calculate browser inventory value.

Valued incoming commands submit acquisition cost per selected purchase unit, separate from sales tax. Outgoing damage/corrections use the server's location average and ignore client cost; the form submits zero for the required but unused outgoing `unitCost`. Purchase conversion results must resolve to whole base units. PO receipts use the original PO unit/factor, not a newly selected unit. The server consumes the exact final value remainder and rejects over-receipts.

There is **no separate adjustment approval queue endpoint**. Management explicitly confirms/reasons a direct stock adjustment or batch discrepancy and the server posts it immediately. Aggregate counts retain their distinct submitted/approved states. The UI does not invent a pending adjustment, reviewer identity or two-person approval.

Each F4 command uses its backend `requestId`, separately from transport correlation IDs. A lost/5xx response freezes the draft and exposes **Retry same command**, reusing the exact path/payload/ID. No write is automatically retried. Confirmed operations get new IDs for later actions, including identical consecutive partial receipts. A definitive failure preserves the input for review/correction; stock/value is never optimistically changed. IDs stay in component memory: after leaving/reloading, reconcile saved lists, receipt/count status and the movement ledger before creating another operation.

## Batches, expiry and discrepancies

Enable tracking before stock exists through the F3 product controls. The product read DTO still omits the tracking flag, so receiving instructions require explicit batch metadata for known tracked products and omit it for untracked products. The server validates this. One PO product line can receive into one batch per receipt; use separate receipts for multiple batches of that product. A batch's expiry is immutable.

Expiry is a calendar date, valid through that UTC day. The server excludes older batches from saleable stock. Batch-list `available` means physical quantity minus reservations and may include expired stock; it is labeled **Unreserved physical**, never promised as saleable. Alert filtering uses the server clock; any browser-clock expired badge is advisory.

Batch review captures `expectedQuantity` when opened. Approval sends that snapshot, counted base quantity and reason. A stale count or count below reservations is rejected. Close, **Refresh batch balances**, recount and reopen rather than silently adopting a new expectation into a dirty form. The list includes only positive on-hand batches; zero-stock batches cannot be discovered here without an additional backend read endpoint.

Aggregate count summaries describe units, not financial loss. Users are directed to explicit batch review for tracked discrepancies. The backend does not expose a tracking flag in count lines/product reads; the frontend cannot infer every tracked item from an empty batch list. Existing count creation has no idempotency key, while approval is server-idempotent once approved. No automatic retry is introduced for count creation or lifecycle actions.

## Transfer behavior

REQUESTED moves nothing. Dispatch removes source quantity/value, and the saved detail exposes transit quantity/value. Partial receipt adds only confirmed quantities and their saved value to the destination. The last receipt consumes the transit value remainder. In-transit goods are never added to destination availability in the browser.

Tracked transfers require one source batch per product and retain its expiry. Multiple batches of a product require separate transfers. Dispatched transfers cannot be silently cancelled. There is no automated transit-loss/write-off endpoint; unresolved missing goods require operational reconciliation.

## Endpoints consumed

| Endpoint                                                                                  | Methods                                                  |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `/api/inventory`, `/api/inventory/movements`, `/api/inventory/reasons`                    | Existing GET branch stock/ledger/reasons                 |
| `/api/inventory/{productId}`, `.../movements`, `.../reorder-level`                        | Retained opening POST, quantity-only POST, threshold PUT |
| `/api/v1/inventory/adjustments`                                                           | POST valued receipt/damage/correction                    |
| `/api/v1/inventory/batches`                                                               | GET `locationId`, `expiring`, `days`, `limit`, `offset`  |
| `/api/v1/inventory/batches/{id}/count`                                                    | POST expected/counted quantity and reason                |
| `/api/v1/purchasing/suppliers`                                                            | GET paginated directory, POST create                     |
| `/api/v1/purchasing/orders`                                                               | GET permitted orders, POST create                        |
| `/api/v1/purchasing/orders/{id}`                                                          | GET lines and receipt headers                            |
| `/api/v1/purchasing/orders/{id}/receive`, `.../cancel`                                    | POST receive / cancel                                    |
| `/api/v1/inventory/transfers`                                                             | GET permitted list, POST request                         |
| `/api/v1/inventory/transfers/{id}`                                                        | GET server transit fields                                |
| `/api/v1/inventory/transfers/{id}/dispatch`, `.../receive`, `.../cancel`                  | POST lifecycle commands                                  |
| `/api/counts`, `/api/counts/{id}`, `.../lines`, `.../submit`, `.../reopen`, `.../approve` | Retained count contracts                                 |
| `/api/products`, `/api/v1/catalogue/products/{id}/units`, `/api/v1/branches`              | Existing permitted product/unit/branch selection         |

Additional API limits: no supplier edit/deactivate, supplier search, receipt-line reads, separate adjustment-review queue, explicit average/provenance read, zero-stock batch discovery or transit-loss write-off. Supplier creation uses the currently displayed directory page (200 rows); pages can be changed before opening the form. Product choices reuse the F3 paginated family query. PO/transfer lists represent all permitted branches, not a fictional header-branch server filter. Counts retain the backend's 200-session limit. No missing endpoint is represented as implemented.

Cost columns are hidden according to frontend capabilities. The existing stock read API itself returns valuation fields to permitted tenant readers; this frontend gating is not a server-side field-confidentiality guarantee. Backend response masking would be needed for stricter cost-data confidentiality.

## Changes and validation

New: `api/inventory.ts`, `lib/inventory.ts`, `components/InventoryUI.tsx`, `features/purchasing.tsx`, `features/transfers.tsx`, `features/inventory-operations.tsx`, `test/inventory-f4.test.tsx`.

Extended: `api/types.ts`, app routes/navigation, existing inventory/movement/count screens, onboarding and styles. Purchasing/transfer routes load in separate bundles to keep the initial production chunk below Vite's 500 KB warning threshold. Existing fitment/catalogue/auth/payment flows remain intact. README and implementation log reflect F4.

Validation on 2026-11-14:

- **134 tests pass across 11 files**, including 17 new F4 tests for exact decimal/display arithmetic, expiry/quantity bounds, branch switching/draft disposal, clerk visibility, reasoned adjustments, stale batch counts, expiry filters, count conflicts, PO unit/cost payloads, fixed receiving branch, partial/over receiving, uncertain receipt/supplier retries, transit lifecycle and denied branch reads.
- `npm.cmd run build`, `npm.cmd run format:check` and `git diff --check` pass. No new dependency or migration is required.
- Chrome CLI checks used fresh disposable SQLite/demo backend/frontend ports 18084/5184 with SMTP disabled and an ephemeral security key. Existing backend data/key and 8080/5173 services were preserved. The QA services were restarted with a new disposable database after a long pause; no existing user database was repaired or reset.
- Actual supplier/PO creation, three receipts (0.5, 0.5, 1 CASE_12), actual acquisition values, valued direct receipt and branch average display passed. The example reached 30 units with recorded value 360 and display average 12 before subsequent operations.
- Request/dispatch/two partial transfer receipts preserved separate transit values. Source stock/value decreased, destination stock/value increased only on receipt, identical receipt payloads used distinct confirmed command IDs, and branch switching showed the correct stock.
- Tracked receipts showed 7 physical / 0 reserved / 5 saleable units with two expired units. Expiry filtering, explicit batch discrepancy approval, aggregate count save/submit/approve, and ledger value/reference reads passed. Over-receipt was rejected with 409, its draft remained visible, and a corrected receipt succeeded.
- Desktop 1280px and 390px responsive inventory/purchasing layouts were inspected. Tables remained contained (390px page scroll width); native PO dialog measured 358px with focus, Tab and Escape working. Console inspection showed the expected deliberately triggered 409 and no unexpected JavaScript error.

QA assets remain under ignored `.local-demo/f4`. Physical scanners, printers, accounting exports and production load/concurrency certification are outside these browser checks. F5 payment UI is still outstanding; completing F4 does not certify the entire frontend MVP.

Next: **F5 — fast online POS, server pricing/reservations, cash/manual-terminal/simulator distinctions, uncertain-payment reconciliation, receipts and returns/refunds**. Stop after F4 for phase review under the supplied prompt.
