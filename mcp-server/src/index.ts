import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { registerTools } from "./tools.js";

const transportMode = process.env.MCP_TRANSPORT ?? "stdio";

if (transportMode === "http") {
  const PORT = parseInt(process.env.PORT ?? "8080", 10);
  const app = express();
  app.use(express.json());

  // Health probe for Container Apps
  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  // Session map: session ID -> transport
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  app.post("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    try {
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New session
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports[sid] = transport;
          },
        });
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) delete transports[sid];
        };

        const server = new McpServer({
          name: "philly-poverty-profiteering",
          version: "1.0.0",
        });
        registerTools(server);
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: No valid session ID" },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("Error handling MCP request:", err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  app.get("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  });

  app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`MCP Streamable HTTP server listening on port ${PORT}`);
  });

  process.on("SIGINT", async () => {
    for (const sid of Object.keys(transports)) {
      await transports[sid].close();
      delete transports[sid];
    }
    process.exit(0);
  });
} else {
  // stdio mode (default — Claude Code / Claude Desktop)
  const server = new McpServer({
    name: "philly-poverty-profiteering",
    version: "1.0.0",
  });
  registerTools(server);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
