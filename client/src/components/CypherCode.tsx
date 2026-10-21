import { useState, type ReactNode } from 'react';
import Icon from './Icon';

const KEYWORDS = new Set(
  ('MATCH OPTIONAL WHERE WITH RETURN ORDER BY LIMIT SKIP UNWIND AS DISTINCT DESC ASC AND OR NOT XOR IN ' +
    'CASE WHEN THEN ELSE END EXISTS CONTAINS STARTS ENDS IS NULL TRUE FALSE').split(' '),
);

// comment | string | $param | :Label or :REL_TYPE | number | word
const TOKEN = /(\/\/[^\n]*)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|(\$\w+)|(:[A-Z_]\w*)|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_]\w*\b)/g;

/** Tiny Cypher syntax highlighter: wraps tokens in <span class="tok-..."> elements. */
function highlight(cypher: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of cypher.matchAll(TOKEN)) {
    const index = m.index ?? 0;
    if (index > last) out.push(cypher.slice(last, index));
    const text = m[0];
    let cls: string | null = null;
    if (m[1]) cls = 'comment';
    else if (m[2]) cls = 'string';
    else if (m[3]) cls = 'param';
    else if (m[4]) cls = 'label';
    else if (m[5]) cls = 'number';
    else if (KEYWORDS.has(text.toUpperCase())) cls = 'keyword';
    else if (/^\s*\(/.test(cypher.slice(index + text.length))) cls = 'function';
    out.push(cls ? <span key={index} className={`tok-${cls}`}>{text}</span> : text);
    last = index + text.length;
  }
  out.push(cypher.slice(last));
  return out;
}

export default function CypherCode({ cypher, open = false }: { cypher: string; open?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cypher);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the text is still selectable.
    }
  };

  return (
    <details className="cypher" open={open}>
      <summary>
        <Icon name="chevron" className="cypher-chevron" />
        <Icon name="code" />
        <span>Cypher</span>
        <span className="cypher-hint">the exact query that ran</span>
      </summary>
      <div className="cypher-body">
        <button className="copy" onClick={copy} title="Copy Cypher">
          <Icon name={copied ? 'check' : 'copy'} size={14} />
          {copied ? 'Copied' : 'Copy'}
        </button>
        <pre>
          <code>{highlight(cypher)}</code>
        </pre>
      </div>
    </details>
  );
}
