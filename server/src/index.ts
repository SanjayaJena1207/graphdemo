import { createApp } from './app.js';
import { config } from './config.js';
import { warmUpOllama } from './llm/ollama.js';
import { closeNeo4j, verifyNeo4j } from './neo4j.js';

async function main() {
  try {
    await verifyNeo4j();
    console.log(`Connected to Neo4j (database "${config.NEO4J_DATABASE}")`);
  } catch (err) {
    // Keep running so /api/health can report the problem, but make it obvious.
    console.error(
      `\n*** Could not connect to Neo4j: ${(err as Error).message}\n` +
        '*** Check NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD in server/.env and that the Aura instance is running.\n',
    );
  }

  warmUpOllama();

  const server = createApp().listen(config.PORT, () => {
    console.log(`API listening on http://localhost:${config.PORT} (LLM provider: ${config.LLM_PROVIDER})`);
  });

  const shutdown = async () => {
    console.log('Shutting down...');
    server.close();
    await closeNeo4j();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
