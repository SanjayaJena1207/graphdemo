import type { QueryResult } from './neo4j.js';
import type { LlmClient } from './llm/index.js';

// Kept short and direct: llama3.2:1b follows simple instructions best.
const SYSTEM_PROMPT = [
  'You are a retail data analyst.',
  'Explain these query results to a business user in 3 to 6 short bullet points.',
  'Use only the numbers given. Do not invent data.',
  'If the result is empty, say so.',
  'Write each bullet as one full sentence.',
].join(' ');

const MAX_ROWS = 30;

export function buildExplainPrompt(title: string, description: string, result: QueryResult): string {
  const shown = result.rows.slice(0, MAX_ROWS);
  const rowsText =
    shown.length === 0
      ? 'none (the query returned no rows)'
      : `${shown.length} of ${result.rows.length}\n${JSON.stringify(shown)}`;

  return [
    `Query: ${title}`,
    `What it does: ${description}`,
    `Columns: ${result.columns.join(', ')}`,
    `Rows: ${rowsText}`,
  ].join('\n');
}

export async function explainResult(llm: LlmClient, title: string, description: string, result: QueryResult) {
  const started = Date.now();
  const explanation = await llm.generate({
    system: SYSTEM_PROMPT,
    prompt: buildExplainPrompt(title, description, result),
  });
  return { explanation, provider: llm.provider, model: llm.model, llmMs: Date.now() - started };
}
