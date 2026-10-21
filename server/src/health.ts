import { GoogleGenAI } from '@google/genai';
import { config } from './config.js';
import type { Provider } from './llm/index.js';
import { verifyNeo4j } from './neo4j.js';

export interface ProviderStatus {
  provider: Provider;
  model: string;
  reachable: boolean;
  message?: string;
}

export interface HealthReport {
  neo4j: { connected: boolean; message?: string };
  llm: { active: Provider; providers: ProviderStatus[] };
}

async function checkOllama(): Promise<ProviderStatus> {
  const status: ProviderStatus = { provider: 'ollama', model: config.OLLAMA_MODEL, reachable: false };
  try {
    const res = await fetch(`${config.OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) {
      status.message = `Ollama answered with HTTP ${res.status}`;
      return status;
    }
    const body = (await res.json()) as { models?: { name: string }[] };
    const installed = (body.models ?? []).some((m) => m.name === config.OLLAMA_MODEL);
    status.reachable = installed;
    if (!installed) status.message = `Ollama is running but the model is missing. Run: ollama pull ${config.OLLAMA_MODEL}`;
  } catch {
    status.message = `Ollama is not reachable. Run: ollama serve (and ollama pull ${config.OLLAMA_MODEL})`;
  }
  return status;
}

// Cache the Gemini check so the health endpoint doesn't eat into the free-tier quota.
let geminiCache: { at: number; status: ProviderStatus } | undefined;

async function checkGemini(): Promise<ProviderStatus> {
  if (geminiCache && Date.now() - geminiCache.at < 60_000) return geminiCache.status;

  const status: ProviderStatus = { provider: 'gemini', model: config.GEMINI_MODEL, reachable: false };
  if (!config.GEMINI_API_KEY) {
    status.message = 'GEMINI_API_KEY is not set in server/.env';
    return status;
  }
  try {
    const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
    await ai.models.get({ model: config.GEMINI_MODEL });
    status.reachable = true;
  } catch (err) {
    const code = (err as { status?: number }).status;
    status.message = code ? `Gemini answered with HTTP ${code}` : 'Gemini is not reachable';
  }
  geminiCache = { at: Date.now(), status };
  return status;
}

export async function getHealth(): Promise<HealthReport> {
  const [neo, ollama, gemini] = await Promise.all([
    verifyNeo4j().then(
      () => ({ connected: true }),
      (err: Error) => ({ connected: false, message: err.message }),
    ),
    checkOllama(),
    checkGemini(),
  ]);
  return { neo4j: neo, llm: { active: config.LLM_PROVIDER, providers: [ollama, gemini] } };
}
