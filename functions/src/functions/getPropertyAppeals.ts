import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { query } from "../shared/db.js";

async function handler(req: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  try {
  const parcelNumber = req.params.parcelNumber;
  if (!parcelNumber) {
    return { status: 400, jsonBody: { error: "parcelNumber is required" } };
  }

  const rows = await query(
    `SELECT appealnumber, appealtype, appealstatus, decision, appealgrounds,
            primaryappellant, appellanttype, proviso,
            createddate, scheduleddate, decisiondate, completeddate,
            relatedcasefile, relatedpermit, address
     FROM appeals
     WHERE opa_account_num = @parcelNumber
     ORDER BY createddate DESC`,
    { parcelNumber }
  );

  return { jsonBody: { parcel_number: parcelNumber, appeals: rows, count: rows.length } };
  } catch (err: any) {
    return { status: 500, jsonBody: { error: err.message, stack: err.stack } };
  }
}

app.http("getPropertyAppeals", {
  methods: ["GET"],
  authLevel: "function",
  route: "properties/{parcelNumber}/appeals",
  handler,
});
