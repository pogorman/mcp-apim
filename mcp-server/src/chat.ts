/**
 * Chat endpoint — bridges the SPA to Azure OpenAI with tool calling.
 * The LLM decides which APIM tools to call based on the user's natural language prompt.
 */

import { AzureOpenAI } from "openai";
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { SYSTEM_PROMPT, TOOLS, executeTool } from "./tool-executor.js";

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
