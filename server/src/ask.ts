import { guardCypher } from './cypherGuard.js';
import { HttpError, isCypherError } from './errors.js';
import { explainResult } from './explain.js';
import type { LlmClient } from './llm/index.js';
import { runRead, type QueryResult } from './neo4j.js';
import { findQuery } from './queries.js';

const GRAPH_MODEL = `Nodes:
(:Customer {customerId, name, email, city, signupDate})
(:Order {orderId, orderDate, status, totalAmount, paymentMethod})
(:Product {productId, name, brand, price})
(:Category {categoryId, name})
(:Address {addressId, line1, city, pincode})
(:Device {deviceId, type})
Relationships:
(Customer)-[:PLACED]->(Order)
(Order)-[:CONTAINS {quantity, unitPrice}]->(Product)
(Product)-[:IN_CATEGORY]->(Category)
(Category)-[:SUBCATEGORY_OF]->(Category)
(Order)-[:SHIPPED_TO]->(Address)
(Customer)-[:USES_DEVICE]->(Device)
(Customer)-[:REVIEWED {rating, reviewDate}]->(Product)`;

const RULES = `Rules:
- Read-only. Use only MATCH, OPTIONAL MATCH, WHERE, WITH, UNWIND, RETURN, ORDER BY, LIMIT.
- Use only the labels, relationships and properties listed above.
- Name every returned column with AS.
- Always end with LIMIT 50 or less.
- Return only the Cypher. No explanation, no code fences.`;

const SYSTEM_PROMPT = 'You translate questions about an e-commerce graph into Neo4j Cypher.';

// Three catalog queries as worked examples (no parameters, so the model doesn't invent any).
const EXAMPLE_IDS = ['S2', 'S3', 'S4'];

let categoryNames: string[] | undefined;

async function getCategoryNames(): Promise<string[]> {
  if (!categoryNames) {
    const { rows } = await runRead('MATCH (c:Category) RETURN c.name AS name ORDER BY name');
    categoryNames = rows.map((r) => String(r.name));
  }
  return categoryNames;
}

async function buildPrompt(question: string): Promise<string> {
  const examples = EXAMPLE_IDS.map((id) => {
    const q = findQuery(id)!;
    return `Question: ${q.description}\nCypher:${q.cypher}`;
  }).join('\n\n');

  return [
    GRAPH_MODEL,
    `Category names: ${(await getCategoryNames()).join(', ')}`,
    RULES,
    `Examples:\n${examples}`,
    `Question: ${question}\nCypher:`,
  ].join('\n\n');
}

/** Ask the LLM for Cypher and check it. Throws a 422 with the Cypher if the guard rejects it. */
async function writeCypher(llm: LlmClient, prompt: string): Promise<string> {
  const reply = await llm.generate({ system: SYSTEM_PROMPT, prompt });
  const guarded = guardCypher(reply);
  if (!guarded.ok) throw new HttpError(422, guarded.error, { cypher: guarded.cypher });
  return guarded.cypher;
}

export async function askQuestion(llm: LlmClient, question: string) {
  const started = Date.now();
  const prompt = await buildPrompt(question);

  // Step 1 + 2: generate and validate.
  let cypher = await writeCypher(llm, prompt);
  let attempts = 1;
  let result: QueryResult;

  // Step 3: run it; on a Cypher error, give the model one chance to fix it.
  try {
    result = await runRead(cypher);
  } catch (err) {
    if (!isCypherError(err)) throw err;
    const firstError = (err as Error).message.split('\n')[0];
    attempts = 2;
    cypher = await writeCypher(
      llm,
      `${prompt}\n${cypher}\n\nThat Cypher failed with this error:\n${firstError}\n\nWrite a corrected query. Return only the Cypher.`,
    );
    try {
      result = await runRead(cypher);
    } catch (retryErr) {
      if (!isCypherError(retryErr)) throw retryErr;
      throw new HttpError(
        422,
        `${llm.model} couldn't write a working query for that question. Try rephrasing it, or switch providers.`,
        { cypher, cypherError: (retryErr as Error).message.split('\n')[0] },
      );
    }
  }
  const generateMs = Date.now() - started;

  // Step 4: explain the rows.
  const explained = await explainResult(llm, question, `Answer to the question: ${question}`, result);
  return { question, cypher, attempts, generateMs, ...result, ...explained };
}
