import { config } from '../config.js';
import { gemini } from './gemini.js';
import { ollama } from './ollama.js';
import type { LlmClient, Provider } from './types.js';

export * from './types.js';

/** Pick the LLM for this request: the client's choice, else LLM_PROVIDER from .env. */
export function getLlm(provider?: Provider): LlmClient {
  return (provider ?? config.LLM_PROVIDER) === 'gemini' ? gemini : ollama;
}
