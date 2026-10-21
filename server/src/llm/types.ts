export type Provider = 'ollama' | 'gemini';

export const PROVIDERS: Provider[] = ['ollama', 'gemini'];

export interface GenerateInput {
  system: string;
  prompt: string;
}

export interface LlmClient {
  provider: Provider;
  model: string;
  generate(input: GenerateInput): Promise<string>;
}
