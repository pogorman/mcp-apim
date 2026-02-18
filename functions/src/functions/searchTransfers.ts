import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { query } from "../shared/db.js";

async function handler(req: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  try {
  const body = (await req.json()) as {
    grantorGrantee?: string;
    documentType?: string;
    zip?: string;
    minConsideration?: number;
    maxConsideration?: number;
    limit?: number;
  };

  const limit = Math.min(body.limit ?? 50, 200);
  const conditions: string[] = [];
  const params: Record<string, unknown> = { limit };

  if (body.grantorGrantee) {
    conditions.push(
      "(UPPER(grantors) LIKE @name OR UPPER(grantees) LIKE @name)"
    );
    params.name = `%${body.grantorGrantee.toUpperCase()}%`;
  }

  if (body.documentType) {
    conditions.push("UPPER(document_type) LIKE @docType");
    params.docType = `%${body.documentType.toUpperCase()}%`;
  }

  if (body.zip) {
    conditions.push("zip_code LIKE @zip");
    params.zip = `${body.zip}%`;
  }

  if (body.maxConsideration !== undefined) {
    conditions.push("total_consideration <= @maxConsideration");
    params.maxConsideration = body.maxConsideration;
  }

  if (body.minConsideration !== undefined) {
    conditions.push("total_consideration >= @minConsideration");
    params.minConsideration = body.minConsideration;
  }

  if (conditions.length === 0) {
    return { status: 400, jsonBody: { error: "At least one search parameter is required" } };
  }

  const where = conditions.join(" AND ");

  const rows = await query(
    `SELECT TOP (@limit)
       objectid, document_id, document_type, display_date, document_date,
       street_address, zip_code, grantors, grantees,
       total_consideration, cash_consideration, assessed_value,
       fair_market_value, opa_account_num, recording_date
     FROM rtt_summary
     WHERE ${where}
     ORDER BY display_date DESC`,
    params
  );

  return { jsonBody: { transfers: rows, count: rows.length } };
  } catch (err: any) {
    return { status: 500, jsonBody: { error: err.message, stack: err.stack } };
  }
}

app.http("searchTransfers", {
  methods: ["POST"],
  authLevel: "function",
  route: "search-transfers",
  handler,
});
