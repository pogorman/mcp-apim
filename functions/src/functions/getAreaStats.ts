import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { query } from "../shared/db.js";

async function handler(req: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  try {
  const zipCode = req.params.zipCode;
  if (!zipCode) {
    return { status: 400, jsonBody: { error: "zipCode is required" } };
  }

  // Property stats
  const [propertyStats] = await query(
    `SELECT
       COUNT(*) AS total_properties,
       SUM(CASE WHEN category_code_description LIKE '%VACANT%' THEN 1 ELSE 0 END) AS vacant_properties,
       SUM(CASE WHEN category_code_description = 'SINGLE FAMILY' THEN 1 ELSE 0 END) AS single_family,
       SUM(CASE WHEN category_code_description = 'MULTI FAMILY' THEN 1 ELSE 0 END) AS multi_family,
       SUM(CASE WHEN category_code_description = 'COMMERCIAL' THEN 1 ELSE 0 END) AS commercial,
       AVG(market_value) AS avg_market_value,
       SUM(market_value) AS total_market_value,
       SUM(CASE WHEN homestead_exemption = 0 THEN 1 ELSE 0 END) AS non_owner_occupied
     FROM opa_properties
     WHERE zip_code LIKE @zip`,
    { zip: `${zipCode}%` }
  );

  // Violation stats
  const [violationStats] = await query(
    `SELECT
       COUNT(*) AS total_investigations,
       SUM(CASE WHEN investigationstatus = 'FAILED' THEN 1 ELSE 0 END) AS failed_investigations,
       SUM(CASE WHEN investigationstatus = 'PASSED' THEN 1 ELSE 0 END) AS passed_investigations
     FROM case_investigations
     WHERE zip LIKE @zip`,
    { zip: `${zipCode}%` }
  );

  // Demolition stats
  const [demoStats] = await query(
    `SELECT
       COUNT(*) AS total_demolitions,
       SUM(CASE WHEN city_demo = 'YES' THEN 1 ELSE 0 END) AS city_initiated_demolitions
     FROM demolitions
     WHERE zip LIKE @zip`,
    { zip: `${zipCode}%` }
  );

  // Business license stats
  const [licenseStats] = await query(
    `SELECT
       COUNT(*) AS total_licenses,
       SUM(CASE WHEN licensetype = 'Rental' THEN 1 ELSE 0 END) AS rental_licenses,
       SUM(CASE WHEN licensetype LIKE '%Vacant%' THEN 1 ELSE 0 END) AS vacant_licenses
     FROM business_licenses
     WHERE zip LIKE @zip`,
    { zip: `${zipCode}%` }
  );

  // Transfer stats
  const [transferStats] = await query(
    `SELECT
       COUNT(*) AS total_transfers,
       SUM(CASE WHEN document_type LIKE '%SHERIFF%' THEN 1 ELSE 0 END) AS sheriff_sales,
       SUM(CASE WHEN total_consideration <= 1 AND document_type LIKE 'DEED%' THEN 1 ELSE 0 END) AS dollar_transfers,
       AVG(CASE WHEN total_consideration > 0 THEN total_consideration END) AS avg_sale_price
     FROM rtt_summary
     WHERE zip_code LIKE @zip`,
    { zip: `${zipCode}%` }
  );

  // Top owners in this zip
  const topOwners = await query(
    `SELECT TOP 10
       owner_1,
       COUNT(*) AS property_count,
       SUM(market_value) AS total_value
     FROM opa_properties
     WHERE zip_code LIKE @zip AND owner_1 IS NOT NULL
     GROUP BY owner_1
     ORDER BY COUNT(*) DESC`,
    { zip: `${zipCode}%` }
  );

  return {
    jsonBody: {
      zip_code: zipCode,
      property_stats: propertyStats,
      violation_stats: violationStats,
      demolition_stats: demoStats,
      license_stats: licenseStats,
      transfer_stats: transferStats,
      top_owners: topOwners,
    },
  };
  } catch (err: any) {
    return { status: 500, jsonBody: { error: err.message, stack: err.stack } };
  }
}

app.http("getAreaStats", {
  methods: ["GET"],
  authLevel: "function",
  route: "stats/zip/{zipCode}",
  handler,
});
