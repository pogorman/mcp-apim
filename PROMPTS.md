# Prompts Used

User prompts from each session of building this project, reconstructed from session logs and conversation context. Prompts from sessions 1-6 are summarized (exact wording not preserved); sessions 7+ are closer to verbatim.

---

## Session 1 — Project Setup & Planning

- Initial project briefing describing the goal: build an MCP server for investigating poverty profiteering in Philadelphia, using public property data from davew-msft/PhillyStats
- Architecture discussion: MCP Server → APIM → Azure Functions → Azure SQL
- Requested a 6-step implementation plan

## Session 2 — SQL Schema & Infrastructure

- "Create the SQL schema for all 10 tables based on the PhillyStats CSV headers"
- "Add views for entity-property lookups, violation summaries, and owner portfolios"
- "Create the Azure infrastructure — resource group, SQL server, database, storage, function app, APIM"
- "Load the CSV data into the database" (led to multiple iterations: bcp, Python, Node.js)
- Debugging CSV parsing issues with backslash-escaped quotes and unescaped mid-field quotes

## Session 3 — Azure Functions

- "Create all 12 Azure Functions for the API endpoints"
- "Create a shared database module using mssql with Azure AD auth"
- Discussion of each endpoint's query logic, particularly getTopViolators and searchEntities performance

## Session 4 — MCP Server

- "Create the MCP server with stdio transport and 12 tool definitions"
- "Each tool should map to one Azure Function endpoint"
- "Add the APIM client that injects the subscription key header"
- "Create the .mcp.json config for Claude Code"

## Session 5 — Deployment & Debugging

- "Deploy the functions to Azure"
- "All APIM endpoints are returning 404 — figure out why" (led to npm workspace hoisting discovery)
- "The queries are timing out" (led to CTE refactoring of getTopViolators and searchEntities)
- "Create the APIM operations and policy to inject the function key"
- Multiple rounds of debugging: staging directory pattern, zip deployment, MSYS path conversion

## Session 6 — Documentation & Git

- "Create CLAUDE.md, USAGE.md, and SESSION_LOG.md"
- "Set up the git repo and push to GitHub"
- "Test all endpoints to make sure everything still works"
- "Do a cost review — what are we paying for when idle?"
- Discussion of Copilot Studio integration options (stdio vs HTTP transport, MCP vs direct APIM connector)
- "Create ARCHITECTURE.md with full technical reference — schema, API specs, ERD, everything"
- "Update all root md files with the Copilot Studio research"

## Session 7 — Streamable HTTP, Container App, Foundry Agent

- "Can you check out where we left off and get busy again on the tasks?" (resuming after context window cut-off)
- Plan approval: add HTTP transport, containerize, deploy Container App, create Foundry agent
- "Continue from where you left off" (after brief pause)
- Debugging APIM path mismatch (`/api` vs `/philly`), MCAPS blocking storage/SQL public access
- End-to-end verification of Container App → APIM → Functions → SQL chain

## Session 8 — Documentation & SPA

- "Here are some things we need next:
  - Update all root md's, including any architectural diagrams
  - README.md so the root of the GitHub repo has a nice to read doc. Probably can use a bunch of content we already have but maybe clean it up a bit so it looks better for a home page readme
  - New md for all commands that have been used, e.g. bash, curl, etc, and a very short description of what they did. This will be another root md that I want to keep updated.
  - Front-end test harness SPA that shows and allows me to interact with the agent and really nothing else right now except maybe some text that describes what the page is for. We will build this out more later but for now I just want to be able to test the agent in a live web page.
  - Do you have access to all prompts I've used since we started this project? I would like another md called PROMPTS that contains those if possible."

## Session 9 — Azure AI Foundry, Chat Endpoint, Chat SPA

- "can we deploy the spa to azure? i'd like to use it from a remote web server, not local"
- "i already have a custom domain and spa being hosted in azure. can i use that same custom domain, but add a subdomain like /povertyprofiteering and not mess up my other azure hosted spa even though they are in different app services?"
- "ok but what's the link i can use now"
- "help me understand. this spa only has the ability to use the specific tools in the mcp. they are very specific requiring a parcel number, exact sql query, name, but no where for me to just run a prompt where the agent will figure out how to best answer the question using all the data it's grounded in, along with the tools. i also don't see an agent in azure. i thought i would see a foundry project and agent or something like that."
- "i have an existing foundy project... can we use that or should we start from scratch"
- Plan approval: create Foundry Hub/Project, add /chat endpoint with Azure OpenAI tool calling, rebuild SPA as chat interface

## Session 10 — Documentation Deep-Dive, Dual-Panel SPA

- "when updating the architecture document, please make sure to really explain what's going on with the container(s). i'm new to containers but don't necessarily need things dumbed down. just need to understand that basics to the specifics. i also want you to go into detail on the agent and how it works when presented with specific questions. when does it use just the llm if ever, or just the mcp server if ever. the spa that had just the mcp tool interface... i still want that but as a separate page just so i can show the very specific tools the mcp server exposes. am i saying that right? maybe have the investigative agent as one view accessible by a left hand nav icon, and then the mcp tool interface as another. it would be nice to be able to have them both open at the same time, side by side like vertical tabs where when i close one the remaining open one takes up the space the other one once occupied. finally make sure the latest is deployed to azure prod, update all our root files, and push everything to github repo"

---

## Example Analysis Prompts (for use with the connected agent)

These are prompts for use with Claude or any MCP-connected agent once the tools are available:

- "Who are the top 10 worst property owners in Philadelphia by code violations?"
- "Tell me about GEENA LLC — how many properties do they own and how many violations?"
- "What check cashing businesses operate in zip code 19134?"
- "Show me the assessment trend for parcel 405100505 over the last 10 years"
- "Which zip codes have the highest vacancy and violation rates?"
- "Find LLCs that own more than 50 properties and have demolition records"
- "What properties at 19134 have both vacant land licenses and failed inspections?"
- "Deep dive on 2837 Kensington Ave — who owns it, what violations, any demolitions?"
- "Who are the top violators that are LLCs specifically, not government entities?"
- "Compare violation rates between zip codes 19134 and 19140"
