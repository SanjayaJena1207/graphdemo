import { useEffect, useState } from 'react';
import type { ApiError, Explanation, Row } from '../api';
import ResultsTable from './ResultsTable';
import RingGraph from './RingGraph';

export interface ResultView {
  title: string;
  queryId?: string; // catalog queries only
  cypher: string;
  columns: string[];
  rows: Row[];
  durationMs: number;
  explanation?: Explanation;
  attempts?: number; // Ask only: 2 means the LLM had to fix its first query
}

interface Props {
  result: ResultView | null;
  loading: string | null;
  error: ApiError | null;
}

function ExplanationText({ text }: { text: string }) {
  // LLMs answer in light markdown: "* point", "- point", "• point", **bold**.
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const bullet = /^([*•-]|\d+\.)\s+/;
  const renderInline = (line: string) =>
    line.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));

  const intro = lines.filter((l) => !bullet.test(l));
  const points = lines.filter((l) => bullet.test(l));
  return (
    <>
      {intro.map((l, i) => (
        <p key={i}>{renderInline(l)}</p>
      ))}
      {points.length > 0 && (
        <ul>
          {points.map((l, i) => (
            <li key={i}>{renderInline(l.replace(bullet, ''))}</li>
          ))}
        </ul>
      )}
    </>
  );
}

function Elapsed() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="elapsed">{seconds}s</span>;
}

function CypherBox({ cypher, open = false }: { cypher: string; open?: boolean }) {
  return (
    <details className="cypher" open={open}>
      <summary>Cypher</summary>
      <pre>
        <code>{cypher}</code>
      </pre>
    </details>
  );
}

export default function ResultsPanel({ result, loading, error }: Props) {
  const [tab, setTab] = useState<'table' | 'network'>('table');
  useEffect(() => setTab('table'), [result]);

  if (loading) {
    return (
      <section className="results">
        <div className="loading">
          <span className="spinner" aria-hidden />
          <span>{loading}</span>
          <Elapsed />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="results">
        <div className="banner error" role="alert">
          <strong>{error.message}</strong>
          {error.cypherError && <div className="banner-detail">Neo4j said: {error.cypherError}</div>}
        </div>
        {error.cypher && <CypherBox cypher={error.cypher} open />}
      </section>
    );
  }

  if (!result) {
    return (
      <section className="results">
        <div className="empty">
          <h2>No results yet</h2>
          <p>Run a query from the catalog, or ask a question above.</p>
        </div>
      </section>
    );
  }

  const hasNetwork = result.queryId === 'H3';
  const e = result.explanation;

  return (
    <section className="results">
      <div className="results-head">
        <h2>{result.title}</h2>
        <span className="meta">
          {result.rows.length} row{result.rows.length === 1 ? '' : 's'} · query {result.durationMs} ms
          {result.attempts === 2 && ' · fixed after one Cypher error'}
        </span>
      </div>

      {e && (
        <div className="explanation">
          <div className="explanation-meta">
            Explained by <strong>{e.provider}</strong> ({e.model}) in {(e.llmMs / 1000).toFixed(1)} s
          </div>
          <ExplanationText text={e.explanation} />
        </div>
      )}

      {hasNetwork && (
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'table'} onClick={() => setTab('table')}>
            Table
          </button>
          <button role="tab" aria-selected={tab === 'network'} onClick={() => setTab('network')}>
            Network view
          </button>
        </div>
      )}

      {tab === 'network' && hasNetwork ? (
        <RingGraph />
      ) : (
        <ResultsTable columns={result.columns} rows={result.rows} />
      )}

      <CypherBox cypher={result.cypher} />
    </section>
  );
}
