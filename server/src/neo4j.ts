import neo4j, { type Driver } from 'neo4j-driver';
import { config } from './config.js';

export const QUERY_TIMEOUT_MS = 15_000;

// One driver for the whole server. It manages its own connection pool.
export const driver: Driver = neo4j.driver(
  config.NEO4J_URI,
  neo4j.auth.basic(config.NEO4J_USERNAME, config.NEO4J_PASSWORD),
);

export async function verifyNeo4j(): Promise<void> {
  await driver.getServerInfo({ database: config.NEO4J_DATABASE });
}

export async function closeNeo4j(): Promise<void> {
  await driver.close();
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  durationMs: number;
}

/** Run a read-only query with parameters and a 15 s timeout. */
export async function runRead(cypher: string, params: Record<string, unknown> = {}): Promise<QueryResult> {
  const session = driver.session({
    database: config.NEO4J_DATABASE,
    defaultAccessMode: neo4j.session.READ,
  });
  const started = Date.now();
  try {
    const { columns, records } = await session.executeRead(
      async (tx) => {
        const result = tx.run(cypher, params);
        // keys() works even when the query returns no rows.
        const columns = (await result.keys()).map(String);
        const { records } = await result;
        return { columns, records };
      },
      { timeout: QUERY_TIMEOUT_MS },
    );
    return {
      columns,
      rows: records.map((record) => toPlain(record.toObject()) as Record<string, unknown>),
      durationMs: Date.now() - started,
    };
  } finally {
    await session.close();
  }
}

/** Convert Neo4j driver values into plain JSON-friendly values. */
export function toPlain(value: unknown): unknown {
  if (value === null || value === undefined) return null;

  if (neo4j.isInt(value)) {
    // Fall back to a string for numbers too big for a JS number.
    return value.inSafeRange() ? value.toNumber() : value.toString();
  }

  if (
    neo4j.isDate(value) ||
    neo4j.isDateTime(value) ||
    neo4j.isLocalDateTime(value) ||
    neo4j.isTime(value) ||
    neo4j.isLocalTime(value) ||
    neo4j.isDuration(value)
  ) {
    return value.toString(); // ISO 8601 text, e.g. "2024-01-15"
  }

  if (neo4j.isNode(value) || neo4j.isRelationship(value)) {
    return toPlain(value.properties);
  }

  if (neo4j.isPath(value)) {
    return [toPlain(value.start), ...value.segments.map((s) => toPlain(s.end))];
  }

  if (neo4j.isPoint(value)) {
    return { srid: toPlain(value.srid), x: value.x, y: value.y, z: value.z ?? null };
  }

  if (Array.isArray(value)) return value.map(toPlain);

  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toPlain(v)]));
  }

  return value;
}
