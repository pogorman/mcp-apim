/**
 * Shared tool definitions and executor used by both
 * Chat Completions (chat.ts) and Assistants API (foundry-agent.ts).
 */

import type { ChatCompletionTool } from "openai/resources/chat/completions";
import * as api from "./apim-client.js";

export const SYSTEM_PROMPT = `You are an investigative analyst specializing in Philadelphia property data. You have access to tools that query a database of ~34 million rows covering property ownership networks, code violations, demolitions, business licenses, tax assessments, and real estate transfer records.

Use these tools to identify patterns of neglect, exploitative landlords, and poverty profiteering. When answering, cite specific data (parcel numbers, violation counts, addresses). Be thorough — call multiple tools when needed to build a complete picture. Use transfer data to detect $1 transfers (LLC shuffling), sheriff sale purchases, and property flipping.

Available data: 584K properties, 2.8M entities, 1.6M code violations, 422K business licenses, 316K appeals, 13.5K demolitions, 6.4M assessment records, 5M+ real estate transfer records.`;

export const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_entities",
      description: "Search for entities (people, LLCs, corporations) by name. Returns matching entities and how many properties they are linked to.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name or partial name to search for (e.g., 'GEENA LLC', 'WALSH')" },
          limit: { type: "number", description: "Max results to return (default 50, max 200)" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_entity_network",
      description: "Get the full property network for an entity: all linked addresses, parcels, property details, and violation/demolition counts.",
      parameters: {
        type: "object",
        properties: {
          entityId: { type: "string", description: "The master_entity_id UUID from search_entities results" },
        },
        required: ["entityId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_property_profile",
      description: "Get complete details for a property by parcel number: ownership, building info, market value, assessment, active licenses, and violation/demolition/appeal counts.",
      parameters: {
        type: "object",
        properties: {
          parcelNumber: { type: "string", description: "The OPA parcel number (e.g., '405100505')" },
        },
        required: ["parcelNumber"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_property_violations",
      description: "Get code enforcement case investigations for a property. Can filter by status (FAILED, PASSED, CLOSED). Supports pagination.",
      parameters: {
        type: "object",
        properties: {
          parcelNumber: { type: "string", description: "The OPA parcel number" },
          status: { type: "string", description: "Filter by investigation status: FAILED, PASSED, CLOSED" },
          limit: { type: "number", description: "Results per page (default 100, max 500)" },
        },
        required: ["parcelNumber"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_property_assessments",
      description: "Get the assessment history for a property showing market value, taxable amounts, and exemptions by year (2015-2025).",
      parameters: {
        type: "object",
        properties: {
          parcelNumber: { type: "string", description: "The OPA parcel number" },
        },
        required: ["parcelNumber"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_property_licenses",
      description: "Get all business and commercial activity licenses associated with a property.",
      parameters: {
        type: "object",
        properties: {
          parcelNumber: { type: "string", description: "The OPA parcel number" },
        },
        required: ["parcelNumber"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_property_appeals",
      description: "Get all L&I appeals filed for a property. Shows appeal type, status, decision, appellant, and related case files.",
      parameters: {
        type: "object",
        properties: {
          parcelNumber: { type: "string", description: "The OPA parcel number" },
        },
        required: ["parcelNumber"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_property_demolitions",
      description: "Get demolition records for a property. Shows whether demolition was city-initiated (taxpayer-funded) or owner-initiated.",
      parameters: {
        type: "object",
        properties: {
          parcelNumber: { type: "string", description: "The OPA parcel number" },
        },
        required: ["parcelNumber"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_property_transfers",
      description: "Get real estate transfer tax records for a property. Shows chain of ownership: sale prices, document types (DEED, SHERIFF DEED, MORTGAGE), grantors, grantees, and dates.",
      parameters: {
        type: "object",
        properties: {
          parcelNumber: { type: "string", description: "The OPA parcel number" },
        },
        required: ["parcelNumber"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_transfers",
      description: "Search real estate transfer records by grantor/grantee name, document type, zip code, or consideration amount. Find $1 transfers (maxConsideration=1), sheriff sales (documentType='SHERIFF'), or all transfers for an entity.",
      parameters: {
        type: "object",
        properties: {
          grantorGrantee: { type: "string", description: "Name to search in grantor and grantee fields (e.g., 'GEENA LLC')" },
          documentType: { type: "string", description: "Document type filter (e.g., 'DEED', 'SHERIFF', 'MORTGAGE')" },
          zip: { type: "string", description: "Zip code filter (e.g., '19134')" },
          minConsideration: { type: "number", description: "Minimum total consideration/sale price" },
          maxConsideration: { type: "number", description: "Maximum total consideration (use 1 to find $1 transfers)" },
          limit: { type: "number", description: "Max results (default 50, max 200)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_businesses",
      description: "Search business and commercial activity licenses by keyword, type, or zip code. Use to find check cashing, pawn shops, title loans, dollar stores, and other businesses.",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "Business name keyword (e.g., 'check cashing', 'pawn', 'dollar')" },
          licensetype: { type: "string", description: "License type filter (e.g., 'Rental', 'Food', 'Vacant')" },
          zip: { type: "string", description: "Zip code filter (e.g., '19134')" },
          limit: { type: "number", description: "Max results (default 50, max 200)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_violators",
      description: "Get the ranked list of property owners with the most code violations across their portfolio.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of results (default 25, max 100)" },
          minProperties: { type: "number", description: "Minimum properties to qualify (default 5)" },
          entityType: { type: "string", description: "Filter: 'llc' for corporate entities only, omit for all" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_area_stats",
      description: "Get aggregate statistics for a Philadelphia zip code: property counts, vacancy rates, violation rates, demolitions, license counts, and top property owners.",
      parameters: {
        type: "object",
        properties: {
          zipCode: { type: "string", description: "5-digit zip code (e.g., '19134')" },
        },
        required: ["zipCode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_query",
      description: "Execute a custom read-only SQL query. Tables: master_entity, master_address, master_entity_address, opa_properties, assessments, business_licenses, commercial_activity_licenses, case_investigations, appeals, demolitions, rtt_summary. IMPORTANT: For transfer/sale data use search_transfers or get_property_transfers tools instead — they are faster and easier. Only use run_query for queries those tools cannot answer.",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "SQL SELECT query. Must include TOP(n) or OFFSET/FETCH. Max 1000 rows." },
        },
        required: ["sql"],
      },
    },
  },
];

/** Execute a tool by name, calling the corresponding APIM client function. */
export async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    let result: unknown;
    switch (name) {
      case "search_entities":
        result = await api.searchEntities(args.name as string, args.limit as number | undefined);
        break;
      case "get_entity_network":
        result = await api.getEntityNetwork(args.entityId as string);
        break;
      case "get_property_profile":
        result = await api.getPropertyProfile(args.parcelNumber as string);
        break;
      case "get_property_violations":
        result = await api.getPropertyViolations(args.parcelNumber as string, args.status as string | undefined, undefined, args.limit as number | undefined);
        break;
      case "get_property_assessments":
        result = await api.getPropertyAssessments(args.parcelNumber as string);
        break;
      case "get_property_licenses":
        result = await api.getPropertyLicenses(args.parcelNumber as string);
        break;
      case "get_property_appeals":
        result = await api.getPropertyAppeals(args.parcelNumber as string);
        break;
      case "get_property_demolitions":
        result = await api.getPropertyDemolitions(args.parcelNumber as string);
        break;
      case "get_property_transfers":
        result = await api.getPropertyTransfers(args.parcelNumber as string);
        break;
      case "search_transfers":
        result = await api.searchTransfers(args as {
          grantorGrantee?: string; documentType?: string; zip?: string;
          minConsideration?: number; maxConsideration?: number; limit?: number;
        });
        break;
      case "search_businesses":
        result = await api.searchBusinesses(args as { keyword?: string; licensetype?: string; zip?: string; limit?: number });
        break;
      case "get_top_violators":
        result = await api.getTopViolators(args as { limit?: number; minProperties?: number; entityType?: string });
        break;
      case "get_area_stats":
        result = await api.getAreaStats(args.zipCode as string);
        break;
      case "run_query":
        result = await api.runQuery(args.sql as string, args.params as Record<string, unknown> | undefined);
        break;
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
    return JSON.stringify(result);
  } catch (err) {
    return JSON.stringify({ error: String(err) });
  }
}
