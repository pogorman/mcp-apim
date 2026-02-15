import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { query } from "../shared/db.js";

async function handler(req: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  try {
  const entityId = req.params.entityId;
  if (!entityId) {
    return { status: 400, jsonBody: { error: "entityId is required" } };
  }

  // Get entity info
  const [entity] = await query(
    `SELECT master_entity_id, name_text FROM master_entity WHERE master_entity_id = @entityId`,
    { entityId }
  );

  if (!entity) {
    return { status: 404, jsonBody: { error: "Entity not found" } };
  }

  // Get all linked addresses and parcels
  const links = await query(
    `SELECT
       ea.parcel_number,
       a.address_text,
       ea.notes,
       p.owner_1,
       p.address_std AS property_address,
       p.category_code_description,
       p.market_value,
       p.zip_code,
       p.homestead_exemption
     FROM master_entity_address ea
     LEFT JOIN master_address a ON a.master_address_id = ea.master_address_id
     LEFT JOIN opa_properties p ON p.parcel_number = ea.parcel_number
     WHERE ea.master_entity_id = @entityId
     ORDER BY p.market_value DESC`,
    { entityId }
  );

  // Get violation and demolition counts for this entity's parcels
  const parcelNumbers = links
    .map((l: Record<string, unknown>) => l.parcel_number)
    .filter(Boolean);

  let violationSummary = { total_violations: 0, total_failed: 0, total_demolitions: 0 };

  if (parcelNumbers.length > 0) {
    const parcelList = parcelNumbers.map((p: unknown) => `'${p}'`).join(",");
    const [summary] = await query(
      `SELECT
         COUNT(DISTINCT ci.objectid) AS total_violations,
         SUM(CASE WHEN ci.investigationstatus = 'FAILED' THEN 1 ELSE 0 END) AS total_failed,
         (SELECT COUNT(*) FROM demolitions d WHERE d.opa_account_num IN (${parcelList})) AS total_demolitions
       FROM case_investigations ci
       WHERE ci.opa_account_num IN (${parcelList})`
    );
    if (summary) violationSummary = summary as typeof violationSummary;
  }

  return {
    jsonBody: {
      entity,
      property_count: parcelNumbers.length,
      properties: links,
      violation_summary: violationSummary,
    },
  };
  } catch (err: any) {
    return { status: 500, jsonBody: { error: err.message, stack: err.stack } };
  }
}

app.http("getEntityNetwork", {
  methods: ["GET"],
  authLevel: "function",
  route: "entities/{entityId}/network",
  handler,
});
