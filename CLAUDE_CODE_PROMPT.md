# Build: Graph Insights app (React + Neo4j AuraDB + LLM)

## Goal

Build a small full-stack app that queries my Neo4j AuraDB Free e-commerce graph and uses an LLM to explain the results in plain English. The LLM is switchable between a local model (Ollama, `llama3.2:1b`) and Google Gemini (free API key).

Work in phases (below). After each phase, run it, show me what works, and wait for my OK before the next phase.

## Context

- The graph is already loaded in Neo4j AuraDB Free (I followed `ecommerce_load.cypher` in this folder).
- `ecommerce_queries.cypher` in this folder holds 8 tested queries: S1–S4 (simple) and H1–H4 (complex). Use these exact queries; do not rewrite their logic.
- Graph model:
  - `(:Customer {customerId, name, email, city, signupDate})`
  - `(:Order {orderId, orderDate, status, totalAmount, paymentMethod})`
  - `(:Product {productId, name, brand, price})`
  - `(:Category {categoryId, name})`
  - `(:Address {addressId, line1, city, pincode})`
  - `(:Device {deviceId, type})`
  - `(Customer)-[:PLACED]->(Order)-[:CONTAINS {quantity, unitPrice}]->(Product)-[:IN_CATEGORY]->(Category)-[:SUBCATEGORY_OF]->(Category)`
  - `(Order)-[:SHIPPED_TO]->(Address)`, `(Customer)-[:USES_DEVICE]->(Device)`, `(Customer)-[:REVIEWED {rating, reviewDate}]->(Product)`
- Customer IDs run C001–C025. C021–C025 are a planted fraud ring.

## Architecture (must follow)

```
React (Vite)  →  Node/Express API  →  Neo4j AuraDB (neo4j-driver, Bolt)
                        └──────────→  LLM provider: Ollama (local) | Gemini (cloud)
```

- The browser NEVER talks to Neo4j, Ollama or Gemini directly. All credentials stay in `server/.env`.
- One Neo4j driver instance for the whole server (create at startup, close on shutdown). Verify connectivity at startup and log a clear error if it fails.
- All Neo4j calls run in READ mode (`session.executeRead` or `defaultAccessMode: READ`).
- Always pass values as query parameters (`$customerId`), never by string concatenation.
- Convert Neo4j types before sending JSON: Integers to JS numbers, Date/DateTime to ISO strings, nodes to plain property objects.

## Tech stack

- Monorepo with two folders: `server/` and `client/`. Root `package.json` with an `npm run dev` that starts both (use `concurrently`).
- Server: Node 20+, TypeScript, Express, `neo4j-driver`, `@google/genai`, `zod` for request validation, `dotenv`.
- Ollama: call its REST API with `fetch` (`POST {OLLAMA_URL}/api/chat`, `stream: false`). No extra SDK.
- Client: React + Vite + TypeScript, plain CSS or Tailwind (your choice, keep it simple). `react-force-graph-2d` for the network view.

## Environment (`server/.env.example`, commit only the example)

```
NEO4J_URI=neo4j+s://xxxxxxxx.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=
NEO4J_DATABASE=neo4j
LLM_PROVIDER=ollama            # ollama | gemini
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:1b
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
PORT=3001
```

Add `.env` to `.gitignore`.

## Phases

### Phase 1: Server + Neo4j

1. Scaffold `server/` with the stack above.
2. Create a query catalog (`server/src/queries.ts`): an array of `{ id, title, description, cypher, params }` for S1–S4 and H1–H4, copied from `ecommerce_queries.cypher`. Replace hard-coded `'C001'` with `$customerId` where relevant (S1, H1). Remove `:param` lines (those are console commands, not Cypher).
3. Endpoints:
   - `GET /api/health` → Neo4j connectivity + which LLM provider is active and reachable.
   - `GET /api/queries` → catalog list (id, title, description, params needed).
   - `POST /api/queries/:id/run` with `{ params }` → `{ columns, rows, durationMs }`.
   - `GET /api/customers` → id + name list for a dropdown.
4. Add a 15-second query timeout and return clean JSON errors (never stack traces).
5. Test: a small script or `curl` examples that run every catalog query and print row counts. Expected: S1 for C001 returns 3 rows; H3 returns 2 rows with the first ring's riskScore = 100.

### Phase 2: LLM layer

1. `server/src/llm/` with one interface: `generate({ system, prompt }): Promise<string>`, two implementations (`ollama.ts`, `gemini.ts`) and a factory that picks by `LLM_PROVIDER`. Allow the client to override the provider per request (`provider` field), falling back to the env default.
2. `POST /api/explain` with `{ queryId, params, provider? }`:
   - Runs the catalog query, then sends the LLM: the query's title and description, the column names, and up to 30 rows as compact JSON.
   - System prompt: you are a retail data analyst; explain these results to a business user in 3 to 6 bullet points; use only the numbers given; don't invent data; if the result is empty, say so.
   - Returns `{ rows, columns, explanation, provider, model, llmMs }`.
3. Handle failures: Ollama not running → a clear message telling me to run `ollama serve` and `ollama pull llama3.2:1b`; Gemini 429 → "free-tier rate limit reached, try again in a minute or switch to Ollama".
4. Keep prompts small. `llama3.2:1b` has limited reasoning, so truncate rows and keep instructions short and direct.

### Phase 3: "Ask a question" (text-to-Cypher), guarded

1. `POST /api/ask` with `{ question, provider? }`.
2. Step 1: the LLM generates Cypher. Its prompt includes the full graph model above, 3 of the catalog queries as examples, and the rules: read-only, return only the Cypher, always end with `LIMIT 50` or less.
3. Step 2: validate before running:
   - Strip markdown code fences.
   - Reject if it contains (case-insensitive, word boundary) `CREATE`, `MERGE`, `DELETE`, `DETACH`, `SET`, `REMOVE`, `DROP`, `LOAD CSV`, `CALL dbms`, `CALL db.` (allow `CALL {` subqueries only if you can do so safely; otherwise reject all `CALL`), `apoc.`.
   - Run in a READ session anyway, as a second line of defence.
   - Add `LIMIT 50` if missing.
4. Step 3: run it; on a Cypher syntax error, send the error back to the LLM once to fix it, then give up with a friendly message.
5. Step 4: the LLM explains the rows (same as Phase 2).
6. Return the generated Cypher too, so the UI can show it.
7. Note in the README that `llama3.2:1b` will often write wrong Cypher; Gemini does much better. That's expected and a useful comparison.

### Phase 4: React client

One page, three areas:

1. **Header:** app name, a provider toggle (Ollama / Gemini) showing model name and health status from `/api/health`.
2. **Query catalog panel:** cards for S1–S4 and H1–H4 with title and description. A customer dropdown appears for queries that need `customerId`. Buttons: "Run" and "Run + Explain".
3. **Results area:**
   - The LLM explanation at the top (with provider, model and time taken).
   - A sortable results table.
   - For H3 (fraud rings), a "Network view" tab using `react-force-graph-2d`: add a server endpoint `GET /api/rings/graph` returning nodes (customers, devices, addresses) and links for customers in rings, and colour the high-risk ring red.
   - A collapsible "Cypher" box showing the exact query that ran.
4. **Ask box:** a text input ("Which customers bought both a phone and headphones?"), shows generated Cypher, rows and explanation, or the validation error.
5. Loading states, error banners, and an empty state. Configure the Vite dev proxy so `/api` goes to the server.

### Phase 5: Polish and docs

1. `README.md`: prerequisites (Node 20, Ollama installed, Aura instance running), setup steps (`ollama pull llama3.2:1b`, get a Gemini key at Google AI Studio, fill `.env`), `npm install`, `npm run dev`, and an architecture diagram in Mermaid.
2. A short "What I learned" section in the README comparing the two LLMs on the same three questions.
3. Basic tests: Vitest for the Cypher validator (must reject every forbidden keyword, must accept all catalog queries) and for the Neo4j type conversion.

## Rules for you (Claude Code)

- Ask me before installing anything globally or changing files outside this folder.
- Don't put any secret in code, logs or the client bundle. Never print `.env` values.
- Prefer simple, readable code over abstractions; this is a learning project.
- Run the type checker and tests before saying a phase is done, and tell me how to check it myself.
