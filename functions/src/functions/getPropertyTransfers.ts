import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { query } from "../shared/db.js";

async function handler(req: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  try {
  const parcelNumber = req.params.parcelNumber;
  if (!parcelNumber) {
    return { status: 400, jsonBody: { error: "parcelNumber is required" } };
  }

  const rows = await query(
    `SELECT objectid, document_id, document_type, display_date, document_date,
            street_address, grantors, grantees,
            total_consideration, cash_consideration, other_consideration,
            assessed_value, fair_market_value, receipt_num, recording_date,
            legal_remarks, discrepancy
     FROM rtt_summary
     WHERE opa_account_num = @parcelNumber
     ORDER BY display_date DESC`,
    { parcelNumber }
  );

  return { jsonBody: { parcel_number: parcelNumber, transfers: rows, count: rows.length } };
  } catch (err: any) {
    return { status: 500, jsonBody: { error: err.message, stack: err.stack } };
  }
}

app.http("getPropertyTransfers", {
  methods: ["GET"],
  authLevel: "function",
  route: "properties/{parcelNumber}/transfers",
  handler,
});
