import { useEffect, useState } from 'react';
import { api, ApiError, type CatalogQuery, type Customer, type Health, type Provider } from './api';
import AskBox from './components/AskBox';
import Header from './components/Header';
import QueryCatalog from './components/QueryCatalog';
import ResultsPanel, { type QuickStart, type ResultView } from './components/ResultsPanel';

const RETRY_ATTEMPTS = 20;
const RETRY_DELAY_MS = 1500; // about 30 s in total

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [provider, setProvider] = useState<Provider>('ollama');
  const [queries, setQueries] = useState<CatalogQuery[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ResultView | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [activeQueryId, setActiveQueryId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    // With "npm run dev" the client can be up before the API is listening,
    // so keep retrying for a while instead of failing on the first try.
    const load = async (attempt: number) => {
      try {
        const h = await api.health();
        if (cancelled) return;
        setHealth(h);
        setProvider(h.llm.active); // start on the provider from server/.env
        setError(null);
        api.queries().then(setQueries, setError);
        api.customers().then(setCustomers, () => {}); // the dropdown falls back to C001
      } catch {
        if (cancelled) return;
        if (attempt < RETRY_ATTEMPTS) {
          timer = setTimeout(() => load(attempt + 1), RETRY_DELAY_MS);
        } else {
          setError(new ApiError('Cannot reach the API server. Is "npm run dev" running?'));
        }
      }
    };
    load(1);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const modelName = health?.llm.providers.find((p) => p.provider === provider)?.model ?? provider;

  /** Show a loading state, run the request, then show its result or error. */
  async function track(label: string, work: () => Promise<ResultView>) {
    setLoading(label);
    setError(null);
    try {
      setResult(await work());
    } catch (err) {
      setResult(null);
      setError(err instanceof ApiError ? err : new ApiError(String(err)));
    } finally {
      setLoading(null);
    }
  }

  const runQuery = (q: CatalogQuery, explain: boolean) => {
    const params: Record<string, string> = {};
    for (const p of q.params) params[p.name] = selectedCustomers[q.id] ?? 'C001';
    const base = { title: q.title, queryId: q.id, cypher: q.cypher };
    setActiveQueryId(q.id);

    if (!explain) {
      return track(`Running ${q.id}…`, async () => ({ ...base, ...(await api.run(q.id, params)) }));
    }
    return track(`Running ${q.id} and asking ${modelName} to explain…`, async () => {
      const { columns, rows, durationMs, ...explanation } = await api.explain(q.id, params, provider);
      return { ...base, columns, rows, durationMs, explanation };
    });
  };

  const ask = (question: string) => {
    setActiveQueryId(null);
    return track(`${modelName} is writing Cypher for your question…`, async () => {
      const r = await api.ask(question, provider);
      return {
        title: question,
        cypher: r.cypher,
        columns: r.columns,
        rows: r.rows,
        durationMs: r.durationMs,
        attempts: r.attempts,
        explanation: { explanation: r.explanation, provider: r.provider, model: r.model, llmMs: r.llmMs },
      };
    });
  };

  const byId = (id: string) => queries.find((q) => q.id === id);
  const quickStarts: QuickStart[] = [
    { label: 'Detect fraud rings', icon: 'shield', onClick: () => byId('H3') && runQuery(byId('H3')!, false) },
    { label: 'Best sellers + AI summary', icon: 'chart', onClick: () => byId('S2') && runQuery(byId('S2')!, true) },
    { label: 'Ask: phone + headphones', icon: 'sparkles', onClick: () => ask('Which customers bought both a phone and headphones?') },
  ];

  return (
    <div className="app">
      <Header health={health} provider={provider} onProviderChange={setProvider} />
      <main className="layout">
        <QueryCatalog
          queries={queries}
          customers={customers}
          selectedCustomers={selectedCustomers}
          onCustomerChange={(id, c) => setSelectedCustomers((s) => ({ ...s, [id]: c }))}
          onRun={runQuery}
          activeId={activeQueryId}
          busy={loading !== null}
        />
        <div className="workspace">
          <AskBox onAsk={ask} busy={loading !== null} modelName={modelName} />
          <ResultsPanel result={result} loading={loading} error={error} quickStarts={quickStarts} />
        </div>
      </main>
    </div>
  );
}
