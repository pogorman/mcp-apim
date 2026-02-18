# Prompts Used

User prompts from each session of building this project, reconstructed from session logs and conversation context. Prompts from sessions 1-6 are summarized (exact wording not preserved); sessions 7+ are closer to verbatim.

---

## Table of Contents

- [Session 1 — Project Setup & Planning](#session-1--project-setup--planning)
- [Session 2 — SQL Schema & Infrastructure](#session-2--sql-schema--infrastructure)
- [Session 3 — Azure Functions](#session-3--azure-functions)
- [Session 4 — MCP Server](#session-4--mcp-server)
- [Session 5 — Deployment & Debugging](#session-5--deployment--debugging)
- [Session 6 — Documentation & Git](#session-6--documentation--git)
- [Session 7 — Streamable HTTP, Container App, Foundry Agent](#session-7--streamable-http-container-app-foundry-agent)
- [Session 8 — Documentation & SPA](#session-8--documentation--spa)
- [Session 9 — Azure AI Foundry, Chat Endpoint, Chat SPA](#session-9--azure-ai-foundry-chat-endpoint-chat-spa)
- [Session 10 — Documentation Deep-Dive, Dual-Panel SPA](#session-10--documentation-deep-dive-dual-panel-spa)
- [Session 11 — Model Selector, AI Foundry Fix](#session-11--model-selector-ai-foundry-fix)
- [Session 12 — Documentation, Foundry Deep-Dive, FAQ](#session-12--documentation-foundry-deep-dive-faq)
- [Session 13 — City Portal + Foundry Agent](#session-13--city-portal--foundry-agent)
- [Session 14 — UI Polish, Copilot Studio, Docs Reorganization](#session-14--ui-polish-copilot-studio-docs-reorganization)
- [Session 15 — Copilot Studio Panel, User Guide, Wake-Up Script](#session-15--copilot-studio-panel-user-guide-wake-up-script)
- [Session 16 — ELI5 Documentation](#session-16--eli5-documentation)
- [Session 17 — Foundry Agent Fix, Token Docs](#session-17--foundry-agent-fix-token-docs)
- [Session 18 — Authentication, Docs Panel, Background Image](#session-18--authentication-docs-panel-background-image)
- [Session 19 — SK Agent, Bicep IaC, MCAPS Fix](#session-19--sk-agent-bicep-iac-mcaps-fix)
- [Session 20 — SK Agent UX, SQL Bug Fix](#session-20--sk-agent-ux-sql-bug-fix)
- [Session 21 — VNet + Private Endpoints, Function App Fix](#session-21--vnet--private-endpoints-function-app-fix)
- [Session 22-25 — SPA Polish, Slides, M365 Agent](#sessions-22-25--spa-polish-slides-m365-agent)
- [Session 26 — V2: Real Estate Transfer Data (The Game Changer)](#session-26--v2-real-estate-transfer-data-the-game-changer)
- [Example Analysis Prompts](#example-analysis-prompts-for-use-with-the-connected-agent)
- [NEW! Transfer Data Prompts (V2)](#new-transfer-data-prompts-v2)

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

## Session 11 — Model Selector, AI Foundry Fix

- "is there a reason i can't open the azure foundry project? i get this error Error loading Azure AI hub You are attempting to access a restricted resource from an unauthorized network location. Please contact your administrator or follow the troubleshooting instructions"
- "i would like to change the model, or at least have the option to use other models. like o4 mini, gpt 5.2, and phi-4.... there should be a dropdown where the model is currently displayed in the web page that allows me to choose"

## Session 12 — Documentation, Foundry Deep-Dive, FAQ

- "were you able to recover those jupityr notebook files from my colleague? there were 3 of them i think. it would be great to have those and save them in a folder called jupyter-notebooks ... they are on this repo https://github.com/davew-msft/PhillyStats/tree/main"
- "push everything to git"
- "are the resource groups and all azure resources listed in the architecture document? just checking."
- "put in some clarification around the rg-foundry resource group, including what is specifically being used in that resource group so i can maybe clean up some stuff that isn't being used."
- "ok...lets take another shot at the readme now. the opening line says it's an mcp server... but it's so much more. let's start the readme out with an executive summary, then a highlevel architecture diagram, then all the other content. just make sure all the other content is current."
- "push everything to git"
- "i'm still getting this error when i try to look at the agent in azure. Error loading Microsoft Foundry project You are attempting to access a restricted resource from an unauthorized network location. am i looking in the right place? do we need to add my ip address somewhere?"
- "the account we're using is azure admin... or is there a higher azure admin for our dev tenants"
- "can you teach me a few things about managing it from the cli? like even simple things like just seeing its name and setting its instructions and description. i can't see any of that"
- "let's create a cli cheat sheet md for my root."
- "can you explain why i can open the default foundry-deployments project no problem...but i can't open philly-profiteering foundry project"
- "you mentioned in my philly profiteering foundry project there were no agents. if there are no agents how am i asking the model/deployment questions using the spa investigative agent? what is the investigative agent if not an agent in azure?"
- "it would be great to capture all these q and a's in an md"
- "in the world of ai agents today, are people building tools like we built or do they specifically build agents. or does it depend? and if so on what? what are the pros and cons to each approach?"
- "make sure all this is in the appropriate mds.... then push everything to github and i'm gonna take a break. nice job!"

## Session 13 — City Portal + Foundry Agent

- "i want to keep everything as is with respect to what we have. but now i want to add an agent in foundry for no other reason than to demonstrate to my colleagues the different clients/agents a mcp/apim set up can have. i would like this to be a 3rd 'tab' if you will on the spa web weve built...make it look like a cool simple web page for the city of philadelphia...but then host the new foundry agent as a floater icon in the bottom right that i can click and launch the agent. this should tie right into what we have now w the investigative agent. does that make sense?"
- "awesome, update your root files and push to git"

## Session 14 — UI Polish, Copilot Studio, Docs Reorganization

- "on the portal page i still see the selector for the model. does that not apply to the philly-investigator agent? if not can we at least update the philly-investigator agent to use gpt 5."
- "lets put all the root mds, except the readme, into a new docs folder... it's getting cluttered in the root."
- "yep push to git"
- "so what's my agents name? description? instructions? what all information can i set?"
- "on the left nav, move the tools icon to the bottom"
- "the results on the investigative agent page (not the portal) are kind of ugly. i know that's not technically an agent, but is there a way to control the format/prettiness of the output"
- "you mentioned there might be someway to visualize my agent in the portal...versus using the cli. can you run through that w me again"
- "right but i get this error. please make note of this so you dont forget again. Error loading Microsoft Foundry project..."
- "i'm not saying to do it yet... but could you take the exact setup of the sql azure tables and data and set them up in dataverse and migrate the data?"
- "do we have custom indexes in our sql server?"
- "can you put something in the faq about why azure sql was a better choice for this effort than dataverse"
- "i want to go into copilot studio and configure an agent to use our tools... i want it to be able to interact w the data and answer questions just like our foundry agent and investigative agent web page..."
- "what is the server name and desc"
- "where do i get the api key?"
- "got it. bam. nice! let me ask you this. is there anyway to host the copilot studio agent on our site on another 'tab'..."
- "my agent's authentication in copilot studio is set to 'authenticate w microsoft'... is that ok"
- "give me a good paragraph for description and a few paragraphs for instructions for this copilot studio agent"
- [Provided iframe embed code] "get it done"
- "the copilot studio pane is visible on the home page... it shouldn't be... also the agent is now giving me a javascript error"
- "the copilot studio agent should be accessible anywhere on the spa with a little floating icon in the bottom right"
- "ok update all our mds. i think they probably all need updating but you tell me. then check everything in"

## Session 15 — Copilot Studio Panel, User Guide, Wake-Up Script

- "the javascript error is back on the copilot studio agent...it literally just says javascripterror"
- "also... the copilot studio agent needs to go back to having it's own left hand navigation. once that is selected, then show the floating icon for launching the agent ...but not on every page"
- "right...get all this into a set of release notes and put it wherever it makes sense w the other release notes based on this next comment. i need a user guide for the spa... can we rebrand and consolidate some of our mds in the docs folder and provide a super easy to use hey here's how this works and what each interface is for so a 12 year old could simply open up the url and do it? the doc should have a toc at the top and of course start with a summary, but then immediately get into what people can do with the app right from jump street assuming they have the url. i'm not going to hand this document out, so feel free to lump whatever other content from the other mds you feel we can consolidate and make easily findable from a toc."
- "also, is there anyway to have a script that wakes everything up or is it best just to go in and run a prompt?"
- "that's great, get ride/delete any mds we no longer need if you didn't do so already"
- "i would love to incorporate maps somehow into this.. something simple at first like if i ask for addresses i get a list accompanied by a map. i have access to power bi... or whatever you suggest. is this possible? what do you suggest?"
- "dude build it hell yeah but make sure to include in our mds the information above and how we can upgrade to something more sophisticated later. on the home page for the spa put a map with all the addresses unless you think that's crazy resource wise. but then come up w wherever we can use a map to embed it and make it more visually appealing"

## Session 16 — ELI5 Documentation

- "go through all or mds... all our code whatever you need to. make me a no kidding file called ELI5.md that explains this solution to me in a manner that allows me to easily explain it to others"
- "add whatever instructions you need to so that you always update this file"
- "i will use this for my demos/presentations when i need to dumb things down depending on my audience"
- "and for gods sake make sure you're updating all our mds in the docs folder and the root, ie claude.md and readme.md"

## Session 17 — Foundry Agent Fix, Token Docs

- "i know how to use the custom spa and the copilot studio agent....but how do i try the actual foundry agent? is that an option on our spa?"
- "something is wrong w the foundry agent on the portal. keeps telling me (no response)"
- (Extensive debugging of Foundry Agent — GPT-5 reasoning model issues, tool output limits, server errors. Switched to GPT-4.1.)
- "in the eli5, make sure you cover context and how tokens work and why we get such different responses across the clients. explain temperature to me and anything about token consumption, both generically and how that applies to the models in our solutions, and make sure it goes in the faq. update everything esp the md files and your memory, check into git, and we'll pick this back up tomorrow. make sure all mds have a toc if you didn't do that already. hey and can you make a note in your memory that when we pick things up tomorrow we need to talk about authentication so not just anyone can use this spa? we don't need to do anything now, but reminder for next session to remind me?"

## Session 18 — Authentication, Docs Panel, Background Image

- "ok... so how do i put authetication into this spa so that not anyone can log in and use it"
- (Selected "SPA only" auth approach — Azure SWA built-in auth with Microsoft login)
- "there should also be a logout link/button... and some visual way of knowing a user is logged in. also, let's put a reader on the spa that alllows me to read both md's and the ipynb notebooks. the mds and notebooks should be listed as like sub nav iteams once the main nav item to view the docs/notebooks has been selectedd."
- "none of the links work in the mds... they all go the home page of the spa instead of going to their respective sections in the mds"
- "some links work some dont. e.g. the copilot studio link on the user guide. and infra and costs on the faq. i'm sure there are more. check them all."
- "use images/philly-bg.jpg as the background for the home and investigave agent (spa) views"
- "ok update all the mds and push everything to git"

## Session 19 — SK Agent, Bicep IaC, MCAPS Fix

- "I want to add a Semantic Kernel multi-agent to the project. Build a C# .NET 8 agent with specialist sub-agents for owner analysis, violation analysis, and area analysis. Deploy it as a Container App and add a panel to the SPA."
- "The SK Agent plugin URLs are wrong — they're using function names like `/getTopViolators` instead of the RESTful APIM paths like `/stats/top-violators`. Fix all the plugin files."
- "The container app didn't update even though I pushed a new image. Why?"
- "Create Bicep infrastructure-as-code for everything — SQL, storage, functions, APIM, container apps, SWA. I want to be able to recreate the whole thing from scratch."
- "Everything is 503 again. MCAPS disabled public access on storage and SQL."
- "Move the Docs tab below the spacer in the activity bar, next to Tools. Reorder welcome page buttons to match."

## Session 20 — SK Agent UX, SQL Bug Fix

- "The SK Agent hangs — it says 'I am compiling data...' but never shows actual results"
- "The top violators endpoint crashes when I filter by LLC"
- "Reorder the nav: Agent, City Portal, Copilot, SK Agent, Tools on top. Docs and About below the spacer."
- "Add a favicon so the browser tab is recognizable"
- "Update all docs and push to git"

## Session 21 — VNet + Private Endpoints, Function App Fix

- "lots of updates, lets get the latest"
- "didn't we create a wake up script? i need everything in azure to wake up"
- "everything i try i get an error saying the service isn't available"
- "all four of them give me errors"
- "still getting this error on the ia panel I'm currently unable to access the list of top property owners by code violations due to a temporary system issue..."
- (Approved SWA redeployment)
- "how can we change this so we don't have to worry about public access being enabled or not"
- (Selected VNet + Private Endpoints approach, approved the plan)
- "let's update all important md files, especially the architecture md and any diagrams. i also added a html file to the docs folder. i had that created in another session using the architecture md document we have in this project. check that out and update it as well to map up with everything we did in this session so far."
- "it didn't look like you updated the prompts, or readme files. read me should reflect the changes we made today since that's the first thing people will read"

## Sessions 22-25 — SPA Polish, Slides, M365 Agent

- "the investigative agent tab should say 'Agent', Foundry Portal should say 'City Portal'..."
- "I want a Reveal.js slide deck that walks through the entire architecture"
- "build me a microsoft 365 copilot declarative agent that uses our mcp server"
- "update all docs and push to git"

## Session 26 — V2: Real Estate Transfer Data (The Game Changer)

- "in the jupyter notebooks, there are discussions around queries that can be run around the philly atlas public facing site. can you look at those, then compare that with what we have in our database, and see if there's anyway we can make use of the public facing philly atlas site to improve our data. make it more recent, make it more thorough and complete."
- "i want the game changer"
- "and make sure you document the shit out of it in our md files along the way so we dont lose anything"
- "i also want to make sure you create a new md thats called v2... b/c we should consider this v2 since this seems like a big step forward. it should show the capabilities, additions etc that we didnt have in v1"
- "make sure you write the game changer plan somewhere i can easily find it and study it"
- "i need some new updated prompts based on this new information and i want them labeled as NEW! or some shit just so we can see exactly why this new data is a game changer"

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

---

## NEW! Transfer Data Prompts (V2)

These prompts showcase the **game changer** — 5 million real estate transfer records added in V2. These were previously impossible.

### 🆕 Dollar Transfer Detection (Factor F19)

$1 transfers are a telltale sign of LLC-to-LLC ownership shuffling to hide the true beneficial owner.

- **"Find all $1 property transfers in zip code 19134"** — Searches 5M+ transfer records for transfers where total_consideration <= $1. These are almost always LLC-to-LLC shuffles, not real sales.
- **"Which LLCs are doing the most $1 transfers city-wide?"** — Cross-references $1 transfers with entity search to find the worst offenders.
- **"Show me $1 transfers in the last 2 years in North Philadelphia zip codes"** — Time-scoped search across multiple zip codes.
- **"Find all transfers for GEENA LLC where the sale price was $1 or less"** — Combines entity name with price filter.

### 🆕 Sheriff Sale Tracking (Factor F10)

Sheriff sales mean a property was sold at auction — often due to tax delinquency. LLCs that buy dozens of sheriff sale properties are a poverty profiteering red flag.

- **"Find all sheriff sale purchases in 19134"** — Searches transfers with document type SHERIFF.
- **"Which entities have purchased the most properties at sheriff sales?"** — Identifies bulk sheriff sale buyers.
- **"Show me sheriff sales in Kensington over the last 5 years"** — Geographic and time-scoped sheriff sale analysis.
- **"Did GEENA LLC acquire any properties through sheriff sales?"** — Entity-specific sheriff sale lookup.

### 🆕 Ownership Chain Analysis (Factor F13)

See the complete chain of ownership for any property — who sold to whom, for how much, and when.

- **"Show me the complete transfer history for 2837 Kensington Ave"** — Every deed, mortgage, sheriff sale, and assignment for one property.
- **"How many times has parcel 405100505 changed hands?"** — Quick ownership turnover check.
- **"What's the price history for properties owned by GEENA LLC?"** — Cross-references entity network with transfer prices to detect buy-low-flip-high patterns.
- **"Find properties that were bought for under $10,000 and later sold for over $100,000"** — Classic flip detection across the entire city.

### 🆕 Property Flipping Patterns

Flipping isn't illegal, but serial flipping in distressed neighborhoods while ignoring code violations is a profiteering indicator.

- **"Find properties in 19134 that have been transferred more than 3 times since 2020"** — High-turnover property detection.
- **"Show me all transfers by entities that also have code violations"** — Combines transfer data with violation data to find negligent flippers.
- **"What's the average time between purchase and resale for LLCs with the most violations?"** — Advanced flip pattern analysis.

### 🆕 Combined Investigations (Using V1 + V2 Data Together)

The real power is combining transfer records with the existing ownership, violation, and demolition data.

- **"Deep investigation: Find LLCs that bought properties at sheriff sales, accumulated violations, then transferred them for $1 to another LLC"** — The complete poverty profiteering playbook in one query.
- **"For the top 10 worst violators, show me their transfer history — did they buy cheap and let properties deteriorate?"** — Connects V1 violation rankings with V2 transfer price history.
- **"Compare: properties in 19134 that had demolitions — who owned them before demolition, how much did they pay, and did they transfer ownership before the city demolished?"** — Tracks the ownership trail before taxpayer-funded demolitions.
- **"Find entities that appear as both grantee on sheriff sales AND grantor on $1 transfers"** — Identifies the buy-at-auction-shuffle-to-LLC pipeline.
- **"Which zip codes have the highest rate of $1 transfers AND the highest violation rates?"** — Area-level cross-analysis between V1 and V2 data.
