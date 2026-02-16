/**
 * Foundry Agent — Assistants API lifecycle.
 * Azure manages the tool-calling loop and threads persist server-side.
 * We just execute tools when the run enters "requires_action" state.
 */

import { AzureOpenAI } from "openai";
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
import { SYSTEM_PROMPT, TOOLS, executeTool } from "./tool-executor.js";

const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT ?? "https://foundry-og-agents.cognitiveservices.azure.com/";
const AZURE_OPENAI_API_VERSION = "2025-01-01-preview";
const AGENT_MODEL = "gpt-5";
const AGENT_NAME = "philly-investigator";

let clientInstance: AzureOpenAI | null = null;
let agentId: string | null = null;

function getClient(): AzureOpenAI {
  if (!clientInstance) {
    const credential = new DefaultAzureCredential();
    const tokenProvider = getBearerTokenProvider(credential, "https://cognitiveservices.azure.com/.default");
    clientInstance = new AzureOpenAI({
      azureADTokenProvider: tokenProvider,
      endpoint: AZURE_OPENAI_ENDPOINT,
      apiVersion: AZURE_OPENAI_API_VERSION,
    });
  }
  return clientInstance;
}

/**
 * Ensure the assistant exists. Searches for an existing one by name,
 * creates it if not found. Caches the ID in memory.
 */
export async function ensureAgent(): Promise<string> {
  if (agentId) return agentId;

  const client = getClient();

  // Search for existing assistant by name
  const list = await client.beta.assistants.list({ limit: 100 });
  for (const assistant of list.data) {
    if (assistant.name === AGENT_NAME) {
      agentId = assistant.id;
      console.log(`[agent] Found existing assistant: ${agentId}`);
      return agentId;
    }
  }

  // Create new assistant with our tools
  const assistant = await client.beta.assistants.create({
    name: AGENT_NAME,
    description: "Investigates poverty profiteering patterns in Philadelphia using 29M rows of public data.",
    model: AGENT_MODEL,
    instructions: SYSTEM_PROMPT,
    tools: TOOLS.filter((t): t is typeof t & { type: "function"; function: object } => t.type === "function")
      .map(t => ({
        type: "function" as const,
        function: t.function,
      })),
    temperature: 0.7,
  });

  agentId = assistant.id;
  console.log(`[agent] Created new assistant: ${agentId}`);
  return agentId;
}

/** Create a new thread. Returns the thread ID. */
export async function createThread(): Promise<string> {
  const client = getClient();
  const thread = await client.beta.threads.create();
  console.log(`[agent] Created thread: ${thread.id}`);
  return thread.id;
}

export interface AgentResponse {
  reply: string;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
}

/** Send a message to a thread and run the assistant. Polls until complete. */
export async function sendMessage(threadId: string, message: string): Promise<AgentResponse> {
  const client = getClient();
  const assistantId = await ensureAgent();
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  // Add the user message to the thread
  await client.beta.threads.messages.create(threadId, {
    role: "user",
    content: message,
  });

  // Create a run
  let run = await client.beta.threads.runs.create(threadId, {
    assistant_id: assistantId,
  });

  console.log(`[agent] Run ${run.id} started (status: ${run.status})`);

  // Poll until terminal state
  while (true) {
    if (run.status === "completed") {
      break;
    }

    if (run.status === "failed") {
      const errorMsg = run.last_error?.message ?? "Unknown error";
      throw new Error(`Agent run failed: ${errorMsg}`);
    }

    if (run.status === "cancelled" || run.status === "expired") {
      throw new Error(`Agent run ${run.status}`);
    }

    if (run.status === "requires_action") {
      const requiredAction = run.required_action;
      if (requiredAction?.type === "submit_tool_outputs") {
        const toolOutputs = [];
        for (const tc of requiredAction.submit_tool_outputs.tool_calls) {
          const args = JSON.parse(tc.function.arguments);
          toolCalls.push({ name: tc.function.name, args });

          console.log(`  [agent-tool] ${tc.function.name}(${JSON.stringify(args).slice(0, 100)})`);
          const result = await executeTool(tc.function.name, args);

          toolOutputs.push({
            tool_call_id: tc.id,
            output: result,
          });
        }

        // Submit tool outputs and get updated run
        run = await client.beta.threads.runs.submitToolOutputs(run.id, {
          thread_id: threadId,
          tool_outputs: toolOutputs,
        });
        console.log(`[agent] Submitted tool outputs (status: ${run.status})`);
        continue;
      }
    }

    // Wait before polling again
    await new Promise(resolve => setTimeout(resolve, 1000));
    run = await client.beta.threads.runs.retrieve(run.id, { thread_id: threadId });
  }

  // Extract the assistant's response from thread messages
  const messages = await client.beta.threads.messages.list(threadId, {
    order: "desc",
    limit: 1,
  });

  let reply = "(no response)";
  const lastMessage = messages.data[0];
  if (lastMessage?.role === "assistant" && lastMessage.content.length > 0) {
    const textBlock = lastMessage.content.find(b => b.type === "text");
    if (textBlock?.type === "text") {
      reply = textBlock.text.value;
    }
  }

  return { reply, toolCalls };
}
