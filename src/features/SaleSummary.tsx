import type { SaleQuote } from '../api/checkout';
import { saleMoney } from '../lib/checkout';
import { Table } from '../components/ui';
export function SaleSummary({
  quote,
  discount,
}: {
  quote: SaleQuote | Omit<SaleQuote, 'sufficientStock'>;
  discount?: number;
}) {
  return (
    <>
      <Table
        rows={quote.lines}
        columns={[
          {
            title: 'Product / units',
            render: (l) => (
              <>
                <strong>{l.item_name}</strong>
                <p>
                  {l.sku} · {l.quantity} base units
                  {l.unit_code ? ` · ${l.unit_quantity} ${l.unit_code} × ${l.unit_factor}` : ''}
                </p>
              </>
            ),
          },
          {
            title: 'Tax classification',
            render: (l) => (
              <>
                {l.tax_classification} · {l.tax_rate_percent}%
                <p>
                  {l.tax_illustrative ? 'Illustrative profile' : ''}
                  {l.tax_verified ? ' · Owner reviewed' : ' · Unverified'}
                </p>
              </>
            ),
          },
          {
            title: 'Discount rule',
            render: (l) => (
              <>
                {l.discount_percent}%<p>{l.discount_reason || 'No discount'}</p>
              </>
            ),
          },
          {
            title: 'Net / tax / total (server)',
            render: (l) => (
              <>
                {saleMoney(l.net_cents, quote.currency)} / {saleMoney(l.tax_cents, quote.currency)}{' '}
                / <strong>{saleMoney(l.total_cents, quote.currency)}</strong>
              </>
            ),
          },
        ]}
      />
      <dl className="sale-totals">
        <div>
          <dt>Net</dt>
          <dd>{saleMoney(quote.net_cents, quote.currency)}</dd>
        </div>
        <div>
          <dt>Sales tax</dt>
          <dd>{saleMoney(quote.tax_cents, quote.currency)}</dd>
        </div>
        {discount != null && (
          <div>
            <dt>Recorded discount</dt>
            <dd>{saleMoney(discount, quote.currency)}</dd>
          </div>
        )}
        <div>
          <dt>Total</dt>
          <dd>{saleMoney(quote.total_cents, quote.currency)}</dd>
        </div>
      </dl>
      <p className="form-hint">
        {quote.price_mode} prices · {quote.seller_registration_status} seller ·{' '}
        {quote.seller_tax_verified ? 'Owner-reviewed policy' : 'Policy not Owner reviewed'}. The
        server calculates and snapshots all amounts.
      </p>
    </>
  );
}
