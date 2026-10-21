import { useEffect, useState } from 'react';
import type { ApiError, Explanation, Row } from '../api';
import CypherCode from './CypherCode';
import Icon from './Icon';
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

export interface QuickStart {
  label: string;
  icon: 'shield' | 'chart' | 'sparkles';
  onClick: () => void;
}

interface Props {
  result: ResultView | null;
  loading: string | null;
  error: ApiError | null;
  quickStarts: QuickStart[];
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
        <p key={i} className="explanation-intro">
          {renderInline(l)}
        </p>
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

function Loading({ label }: { label: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="loading">
      <div className="loading-head">
        <span className="spinner" aria-hidden />
        <span>{label}</span>
        <span className="elapsed">{seconds}s</span>
      </div>
      {seconds >= 10 && (
        <p className="loading-hint">Still working. The first Ollama call loads the model and can take a minute.</p>
      )}
      <div className="skeleton shimmer" style={{ height: 96 }} />
      <div className="skeleton shimmer" style={{ height: 36 }} />
      <div className="skeleton shimmer" style={{ height: 180 }} />
    </div>
  );
}

function EmptyState({ quickStarts }: { quickStarts: QuickStart[] }) {
  return (
    <div className="empty">
      <svg className="empty-art" viewBox="0 0 220 120" aria-hidden>
        <defs>
          <linearGradient id="empty-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4f46e5" />
            <stop offset="1" stopColor="#db2777" />
          </linearGradient>
        </defs>
        <g stroke="var(--border-strong)" strokeWidth="2">
          <line x1="40" y1="60" x2="100" y2="28" />
          <line x1="40" y1="60" x2="100" y2="94" />
          <line x1="100" y1="28" x2="170" y2="44" />
          <line x1="100" y1="94" x2="170" y2="44" />
          <line x1="100" y1="94" x2="180" y2="100" />
          <line x1="100" y1="28" x2="100" y2="94" strokeDasharray="4 4" />
        </g>
        <circle cx="40" cy="60" r="12" fill="url(#empty-g)" />
        <circle cx="100" cy="28" r="9" fill="var(--ring)" />
        <circle cx="100" cy="94" r="9" fill="var(--ring)" />
        <circle cx="170" cy="44" r="14" fill="url(#empty-g)" />
        <circle cx="180" cy="100" r="7" fill="var(--border-strong)" />
      </svg>
      <h2>Explore your graph</h2>
      <p>Run a query from the catalog, ask a question above, or start with one of these:</p>
      <div className="quick-starts">
        {quickStarts.map((q) => (
          <button key={q.label} className="btn btn-ghost" onClick={q.onClick}>
            <Icon name={q.icon} size={15} /> {q.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ResultsPanel({ result, loading, error, quickStarts }: Props) {
  const [tab, setTab] = useState<'table' | 'network'>('table');
  useEffect(() => setTab('table'), [result]);

  if (loading) {
    return (
      <section className="results">
        <Loading label={loading} />
      </section>
    );
  }

  if (error) {
    return (
      <section className="results">
        <div className="banner error" role="alert">
          <Icon name="alert" size={20} />
          <div>
            <strong>{error.message}</strong>
            {error.cypherError && <div className="banner-detail">Neo4j said: {error.cypherError}</div>}
          </div>
        </div>
        {error.cypher && <CypherCode cypher={error.cypher} open />}
      </section>
    );
  }

  if (!result) {
    return (
      <section className="results">
        <EmptyState quickStarts={quickStarts} />
      </section>
    );
  }

  const hasNetwork = result.queryId === 'H3';
  const e = result.explanation;

  return (
    <section className="results">
      <div className="results-head">
        <div>
          <span className="eyebrow">{result.queryId ? `Catalog query ${result.queryId}` : 'Your question'}</span>
          <h2>{result.title}</h2>
        </div>
        <div className="stats">
          <span className="stat">
            <Icon name="rows" size={13} /> {result.rows.length} row{result.rows.length === 1 ? '' : 's'}
          </span>
          <span className="stat">
            <Icon name="database" size={13} /> {result.durationMs} ms
          </span>
          {e && (
            <span className="stat">
              <Icon name="clock" size={13} /> LLM {(e.llmMs / 1000).toFixed(1)} s
            </span>
          )}
          {result.attempts === 2 && <span className="stat stat-warn">fixed after 1 Cypher error</span>}
        </div>
      </div>

      {e && (
        <div className="explanation">
          <div className="explanation-head">
            <span className="explanation-title">
              <Icon name="sparkles" size={16} /> AI summary
            </span>
            <span className="model-badge">
              <Icon name={e.provider === 'gemini' ? 'cloud' : 'laptop'} size={12} /> {e.model}
            </span>
          </div>
          <ExplanationText text={e.explanation} />
        </div>
      )}

      {hasNetwork && (
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'table'} onClick={() => setTab('table')}>
            <Icon name="table" size={14} /> Table
          </button>
          <button role="tab" aria-selected={tab === 'network'} onClick={() => setTab('network')}>
            <Icon name="network" size={14} /> Network view
          </button>
        </div>
      )}

      {tab === 'network' && hasNetwork ? (
        <RingGraph />
      ) : (
        <ResultsTable columns={result.columns} rows={result.rows} />
      )}

      <CypherCode cypher={result.cypher} />
    </section>
  );
}
