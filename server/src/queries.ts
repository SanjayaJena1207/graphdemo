// Query catalog. The Cypher is copied from ecommerce_queries.cypher.
// Only changes: S1 uses $customerId instead of 'C001', and H1's
// `:param` console line is removed (the query already uses $customerId).

export interface QueryParam {
  name: 'customerId';
  label: string;
  example: string;
}

export interface CatalogQuery {
  id: string;
  title: string;
  description: string;
  cypher: string;
  params: QueryParam[];
}

const customerParam: QueryParam = { name: 'customerId', label: 'Customer', example: 'C001' };

export const queries: CatalogQuery[] = [
  {
    id: 'S1',
    title: 'Customer order history',
    description: "One customer's order history with the items in each order.",
    params: [customerParam],
    cypher: `
MATCH (c:Customer {customerId: $customerId})-[:PLACED]->(o:Order)-[r:CONTAINS]->(p:Product)
RETURN o.orderId AS orderId, o.orderDate AS orderDate, o.status AS status,
       o.totalAmount AS total,
       collect(p.name + ' x' + toString(r.quantity)) AS items
ORDER BY orderDate`,
  },
  {
    id: 'S2',
    title: 'Top 5 best-selling products',
    description: 'Top 5 products by units sold, with the revenue they brought in.',
    params: [],
    cypher: `
MATCH (:Order)-[r:CONTAINS]->(p:Product)
RETURN p.name AS product,
       sum(r.quantity) AS unitsSold,
       sum(r.quantity * r.unitPrice) AS revenue
ORDER BY unitsSold DESC, revenue DESC
LIMIT 5`,
  },
  {
    id: 'S3',
    title: 'Electronics catalogue',
    description: 'Every product under "Electronics", including its subcategories.',
    params: [],
    cypher: `
MATCH (p:Product)-[:IN_CATEGORY]->(c:Category)
      -[:SUBCATEGORY_OF*0..]->(:Category {name: 'Electronics'})
RETURN c.name AS subcategory, p.name AS product, p.price AS price
ORDER BY subcategory, price DESC`,
  },
  {
    id: 'S4',
    title: 'Highest-rated products',
    description: 'Top 5 products by average rating (at least 2 reviews).',
    params: [],
    cypher: `
MATCH (:Customer)-[r:REVIEWED]->(p:Product)
WITH p, avg(r.rating) AS avgRating, count(r) AS reviews
WHERE reviews >= 2
RETURN p.name AS product, round(avgRating, 2) AS avgRating, reviews
ORDER BY avgRating DESC, reviews DESC
LIMIT 5`,
  },
  {
    id: 'H1',
    title: 'Personalized recommendations',
    description:
      'Collaborative filtering: find the 5 customers most similar to this one (Jaccard similarity on purchases) and recommend what they bought, weighted by similarity and rating.',
    params: [customerParam],
    cypher: `
MATCH (me:Customer {customerId: $customerId})-[:PLACED]->(:Order)-[:CONTAINS]->(mine:Product)
WITH me, collect(DISTINCT mine) AS myProducts
UNWIND myProducts AS shared
MATCH (shared)<-[:CONTAINS]-(:Order)<-[:PLACED]-(peer:Customer)
WHERE peer <> me
WITH me, myProducts, peer, count(DISTINCT shared) AS overlap
MATCH (peer)-[:PLACED]->(:Order)-[:CONTAINS]->(pp:Product)
WITH myProducts, peer, overlap, collect(DISTINCT pp) AS peerProducts
WITH myProducts, peer, peerProducts,
     toFloat(overlap) / (size(myProducts) + size(peerProducts) - overlap) AS similarity
ORDER BY similarity DESC, peer.customerId
LIMIT 5
UNWIND peerProducts AS rec
WITH myProducts, peer, similarity, rec
WHERE NOT rec IN myProducts
OPTIONAL MATCH (peer)-[rv:REVIEWED]->(rec)
WITH rec, peer, similarity * coalesce(rv.rating, 3) / 5.0 AS weightedVote
WITH rec, sum(weightedVote) AS score, collect(peer.name) AS becauseOf
MATCH (rec)-[:IN_CATEGORY]->(cat:Category)
RETURN rec.name AS recommendation, cat.name AS category, rec.price AS price,
       round(score, 3) AS score, becauseOf
ORDER BY score DESC
LIMIT 5`,
  },
  {
    id: 'H2',
    title: 'Frequently bought together',
    description:
      'Product pairs bought in the same order, with support, confidence and lift (lift > 1 means more often than chance).',
    params: [],
    cypher: `
MATCH (o:Order)
WITH count(o) AS totalOrders
MATCH (a:Product)<-[:CONTAINS]-(o:Order)-[:CONTAINS]->(b:Product)
WHERE a.productId < b.productId
WITH totalOrders, a, b, count(DISTINCT o) AS together
WHERE together >= 2
MATCH (a)<-[:CONTAINS]-(oa:Order)
WITH totalOrders, a, b, together, count(DISTINCT oa) AS ordersWithA
MATCH (b)<-[:CONTAINS]-(ob:Order)
WITH totalOrders, a, b, together, ordersWithA, count(DISTINCT ob) AS ordersWithB
RETURN a.name AS productA, b.name AS productB,
       together AS support,
       round(toFloat(together) / ordersWithA, 2) AS confidenceAtoB,
       round((toFloat(together) / totalOrders) /
             ((toFloat(ordersWithA) / totalOrders) * (toFloat(ordersWithB) / totalOrders)), 2) AS lift
ORDER BY lift DESC, support DESC, productA
LIMIT 10`,
  },
  {
    id: 'H3',
    title: 'Fraud-ring detection',
    description:
      'Groups of customers linked by shared devices or shipping addresses, scored on shared identifiers, chargebacks, signup timing and order value.',
    params: [],
    cypher: `
MATCH (c:Customer)
OPTIONAL MATCH (c)-[:USES_DEVICE|PLACED|SHIPPED_TO*1..8]-(other:Customer)
WHERE other <> c
WITH c, collect(DISTINCT other) + c AS members
UNWIND members AS m
WITH c, m ORDER BY m.customerId
WITH c, collect(DISTINCT m) AS ring
WHERE size(ring) >= 2
WITH DISTINCT ring
// shared devices inside the ring
OPTIONAL MATCH (d:Device)<-[:USES_DEVICE]-(m:Customer)
WHERE m IN ring
WITH ring, d, count(m) AS deviceUsers
WITH ring, count(CASE WHEN deviceUsers > 1 THEN d END) AS sharedDevices
// shared shipping addresses inside the ring
OPTIONAL MATCH (a:Address)<-[:SHIPPED_TO]-(:Order)<-[:PLACED]-(m:Customer)
WHERE m IN ring
WITH ring, sharedDevices, a, count(DISTINCT m) AS shippers
WITH ring, sharedDevices, count(CASE WHEN shippers > 1 THEN a END) AS sharedAddresses
// order behaviour of the ring
UNWIND ring AS m
OPTIONAL MATCH (m)-[:PLACED]->(o:Order)
WITH ring, sharedDevices, sharedAddresses,
     count(o) AS orders,
     sum(o.totalAmount) AS orderValue,
     count(CASE WHEN o.status = 'Chargeback' THEN 1 END) AS chargebacks,
     min(m.signupDate) AS firstSignup,
     max(m.signupDate) AS lastSignup
WITH *, duration.inDays(firstSignup, lastSignup).days AS signupSpreadDays
WITH ring, sharedDevices, sharedAddresses, orders, orderValue, chargebacks, signupSpreadDays,
     sharedDevices * 15 + sharedAddresses * 15 + chargebacks * 10
       + CASE WHEN signupSpreadDays <= 14 THEN 20 ELSE 0 END
       + CASE WHEN orderValue > 300000 THEN 20 ELSE 0 END AS rawScore
RETURN [m IN ring | m.name] AS ringMembers,
       size(ring) AS members, sharedDevices, sharedAddresses,
       orders, orderValue, chargebacks, signupSpreadDays,
       CASE WHEN rawScore > 100 THEN 100 ELSE rawScore END AS riskScore
ORDER BY riskScore DESC`,
  },
  {
    id: 'H4',
    title: 'Customer journeys across categories',
    description:
      'Which top-level category tends to lead to which in consecutive orders, with the average gap in days.',
    params: [],
    cypher: `
MATCH (c:Customer)-[:PLACED]->(o:Order)
WHERE o.status <> 'Chargeback'
WITH c, o ORDER BY o.orderDate
WITH c, collect(o) AS journey
WHERE size(journey) > 1
UNWIND range(0, size(journey) - 2) AS i
WITH journey[i] AS fromOrder, journey[i + 1] AS toOrder
MATCH (fromOrder)-[:CONTAINS]->(:Product)-[:IN_CATEGORY]->(:Category)
      -[:SUBCATEGORY_OF*0..]->(fromTop:Category)
WHERE NOT EXISTS { (fromTop)-[:SUBCATEGORY_OF]->() }
MATCH (toOrder)-[:CONTAINS]->(:Product)-[:IN_CATEGORY]->(:Category)
      -[:SUBCATEGORY_OF*0..]->(toTop:Category)
WHERE NOT EXISTS { (toTop)-[:SUBCATEGORY_OF]->() }
WITH DISTINCT fromOrder, toOrder, fromTop, toTop
WHERE fromTop <> toTop
RETURN fromTop.name AS boughtFirst, toTop.name AS thenBought,
       count(*) AS transitions,
       round(avg(duration.inDays(fromOrder.orderDate, toOrder.orderDate).days)) AS avgDaysBetween
ORDER BY transitions DESC, boughtFirst
LIMIT 10`,
  },
];

export function findQuery(id: string): CatalogQuery | undefined {
  return queries.find((q) => q.id.toLowerCase() === id.toLowerCase());
}
