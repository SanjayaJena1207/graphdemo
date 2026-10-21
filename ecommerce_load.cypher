// =====================================================================
// E-commerce graph for Neo4j AuraDB Free
// Run each statement one at a time (or paste the whole file into the
// Aura "Query" tool, which runs statements separated by semicolons).
// =====================================================================

// ---------------------------------------------------------------------
// STEP 0. Point to where your CSV files live (must be public HTTPS).
// Replace <github-user>/<repo> with your own. Keep the trailing slash.
// ---------------------------------------------------------------------
:param base => 'https://raw.githubusercontent.com/<github-user>/<repo>/main/';

// ---------------------------------------------------------------------
// STEP 1. Constraints (also create the indexes used for fast lookups)
// ---------------------------------------------------------------------
CREATE CONSTRAINT customer_id IF NOT EXISTS FOR (c:Customer) REQUIRE c.customerId IS UNIQUE;
CREATE CONSTRAINT product_id  IF NOT EXISTS FOR (p:Product)  REQUIRE p.productId  IS UNIQUE;
CREATE CONSTRAINT category_id IF NOT EXISTS FOR (c:Category) REQUIRE c.categoryId IS UNIQUE;
CREATE CONSTRAINT order_id    IF NOT EXISTS FOR (o:Order)    REQUIRE o.orderId    IS UNIQUE;
CREATE CONSTRAINT address_id  IF NOT EXISTS FOR (a:Address)  REQUIRE a.addressId  IS UNIQUE;
CREATE CONSTRAINT device_id   IF NOT EXISTS FOR (d:Device)   REQUIRE d.deviceId   IS UNIQUE;

// ---------------------------------------------------------------------
// STEP 2. Nodes
// ---------------------------------------------------------------------

// Categories
LOAD CSV WITH HEADERS FROM $base + 'categories.csv' AS row
MERGE (c:Category {categoryId: row.category_id})
SET c.name = row.name;

// Category hierarchy: (child)-[:SUBCATEGORY_OF]->(parent)
LOAD CSV WITH HEADERS FROM $base + 'categories.csv' AS row
WITH row WHERE row.parent_id IS NOT NULL AND row.parent_id <> ''
MATCH (child:Category  {categoryId: row.category_id})
MATCH (parent:Category {categoryId: row.parent_id})
MERGE (child)-[:SUBCATEGORY_OF]->(parent);

// Products + (:Product)-[:IN_CATEGORY]->(:Category)
LOAD CSV WITH HEADERS FROM $base + 'products.csv' AS row
MERGE (p:Product {productId: row.product_id})
SET p.name  = row.name,
    p.brand = row.brand,
    p.price = toFloat(row.price)
WITH p, row
MATCH (c:Category {categoryId: row.category_id})
MERGE (p)-[:IN_CATEGORY]->(c);

// Customers
LOAD CSV WITH HEADERS FROM $base + 'customers.csv' AS row
MERGE (c:Customer {customerId: row.customer_id})
SET c.name       = row.name,
    c.email      = row.email,
    c.city       = row.city,
    c.signupDate = date(row.signup_date);

// Addresses
LOAD CSV WITH HEADERS FROM $base + 'addresses.csv' AS row
MERGE (a:Address {addressId: row.address_id})
SET a.line1   = row.line1,
    a.city    = row.city,
    a.pincode = row.pincode;

// Devices + (:Customer)-[:USES_DEVICE]->(:Device)
LOAD CSV WITH HEADERS FROM $base + 'devices.csv' AS row
MERGE (d:Device {deviceId: row.device_id})
SET d.type = row.device_type
WITH d, row
MATCH (c:Customer {customerId: row.customer_id})
MERGE (c)-[:USES_DEVICE]->(d);

// Orders + (:Customer)-[:PLACED]->(:Order)-[:SHIPPED_TO]->(:Address)
LOAD CSV WITH HEADERS FROM $base + 'orders.csv' AS row
MERGE (o:Order {orderId: row.order_id})
SET o.orderDate     = date(row.order_date),
    o.status        = row.status,
    o.totalAmount   = toFloat(row.total_amount),
    o.paymentMethod = row.payment_method
WITH o, row
MATCH (c:Customer {customerId: row.customer_id})
MATCH (a:Address  {addressId:  row.address_id})
MERGE (c)-[:PLACED]->(o)
MERGE (o)-[:SHIPPED_TO]->(a);

// ---------------------------------------------------------------------
// STEP 3. Relationships from "join" tables
// ---------------------------------------------------------------------

// Order lines: (:Order)-[:CONTAINS {quantity, unitPrice}]->(:Product)
LOAD CSV WITH HEADERS FROM $base + 'order_items.csv' AS row
MATCH (o:Order   {orderId:   row.order_id})
MATCH (p:Product {productId: row.product_id})
MERGE (o)-[r:CONTAINS]->(p)
SET r.quantity  = toInteger(row.quantity),
    r.unitPrice = toFloat(row.unit_price);

// Reviews: (:Customer)-[:REVIEWED {rating, reviewDate}]->(:Product)
LOAD CSV WITH HEADERS FROM $base + 'reviews.csv' AS row
MATCH (c:Customer {customerId: row.customer_id})
MATCH (p:Product  {productId:  row.product_id})
MERGE (c)-[r:REVIEWED]->(p)
SET r.rating     = toInteger(row.rating),
    r.reviewDate = date(row.review_date);

// ---------------------------------------------------------------------
// STEP 4. Verify the load
// Expected nodes: Order 67, Product 36, Device 28, Customer 25,
//                 Address 22, Category 12  (total 190)
// Expected relationships: CONTAINS 138, PLACED 67, SHIPPED_TO 67,
//                 REVIEWED 59, IN_CATEGORY 36, USES_DEVICE 33,
//                 SUBCATEGORY_OF 7  (total 407)
// ---------------------------------------------------------------------
MATCH (n)
RETURN labels(n)[0] AS label, count(*) AS nodes
ORDER BY nodes DESC;

MATCH ()-[r]->()
RETURN type(r) AS relationship, count(*) AS total
ORDER BY total DESC;
