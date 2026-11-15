# Local demonstration checklist

Run Vite and Spring as described in the README. Configure the backend demo password locally. Business IDs come from the database; fixture compatibility is not a manufacturer guarantee.

For the updated identity workflow, first follow the [F1 walkthrough](ORVEXA_F1_IDENTITY.md#demonstration-walkthrough). Owners/platform staff must complete MFA. Invite staff from Team and edit memberships/branch grants instead of setting their passwords or global names. The operational checklist below originated with the earlier demo; new tax/catalogue/purchasing/payment behavior remains F2–F5 work.

## Access and setup

1. Sign in as operator. Review automotive/grocery metadata and note IDs; optionally provision a business and first owner.
2. Sign in as automotive owner/manager. Confirm tenant/location and create a CLERK/CASHIER in Team. No email is sent.
3. Verify clerk/cashier navigation: clerk can count/fulfill; cashier can sell. Neither has reports/admin controls. Sign in as grocery separately and confirm isolated products/stock.
4. Return to the automotive owner. A full page reload intentionally requires employee sign-in again.

## Catalog, stock and counts

1. Create a category in Settings and a product with SKU, barcode, price, cost and threshold. Add verified fitment with an explicit source through product detail.
2. Download the opening CSV template. Preview an unknown SKU to show validation, correct it and preview again, then commit quantities for previously unstocked catalog SKUs. Product registration itself is manual.
3. Alternatively enter manual opening stock. Confirm on-hand/reserved/available at the selected location.
4. Start a stock count, scan/type a SKU/barcode and save its total counted quantity. Leave and resume the draft; submit and approve as owner/manager.
5. To show conflict recovery, change counted stock after submission. Approval must fail; reopen, recount/save affected lines, resubmit and approve. Stock remains sellable throughout.

## POS and public checkout

1. Scan `DEMO1001` or enter `AF-CIVIC-01` at POS. Reserve the server-priced cart and process simulated CASH/CARD success. Download the text receipt.
2. Open the tenant storefront in a second tab. Search Honda / Civic / 2009. Confirm availability reflects the POS sale after refresh/poll.
3. Add a product, reserve and simulate payment. Reload the public order in the same tab to check saved-token access. No employee login is needed.
4. Cancel an eligible completed, unfulfilled online order; confirm restored stock and recorded simulated refund. The receipt remains downloadable.
5. Make another order with a failed simulated payment; verify PAYMENT_FAILED and released stock. Leave a reservation unpaid for five minutes to demonstrate expiry.

## Contention, retries and access

1. Use a dedicated SKU with exactly one available unit at the storefront's location (first active location). Build a POS cart and a public cart; neither preview reserves.
2. Submit both checkouts together. Exactly one may reserve. The loser must show a stock conflict. Refresh both and cancel or complete the winner.
3. Double-click or retry the same supported command without editing inputs. It must retain its request ID and avoid duplicate stock/payment effects. A different action gets a new ID.
4. A lost initial public checkout response is special: its token may never arrive. Avoid blind order creation; wait for expiry or ask staff. An order opened without its tab/origin's capability must show an access explanation.

## Operations and reports

1. Record DAMAGE with a positive quantity, configured reason and notes. Confirm reduced availability and low-stock flags at/below threshold.
2. Review actor/deltas/balances in Movements; view order lifecycle separately and administration in Audit activity.
3. Fulfill a paid order as clerk/manager/owner. Record a full return as owner/manager, explicitly choosing resellable or damaged stock. Only resellable returns restock. Refund-only leaves inventory unchanged.
4. Filter Reports by inclusive UTC date/channel. Review simulated gross/refund/net revenue and gross cost/profit estimates; export stock CSV. Stock follows the header location; sales cover all locations.

All funds are simulated. Login, tenant permissions, structured compatibility, stock transactions and audit are functional. AI, SMTP, live payments, public hosting, subscriptions, offline sync and production deployment remain outside this MVP.
