#pragma warning disable SKEXP0110 // Agent orchestration is experimental

using System.Diagnostics;
using Azure.Identity;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.Agents;
using Microsoft.SemanticKernel.Agents.Orchestration;
using Microsoft.SemanticKernel.Agents.Orchestration.Handoff;
using Microsoft.SemanticKernel.Agents.Runtime.InProcess;
using Microsoft.SemanticKernel.ChatCompletion;
using Microsoft.SemanticKernel.Connectors.OpenAI;
using PhillySkAgent.Plugins;

var builder = WebApplication.CreateBuilder(args);

var app = builder.Build();

// CORS — allow SPA access
app.Use(async (context, next) =>
{
    context.Response.Headers.Append("Access-Control-Allow-Origin", "*");
    context.Response.Headers.Append("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    context.Response.Headers.Append("Access-Control-Allow-Headers", "Content-Type");
    if (context.Request.Method == "OPTIONS")
    {
        context.Response.StatusCode = 204;
        return;
    }
    await next();
});

// Configuration
var config = app.Configuration;
var aoaiEndpoint = Environment.GetEnvironmentVariable("AZURE_OPENAI_ENDPOINT")
    ?? config["AzureOpenAI:Endpoint"]
    ?? throw new InvalidOperationException("AZURE_OPENAI_ENDPOINT not set");
var aoaiDeployment = Environment.GetEnvironmentVariable("AZURE_OPENAI_DEPLOYMENT")
    ?? config["AzureOpenAI:DeploymentName"]
    ?? "gpt-4.1";
var apimBaseUrl = Environment.GetEnvironmentVariable("APIM_BASE_URL")
    ?? config["APIM:BaseUrl"]
    ?? throw new InvalidOperationException("APIM_BASE_URL not set");
var apimKey = Environment.GetEnvironmentVariable("APIM_SUBSCRIPTION_KEY")
    ?? config["APIM:SubscriptionKey"]
    ?? throw new InvalidOperationException("APIM_SUBSCRIPTION_KEY not set");

// Use API key from env var if set, otherwise use managed identity
var aoaiApiKey = Environment.GetEnvironmentVariable("AZURE_OPENAI_API_KEY");

var httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(120) };

// Build a kernel with Azure OpenAI
Kernel CreateKernel()
{
    var kb = Kernel.CreateBuilder();
    if (!string.IsNullOrEmpty(aoaiApiKey))
    {
        kb.AddAzureOpenAIChatCompletion(aoaiDeployment, aoaiEndpoint, aoaiApiKey);
    }
    else
    {
        kb.AddAzureOpenAIChatCompletion(aoaiDeployment, aoaiEndpoint, new DefaultAzureCredential());
    }
    return kb.Build();
}

// Health check
app.MapGet("/healthz", () => Results.Ok(new { status = "ok", service = "philly-sk-agent" }));

// Main investigate endpoint
app.MapPost("/investigate", async (HttpRequest request) =>
{
    var body = await request.ReadFromJsonAsync<InvestigateRequest>();
    if (body?.Prompt is null or "")
        return Results.BadRequest(new { error = "prompt is required" });

    var sw = Stopwatch.StartNew();
    var agentsInvolved = new List<string>();
    var toolCallLog = new List<object>();

    try
    {
        // Create specialist kernels with focused plugins
        var ownerKernel = CreateKernel();
        ownerKernel.Plugins.Add(KernelPluginFactory.CreateFromObject(
            new OwnerPlugin(httpClient, apimBaseUrl, apimKey), "Owner"));

        var violationKernel = CreateKernel();
        violationKernel.Plugins.Add(KernelPluginFactory.CreateFromObject(
            new ViolationPlugin(httpClient, apimBaseUrl, apimKey), "Violation"));

        var areaKernel = CreateKernel();
        areaKernel.Plugins.Add(KernelPluginFactory.CreateFromObject(
            new AreaPlugin(httpClient, apimBaseUrl, apimKey), "Area"));

        // Define agents
        ChatCompletionAgent triageAgent = new()
        {
            Name = "Triage",
            Description = "Routes investigation requests to the right specialist agent.",
            Instructions = """
                You are a Philadelphia property investigation coordinator. Your job is to understand
                the user's question and route it to the right specialist:

                - **OwnerAnalyst**: Questions about who owns properties, LLC networks, entity searches,
                  property details, ownership patterns
                - **ViolationAnalyst**: Questions about code violations, enforcement actions, top violators,
                  demolitions, L&I appeals
                - **AreaAnalyst**: Questions about neighborhoods/zip codes, area statistics, business licenses,
                  property assessments, check cashing / pawn shops, or custom SQL queries

                IMPORTANT RULES:
                - When routing to a specialist, do NOT write any planning or status messages. Just hand off immediately.
                - For complex questions that span multiple domains, hand off to one specialist at a time.
                - When a specialist returns results, synthesize a clear, comprehensive answer for the user.
                - Always provide specific numbers, names, and details from the data.
                - Your ONLY user-facing response should be the final synthesized answer with real data.
                """,
            Kernel = CreateKernel()
        };

        ChatCompletionAgent ownerAgent = new()
        {
            Name = "OwnerAnalyst",
            Description = "Investigates property owner networks, LLC structures, and ownership patterns.",
            Instructions = """
                You are a property ownership analyst for Philadelphia. You investigate who owns properties,
                LLC networks, and entity relationships. Use your tools to search for entities, get their
                property networks, and pull detailed property profiles. Always provide specific data:
                entity names, property counts, parcel numbers, addresses. When done with your analysis,
                hand back to Triage with your findings.
                """,
            Kernel = ownerKernel,
            Arguments = new KernelArguments(
                new OpenAIPromptExecutionSettings
                {
                    FunctionChoiceBehavior = FunctionChoiceBehavior.Auto()
                })
        };

        ChatCompletionAgent violationAgent = new()
        {
            Name = "ViolationAnalyst",
            Description = "Analyzes code violations, enforcement patterns, demolitions, and appeals.",
            Instructions = """
                You are a code enforcement analyst for Philadelphia. You investigate violations,
                demolitions, appeals, and identify the worst offenders. Use your tools to find top
                violators, check specific property violations, demolition records, and appeal history.
                Provide specific numbers and case details. When done, hand back to Triage with findings.
                """,
            Kernel = violationKernel,
            Arguments = new KernelArguments(
                new OpenAIPromptExecutionSettings
                {
                    FunctionChoiceBehavior = FunctionChoiceBehavior.Auto()
                })
        };

        ChatCompletionAgent areaAgent = new()
        {
            Name = "AreaAnalyst",
            Description = "Analyzes zip code statistics, business licenses, assessments, and runs custom queries.",
            Instructions = """
                You are a neighborhood and area analyst for Philadelphia. You analyze zip code statistics,
                business license patterns (check cashing, pawn shops, etc.), property assessment trends,
                and can run custom SQL queries for specialized analysis. Provide specific data with numbers.
                When done, hand back to Triage with findings.
                """,
            Kernel = areaKernel,
            Arguments = new KernelArguments(
                new OpenAIPromptExecutionSettings
                {
                    FunctionChoiceBehavior = FunctionChoiceBehavior.Auto()
                })
        };

        // Define handoff relationships
        var handoffs = OrchestrationHandoffs
            .StartWith(triageAgent)
            .Add(triageAgent, ownerAgent, violationAgent, areaAgent)
            .Add(ownerAgent, triageAgent, "Transfer back when ownership analysis is complete")
            .Add(violationAgent, triageAgent, "Transfer back when violation analysis is complete")
            .Add(areaAgent, triageAgent, "Transfer back when area analysis is complete");

        // Set up orchestration with response tracking
        HandoffOrchestration orchestration = new(
            handoffs, triageAgent, ownerAgent, violationAgent, areaAgent)
        {
            ResponseCallback = msg =>
            {
                if (msg.AuthorName is not null && !agentsInvolved.Contains(msg.AuthorName))
                    agentsInvolved.Add(msg.AuthorName);
                return ValueTask.CompletedTask;
            }
        };

        // Run the orchestration
        InProcessRuntime runtime = new();
        await runtime.StartAsync();

        var result = await orchestration.InvokeAsync(body.Prompt, runtime);
        var reply = await result.GetValueAsync(TimeSpan.FromSeconds(180));

        await runtime.RunUntilIdleAsync();

        sw.Stop();

        return Results.Ok(new
        {
            reply = reply ?? "No response generated.",
            agents = agentsInvolved,
            toolCalls = toolCallLog,
            executionTimeMs = sw.ElapsedMilliseconds,
            model = aoaiDeployment
        });
    }
    catch (Exception ex)
    {
        sw.Stop();
        Console.Error.WriteLine($"Investigation error: {ex}");
        return Results.Json(new { error = ex.Message, executionTimeMs = sw.ElapsedMilliseconds },
            statusCode: 500);
    }
});

var port = Environment.GetEnvironmentVariable("PORT") ?? "8080";
app.Urls.Add($"http://0.0.0.0:{port}");
app.Run();

record InvestigateRequest(string? Prompt);
