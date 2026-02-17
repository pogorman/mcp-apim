using System.ComponentModel;
using System.Net.Http.Json;
using Microsoft.SemanticKernel;

namespace PhillySkAgent.Plugins;

public class ViolationPlugin(HttpClient http, string baseUrl, string subscriptionKey)
{
    private void AddAuth(HttpRequestMessage req) =>
        req.Headers.Add("Ocp-Apim-Subscription-Key", subscriptionKey);

    [KernelFunction, Description("Get code enforcement case investigations for a property. Can filter by status (FAILED, PASSED, CLOSED). Supports pagination.")]
    public async Task<string> GetPropertyViolations(
        [Description("The OPA parcel number")] string parcelNumber,
        [Description("Filter by investigation status: FAILED, PASSED, CLOSED")] string? status = null,
        [Description("Results per page (default 100, max 500)")] int limit = 100,
        [Description("Pagination offset (default 0)")] int offset = 0)
    {
        var qs = $"limit={limit}&offset={offset}";
        if (!string.IsNullOrEmpty(status)) qs += $"&status={status}";
        var req = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/properties/{parcelNumber}/violations?{qs}");
        AddAuth(req);
        var resp = await http.SendAsync(req);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadAsStringAsync();
    }

    [KernelFunction, Description("Get the ranked list of property owners with the most code violations across their portfolio. Filters by minimum property count and entity type (LLC vs individual).")]
    public async Task<string> GetTopViolators(
        [Description("Number of results (default 25, max 100)")] int limit = 25,
        [Description("Minimum properties to qualify (default 5)")] int minProperties = 5,
        [Description("Filter: 'llc' for corporate entities only, omit for all")] string? entityType = null)
    {
        var qs = $"limit={limit}&minProperties={minProperties}";
        if (!string.IsNullOrEmpty(entityType)) qs += $"&entityType={entityType}";
        var req = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/stats/top-violators?{qs}");
        AddAuth(req);
        var resp = await http.SendAsync(req);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadAsStringAsync();
    }

    [KernelFunction, Description("Get demolition records for a property. Shows whether demolition was city-initiated (taxpayer-funded) or owner-initiated, contractor info, and status.")]
    public async Task<string> GetPropertyDemolitions(
        [Description("The OPA parcel number")] string parcelNumber)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/properties/{parcelNumber}/demolitions");
        AddAuth(req);
        var resp = await http.SendAsync(req);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadAsStringAsync();
    }

    [KernelFunction, Description("Get all L&I appeals filed for a property. Shows appeal type, status, decision, appellant, and related case files.")]
    public async Task<string> GetPropertyAppeals(
        [Description("The OPA parcel number")] string parcelNumber)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/properties/{parcelNumber}/appeals");
        AddAuth(req);
        var resp = await http.SendAsync(req);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadAsStringAsync();
    }
}
