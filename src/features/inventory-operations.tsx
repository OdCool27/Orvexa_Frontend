import { useState } from 'react';
import { useAuth } from '../auth/Auth';
import { can } from '../auth/permissions';
import { useWorkspace } from '../app/workspace';
import { query } from '../api/client';
import type { Batch } from '../api/inventory';
import {
  Badge,
  ErrorBox,
  Field,
  Form,
  Heading,
  Input,
  Loading,
  Modal,
  Pager,
  str,
  Table,
  useApiQuery,
} from '../components/ui';
import {
  BranchName,
  InventoryFeedback,
  InventoryLinks,
  ProductName,
  ProductPicker,
  PurchaseUnitPicker,
  useInventoryCommand,
} from '../components/InventoryUI';
import { acquisitionCost, isoDate, wholeQuantity } from '../lib/inventory';
import { unitDecimal } from '../lib/catalogue';

export function ValuedAdjustment({
  productId = '',
  locationId,
  close,
}: {
  productId?: string;
  locationId: number;
  close: () => void;
}) {
  const [product, setProduct] = useState(productId);
  const [unit, setUnit] = useState('');
  const [type, setType] = useState('RECEIPT');
  const command = useInventoryCommand();
  const incoming = type === 'RECEIPT' || type === 'CORRECTION_IN';
  return (
    <Modal
      title="Receive or adjust valued stock"
      close={() => {
        if (!command.pending) close();
      }}
    >
      <p>
        Branch:{' '}
        <strong>
          <BranchName id={locationId} />
        </strong>
        . This management action posts immediately with your approval and reason; there is no
        separate pending-adjustment queue.
      </p>
      <InventoryFeedback command={command} />
      <Form
        pending={command.pending}
        disabled={command.blocked}
        submit="Approve and post stock change"
        onSubmit={(data) =>
          void command.send(
            '/api/v1/inventory/adjustments',
            () => {
              if (!product || !unit)
                throw new Error('Choose a product and purchase-enabled conversion unit.');
              return {
                locationId,
                productId: product,
                unit,
                quantity: unitDecimal(str(data, 'quantity'), true),
                unitCost: incoming ? acquisitionCost(str(data, 'unitCost')) : '0',
                type,
                reason: str(data, 'reason'),
                batchCode: str(data, 'batchCode') || null,
                expiresOn: isoDate(str(data, 'expiresOn')),
              };
            },
            'Stock change posted. Server balances and value have been refreshed.',
            close,
          )
        }
      >
        <ProductPicker
          value={product}
          change={(value) => {
            setProduct(value);
            setUnit('');
          }}
        />
        <PurchaseUnitPicker product={product} value={unit} change={setUnit} />
        <Field label="Stock action">
          <select name="type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="RECEIPT">Receive goods</option>
            <option value="DAMAGE">Remove damaged stock</option>
            <option value="CORRECTION_IN">Correction: add stock</option>
            <option value="CORRECTION_OUT">Correction: remove stock</option>
          </select>
        </Field>
        <Input name="quantity" label="Adjustment quantity in selected unit" />
        {incoming ? (
          <Input name="unitCost" label="Acquisition cost per selected unit" value="0" />
        ) : (
          <p className="form-hint">
            Outgoing value uses the server’s current branch average. Reserved stock cannot be
            consumed.
          </p>
        )}
        <Input
          name="batchCode"
          label="Adjustment batch code (if tracked)"
          required={false}
          maxLength={80}
        />
        <Input name="expiresOn" label="Batch expiry date (optional)" type="date" required={false} />
        <Field label="Approval reason">
          <textarea name="reason" required maxLength={500} rows={3} />
        </Field>
        <Field label="I reviewed and approve this stock adjustment">
          <input type="checkbox" required />
        </Field>
        <p className="form-hint span-2">
          Incoming acquisition costs are separate from sales tax. Tracked incoming stock requires a
          batch; existing batch expiry is immutable. For removals, supply a batch code to target a
          batch and leave expiry blank. Blank batch removals follow the server’s allocation rules.
        </p>
      </Form>
    </Modal>
  );
}
export function BatchesPage() {
  const { user } = useAuth();
  const { locationId } = useWorkspace();
  const [offset, setOffset] = useState(0);
  const [expiring, setExpiring] = useState(false);
  const [days, setDays] = useState('30');
  const batches = useApiQuery<Batch[]>(
    '/api/v1/inventory/batches' + query({ locationId, expiring, days, limit: 25, offset }),
    !!locationId,
    true,
  );
  const [count, setCount] = useState<Batch>();
  const utcToday = new Date().toISOString().slice(0, 10);
  return (
    <>
      <Heading
        eyebrow="BATCH STOCK & SHELF LIFE"
        title="Batches & expiry"
        description="Physical batch balances at the active branch. Expiry dates remain valid through their UTC calendar day."
      >
        <button className="button secondary" onClick={() => void batches.refetch()}>
          Refresh batch balances
        </button>
      </Heading>
      <InventoryLinks />
      <div className="notice info">
        Expired physical stock can remain on hand. The stock screen’s saleable availability excludes
        expired batches; an unreserved batch quantity here is not a promise that it can be sold.
      </div>
      <section className="panel">
        <div className="filters">
          <Field label="Batch expiry filter">
            <select
              value={expiring ? 'expiring' : 'all'}
              onChange={(e) => {
                setExpiring(e.target.value === 'expiring');
                setOffset(0);
              }}
            >
              <option value="all">All positive-stock batches</option>
              <option value="expiring">Past-due and soon-due batches</option>
            </select>
          </Field>
          <Field label="Expiry alert horizon">
            <select
              value={days}
              onChange={(e) => {
                setDays(e.target.value);
                setOffset(0);
              }}
            >
              {[0, 7, 30, 90, 365].map((n) => (
                <option key={n} value={n}>
                  {n} days
                </option>
              ))}
            </select>
          </Field>
        </div>
        <ErrorBox error={batches.error} />
        {batches.isLoading ? (
          <Loading />
        ) : (
          <Table
            rows={batches.data || []}
            empty="No positive-stock batches match this branch and expiry filter."
            columns={[
              {
                title: 'Product / batch',
                render: (b) => (
                  <>
                    <ProductName id={b.product_id} />
                    <p>{b.code}</p>
                  </>
                ),
              },
              {
                title: 'Expiry (UTC date)',
                render: (b) => (
                  <>
                    {b.expires_on || 'No expiry'}
                    {b.expires_on && b.expires_on < utcToday && (
                      <Badge value="PAST_EXPIRY_BY_BROWSER_CLOCK" />
                    )}
                  </>
                ),
              },
              { title: 'Physical on hand', render: (b) => b.quantity_on_hand },
              { title: 'Reserved', render: (b) => b.quantity_reserved },
              { title: 'Unreserved physical', render: (b) => b.available },
              {
                title: 'Count',
                render: (b) =>
                  can(user, 'manage') && (
                    <button className="text-button" onClick={() => setCount(b)}>
                      Review count for {b.code}
                    </button>
                  ),
              },
            ]}
          />
        )}
        <Pager offset={offset} count={batches.data?.length || 0} setOffset={setOffset} />
      </section>
      <p className="form-hint">
        The server clock controls alert filtering and sale restrictions. Browser-clock expiry labels
        are advisory. Zero-stock batches are not included in this list.
      </p>
      {count && <BatchCount batch={count} close={() => setCount(undefined)} />}
    </>
  );
}
function BatchCount({ batch, close }: { batch: Batch; close: () => void }) {
  const command = useInventoryCommand();
  const [counted, setCounted] = useState(String(batch.quantity_on_hand));
  const numeric = /^\d+$/.test(counted) ? +counted : null;
  return (
    <Modal
      title={`Review batch count: ${batch.code}`}
      close={() => {
        if (!command.pending) close();
      }}
    >
      <p>
        <ProductName id={batch.product_id} /> at <BranchName id={batch.location_id} />. Expected
        physical quantity: {batch.quantity_on_hand}; reserved: {batch.quantity_reserved}. Approving
        posts the discrepancy now. If stock changed, close this review, refresh batch balances,
        recount, and reopen it.
      </p>
      <InventoryFeedback command={command} />
      <Form
        pending={command.pending}
        disabled={command.blocked}
        submit="Approve batch discrepancy"
        onSubmit={(data) =>
          void command.send(
            `/api/v1/inventory/batches/${batch.id}/count`,
            () => ({
              expectedQuantity: batch.quantity_on_hand,
              countedQuantity: wholeQuantity(counted, true),
              reason: str(data, 'reason'),
            }),
            'Batch count approved and ledger updated.',
            close,
          )
        }
      >
        <Field label="Counted base units">
          <input
            type="number"
            min={0}
            max={2147483647}
            step={1}
            value={counted}
            required
            onChange={(e) => setCounted(e.target.value)}
          />
        </Field>
        <p>
          Count discrepancy:{' '}
          {numeric == null ? 'Enter a valid count' : numeric - batch.quantity_on_hand} base units.
        </p>
        <Field label="Batch count approval reason">
          <textarea name="reason" required maxLength={500} />
        </Field>
        <Field label="I reviewed this batch count discrepancy">
          <input type="checkbox" required />
        </Field>
      </Form>
    </Modal>
  );
}
