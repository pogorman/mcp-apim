import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { query } from "../shared/db.js";

async function handler(req: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  try {
  const parcelNumber = req.params.parcelNumber;
  if (!parcelNumber) {
    return { status: 400, jsonBody: { error: "parcelNumber is required" } };
  }

  // Get property details
  const [property] = await query(
    `SELECT * FROM opa_properties WHERE parcel_number = @parcelNumber`,
    { parcelNumber }
  );

  if (!property) {
    return { status: 404, jsonBody: { error: "Property not found" } };
  }

  // Get latest assessment
  const [assessment] = await query(
    `SELECT TOP 1 * FROM assessments WHERE parcel_number = @parcelNumber ORDER BY year DESC`,
    { parcelNumber }
  );

  // Get counts
  const [counts] = await query(
    `SELECT
       (SELECT COUNT(*) FROM case_investigations WHERE opa_account_num = @pn) AS violation_count,
       (SELECT COUNT(*) FROM case_investigations WHERE opa_account_num = @pn AND investigationstatus = 'FAILED') AS failed_count,
       (SELECT COUNT(*) FROM demolitions WHERE opa_account_num = @pn) AS demolition_count,
       (SELECT COUNT(*) FROM appeals WHERE opa_account_num = @pn) AS appeal_count,
       (SELECT COUNT(*) FROM business_licenses WHERE opa_account_num = @pn) AS license_count,
       (SELECT COUNT(*) FROM rtt_summary WHERE opa_account_num = @pn) AS transfer_count`,
    { pn: parcelNumber }
  );

  // Get active licenses
  const licenses = await query(
    `SELECT licensenum, licensetype, licensestatus, business_name, rentalcategory, numberofunits
     FROM business_licenses
     WHERE opa_account_num = @parcelNumber AND licensestatus = 'Active'`,
    { parcelNumber }
  );

  return {
    jsonBody: {
      property,
      latest_assessment: assessment,
      counts,
      active_licenses: licenses,
    },
  };
  } catch (err: any) {
    return { status: 500, jsonBody: { error: err.message, stack: err.stack } };
  }
}

app.http("getPropertyProfile", {
  methods: ["GET"],
  authLevel: "function",
  route: "properties/{parcelNumber}",
  handler,
});
