using System.ComponentModel;
using System.Net.Http.Json;
using Microsoft.SemanticKernel;

namespace PhillySkAgent.Plugins;

public class OwnerPlugin(HttpClient http, string baseUrl, string subscriptionKey)
{
    private void AddAuth(HttpRequestMessage req) =>
        req.Headers.Add("Ocp-Apim-Subscription-Key", subscriptionKey);

    [KernelFunction, Description("Search for entities (people, LLCs, corporations) by name. Returns matching entities and how many properties they are linked to.")]
    public async Task<string> SearchEntities(
        [Description("Name or partial name to search for (e.g., 'GEENA LLC', 'WALSH')")] string name,
        [Description("Max results to return (default 50, max 200)")] int limit = 50)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/search-entities");
        AddAuth(req);
        req.Content = JsonContent.Create(new { name, limit });
        var resp = await http.SendAsync(req);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadAsStringAsync();
    }

    [KernelFunction, Description("Get the full property network for an entity: all linked addresses, parcels, property details, and violation/demolition counts.")]
    public async Task<string> GetEntityNetwork(
        [Description("The master_entity_id UUID from search_entities results")] string entityId)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/entities/{entityId}/network");
        AddAuth(req);
        var resp = await http.SendAsync(req);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadAsStringAsync();
    }

    [KernelFunction, Description("Get complete details for a property by parcel number: ownership, building info, market value, assessment, active licenses, and violation/demolition/appeal counts.")]
    public async Task<string> GetPropertyProfile(
        [Description("The OPA parcel number (e.g., '405100505')")] string parcelNumber)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/properties/{parcelNumber}");
        AddAuth(req);
        var resp = await http.SendAsync(req);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadAsStringAsync();
    }
}
