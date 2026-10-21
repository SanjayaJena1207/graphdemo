import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

// Always load server/.env, no matter which folder the process was started from.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '.env'), quiet: true });

const EnvSchema = z.object({
  NEO4J_URI: z.string().min(1, 'NEO4J_URI is missing'),
  NEO4J_USERNAME: z.string().min(1, 'NEO4J_USERNAME is missing'),
  NEO4J_PASSWORD: z.string().min(1, 'NEO4J_PASSWORD is missing'),
  NEO4J_DATABASE: z.string().default('neo4j'),
  LLM_PROVIDER: z.enum(['ollama', 'gemini']).default('ollama'),
  OLLAMA_URL: z.string().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('llama3.2:1b'),
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  PORT: z.coerce.number().int().positive().default(3001),
});

export type Config = z.infer<typeof EnvSchema>;

function loadConfig(): Config {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Only report which settings are wrong, never their values.
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    console.error(`Invalid server/.env (copy server/.env.example and fill it in):\n${problems.join('\n')}`);
    process.exit(1);
  }
  return parsed.data;
}

export const config = loadConfig();
