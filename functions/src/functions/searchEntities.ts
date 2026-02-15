import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { query } from "../shared/db.js";

interface EntityResult {
  master_entity_id: string;
  name_text: string;
  property_count: number;
}

async function handler(req: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  try {
  const body = (await req.json()) as { name: string; limit?: number };
  const name = body.name?.trim();
  if (!name) {
    return { status: 400, jsonBody: { error: "name is required" } };
  }

  const limit = Math.min(body.limit ?? 50, 200);
  const pattern = `%${name.toUpperCase()}%`;

  const rows = await query<EntityResult>(
    `SELECT TOP (@limit)
       e.master_entity_id,
       e.name_text,
       (SELECT COUNT(DISTINCT ea.parcel_number)
        FROM master_entity_address ea
        WHERE ea.master_entity_id = e.master_entity_id) AS property_count
     FROM master_entity e
     WHERE e.name_text LIKE @pattern
     ORDER BY property_count DESC`,
    { pattern, limit }
  );

  return { jsonBody: { results: rows, count: rows.length } };
  } catch (err: any) {
    return { status: 500, jsonBody: { error: err.message, stack: err.stack } };
  }
}

app.http("searchEntities", {
  methods: ["POST"],
  authLevel: "function",
  route: "search-entities",
  handler,
});
