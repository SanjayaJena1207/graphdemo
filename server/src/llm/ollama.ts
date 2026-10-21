import { config } from '../config.js';
import { HttpError } from '../errors.js';
import type { GenerateInput, LlmClient } from './types.js';

// The first call after Ollama starts can take over a minute (model load + warm-up);
// later calls take seconds. keep_alive keeps the model in memory between calls.
const OLLAMA_TIMEOUT_MS = 180_000;
const KEEP_ALIVE = '30m';

/** Load the model in the background so the first real request is fast. */
export function warmUpOllama(): void {
  fetch(`${config.OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.OLLAMA_MODEL, messages: [], keep_alive: KEEP_ALIVE }),
  }).then(
    () => console.log(`Ollama model ${config.OLLAMA_MODEL} is loaded`),
    () => console.warn('Ollama is not running; Ollama requests will fail until you run "ollama serve"'),
  );
}

const notRunning = () =>
  new HttpError(503, `Ollama is not running. Start it with "ollama serve" and run "ollama pull ${config.OLLAMA_MODEL}".`);

export const ollama: LlmClient = {
  provider: 'ollama',
  model: config.OLLAMA_MODEL,

  async generate({ system, prompt }: GenerateInput): Promise<string> {
    let res: Response;
    try {
      res = await fetch(`${config.OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.OLLAMA_MODEL,
          stream: false,
          keep_alive: KEEP_ALIVE,
          options: { temperature: 0.2 },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
      });
    } catch (err) {
      if ((err as Error).name === 'TimeoutError') {
        throw new HttpError(
          504,
          `Ollama took longer than ${OLLAMA_TIMEOUT_MS / 1000} seconds to answer. The first call loads the model; try again, or switch to Gemini.`,
        );
      }
      throw notRunning();
    }

    if (res.status === 404) {
      throw new HttpError(503, `Ollama doesn't have the model. Run "ollama pull ${config.OLLAMA_MODEL}".`);
    }
    if (!res.ok) throw new HttpError(502, `Ollama answered with HTTP ${res.status}`);

    const body = (await res.json()) as { message?: { content?: string } };
    return body.message?.content?.trim() ?? '';
  },
};
