import { useState, type FormEvent } from 'react';
import Icon from './Icon';

interface Props {
  onAsk: (question: string) => void;
  busy: boolean;
  modelName: string;
}

const EXAMPLES = [
  'Which customers bought both a phone and headphones?',
  'Which 5 cities have the highest total order value?',
  'List out orders from customer Pooja',
];

export default function AskBox({ onAsk, busy, modelName }: Props) {
  const [question, setQuestion] = useState('');
  const ready = question.trim().length >= 3;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready) onAsk(question.trim());
  };

  return (
    <section className="ask">
      <div className="ask-head">
        <h2>
          <Icon name="sparkles" size={18} /> Ask the graph
        </h2>
        <p>
          Your question becomes Cypher, is checked to be read-only, runs on Neo4j, then gets explained by{' '}
          <strong>{modelName}</strong>.
        </p>
      </div>

      <form onSubmit={submit} className="ask-row">
        <div className="input-wrap">
          <Icon name="sparkles" size={16} className="input-icon" />
          <input
            id="ask-input"
            type="text"
            aria-label="Ask a question about the graph"
            value={question}
            maxLength={500}
            placeholder={EXAMPLES[0]}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </div>
        <button className="btn btn-primary btn-lg" type="submit" disabled={busy || !ready}>
          Ask <Icon name="arrow" size={15} />
        </button>
      </form>

      <div className="examples">
        <span className="examples-label">Try:</span>
        {EXAMPLES.map((ex) => (
          <button key={ex} className="chip" disabled={busy} onClick={() => setQuestion(ex)}>
            {ex}
          </button>
        ))}
      </div>
    </section>
  );
}
