// Runs every catalog query against Neo4j and prints row counts.
// Usage: npm run test:queries   (from the repo root or server/)
import { closeNeo4j, runRead, verifyNeo4j } from '../src/neo4j.js';
import { queries } from '../src/queries.js';

const sampleParams = { customerId: 'C001' };
let failures = 0;

function check(label: string, ok: boolean) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
}

try {
  await verifyNeo4j();
} catch (err) {
  console.error(`Could not connect to Neo4j: ${(err as Error).message}`);
  process.exit(1);
}

for (const q of queries) {
  const params = Object.fromEntries(q.params.map((p) => [p.name, sampleParams[p.name]]));
  try {
    const { rows, durationMs } = await runRead(q.cypher, params);
    const paramText = q.params.length ? ` ${JSON.stringify(params)}` : '';
    console.log(`${q.id.padEnd(3)} ${String(rows.length).padStart(3)} rows  ${String(durationMs).padStart(5)} ms  ${q.title}${paramText}`);

    if (q.id === 'S1') check('S1 for C001 returns 3 rows', rows.length === 3);
    if (q.id === 'H3') {
      check('H3 returns 2 rows', rows.length === 2);
      check('H3 first ring riskScore = 100', rows[0]?.riskScore === 100);
    }
  } catch (err) {
    console.log(`${q.id.padEnd(3)} ERROR  ${(err as Error).message}`);
    failures++;
  }
}

await closeNeo4j();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
