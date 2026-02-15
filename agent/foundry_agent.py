"""
Azure AI Foundry Agent with MCP Tools + Bing Grounding

Connects to our Philly poverty profiteering MCP server (deployed on Container Apps)
and optionally adds Bing web search grounding for real-time data.

Prerequisites:
  1. Azure AI Foundry project (https://ai.azure.com)
  2. Container App running the MCP server (deploy with infra/deploy-agent.sh)
  3. (Optional) Grounding with Bing Search resource connected to the project

Environment variables:
  PROJECT_ENDPOINT           - Azure AI Foundry project endpoint
  MODEL_DEPLOYMENT_NAME      - Model deployment (default: gpt-4o)
  MCP_SERVER_URL             - Container App MCP endpoint (e.g. https://philly-mcp-server.*.azurecontainerapps.io/mcp)
  BING_CONNECTION_NAME       - (Optional) Bing grounding connection ID for web search

Usage:
  pip install -r requirements.txt
  az login
  python foundry_agent.py
  python foundry_agent.py --query "Who are the top violators in 19134?"
"""

import argparse
import os
import sys
import time

from azure.ai.projects import AIProjectClient
from azure.identity import DefaultAzureCredential
from azure.ai.agents.models import (
    BingGroundingTool,
    ListSortOrder,
    McpTool,
    MessageTextContent,
    RequiredMcpToolCall,
    SubmitToolApprovalAction,
    ToolApproval,
)


def create_agent(project_client: AIProjectClient):
    """Create a Foundry agent with MCP + optional Bing tools."""
    mcp_url = os.environ.get("MCP_SERVER_URL")
    if not mcp_url:
        print("ERROR: MCP_SERVER_URL environment variable is required.")
        print("  Set it to your Container App MCP endpoint, e.g.:")
        print("  export MCP_SERVER_URL=https://philly-mcp-server.<region>.azurecontainerapps.io/mcp")
        sys.exit(1)

    model = os.environ.get("MODEL_DEPLOYMENT_NAME", "gpt-4o")

    # MCP tool — connects to our Philly property data server
    mcp_tool = McpTool(
        server_label="philly-stats",
        server_url=mcp_url,
    )

    # Combine tool definitions
    all_tools = mcp_tool.definitions

    # Optional: Bing grounding for web search
    bing_conn = os.environ.get("BING_CONNECTION_NAME")
    bing_tool = None
    if bing_conn:
        bing_tool = BingGroundingTool(connection_id=bing_conn)
        all_tools = all_tools + bing_tool.definitions
        print(f"  Bing grounding enabled (connection: ...{bing_conn[-20:]})")
    else:
        print("  Bing grounding disabled (set BING_CONNECTION_NAME to enable)")

    agent = project_client.agents.create_agent(
        model=model,
        name="philly-investigator",
        instructions=(
            "You are an investigative analyst specializing in Philadelphia property data. "
            "You have access to tools that query a database of ~29 million rows covering "
            "property ownership networks, code violations, demolitions, business licenses, "
            "and tax assessments. Use these tools to identify patterns of neglect, "
            "exploitative landlords, and poverty profiteering. "
            "When answering, cite specific data (parcel numbers, violation counts, addresses). "
            "If Bing web search is available, use it to find recent news about properties or owners."
        ),
        tools=all_tools,
    )
    print(f"  Created agent: {agent.id}")
    return agent, mcp_tool, bing_tool


def run_query(project_client: AIProjectClient, agent, mcp_tool, bing_tool, query: str):
    """Run a single query against the agent and print the response."""
    agents = project_client.agents

    # Create thread and message
    thread = agents.threads.create()
    agents.messages.create(thread_id=thread.id, role="user", content=query)

    # Build tool resources — auto-approve MCP calls (we trust our own server)
    mcp_tool.update_headers("X-Source", "foundry-agent")
    tool_resources = mcp_tool.resources

    run = agents.runs.create(
        thread_id=thread.id,
        agent_id=agent.id,
        tool_resources=tool_resources,
    )

    # Poll until complete
    while run.status in ("queued", "in_progress", "requires_action"):
        time.sleep(1)
        run = agents.runs.get(thread_id=thread.id, run_id=run.id)

        # Auto-approve MCP tool calls
        if run.status == "requires_action" and isinstance(
            run.required_action, SubmitToolApprovalAction
        ):
            tool_calls = run.required_action.submit_tool_approval.tool_calls
            approvals = []
            for tc in tool_calls:
                if isinstance(tc, RequiredMcpToolCall):
                    print(f"  [MCP] {tc.name}({tc.arguments[:80]}...)")
                    approvals.append(
                        ToolApproval(
                            tool_call_id=tc.id,
                            approve=True,
                            headers=mcp_tool.headers,
                        )
                    )
            if approvals:
                agents.runs.submit_tool_outputs(
                    thread_id=thread.id,
                    run_id=run.id,
                    tool_approvals=approvals,
                )

    if run.status == "failed":
        print(f"\nRun failed: {run.last_error}")
        return

    # Print assistant response
    messages = agents.messages.list(thread_id=thread.id, order=ListSortOrder.ASCENDING)
    for msg in messages:
        if msg.role == "assistant" and msg.text_messages:
            text = msg.text_messages[-1].text.value
            print(f"\n{text}")

    # Cleanup thread
    agents.threads.delete(thread_id=thread.id)


def interactive_loop(project_client: AIProjectClient, agent, mcp_tool, bing_tool):
    """Run an interactive chat loop."""
    print("\nPhilly Property Investigator (type 'quit' to exit)")
    print("-" * 50)

    while True:
        try:
            query = input("\nYou: ").strip()
        except (EOFError, KeyboardInterrupt):
            break

        if not query or query.lower() in ("quit", "exit", "q"):
            break

        run_query(project_client, agent, mcp_tool, bing_tool, query)

    print("\nGoodbye.")


def main():
    parser = argparse.ArgumentParser(description="Philly Property Investigator Agent")
    parser.add_argument("--query", "-q", help="Single query (skip interactive mode)")
    args = parser.parse_args()

    project_endpoint = os.environ.get("PROJECT_ENDPOINT")
    if not project_endpoint:
        print("ERROR: PROJECT_ENDPOINT environment variable is required.")
        print("  Set it to your Azure AI Foundry project endpoint.")
        sys.exit(1)

    print("Initializing Foundry agent...")
    project_client = AIProjectClient(
        endpoint=project_endpoint,
        credential=DefaultAzureCredential(),
    )

    with project_client:
        agent, mcp_tool, bing_tool = create_agent(project_client)

        try:
            if args.query:
                run_query(project_client, agent, mcp_tool, bing_tool, args.query)
            else:
                interactive_loop(project_client, agent, mcp_tool, bing_tool)
        finally:
            project_client.agents.delete_agent(agent.id)
            print("Agent cleaned up.")


if __name__ == "__main__":
    main()
