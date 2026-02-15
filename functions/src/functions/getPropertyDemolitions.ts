import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { query } from "../shared/db.js";

async function handler(req: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  try {
  const parcelNumber = req.params.parcelNumber;
  if (!parcelNumber) {
    return { status: 400, jsonBody: { error: "parcelNumber is required" } };
  }

  const rows = await query(
    `SELECT objectid, caseorpermitnumber, applicantname, applicanttype,
            city_demo, typeofwork, typeofworkdescription, status,
            contractorname, start_date, completed_date, address, opa_owner
     FROM demolitions
     WHERE opa_account_num = @parcelNumber
     ORDER BY start_date DESC`,
    { parcelNumber }
  );

  return { jsonBody: { parcel_number: parcelNumber, demolitions: rows, count: rows.length } };
  } catch (err: any) {
    return { status: 500, jsonBody: { error: err.message, stack: err.stack } };
  }
}

app.http("getPropertyDemolitions", {
  methods: ["GET"],
  authLevel: "function",
  route: "properties/{parcelNumber}/demolitions",
  handler,
});
