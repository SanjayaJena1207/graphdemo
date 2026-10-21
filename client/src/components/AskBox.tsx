import { useState, type FormEvent } from 'react';

interface Props {
  onAsk: (question: string) => void;
  busy: boolean;
}

const EXAMPLES = [
  'Which customers bought both a phone and headphones?',
  'Which 5 cities have the highest total order value?',
  'Which products have never been reviewed?',
];

export default function AskBox({ onAsk, busy }: Props) {
  const [question, setQuestion] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (question.trim().length >= 3) onAsk(question.trim());
  };

  return (
    <section className="ask">
      <form onSubmit={submit}>
        <label htmlFor="ask-input">Ask a question about the graph</label>
        <div className="ask-row">
          <input
            id="ask-input"
            type="text"
            value={question}
            maxLength={500}
            placeholder={EXAMPLES[0]}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button className="primary" type="submit" disabled={busy || question.trim().length < 3}>
            Ask
          </button>
        </div>
      </form>
      <div className="examples">
        {EXAMPLES.map((ex) => (
          <button key={ex} className="chip" disabled={busy} onClick={() => setQuestion(ex)}>
            {ex}
          </button>
        ))}
      </div>
    </section>
  );
}
