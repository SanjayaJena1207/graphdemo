import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { getHealth } from './health.js';
import { QUERY_TIMEOUT_MS, runRead } from './neo4j.js';
import { findQuery, queries, type CatalogQuery } from './queries.js';

/** An error whose message is safe to show to the client. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const CustomerId = z.string().regex(/^C\d{3}$/, 'customerId must look like C001');

const RunBody = z.object({
  params: z.record(z.string(), z.unknown()).default({}),
});

/** Check the request params against what the catalog query declares. */
export function validateParams(query: CatalogQuery, raw: Record<string, unknown>): Record<string, string> {
  const params: Record<string, string> = {};
  for (const p of query.params) {
    const parsed = CustomerId.safeParse(raw[p.name]);
    if (!parsed.success) {
      throw new HttpError(400, `Query ${query.id} needs "${p.name}" (e.g. ${p.example}): ${parsed.error.issues[0].message}`);
    }
    params[p.name] = parsed.data;
  }
  return params;
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', async (_req, res) => {
    const health = await getHealth();
    res.status(health.neo4j.connected ? 200 : 503).json(health);
  });

  app.get('/api/queries', (_req, res) => {
    res.json(queries.map(({ id, title, description, params }) => ({ id, title, description, params })));
  });

  app.post('/api/queries/:id/run', async (req, res) => {
    const query = findQuery(req.params.id);
    if (!query) throw new HttpError(404, `Unknown query "${req.params.id}"`);

    const body = RunBody.safeParse(req.body ?? {});
    if (!body.success) throw new HttpError(400, 'Body must look like { "params": { ... } }');

    const params = validateParams(query, body.data.params);
    res.json(await runRead(query.cypher, params));
  });

  app.get('/api/customers', async (_req, res) => {
    const { rows } = await runRead(
      'MATCH (c:Customer) RETURN c.customerId AS id, c.name AS name ORDER BY id',
    );
    res.json(rows);
  });

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

  // Every error becomes clean JSON. Details go to the server log, never to the client.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const { status, message } = toClientError(err);
    if (status >= 500) console.error('[api]', err);
    res.status(status).json({ error: message });
  });

  return app;
}

function toClientError(err: unknown): { status: number; message: string } {
  if (err instanceof HttpError) return { status: err.status, message: err.message };

  // Malformed JSON body from express.json()
  if (err instanceof SyntaxError && 'body' in err) return { status: 400, message: 'Request body is not valid JSON' };

  const code = (err as { code?: string }).code ?? '';
  if (code.includes('TransactionTimedOut') || code.includes('Timeout')) {
    return { status: 504, message: `Query took longer than ${QUERY_TIMEOUT_MS / 1000} seconds and was stopped` };
  }
  if (code === 'ServiceUnavailable' || code === 'SessionExpired') {
    return { status: 503, message: 'Cannot reach Neo4j. Is the Aura instance running?' };
  }
  if (code.startsWith('Neo.ClientError.Security')) {
    return { status: 503, message: 'Neo4j rejected the credentials in server/.env' };
  }
  if (code.startsWith('Neo.ClientError.Statement')) {
    return { status: 400, message: `Cypher error: ${(err as Error).message.split('\n')[0]}` };
  }
  return { status: 500, message: 'Something went wrong on the server' };
}
