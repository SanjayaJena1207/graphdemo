// Checks LLM-written Cypher before it runs. This is the first line of defence;
// the READ session in neo4j.ts is the second.

export const MAX_LIMIT = 50;

// All CALL is rejected (that also covers CALL dbms.*, CALL db.* and CALL { } subqueries):
// telling a safe subquery apart from a write would need a real Cypher parser.
const FORBIDDEN: [label: string, pattern: RegExp][] = [
  ['CREATE', /\bCREATE\b/i],
  ['MERGE', /\bMERGE\b/i],
  ['DELETE', /\bDELETE\b/i],
  ['DETACH', /\bDETACH\b/i],
  ['SET', /\bSET\b/i],
  ['REMOVE', /\bREMOVE\b/i],
  ['DROP', /\bDROP\b/i],
  ['FOREACH', /\bFOREACH\b/i],
  ['LOAD CSV', /\bLOAD\s+CSV\b/i],
  ['CALL', /\bCALL\b/i],
  ['apoc.', /\bapoc\./i],
];

// Where a query can start, used to skip any chatter before the Cypher.
const FIRST_CLAUSE = /^\s*(OPTIONAL\s+MATCH|MATCH|WITH|UNWIND|RETURN)\b/im;

/** Pull the Cypher out of an LLM reply: drop ``` fences and any text before the first clause. */
export function stripFences(text: string): string {
  const fenced = text.match(/```[a-zA-Z]*\s*\n?([\s\S]*?)```/);
  let cypher = fenced ? fenced[1] : text;
  const start = cypher.search(FIRST_CLAUSE);
  if (start > 0) cypher = cypher.slice(start);
  return cypher.trim().replace(/;+\s*$/, '').trim();
}

/** Make sure the query ends with LIMIT n where n <= MAX_LIMIT. */
export function ensureLimit(cypher: string): string {
  const match = cypher.match(/\bLIMIT\s+(\d+)\s*$/i);
  if (!match) return `${cypher}\nLIMIT ${MAX_LIMIT}`;
  if (Number(match[1]) <= MAX_LIMIT) return cypher;
  return cypher.slice(0, match.index) + `LIMIT ${MAX_LIMIT}`;
}

export type GuardResult = { ok: true; cypher: string } | { ok: false; cypher: string; error: string };

export function guardCypher(raw: string): GuardResult {
  const cypher = stripFences(raw);
  if (!cypher) return { ok: false, cypher, error: 'The model did not return any Cypher.' };

  for (const [label, pattern] of FORBIDDEN) {
    if (pattern.test(cypher)) {
      return { ok: false, cypher, error: `Rejected: the query uses ${label}, which is not allowed (read-only queries only).` };
    }
  }
  if (cypher.includes(';')) {
    return { ok: false, cypher, error: 'Rejected: only a single statement is allowed.' };
  }
  return { ok: true, cypher: ensureLimit(cypher) };
}
