import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { query } from "../shared/db.js";

async function handler(req: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  try {
  const limit = Math.min(parseInt(req.query.get("limit") ?? "25"), 100);
  const minProperties = parseInt(req.query.get("minProperties") ?? "5");
  const entityType = req.query.get("entityType"); // "llc", "individual", or null for all

  let ownerFilter = "";
  if (entityType === "llc") {
    ownerFilter = `AND (owner_1 LIKE '%LLC%' OR owner_1 LIKE '%LP%' OR owner_1 LIKE '%INC%'
                        OR owner_1 LIKE '%CORP%' OR owner_1 LIKE '%ASSOCIATES%'
                        OR owner_1 LIKE '%HOLDINGS%' OR owner_1 LIKE '%PARTNERS%')`;
  }

  const rows = await query(
    `WITH owner_props AS (
       SELECT owner_1,
              COUNT(DISTINCT parcel_number) AS property_count,
              SUM(market_value) AS total_market_value,
              SUM(CASE WHEN category_code_description LIKE '%VACANT%' THEN 1 ELSE 0 END) AS vacant_count
       FROM opa_properties
       WHERE owner_1 IS NOT NULL ${ownerFilter}
       GROUP BY owner_1
       HAVING COUNT(DISTINCT parcel_number) >= @minProperties
     ),
     owner_violations AS (
       SELECT p.owner_1,
              COUNT(*) AS total_violations,
              SUM(CASE WHEN ci.investigationstatus = 'FAILED' THEN 1 ELSE 0 END) AS total_failed
       FROM case_investigations ci
       JOIN opa_properties p ON p.parcel_number = ci.opa_account_num
       WHERE p.owner_1 IN (SELECT owner_1 FROM owner_props)
       GROUP BY p.owner_1
     ),
     owner_demos AS (
       SELECT p.owner_1, COUNT(*) AS total_demolitions
       FROM demolitions d
       JOIN opa_properties p ON p.parcel_number = d.opa_account_num
       WHERE p.owner_1 IN (SELECT owner_1 FROM owner_props)
       GROUP BY p.owner_1
     ),
     owner_appeals AS (
       SELECT p.owner_1, COUNT(*) AS total_appeals
       FROM appeals a
       JOIN opa_properties p ON p.parcel_number = a.opa_account_num
       WHERE p.owner_1 IN (SELECT owner_1 FROM owner_props)
       GROUP BY p.owner_1
     )
     SELECT TOP (@limit)
       op.owner_1, op.property_count, op.total_market_value, op.vacant_count,
       ISNULL(ov.total_violations, 0) AS total_violations,
       ISNULL(ov.total_failed, 0) AS total_failed,
       ISNULL(od.total_demolitions, 0) AS total_demolitions,
       ISNULL(oa.total_appeals, 0) AS total_appeals
     FROM owner_props op
     LEFT JOIN owner_violations ov ON ov.owner_1 = op.owner_1
     LEFT JOIN owner_demos od ON od.owner_1 = op.owner_1
     LEFT JOIN owner_appeals oa ON oa.owner_1 = op.owner_1
     ORDER BY ISNULL(ov.total_violations, 0) DESC`,
    { limit, minProperties }
  );

  return { jsonBody: { results: rows, count: rows.length } };
  } catch (err: any) {
    return { status: 500, jsonBody: { error: err.message, stack: err.stack } };
  }
}

app.http("getTopViolators", {
  methods: ["GET"],
  authLevel: "function",
  route: "stats/top-violators",
  handler,
});
