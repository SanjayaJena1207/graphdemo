import type { CatalogQuery, Customer } from '../api';

interface Props {
  queries: CatalogQuery[];
  customers: Customer[];
  selectedCustomers: Record<string, string>;
  onCustomerChange: (queryId: string, customerId: string) => void;
  onRun: (query: CatalogQuery, explain: boolean) => void;
  busy: boolean;
}

export default function QueryCatalog({ queries, customers, selectedCustomers, onCustomerChange, onRun, busy }: Props) {
  const groups = [
    { title: 'Simple queries', items: queries.filter((q) => q.id.startsWith('S')) },
    { title: 'Complex queries', items: queries.filter((q) => q.id.startsWith('H')) },
  ];

  return (
    <aside className="catalog">
      {groups.map((group) => (
        <section key={group.title}>
          <h2>{group.title}</h2>
          {group.items.map((q) => (
            <article key={q.id} className="card">
              <div className="card-head">
                <span className="badge">{q.id}</span>
                <h3>{q.title}</h3>
              </div>
              <p>{q.description}</p>

              {q.params.some((p) => p.name === 'customerId') && (
                <label className="field">
                  <span>Customer</span>
                  <select
                    value={selectedCustomers[q.id] ?? 'C001'}
                    onChange={(e) => onCustomerChange(q.id, e.target.value)}
                  >
                    {customers.length === 0 && <option value="C001">C001</option>}
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.id} · {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="card-actions">
                <button className="secondary" disabled={busy} onClick={() => onRun(q, false)}>
                  Run
                </button>
                <button className="primary" disabled={busy} onClick={() => onRun(q, true)}>
                  Run + Explain
                </button>
              </div>
            </article>
          ))}
        </section>
      ))}
    </aside>
  );
}
