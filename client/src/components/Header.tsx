import type { Health, Provider } from '../api';
import Icon, { Logo } from './Icon';

interface Props {
  health: Health | null;
  provider: Provider;
  onProviderChange: (p: Provider) => void;
}

const PROVIDERS: { id: Provider; label: string; icon: 'laptop' | 'cloud' }[] = [
  { id: 'ollama', label: 'Ollama', icon: 'laptop' },
  { id: 'gemini', label: 'Gemini', icon: 'cloud' },
];

export default function Header({ health, provider, onProviderChange }: Props) {
  const neo = health?.neo4j;
  const neoState = neo ? (neo.connected ? 'ok' : 'bad') : 'pending';

  return (
    <header className="header">
      <div className="header-inner">
        <div className="brand">
          <Logo />
          <div>
            <h1>Graph Insights</h1>
            <p className="tagline">Neo4j graph queries, explained by AI</p>
          </div>
          <span className={`pill status-${neoState}`} title={neo?.message ?? ''}>
            <Icon name="database" size={13} />
            <span className="dot" />
            {neo ? (neo.connected ? 'Neo4j connected' : 'Neo4j offline') : 'Connecting…'}
          </span>
        </div>

        <div className="toggle" role="radiogroup" aria-label="LLM provider">
          {PROVIDERS.map(({ id, label, icon }) => {
            const status = health?.llm.providers.find((s) => s.provider === id);
            const state = status ? (status.reachable ? 'ok' : 'bad') : 'pending';
            return (
              <button
                key={id}
                role="radio"
                aria-checked={provider === id}
                className={provider === id ? 'active' : ''}
                onClick={() => onProviderChange(id)}
                title={status?.message ?? (status?.reachable ? 'Reachable' : '')}
              >
                <Icon name={icon} size={15} />
                <span className="toggle-text">
                  <span className="toggle-name">
                    {label} <span className={`dot status-${state}`} />
                  </span>
                  <span className="toggle-model">{status?.model ?? '…'}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
