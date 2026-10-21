import type { Health, Provider } from '../api';

interface Props {
  health: Health | null;
  provider: Provider;
  onProviderChange: (p: Provider) => void;
}

const LABELS: Record<Provider, string> = { ollama: 'Ollama', gemini: 'Gemini' };

export default function Header({ health, provider, onProviderChange }: Props) {
  const neo = health?.neo4j;

  return (
    <header className="header">
      <div className="brand">
        <h1>Graph Insights</h1>
        <span
          className={`status ${neo ? (neo.connected ? 'ok' : 'bad') : 'pending'}`}
          title={neo?.message ?? ''}
        >
          <span className="dot" /> Neo4j {neo ? (neo.connected ? 'connected' : 'offline') : 'checking…'}
        </span>
      </div>

      <div className="toggle" role="radiogroup" aria-label="LLM provider">
        {(['ollama', 'gemini'] as Provider[]).map((p) => {
          const status = health?.llm.providers.find((s) => s.provider === p);
          return (
            <button
              key={p}
              role="radio"
              aria-checked={provider === p}
              className={provider === p ? 'active' : ''}
              onClick={() => onProviderChange(p)}
              title={status?.message ?? (status?.reachable ? 'Reachable' : '')}
            >
              <span className={`dot ${status ? (status.reachable ? 'ok' : 'bad') : 'pending'}`} />
              <span className="toggle-name">{LABELS[p]}</span>
              <span className="toggle-model">{status?.model ?? '…'}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
}
