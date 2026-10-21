import { runRead } from './neo4j.js';
import { findQuery } from './queries.js';

// Rings at or above this score are drawn red in the network view.
export const HIGH_RISK_SCORE = 70;

export interface GraphNode {
  id: string;
  label: string;
  type: 'customer' | 'device' | 'address';
  ring: number;
  riskScore: number;
  highRisk: boolean;
}

export interface GraphLink {
  source: string;
  target: string;
  type: 'USES_DEVICE' | 'SHIPPED_TO';
}

const RING_DETAILS = `
UNWIND $rings AS ring
MATCH (c:Customer) WHERE c.name IN ring.members
OPTIONAL MATCH (c)-[:USES_DEVICE]->(d:Device)
WITH ring, c, collect(DISTINCT d {.deviceId, .type}) AS devices
OPTIONAL MATCH (c)-[:PLACED]->(:Order)-[:SHIPPED_TO]->(a:Address)
RETURN ring.index AS ring, ring.riskScore AS riskScore,
       c {.customerId, .name} AS customer, devices,
       collect(DISTINCT a {.addressId, .line1, .city}) AS addresses`;

interface DetailRow {
  ring: number;
  riskScore: number;
  customer: { customerId: string; name: string };
  devices: { deviceId: string; type: string }[];
  addresses: { addressId: string; line1: string; city: string }[];
}

/** Customers in fraud rings (from H3) plus the devices and addresses that link them. */
export async function getRingGraph() {
  // H3 finds the rings and scores them; it returns member names.
  const h3 = await runRead(findQuery('H3')!.cypher);
  const rings = h3.rows.map((row, index) => ({
    index,
    members: row.ringMembers as string[],
    riskScore: row.riskScore as number,
  }));

  const { rows } = await runRead(RING_DETAILS, { rings });

  const nodes = new Map<string, GraphNode>();
  const links: GraphLink[] = [];
  const addNode = (node: GraphNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };

  for (const row of rows as unknown as DetailRow[]) {
    const ringInfo = { ring: row.ring, riskScore: row.riskScore, highRisk: row.riskScore >= HIGH_RISK_SCORE };
    const { customerId, name } = row.customer;
    addNode({ id: customerId, label: name, type: 'customer', ...ringInfo });

    for (const d of row.devices) {
      addNode({ id: d.deviceId, label: `${d.deviceId} (${d.type})`, type: 'device', ...ringInfo });
      links.push({ source: customerId, target: d.deviceId, type: 'USES_DEVICE' });
    }
    for (const a of row.addresses) {
      addNode({ id: a.addressId, label: `${a.line1}, ${a.city}`, type: 'address', ...ringInfo });
      links.push({ source: customerId, target: a.addressId, type: 'SHIPPED_TO' });
    }
  }

  return { rings: h3.rows, nodes: [...nodes.values()], links };
}
