import { ApiError, GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import type { GenerateInput, LlmClient } from './types.js';

let ai: GoogleGenAI | undefined;

export const gemini: LlmClient = {
  provider: 'gemini',
  model: config.GEMINI_MODEL,

  async generate({ system, prompt }: GenerateInput): Promise<string> {
    if (!config.GEMINI_API_KEY) {
      throw new HttpError(503, 'GEMINI_API_KEY is not set in server/.env. Get a free key at Google AI Studio, or switch to Ollama.');
    }
    ai ??= new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });

    const call = async () => {
      const response = await ai!.models.generateContent({
        model: config.GEMINI_MODEL,
        contents: prompt,
        config: { systemInstruction: system, temperature: 0.2 },
      });
      return response.text?.trim() ?? '';
    };

    try {
      try {
        return await call();
      } catch (err) {
        // 500/503 mean Google's side is busy; one retry usually works.
        if (!(err instanceof ApiError) || (err.status !== 500 && err.status !== 503)) throw err;
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return await call();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 500 || err.status === 503) {
          throw new HttpError(503, 'Gemini is overloaded right now, try again in a moment or switch to Ollama.');
        }
        if (err.status === 429) {
          throw new HttpError(429, 'Gemini free-tier rate limit reached, try again in a minute or switch to Ollama.');
        }
        if (err.status === 400 || err.status === 401 || err.status === 403) {
          throw new HttpError(503, `Gemini rejected the request (HTTP ${err.status}). Check GEMINI_API_KEY and GEMINI_MODEL in server/.env.`);
        }
        throw new HttpError(502, `Gemini answered with HTTP ${err.status}`);
      }
      throw new HttpError(503, 'Gemini is not reachable. Check your internet connection.');
    }
  },
};
