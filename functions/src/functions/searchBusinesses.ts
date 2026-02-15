import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { query } from "../shared/db.js";

async function handler(req: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  try {
  const body = (await req.json()) as {
    keyword?: string;
    licensetype?: string;
    zip?: string;
    limit?: number;
  };

  const limit = Math.min(body.limit ?? 50, 200);
  const conditions: string[] = [];
  const params: Record<string, unknown> = { limit };

  if (body.keyword) {
    conditions.push(
      "(UPPER(bl.business_name) LIKE @keyword OR UPPER(bl.legalname) LIKE @keyword)"
    );
    params.keyword = `%${body.keyword.toUpperCase()}%`;
  }

  if (body.licensetype) {
    conditions.push("UPPER(bl.licensetype) LIKE @licensetype");
    params.licensetype = `%${body.licensetype.toUpperCase()}%`;
  }

  if (body.zip) {
    conditions.push("bl.zip LIKE @zip");
    params.zip = `${body.zip}%`;
  }

  if (conditions.length === 0) {
    return { status: 400, jsonBody: { error: "At least one search parameter is required" } };
  }

  const where = conditions.join(" AND ");

  const rows = await query(
    `SELECT TOP (@limit)
       bl.licensenum, bl.licensetype, bl.licensestatus, bl.business_name,
       bl.legalname, bl.address, bl.opa_account_num, bl.opa_owner,
       bl.rentalcategory, bl.numberofunits, bl.owneroccupied,
       bl.ownercontact1name, bl.ownercontact1state, bl.zip, bl.censustract
     FROM business_licenses bl
     WHERE ${where}
     ORDER BY bl.business_name`,
    params
  );

  // Also search commercial activity licenses
  const calConditions: string[] = [];
  const calParams: Record<string, unknown> = { limit };

  if (body.keyword) {
    calConditions.push("UPPER(cal.companyname) LIKE @keyword");
    calParams.keyword = `%${body.keyword.toUpperCase()}%`;
  }

  let calRows: Record<string, unknown>[] = [];
  if (calConditions.length > 0) {
    const calWhere = calConditions.join(" AND ");
    calRows = await query(
      `SELECT TOP (@limit)
         cal.licensenum, cal.companyname, cal.licensestatus, cal.licensetype,
         cal.revenuecode, cal.issuedate,
         cal.ownercontact1name, cal.ownercontact1state
       FROM commercial_activity_licenses cal
       WHERE ${calWhere}
       ORDER BY cal.companyname`,
      calParams
    );
  }

  return {
    jsonBody: {
      business_licenses: rows,
      commercial_activity_licenses: calRows,
      business_license_count: rows.length,
      commercial_activity_count: calRows.length,
    },
  };
  } catch (err: any) {
    return { status: 500, jsonBody: { error: err.message, stack: err.stack } };
  }
}

app.http("searchBusinesses", {
  methods: ["POST"],
  authLevel: "function",
  route: "search-businesses",
  handler,
});
