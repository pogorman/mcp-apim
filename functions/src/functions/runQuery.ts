import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { query } from "../shared/db.js";

async function handler(req: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  try {
  const body = (await req.json()) as { sql: string; params?: Record<string, unknown> };
  const sql = body.sql?.trim();

  if (!sql) {
    return { status: 400, jsonBody: { error: "sql is required" } };
  }

  // Safety: only allow SELECT statements
  const normalized = sql.toUpperCase().replace(/\s+/g, " ").trim();
  if (!normalized.startsWith("SELECT")) {
    return { status: 400, jsonBody: { error: "Only SELECT statements are allowed" } };
  }

  // Block dangerous keywords
  const blocked = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE", "EXEC", "EXECUTE", "XP_", "SP_"];
  for (const kw of blocked) {
    if (normalized.includes(kw)) {
      return { status: 400, jsonBody: { error: `Statement contains blocked keyword: ${kw}` } };
    }
  }

  // Enforce TOP/FETCH limit to prevent huge result sets
  if (!normalized.includes("TOP") && !normalized.includes("FETCH")) {
    return {
      status: 400,
      jsonBody: { error: "Query must include TOP(n) or OFFSET/FETCH to limit results. Max 1000 rows." },
    };
  }

  const rows = await query(sql, body.params ?? {});

  return {
    jsonBody: {
      results: rows,
      count: rows.length,
    },
  };
  } catch (err: any) {
    return { status: 500, jsonBody: { error: err.message, stack: err.stack } };
  }
}

app.http("runQuery", {
  methods: ["POST"],
  authLevel: "function",
  route: "query",
  handler,
});
