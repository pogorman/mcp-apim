using System.ComponentModel;
using System.Net.Http.Json;
using Microsoft.SemanticKernel;

namespace PhillySkAgent.Plugins;

public class AreaPlugin(HttpClient http, string baseUrl, string subscriptionKey)
{
    private void AddAuth(HttpRequestMessage req) =>
        req.Headers.Add("Ocp-Apim-Subscription-Key", subscriptionKey);

    [KernelFunction, Description("Get aggregate statistics for a Philadelphia zip code: property counts, vacancy rates, violation rates, demolitions, license counts, and top property owners.")]
    public async Task<string> GetAreaStats(
        [Description("5-digit zip code (e.g., '19134')")] string zipCode)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/stats/zip/{zipCode}");
        AddAuth(req);
        var resp = await http.SendAsync(req);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadAsStringAsync();
    }

    [KernelFunction, Description("Search business and commercial activity licenses by keyword, type, or zip code. Use to find check cashing, pawn shops, title loans, dollar stores, and other businesses.")]
    public async Task<string> SearchBusinesses(
        [Description("Business name keyword (e.g., 'check cashing', 'pawn', 'dollar')")] string? keyword = null,
        [Description("License type filter (e.g., 'Rental', 'Food', 'Vacant')")] string? licensetype = null,
        [Description("Zip code filter (e.g., '19134')")] string? zip = null,
        [Description("Max results (default 50, max 200)")] int limit = 50)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/search-businesses");
        AddAuth(req);
        var body = new Dictionary<string, object?>();
        if (keyword != null) body["keyword"] = keyword;
        if (licensetype != null) body["licensetype"] = licensetype;
        if (zip != null) body["zip"] = zip;
        body["limit"] = limit;
        req.Content = JsonContent.Create(body);
        var resp = await http.SendAsync(req);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadAsStringAsync();
    }

    [KernelFunction, Description("Get the assessment history for a property showing market value, taxable amounts, and exemptions by year (2015-2025).")]
    public async Task<string> GetPropertyAssessments(
        [Description("The OPA parcel number")] string parcelNumber)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/properties/{parcelNumber}/assessments");
        AddAuth(req);
        var resp = await http.SendAsync(req);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadAsStringAsync();
    }

    [KernelFunction, Description("Get all business and commercial activity licenses associated with a property. Shows rental licenses, vacant property licenses, and any commercial operations.")]
    public async Task<string> GetPropertyLicenses(
        [Description("The OPA parcel number")] string parcelNumber)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/properties/{parcelNumber}/licenses");
        AddAuth(req);
        var resp = await http.SendAsync(req);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadAsStringAsync();
    }

    [KernelFunction, Description("Execute a custom read-only SQL query against the Philadelphia property database. Must be a SELECT with TOP(n) or OFFSET/FETCH. Max 1000 rows.")]
    public async Task<string> RunQuery(
        [Description("SQL SELECT query. Must include TOP(n) or OFFSET/FETCH.")] string sql)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/query");
        AddAuth(req);
        req.Content = JsonContent.Create(new { sql });
        var resp = await http.SendAsync(req);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadAsStringAsync();
    }
}
