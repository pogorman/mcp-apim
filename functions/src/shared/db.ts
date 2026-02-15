import sql from "mssql";
import { DefaultAzureCredential } from "@azure/identity";

let pool: sql.ConnectionPool | null = null;

async function getAccessToken(): Promise<string> {
  const credential = new DefaultAzureCredential();
  const token = await credential.getToken("https://database.windows.net/.default");
  return token.token;
}

export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool?.connected) return pool;

  const config: sql.config = {
    server: process.env.SQL_SERVER!,
    database: process.env.SQL_DATABASE!,
    options: {
      encrypt: true,
      trustServerCertificate: false,
    },
    authentication: {
      type: "azure-active-directory-access-token",
      options: {
        token: await getAccessToken(),
      },
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
    requestTimeout: 120000,
  };

  pool = await new sql.ConnectionPool(config).connect();
  return pool;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: Record<string, unknown>
): Promise<T[]> {
  const p = await getPool();
  const request = p.request();

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value);
    }
  }

  const result = await request.query(text);
  return result.recordset as T[];
}
