# Orvexa F3 — Catalogue, variants, units, labels and import

F3 extends the existing product routes and fitment workflow. The frontend MVP still needs F4 inventory/purchasing and F5 updated payments. No backend source, existing database, security key or migration was changed.

## Screens and workflows

| Screen                   | Behavior                                                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/app/products`          | Existing paginated catalogue, filters/archive search, product creation, import entry, exact SKU/barcode lookup suitable for an Enter-terminated keyboard scanner. Leading zeros stay text.                                                 |
| `/app/products/:id`      | Simple/parent/variant details and edit, parent-child navigation, variant creation, category, price/reference cost, immutable identity, branch-independent threshold, retained fitment/archive actions.                                     |
| Product units            | Add immutable purchase/sale factors, inspect allowed operations and request a server conversion. Fractional resulting base units are rejected by Spring.                                                                                   |
| Product labels           | Preserve manufacturer barcodes; generate an internal code only if missing. Authenticated PNG preview, dimension checks, SVG/PNG/PDF download. Print the PDF at actual size. Internal codes are explicitly not GS1-issued GTINs.            |
| Product tax              | Reuses F2 versioned profile assignment and history with its separate authority checks.                                                                                                                                                     |
| Product tracking         | Explicit batch-mode command and last confirmed response; optional expiry dates belong to receiving. History/stock restrictions are displayed and enforced by Spring.                                                                       |
| `/app/imports/catalogue` | CSV/XLSX templates, upload/read, column mapping, local source preview, duplicate policy, server row results, explicit confirmed commit, row-results CSV and saved-job recovery by ID/bookmark. No branch is required to register products. |

The checklist now mentions variants and guided import. Existing opening-stock import remains separate: catalogue import registers products and never receives stock or automatically assigns tax.

## Backend alignment

The shared Spring role resolver treats Administrator as Manager where Manager is required. Product, unit, barcode and import writes therefore allow Owner/Administrator/Manager. Batch-mode changes additionally require all-branch access. Tax configuration remains restricted to an all-branch Owner/Administrator, with verification reserved for an Owner. Server checks are authoritative.

Product type, parent, variant key and base unit are immutable after creation. Variants keep their own SKU, barcode, price, tax assignment and inventory identity. Active children must be archived before their parent. Conversion factors are append-only: add a new unit code for a different pack size. Reference catalogue cost does not represent a branch's weighted-average acquisition cost. A product threshold applies independently at each branch, with a blank value inheriting the business default.

All command decimal inputs are validated and transmitted as decimal strings. The UI does not calculate authoritative conversion quantities, stock, tax or COGS. Conversion results identify the input/unit/purpose and come from the server. An invalid subsequent conversion clears the prior result.

## Import behavior and recovery

1. Download a CSV/XLSX template or choose a file. Client limits: nonempty CSV/XLSX, 1 MB, 1000 data rows, 20 unique nonempty headers and bounded cells. Spring independently enforces its limits, including workbook expansion, one sheet, and rejection of formulas/macros/external links. Use text cells for identifiers.
2. Map required `sku`, `itemName`, `itemDescription` and `unitPrice`. Optional mappings cover barcode/category/reference cost/unit/threshold/type/parent/key. Matching headers are used automatically by Spring; remove/rename an optional matching source column to omit it. Categories and parents must already exist in this business. Import parents first, then variants using their IDs.
3. Inspect the local source preview and saved server row dispositions/errors. The local preview shows up to 20 source records; Spring returns all validation outcomes. XLSX display formatting may differ between the browser reader and Apache POI, so the preview is advisory. A resumed job returns row outcomes, not the source cells or mapping.
4. Confirm the exact saved preview before committing. REJECT reports duplicates; SKIP preserves duplicate SKUs; UPDATE replaces editable fields and can clear optional values. UPDATE uses Spring's saved product snapshot to detect concurrent changes. Commit is atomic: errors/conflicts roll back the entire job, including earlier rows in that transaction. No partial success is fabricated.

Progress represents actual loading/validation/commit operations with an indeterminate indicator; no synthetic percentage is shown. Only a saved `COMMITTED` server status confirms success. Fix invalid data in a new preview. Row-result downloads contain server dispositions and errors.

An uncertain preview retry retains its request ID for unchanged file/mapping/policy. A confirmed new validation gets a new command ID so duplicate decisions are recomputed. Commit retries retain the job's command ID and require a successful saved-status reload after a lost/5xx response. Writes are never automatically retried. Repeated committed jobs are server no-ops.

Product creation has no idempotency key endpoint. A lost/5xx create response disables resubmission and directs the user to inspect the SKU in the catalogue before creating again. Barcode generation is naturally repeatable and preserves an existing code. Unit/tracking commands retain IDs on uncertainty; confirmed tracking changes use fresh IDs so later mode changes are not mistaken for retries.

## Endpoints consumed

| Endpoint                                            | Methods / purpose                                    |
| --------------------------------------------------- | ---------------------------------------------------- |
| `/api/products`                                     | GET paginated search, POST product                   |
| `/api/products/{id}`                                | GET, PUT, DELETE/archive                             |
| `/api/categories`                                   | GET selection; existing category management retained |
| `/api/products/{id}/fitments`, `/api/fitments`      | Existing fitment workflow retained                   |
| `/api/v1/catalogue/products/{id}/units`             | GET, POST                                            |
| `/api/v1/catalogue/products/{id}/convert`           | POST server conversion                               |
| `/api/v1/catalogue/products/{id}/barcode`           | POST generate/preserve                               |
| `/api/v1/catalogue/products/{id}/label`             | GET `format=png                                      | svg   | pdf`, `widthMm`, `heightMm` |
| `/api/v1/inventory/products/{id}/tracking`          | POST explicit mode                                   |
| `/api/v1/tax/profiles`, `/api/v1/products/{id}/tax` | F2 GET history / POST assignment reuse               |
| `/api/v1/catalogue/imports/template`                | GET `format=csv                                      | xlsx` |
| `/api/v1/catalogue/imports/csv`                     | POST JSON original CSV and options                   |
| `/api/v1/catalogue/imports/xlsx`                    | POST multipart `file` and application/json `options` |
| `/api/v1/catalogue/imports/{id}`                    | GET saved job and every row outcome                  |
| `/api/v1/catalogue/imports/{id}/commit`             | POST idempotent commit                               |

Backend limits: no parent/variant list filter, current tracking GET/DTO field, import-job discovery/list, saved-source download or editable preview. Family choices/children read every paginated product page, including archived children. Keep import IDs/bookmarks because history cannot be discovered through a list endpoint. The tracking flag is explicitly unknown after a fresh read; the UI never displays a guessed persisted value. Expiry dates are per received batch, not a product-level flag. These limitations are visible or documented; no endpoint is invented.

## Implementation and dependency

New source: `api/catalogue.ts`, `lib/catalogue.ts`, `features/catalogue-queries.ts`, `features/ProductEditor.tsx`, `features/product-tools.tsx`, `features/catalogue-import.tsx`, `test/catalogue.test.tsx`.

Integration extends `api/types.ts`, `app/App.tsx`, `features/catalog.tsx`, `features/tax.tsx`, `features/onboarding.tsx`, `components/ui.tsx`, and styles. The shared form now distinguishes a disabled prerequisite from a pending request, avoiding a permanent loading label when no request is running. Product panels use distinct identity keys so transient commands/results cannot bleed between products. README, this guide and the implementation log record the phase.

Added `read-excel-file` 9.3.17 and its lockfile dependencies for lazy-loaded browser XLSX source previews; its API was checked against [the official repository documentation](https://github.com/catamphetamine/read-excel-file). Parsing runs through its browser worker. The production XLSX chunk is approximately 52.6 KB before gzip / 16.2 KB gzip and is loaded when reading XLSX. Spring still validates original files and owns commit semantics. No workbook writer is shipped in the app. Installation audit reported zero vulnerabilities at implementation time.

## Validation on 2026-11-14

- `npm.cmd test`: **117 tests pass across ten files**, including 26 new catalogue tests for variants, immutable identity, decimal/file/mapping limits, scanner lookup, server conversions, labels, all-branch tracking, tracking command cycles, uncertain product creation, CSV/XLSX requests, explicit/invalid commits, new preview IDs, uncertain-commit reconciliation, saved recovery and branch-independent import access.
- `npm.cmd run build`: TypeScript and production build pass. `npm.cmd run format:check` and `git diff --check` pass.
- Live Chrome used fresh SQLite/demo services on 18083/5183, SMTP disabled and an ephemeral key. Existing backend/frontend services and data were preserved. Owner MFA was completed only in this disposable database.
- Confirmed parent/variant creation, price edit, immutable variant/base-unit fields, CASE_12 × 0.5 returning 6 EACH, rejection of 0.1 CASE_12, tracking disable/re-enable, internal barcode creation, authenticated PNG preview and PDF download.
- Confirmed real CSV custom mapping and commit, text barcode lookup with leading zeros, exact SKU lookup, saved-job reopening, SKIP/REJECT policies, real XLSX upload/browser parsing/multipart commit and leading-zero preview. UPDATE committed successfully; a later concurrent edit produced the expected 409 and rolled back an earlier CREATE row in the same job.
- Desktop 1280px and mobile 390px layouts were inspected. Product/import pages measured 390px scroll width at a 390px viewport; source tables remain contained. Native dialog focus, Tab and Escape were exercised. A duplicate React panel-key warning found during QA was fixed. Expected server conversion/conflict errors were handled explicitly.

Physical barcode scanning, printer calibration and hardware label readability were not tested; keyboard scanner input and server-produced label files were verified. Saved imports are synchronous bounded transactions, not background/chunked jobs. Product edits have no revision endpoint; concurrent product-edit protection exists specifically in the import snapshot contract. No production tax, stock-costing or payment certification is implied.

Next phase: **F4 — branch inventory/costing, suppliers, purchase orders, partial receiving, batches/expiry, transfers and counts**. Stop after F3 for review under the supplied phase instructions.
