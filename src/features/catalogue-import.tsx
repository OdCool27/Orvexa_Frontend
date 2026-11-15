import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/Auth';
import { ApiError, CommandIds, saveDownload } from '../api/client';
import { catalogueFields, requiredFields, type CatalogueImport } from '../api/catalogue';
import { readCatalogueFile, validateMapping } from '../lib/catalogue';
import {
  Badge,
  ErrorBox,
  Feedback,
  Field,
  Form,
  Heading,
  Input,
  Loading,
  str,
  Table,
  useAction,
  useApiQuery,
} from '../components/ui';
import { date } from '../lib/format';

type Source = Awaited<ReturnType<typeof readCatalogueFile>>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function CatalogueImportPage() {
  const { api } = useAuth();
  const [params, setParams] = useSearchParams();
  const id = params.get('job') || '';
  const validId = uuid.test(id);
  const job = useApiQuery<CatalogueImport>(`/api/v1/catalogue/imports/${id}`, validId);
  const [source, setSource] = useState<Source>();
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [policy, setPolicy] = useState('REJECT');
  const [reconcile, setReconcile] = useState(false);
  const [confirmed, setConfirmed] = useState('');
  const load = useAction();
  const action = useAction();
  const ids = useRef(new CommandIds());
  const previewIds = useRef(new CommandIds());
  const busy = load.pending || action.pending;
  function resetPreview() {
    setParams({}, { replace: true });
    setConfirmed('');
    setReconcile(false);
    action.clear();
  }
  const saved = validId ? job.data : undefined;
  const counts = saved?.rows.reduce(
    (result, row) => ({ ...result, [row.disposition]: (result[row.disposition] || 0) + 1 }),
    {} as Record<string, number>,
  );
  return (
    <>
      <Heading
        eyebrow="GUIDED CATALOGUE IMPORT"
        title="Bring your products into Orvexa"
        description="Upload, map, validate, then explicitly commit. This registers products; it does not receive stock."
      >
        <Link className="button secondary" to="/app/products">
          Back to products
        </Link>
      </Heading>
      <ol className="import-stages" aria-label="Import stages">
        <li>1. Choose a file</li>
        <li>2. Map columns</li>
        <li>3. Review server validation</li>
        <li>4. Commit products</li>
      </ol>
      <section className="panel padded">
        <h2>1. Start with a template or your own file</h2>
        <p>
          CSV or a single-sheet XLSX, up to 1 MB, 1000 data rows and 20 columns. XLSX formulas,
          macros and external links are rejected by the server. Format SKUs and barcodes as text to
          preserve leading zeros.
        </p>
        <div className="actions">
          {['csv', 'xlsx'].map((format) => (
            <button
              key={format}
              className="button secondary"
              disabled={busy}
              onClick={() =>
                void action.run(
                  async () =>
                    saveDownload(
                      await api<Blob>(
                        `/api/v1/catalogue/imports/template?format=${format}`,
                        'GET',
                        undefined,
                        true,
                      ),
                      `catalogue-template.${format}`,
                    ),
                  'Template downloaded.',
                )
              }
            >
              Download {format.toUpperCase()} template
            </button>
          ))}
        </div>
        <Feedback action={load} />
        <Feedback action={action} />
        {busy && <progress aria-label="Import operation in progress" />}
        <Field label="Catalogue file">
          <input
            type="file"
            accept=".csv,.xlsx"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              resetPreview();
              setSource(undefined);
              setMapping({});
              void load.run(
                async () => setSource(await readCatalogueFile(file)),
                'File read. Check the mapping and local preview.',
              );
            }}
          />
        </Field>
        {source && (
          <p>
            {source.file.name} · {source.rows.length - 1} data rows · {source.format.toUpperCase()}
          </p>
        )}
      </section>
      {source && (
        <section className="panel padded">
          <h2>2. Map your columns</h2>
          <p>
            Required fields are marked *. Matching headers are used automatically. Rename or remove
            a matching optional column in your file to omit it. Parent IDs and category IDs must
            already exist in this business; import parents first, then variants using their IDs.
          </p>
          <Form
            pending={busy}
            submit="Validate and save preview"
            onSubmit={() =>
              void action.run(async () => {
                validateMapping(source.rows[0], mapping);
                const options = {
                  mapping,
                  duplicatePolicy: policy,
                  requestId: previewIds.current.for({ digest: source.digest, mapping, policy }),
                };
                let preview: CatalogueImport;
                if (source.format === 'csv')
                  preview = await api<CatalogueImport>('/api/v1/catalogue/imports/csv', 'POST', {
                    csv: source.csv,
                    options,
                  });
                else {
                  const body = new FormData();
                  body.set('file', source.file);
                  body.set(
                    'options',
                    new Blob([JSON.stringify(options)], { type: 'application/json' }),
                  );
                  preview = await api<CatalogueImport>(
                    '/api/v1/catalogue/imports/xlsx',
                    'POST',
                    body,
                  );
                }
                previewIds.current.clear();
                setParams({ job: preview.id }, { replace: true });
                setConfirmed('');
                setReconcile(false);
              }, 'Server preview saved. Inspect every row before committing.')
            }
          >
            {catalogueFields.map((field) => (
              <Field key={field} label={`${field}${requiredFields.includes(field) ? ' *' : ''}`}>
                <select
                  value={mapping[field] || ''}
                  onChange={(e) => {
                    const next = { ...mapping };
                    if (e.target.value) next[field] = e.target.value;
                    else delete next[field];
                    setMapping(next);
                    resetPreview();
                  }}
                >
                  <option value="">
                    {source.rows[0].includes(field)
                      ? `Use matching header: ${field}`
                      : 'Use default / not provided'}
                  </option>
                  {source.rows[0].map((header) => (
                    <option key={header}>{header}</option>
                  ))}
                </select>
              </Field>
            ))}
            <Field label="Duplicate SKU policy">
              <select
                value={policy}
                onChange={(e) => {
                  setPolicy(e.target.value);
                  resetPreview();
                }}
              >
                <option value="REJECT">Reject duplicates</option>
                <option value="SKIP">Skip duplicate SKUs</option>
                <option value="UPDATE">Update existing SKUs</option>
              </select>
            </Field>
            <p className="form-hint span-2">
              {policy === 'UPDATE'
                ? 'Updates replace editable fields for existing SKUs. Blank optional cells can clear existing values. Product type, base unit, parent and variant key cannot be changed; concurrent edits invalidate the preview.'
                : policy === 'SKIP'
                  ? 'Existing SKUs and repeated SKUs are skipped. Other invalid fields or ambiguous codes still prevent commit.'
                  : 'Existing or repeated SKUs are errors. Nothing is changed until a valid preview is committed.'}{' '}
              Tax assignment and batch tracking are configured separately on product pages.
            </p>
          </Form>
          <details>
            <summary>
              Local file preview ({Math.min(20, source.rows.length - 1)} of {source.rows.length - 1}{' '}
              rows)
            </summary>
            <p className="form-hint">
              This shows source cells, not authoritative validation. XLSX display formatting can
              differ from the server’s workbook reader.
            </p>
            <Table
              rows={source.rows.slice(1, 21).map((cells, index) => ({ cells, number: index + 2 }))}
              columns={[
                { title: 'Source row', render: (row) => row.number },
                ...source.rows[0].map((header, index) => ({
                  title: header,
                  render: (row: { cells: string[] }) => row.cells[index] || '—',
                })),
              ]}
            />
          </details>
        </section>
      )}
      <section className="panel padded">
        <h2>Resume a saved import</h2>
        <p>
          Keep the saved preview ID or bookmark its URL. Access stays restricted to this business. A
          resumed job exposes row outcomes; its source file is not returned by the backend.
        </p>
        <Form
          key={id}
          pending={busy}
          submit="Load saved import"
          onSubmit={(data) => {
            const value = str(data, 'id');
            if (!uuid.test(value)) {
              void action.run(async () => {
                throw new Error('Enter a valid import UUID.');
              });
              return;
            }
            setSource(undefined);
            setParams({ job: value }, { replace: true });
            setConfirmed('');
            setReconcile(false);
          }}
        >
          <Input name="id" label="Saved import ID" value={id} />
        </Form>
      </section>
      {id && !validId && (
        <div className="notice danger" role="alert">
          This saved import URL contains an invalid ID.
        </div>
      )}
      {validId && (
        <section className="panel padded">
          <h2>3. Server validation and saved status</h2>
          <p>
            Import ID: <code>{id}</code>
          </p>
          <ErrorBox error={job.error} />
          <button
            className="button secondary small"
            disabled={busy}
            onClick={() =>
              void action.run(async () => {
                const result = await job.refetch();
                if (result.error) throw result.error;
                setReconcile(false);
              }, 'Saved import status reloaded.')
            }
          >
            Reload saved status
          </button>
          {job.isLoading ? (
            <Loading />
          ) : (
            saved && (
              <>
                <p>
                  <Badge value={saved.status} /> · Duplicate policy: {saved.duplicate_policy} ·
                  Created {date(new Date(saved.created_ms).toISOString())}
                  {saved.committed_ms
                    ? ` · Committed ${date(new Date(saved.committed_ms).toISOString())}`
                    : ''}
                </p>
                <p>
                  {counts?.CREATE || 0} create · {counts?.UPDATE || 0} update · {counts?.SKIP || 0}{' '}
                  skip · {counts?.ERROR || 0} error
                </p>
                <Table
                  rows={saved.rows}
                  columns={[
                    { title: 'File record / row', render: (r) => r.row_number },
                    { title: 'Outcome', render: (r) => <Badge value={r.disposition} /> },
                    { title: 'Validation error', render: (r) => r.error || 'None reported' },
                  ]}
                />
                <button
                  className="button secondary small"
                  disabled={busy}
                  onClick={() => {
                    const quote = (value: string) => '"' + value.replace(/"/g, '""') + '"';
                    const csv =
                      'row,disposition,error\r\n' +
                      saved.rows
                        .map((r) =>
                          [String(r.row_number), r.disposition, r.error || ''].map(quote).join(','),
                        )
                        .join('\r\n');
                    saveDownload(
                      new Blob([csv], { type: 'text/csv' }),
                      `catalogue-results-${id}.csv`,
                    );
                  }}
                >
                  Download row results
                </button>
                {saved.status === 'COMMITTED' ? (
                  <div className="notice success" role="status">
                    The server confirms this import is committed. Skipped rows were left unchanged.{' '}
                    <Link className="text-link" to="/app/products">
                      View products
                    </Link>
                  </div>
                ) : (
                  <>
                    <h2>4. Commit the saved preview</h2>
                    <p>
                      Commit is atomic. Any invalid row or conflicting product prevents all changes.
                      Review the server results; rows marked SKIP will remain unchanged.
                    </p>
                    {saved.rows.some((r) => r.error || r.disposition === 'ERROR') && (
                      <div className="notice danger">
                        Correct the source file and create a new preview. This preview cannot be
                        committed.
                      </div>
                    )}
                    {reconcile && (
                      <div className="notice danger" role="alert">
                        The commit outcome is uncertain. Reload saved status before retrying. No
                        automatic retry was made.
                      </div>
                    )}
                    <Field label="I reviewed this saved preview and its duplicate policy">
                      <input
                        type="checkbox"
                        checked={confirmed === id}
                        disabled={busy}
                        onChange={(e) => setConfirmed(e.target.checked ? id : '')}
                      />
                    </Field>
                    <button
                      className="button primary"
                      disabled={
                        busy ||
                        !!job.error ||
                        reconcile ||
                        confirmed !== id ||
                        !saved.rows.length ||
                        saved.rows.some((r) => r.error || r.disposition === 'ERROR')
                      }
                      onClick={() =>
                        void action.run(async () => {
                          try {
                            await api(`/api/v1/catalogue/imports/${id}/commit`, 'POST', {
                              requestId: ids.current.for({ commit: id }),
                            });
                          } catch (error) {
                            if (
                              error instanceof ApiError &&
                              ((error.status === 0 && error.code !== 'OFFLINE') ||
                                error.status >= 500)
                            )
                              setReconcile(true);
                            throw error;
                          }
                        }, 'Commit response received. Check the saved server status.')
                      }
                    >
                      Commit saved preview
                    </button>
                  </>
                )}
              </>
            )
          )}
        </section>
      )}
    </>
  );
}
