import { useEffect, useState } from 'react';
import { api, ApiError, type CatalogQuery, type Customer, type Health, type Provider } from './api';
import AskBox from './components/AskBox';
import Header from './components/Header';
import QueryCatalog from './components/QueryCatalog';
import ResultsPanel, { type ResultView } from './components/ResultsPanel';

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [provider, setProvider] = useState<Provider>('ollama');
  const [queries, setQueries] = useState<CatalogQuery[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ResultView | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    api.health().then(
      (h) => {
        setHealth(h);
        setProvider(h.llm.active); // start on the provider from server/.env
      },
      () => setError(new ApiError('Cannot reach the API server. Is "npm run dev" running?')),
    );
    api.queries().then(setQueries, setError);
    api.customers().then(setCustomers, () => {}); // the dropdown falls back to C001
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
    const base = { title: `${q.id} · ${q.title}`, queryId: q.id, cypher: q.cypher };

    if (!explain) {
      return track(`Running ${q.id}…`, async () => ({ ...base, ...(await api.run(q.id, params)) }));
    }
    return track(`Running ${q.id} and asking ${modelName} to explain…`, async () => {
      const { columns, rows, durationMs, ...explanation } = await api.explain(q.id, params, provider);
      return { ...base, columns, rows, durationMs, explanation };
    });
  };

  const ask = (question: string) =>
    track(`${modelName} is writing Cypher for your question…`, async () => {
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
          busy={loading !== null}
        />
        <div className="workspace">
          <AskBox onAsk={ask} busy={loading !== null} />
          <ResultsPanel result={result} loading={loading} error={error} />
        </div>
      </main>
    </div>
  );
}
