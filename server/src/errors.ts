/** An error whose message is safe to show to the client. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Extra JSON fields for the client, e.g. the Cypher that was rejected. */
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** True when a READ session blocked a write. */
export function isWriteBlocked(err: unknown): boolean {
  return ((err as { code?: string }).code ?? '') === 'Neo.ClientError.Statement.AccessMode';
}

/** True for Neo4j errors caused by the query itself (syntax, unknown function, missing parameter...). */
export function isCypherError(err: unknown): boolean {
  const code = (err as { code?: string }).code ?? '';
  return code.startsWith('Neo.ClientError.Statement') && !isWriteBlocked(err);
}
