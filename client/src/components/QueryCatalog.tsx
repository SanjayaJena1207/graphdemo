import type { CatalogQuery, Customer } from '../api';
import Icon, { type IconName } from './Icon';

interface Props {
  queries: CatalogQuery[];
  customers: Customer[];
  selectedCustomers: Record<string, string>;
  onCustomerChange: (queryId: string, customerId: string) => void;
  onRun: (query: CatalogQuery, explain: boolean) => void;
  activeId: string | null;
  busy: boolean;
}

const ICONS: Record<string, IconName> = {
  S1: 'receipt',
  S2: 'chart',
  S3: 'layers',
  S4: 'star',
  H1: 'sparkles',
  H2: 'link',
  H3: 'shield',
  H4: 'trend',
};

export default function QueryCatalog({ queries, customers, selectedCustomers, onCustomerChange, onRun, activeId, busy }: Props) {
  const groups = [
    { title: 'Simple queries', kind: 'simple', items: queries.filter((q) => q.id.startsWith('S')) },
    { title: 'Advanced queries', kind: 'complex', items: queries.filter((q) => q.id.startsWith('H')) },
  ];

  return (
    <aside className="catalog">
      {queries.length === 0 &&
        [0, 1, 2].map((i) => <div key={i} className="card skeleton-card shimmer" />)}

      {groups.map(
        (group) =>
          group.items.length > 0 && (
            <section key={group.title}>
              <h2 className="section-title">
                {group.title}
                <span className="count">{group.items.length}</span>
              </h2>
              {group.items.map((q) => {
                const active = activeId === q.id;
                return (
                  <article key={q.id} className={`card kind-${group.kind} ${active ? 'active' : ''}`}>
                    <div className="card-head">
                      <span className="card-icon">
                        <Icon name={ICONS[q.id] ?? 'database'} size={18} />
                      </span>
                      <div>
                        <span className="badge">{q.id}</span>
                        <h3>{q.title}</h3>
                      </div>
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
                      <button className="btn btn-ghost" disabled={busy} onClick={() => onRun(q, false)}>
                        <Icon name="play" size={13} /> Run
                      </button>
                      <button className="btn btn-primary" disabled={busy} onClick={() => onRun(q, true)}>
                        <Icon name="sparkles" size={14} /> {active && busy ? 'Running…' : 'Run + Explain'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>
          ),
      )}
    </aside>
  );
}
