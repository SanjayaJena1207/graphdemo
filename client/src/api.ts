// Types and fetch helpers for the Express API. The browser only talks to /api.

export type Provider = 'ollama' | 'gemini';

export interface ProviderStatus {
  provider: Provider;
  model: string;
  reachable: boolean;
  message?: string;
}

export interface Health {
  neo4j: { connected: boolean; message?: string };
  llm: { active: Provider; providers: ProviderStatus[] };
}

export interface CatalogQuery {
  id: string;
  title: string;
  description: string;
  params: { name: 'customerId'; label: string; example: string }[];
  cypher: string;
}

export interface Customer {
  id: string;
  name: string;
}

export type Row = Record<string, unknown>;

export interface QueryResult {
  columns: string[];
  rows: Row[];
  durationMs: number;
}

export interface Explanation {
  explanation: string;
  provider: Provider;
  model: string;
  llmMs: number;
}

export type ExplainResult = QueryResult & Explanation;

export interface AskResult extends ExplainResult {
  question: string;
  cypher: string;
  attempts: number;
  generateMs: number;
}

export interface RingGraph {
  nodes: {
    id: string;
    label: string;
    type: 'customer' | 'device' | 'address';
    ring: number;
    riskScore: number;
    highRisk: boolean;
  }[];
  links: { source: string; target: string; type: 'USES_DEVICE' | 'SHIPPED_TO' }[];
}

/** Error from the API, with the rejected Cypher when there is one. */
export class ApiError extends Error {
  cypher?: string;
  cypherError?: string;
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Cannot reach the API server. Is "npm run dev" running?');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new ApiError(data.error ?? `Request failed (HTTP ${res.status})`);
    err.cypher = data.cypher;
    err.cypherError = data.cypherError;
    throw err;
  }
  return data as T;
}

export const api = {
  // /api/health answers 503 when Neo4j is down, but the body is still the report we want.
  health: async (): Promise<Health> => {
    const res = await fetch('/api/health');
    return res.json();
  },
  queries: () => request<CatalogQuery[]>('/api/queries'),
  customers: () => request<Customer[]>('/api/customers'),
  run: (id: string, params: Record<string, string>) => request<QueryResult>(`/api/queries/${id}/run`, { params }),
  explain: (queryId: string, params: Record<string, string>, provider: Provider) =>
    request<ExplainResult>('/api/explain', { queryId, params, provider }),
  ask: (question: string, provider: Provider) => request<AskResult>('/api/ask', { question, provider }),
  ringGraph: () => request<RingGraph>('/api/rings/graph'),
};
