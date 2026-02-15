import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { query } from "../shared/db.js";

async function handler(req: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  try {
  const parcelNumber = req.params.parcelNumber;
  if (!parcelNumber) {
    return { status: 400, jsonBody: { error: "parcelNumber is required" } };
  }

  const offset = parseInt(req.query.get("offset") ?? "0");
  const limit = Math.min(parseInt(req.query.get("limit") ?? "100"), 500);
  const statusFilter = req.query.get("status"); // e.g., "FAILED"

  let sql = `SELECT objectid, casenumber, casetype, casepriority, caseresponsibility,
                    investigationstatus, investigationcompleted, address, opa_owner
             FROM case_investigations
             WHERE opa_account_num = @parcelNumber`;

  const params: Record<string, unknown> = { parcelNumber };

  if (statusFilter) {
    sql += ` AND investigationstatus = @status`;
    params.status = statusFilter;
  }

  sql += ` ORDER BY investigationcompleted DESC
           OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;
  params.offset = offset;
  params.limit = limit;

  const rows = await query(sql, params);

  // Get total count
  let countSql = `SELECT COUNT(*) AS total FROM case_investigations WHERE opa_account_num = @parcelNumber`;
  const countParams: Record<string, unknown> = { parcelNumber };
  if (statusFilter) {
    countSql += ` AND investigationstatus = @status`;
    countParams.status = statusFilter;
  }
  const [{ total }] = await query<{ total: number }>(countSql, countParams);

  return {
    jsonBody: { results: rows, total, offset, limit },
  };
  } catch (err: any) {
    return { status: 500, jsonBody: { error: err.message, stack: err.stack } };
  }
}

app.http("getPropertyViolations", {
  methods: ["GET"],
  authLevel: "function",
  route: "properties/{parcelNumber}/violations",
  handler,
});
