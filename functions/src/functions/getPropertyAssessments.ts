import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { query } from "../shared/db.js";

async function handler(req: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  try {
  const parcelNumber = req.params.parcelNumber;
  if (!parcelNumber) {
    return { status: 400, jsonBody: { error: "parcelNumber is required" } };
  }

  const rows = await query(
    `SELECT year, market_value, taxable_building, taxable_land, exempt_building, exempt_land
     FROM assessments
     WHERE parcel_number = @parcelNumber
     ORDER BY year ASC`,
    { parcelNumber }
  );

  return { jsonBody: { parcel_number: parcelNumber, assessments: rows } };
  } catch (err: any) {
    return { status: 500, jsonBody: { error: err.message, stack: err.stack } };
  }
}

app.http("getPropertyAssessments", {
  methods: ["GET"],
  authLevel: "function",
  route: "properties/{parcelNumber}/assessments",
  handler,
});
