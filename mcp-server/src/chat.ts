/**
 * Chat endpoint — bridges the SPA to Azure OpenAI with tool calling.
 * The LLM decides which APIM tools to call based on the user's natural language prompt.
 */

import { AzureOpenAI } from "openai";
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
import type { ChatCompletionTool, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import * as api from "./apim-client.js";

const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT ?? "https://foundry-og-agents.cognitiveservices.azure.com/";
const DEFAULT_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-4.1";
const AZURE_OPENAI_API_VERSION = "2025-01-01-preview";

// Available model deployments — deployment name must match what's deployed on the Azure OpenAI resource
const AVAILABLE_MODELS: Array<{ id: string; label: string; description: string }> = [
  { id: "gpt-4.1", label: "GPT-4.1", description: "Best for complex investigations" },
  { id: "gpt-5", label: "GPT-5", description: "Latest flagship model" },
  { id: "gpt-5-mini", label: "GPT-5 Mini", description: "Fast and capable" },
  { id: "o4-mini", label: "o4-mini", description: "Reasoning model, efficient" },
  { id: "o3-mini", label: "o3-mini", description: "Reasoning model, compact" },
  { id: "Phi-4", label: "Phi-4", description: "Microsoft SLM, lightweight" },
];

let clientInstance: AzureOpenAI | null = null;

function getClient(): AzureOpenAI {
  if (!clientInstance) {
    const credential = new DefaultAzureCredential();
    const tokenProvider = getBearerTokenProvider(credential, "https://cognitiveservices.azure.com/.default");
    clientInstance = new AzureOpenAI({
      azureADTokenProvider: tokenProvider,
      endpoint: AZURE_OPENAI_ENDPOINT,
      apiVersion: AZURE_OPENAI_API_VERSION,
      deployment: DEFAULT_DEPLOYMENT,
    });
  }
  return clientInstance;
}

const SYSTEM_PROMPT = `You are an investigative analyst specializing in Philadelphia property data. You have access to tools that query a database of ~29 million rows covering property ownership networks, code violations, demolitions, business licenses, and tax assessments.

Use these tools to identify patterns of neglect, exploitative landlords, and poverty profiteering. When answering, cite specific data (parcel numbers, violation counts, addresses). Be thorough — call multiple tools when needed to build a complete picture.

Available data: 584K properties, 2.8M entities, 1.6M code violations, 422K business licenses, 316K appeals, 13.5K demolitions, 6.4M assessment records.`;

// Tool definitions for Azure OpenAI function calling
const TOOLS: ChatCompletionTool[] = [
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
      description: "Execute a custom read-only SQL query against the Philadelphia property database. Must be a SELECT with TOP(n) or OFFSET/FETCH.",
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

// Map tool names to APIM client functions
async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
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

export interface ChatRequest {
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  model?: string;
}

export interface ChatResponse {
  reply: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  model: string;
}

export function getAvailableModels() {
  return AVAILABLE_MODELS;
}

export async function chat(req: ChatRequest): Promise<ChatResponse> {
  const client = getClient();
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  // Resolve deployment — validate against available models, fall back to default
  const requestedModel = req.model || DEFAULT_DEPLOYMENT;
  const deployment = AVAILABLE_MODELS.some(m => m.id === requestedModel)
    ? requestedModel
    : DEFAULT_DEPLOYMENT;

  // Build message history
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  if (req.history) {
    for (const msg of req.history) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  messages.push({ role: "user", content: req.message });

  // Tool-calling loop — allow up to 10 rounds
  for (let i = 0; i < 10; i++) {
    const response = await client.chat.completions.create({
      messages,
      tools: TOOLS,
      model: deployment,
    });

    const choice = response.choices[0];

    if (choice.finish_reason === "tool_calls" && choice.message.tool_calls) {
      // Add assistant message with tool calls
      messages.push(choice.message);

      // Execute each tool call
      for (const tc of choice.message.tool_calls) {
        if (tc.type !== "function") continue;
        const args = JSON.parse(tc.function.arguments);
        toolCalls.push({ name: tc.function.name, args });

        console.log(`  [tool] ${tc.function.name}(${JSON.stringify(args).slice(0, 100)})`);
        const result = await executeTool(tc.function.name, args);

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      }
      // Continue loop — model may want to call more tools
      continue;
    }

    // Model is done — return final response
    return {
      reply: choice.message.content ?? "(no response)",
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      model: deployment,
    };
  }

  return {
    reply: "I've made too many tool calls trying to answer this. Could you ask a more specific question?",
    toolCalls,
    model: deployment,
  };
}
