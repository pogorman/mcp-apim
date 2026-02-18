import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as api from "./apim-client.js";

export function registerTools(server: McpServer): void {
  server.tool(
    "search_entities",
    "Search for entities (people, LLCs, corporations) by name. Returns matching entities and how many properties they are linked to. Use this to find a specific owner or LLC.",
    {
      name: z.string().describe("Name or partial name to search for (e.g., 'GEENA LLC', 'WALSH')"),
      limit: z.number().optional().describe("Max results to return (default 50, max 200)"),
    },
    async ({ name, limit }) => {
      const result = await api.searchEntities(name, limit);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_entity_network",
    "Get the full property network for an entity: all linked addresses, parcels, property details, and violation/demolition counts. Use after search_entities to investigate a specific entity.",
    {
      entityId: z.string().describe("The master_entity_id UUID from search_entities results"),
    },
    async ({ entityId }) => {
      const result = await api.getEntityNetwork(entityId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_property_profile",
    "Get complete details for a property by parcel number: ownership, building info, market value, assessment, active licenses, and violation/demolition/appeal counts.",
    {
      parcelNumber: z.string().describe("The OPA parcel number (e.g., '405100505')"),
    },
    async ({ parcelNumber }) => {
      const result = await api.getPropertyProfile(parcelNumber);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_property_violations",
    "Get code enforcement case investigations for a property. Can filter by status (FAILED, PASSED, CLOSED). Supports pagination.",
    {
      parcelNumber: z.string().describe("The OPA parcel number"),
      status: z.string().optional().describe("Filter by investigation status: FAILED, PASSED, CLOSED"),
      offset: z.number().optional().describe("Pagination offset (default 0)"),
      limit: z.number().optional().describe("Results per page (default 100, max 500)"),
    },
    async ({ parcelNumber, status, offset, limit }) => {
      const result = await api.getPropertyViolations(parcelNumber, status, offset, limit);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_property_assessments",
    "Get the assessment history for a property showing market value, taxable amounts, and exemptions by year (2015-2025).",
    {
      parcelNumber: z.string().describe("The OPA parcel number"),
    },
    async ({ parcelNumber }) => {
      const result = await api.getPropertyAssessments(parcelNumber);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_property_licenses",
    "Get all business and commercial activity licenses associated with a property. Shows rental licenses, vacant property licenses, and any commercial operations.",
    {
      parcelNumber: z.string().describe("The OPA parcel number"),
    },
    async ({ parcelNumber }) => {
      const result = await api.getPropertyLicenses(parcelNumber);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_property_appeals",
    "Get all L&I appeals filed for a property. Shows appeal type, status, decision, appellant, and related case files.",
    {
      parcelNumber: z.string().describe("The OPA parcel number"),
    },
    async ({ parcelNumber }) => {
      const result = await api.getPropertyAppeals(parcelNumber);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_property_demolitions",
    "Get demolition records for a property. Shows whether demolition was city-initiated (taxpayer-funded) or owner-initiated, contractor info, and status.",
    {
      parcelNumber: z.string().describe("The OPA parcel number"),
    },
    async ({ parcelNumber }) => {
      const result = await api.getPropertyDemolitions(parcelNumber);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_property_transfers",
    "Get real estate transfer tax records for a property. Shows the complete chain of ownership: who sold to whom, sale prices, document types (DEED, SHERIFF DEED, ASSIGNMENT OF MORTGAGE, etc.), and dates. Critical for detecting $1 transfers (LLC shuffling), sheriff sale purchases, and property flipping.",
    {
      parcelNumber: z.string().describe("The OPA parcel number"),
    },
    async ({ parcelNumber }) => {
      const result = await api.getPropertyTransfers(parcelNumber);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "search_transfers",
    "Search real estate transfer records by grantor/grantee name, document type, zip code, or consideration amount. Use to find $1 transfers (set maxConsideration to 1), sheriff sales (documentType 'SHERIFF'), or all transfers involving a specific entity. Covers 5M+ transfer records.",
    {
      grantorGrantee: z.string().optional().describe("Name to search in both grantor and grantee fields (e.g., 'GEENA LLC', 'ROSS')"),
      documentType: z.string().optional().describe("Document type filter (e.g., 'DEED', 'SHERIFF', 'MORTGAGE')"),
      zip: z.string().optional().describe("Zip code filter (e.g., '19134')"),
      minConsideration: z.number().optional().describe("Minimum total consideration/sale price"),
      maxConsideration: z.number().optional().describe("Maximum total consideration/sale price (use 1 to find $1 transfers)"),
      limit: z.number().optional().describe("Max results (default 50, max 200)"),
    },
    async ({ grantorGrantee, documentType, zip, minConsideration, maxConsideration, limit }) => {
      const result = await api.searchTransfers({ grantorGrantee, documentType, zip, minConsideration, maxConsideration, limit });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "search_businesses",
    "Search business and commercial activity licenses by keyword, type, or zip code. Use to find check cashing, pawn shops, title loans, dollar stores, and other businesses relevant to poverty profiteering.",
    {
      keyword: z.string().optional().describe("Business name keyword (e.g., 'check cashing', 'pawn', 'dollar')"),
      licensetype: z.string().optional().describe("License type filter (e.g., 'Rental', 'Food', 'Vacant')"),
      zip: z.string().optional().describe("Zip code filter (e.g., '19134')"),
      limit: z.number().optional().describe("Max results (default 50, max 200)"),
    },
    async ({ keyword, licensetype, zip, limit }) => {
      const result = await api.searchBusinesses({ keyword, licensetype, zip, limit });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_top_violators",
    "Get the ranked list of property owners with the most code violations across their portfolio. Filters by minimum property count and entity type (LLC vs individual).",
    {
      limit: z.number().optional().describe("Number of results (default 25, max 100)"),
      minProperties: z.number().optional().describe("Minimum properties to qualify (default 5)"),
      entityType: z.string().optional().describe("Filter: 'llc' for corporate entities only, omit for all"),
    },
    async ({ limit, minProperties, entityType }) => {
      const result = await api.getTopViolators({ limit, minProperties, entityType });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_area_stats",
    "Get aggregate statistics for a Philadelphia zip code: property counts, vacancy rates, violation rates, demolitions, license counts, and top property owners.",
    {
      zipCode: z.string().describe("5-digit zip code (e.g., '19134')"),
    },
    async ({ zipCode }) => {
      const result = await api.getAreaStats(zipCode);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "run_query",
    "Execute a custom read-only SQL query against the Philadelphia property database. Must be a SELECT with TOP(n) or OFFSET/FETCH. Available tables: master_entity, master_address, master_entity_address, opa_properties, assessments, business_licenses, commercial_activity_licenses, case_investigations, appeals, demolitions, rtt_summary. Views: vw_entity_properties, vw_property_violation_summary, vw_owner_portfolio.",
    {
      sql: z.string().describe("SQL SELECT query. Must include TOP(n) or OFFSET/FETCH. Max 1000 rows."),
      params: z.record(z.string(), z.unknown()).optional().describe("Optional named parameters for the query"),
    },
    async ({ sql, params }) => {
      const result = await api.runQuery(sql, params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
