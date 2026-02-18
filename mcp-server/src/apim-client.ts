/**
 * HTTP client for calling Azure Functions via APIM (or directly).
 */

const BASE_URL = process.env.APIM_BASE_URL ?? process.env.FUNCTION_BASE_URL ?? "http://localhost:7071/api";
const SUBSCRIPTION_KEY = process.env.APIM_SUBSCRIPTION_KEY ?? "";
const FUNCTION_KEY = process.env.FUNCTION_KEY ?? "";

async function request(path: string, options: RequestInit = {}): Promise<unknown> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> ?? {}),
  };

  // APIM subscription key
  if (SUBSCRIPTION_KEY) {
    headers["Ocp-Apim-Subscription-Key"] = SUBSCRIPTION_KEY;
  }

  // Azure Function key (when calling directly, not via APIM)
  if (FUNCTION_KEY && !SUBSCRIPTION_KEY) {
    headers["x-functions-key"] = FUNCTION_KEY;
  }

  const resp = await fetch(url, { ...options, headers });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`API call failed: ${resp.status} ${resp.statusText} - ${text}`);
  }

  return resp.json();
}

export async function searchEntities(name: string, limit?: number): Promise<unknown> {
  return request("/search-entities", {
    method: "POST",
    body: JSON.stringify({ name, limit }),
  });
}

export async function getEntityNetwork(entityId: string): Promise<unknown> {
  return request(`/entities/${entityId}/network`);
}

export async function getPropertyProfile(parcelNumber: string): Promise<unknown> {
  return request(`/properties/${parcelNumber}`);
}

export async function getPropertyViolations(
  parcelNumber: string,
  status?: string,
  offset?: number,
  limit?: number
): Promise<unknown> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (offset) params.set("offset", String(offset));
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  return request(`/properties/${parcelNumber}/violations${qs ? `?${qs}` : ""}`);
}

export async function getPropertyAssessments(parcelNumber: string): Promise<unknown> {
  return request(`/properties/${parcelNumber}/assessments`);
}

export async function getPropertyLicenses(parcelNumber: string): Promise<unknown> {
  return request(`/properties/${parcelNumber}/licenses`);
}

export async function getPropertyAppeals(parcelNumber: string): Promise<unknown> {
  return request(`/properties/${parcelNumber}/appeals`);
}

export async function getPropertyDemolitions(parcelNumber: string): Promise<unknown> {
  return request(`/properties/${parcelNumber}/demolitions`);
}

export async function getPropertyTransfers(parcelNumber: string): Promise<unknown> {
  return request(`/properties/${parcelNumber}/transfers`);
}

export async function searchTransfers(params: {
  grantorGrantee?: string;
  documentType?: string;
  zip?: string;
  minConsideration?: number;
  maxConsideration?: number;
  limit?: number;
}): Promise<unknown> {
  return request("/search-transfers", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function searchBusinesses(params: {
  keyword?: string;
  licensetype?: string;
  zip?: string;
  limit?: number;
}): Promise<unknown> {
  return request("/search-businesses", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function getTopViolators(params?: {
  limit?: number;
  minProperties?: number;
  entityType?: string;
}): Promise<unknown> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.minProperties) qs.set("minProperties", String(params.minProperties));
  if (params?.entityType) qs.set("entityType", params.entityType);
  const q = qs.toString();
  return request(`/stats/top-violators${q ? `?${q}` : ""}`);
}

export async function getAreaStats(zipCode: string): Promise<unknown> {
  return request(`/stats/zip/${zipCode}`);
}

export async function runQuery(sql: string, params?: Record<string, unknown>): Promise<unknown> {
  return request("/query", {
    method: "POST",
    body: JSON.stringify({ sql, params }),
  });
}
