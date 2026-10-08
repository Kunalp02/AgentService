
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Agent.Application.DTOs;
using Agent.Application.Interfaces;
using ccil.ai.platform.common.Auth;

namespace Agent.Infrastructure.DownstreamClients;

public class HttpToolsConfigClient : IToolsConfigClient
{
    private readonly HttpClient _http;
    private readonly ICurrentUser _currentUser;
    private readonly ILogger<HttpToolsConfigClient> _logger;

    public HttpToolsConfigClient(HttpClient http, ICurrentUser currentUser, ILogger<HttpToolsConfigClient> logger)
    {
        _http = http;
        _currentUser = currentUser;
        _logger = logger;
    }

    private HttpRequestMessage BuildRequest(HttpMethod method, string path)
    {
        var request = new HttpRequestMessage(method, path);
        if (!string.IsNullOrEmpty(_currentUser.BearerToken))
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _currentUser.BearerToken);
        return request;
    }

    public async Task<(bool Reachable, IReadOnlyList<ModelOptionDto> Models)> GetActiveModelsAsync(string? classification, CancellationToken ct = default)
    {
        var (reachable, rows) = await FetchAvailableModelsAsync(classification, ct);
        if (!reachable)
            return (false, Array.Empty<ModelOptionDto>());

        // var models = rows.Select(m => new ModelOptionDto(
        //     m.Id, m.Name, m.ModelIdentifier, m.Classification, m.GroupIds.ToList())).ToList();
        
        var models = rows
            .Where(m => string.Equals(
                m.Classification,
                "Chat",
                StringComparison.OrdinalIgnoreCase))
            .Select(m => new ModelOptionDto(
                m.Id,
                m.Name,
                m.ModelIdentifier,
                m.Classification,
                m.GroupIds.ToList()))
            .ToList();
        return (true, models);
    }

    public async Task<ReferenceCheck> ValidateModelVisibleAsync(
        Guid modelId,
        IReadOnlyCollection<Guid> agentGroupIds,
        CancellationToken ct = default)
    {
        try
        {
            var (reachable, available) = await FetchAvailableModelsAsync(classification: null, ct);
            if (!reachable)
                return ReferenceCheck.Unreachable();

            var match = available.FirstOrDefault(m => m.Id == modelId);
            if (match is null)
                return ReferenceCheck.NotVisible();

            if (match.GroupIds.Count > 0 && !match.GroupIds.Overlaps(agentGroupIds))
                return ReferenceCheck.NotVisible();

            return ReferenceCheck.Valid(string.IsNullOrWhiteSpace(match.Name) ? null : match.Name);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Tools config unreachable while validating model {ModelId}", modelId);
            return ReferenceCheck.Unreachable();
        }
    }

    public async Task<(bool Reachable, ModelDetailDto? Detail)> GetModelAsync(Guid modelId, CancellationToken ct = default)
    {
        try
        {
            using var response = await _http.SendAsync(
                BuildRequest(HttpMethod.Get, $"/api/v1/model-registry/{modelId}"), ct);

            if (response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Forbidden)
                return (true, null); // service reachable, model just doesn't exist/isn't visible

            if (IsAuthOrServerFailure(response.StatusCode) || !response.IsSuccessStatusCode)
            {
                _logger.LogWarning("tools_config returned {Status} while fetching model {ModelId}", response.StatusCode, modelId);
                return (false, null);
            }

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
            var root = doc.RootElement;
            if (!root.TryReadGuid("id", out var id))
                return (true, null);

            var baseUrl = root.ReadString("baseUrl");
            var detail = new ModelDetailDto(
                id,
                root.ReadString("name"),
                root.ReadString("modelIdentifier"),
                root.ReadString("provider"),
                string.IsNullOrEmpty(baseUrl) ? null : baseUrl,
                root.ReadGuidArray("groupIds"));

            return (true, detail);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "tools_config unreachable while fetching model {ModelId}", modelId);
            return (false, null);
        }
    }

    public async Task<(bool Reachable, ModelResolveDto? Result)> ResolveModelAsync(Guid modelId, CancellationToken ct = default)
    {
        try
        {
            var request = BuildRequest(HttpMethod.Post, "/api/v1/model-registry/resolve");
            request.Content = JsonContent.Create(new { modelId });

            using var response = await _http.SendAsync(request, ct);

            if (response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Forbidden)
                return (true, null);    

            if (IsAuthOrServerFailure(response.StatusCode) || !response.IsSuccessStatusCode)
            {
                _logger.LogWarning("tools_config returned {Status} while resolving model {ModelId}", response.StatusCode, modelId);
                return (false, null);
            }

            var dto = await response.Content.ReadFromJsonAsync<ModelResolveDto>(cancellationToken: ct);
            return (true, dto);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "tools_config unreachable while resolving model {ModelId}", modelId);
            return (false, null);
        }
    }

    private async Task<(bool Reachable, IReadOnlyList<RegistryModelRow> Models)> FetchAvailableModelsAsync(
        string? classification,
        CancellationToken ct)
    {
        try
        {
            var path = "/api/v1/model-registry?activeOnly=true"
                       + (classification is null ? "" : $"&classification={Uri.EscapeDataString(classification)}");
            using var response = await _http.SendAsync(BuildRequest(HttpMethod.Get, path), ct);

            if (IsAuthOrServerFailure(response.StatusCode) || !response.IsSuccessStatusCode)
            {
                _logger.LogWarning("tools_config returned {Status} for {Path}", response.StatusCode, path);
                return (false, Array.Empty<RegistryModelRow>());
            }

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
            var list = doc.RootElement.UnwrapList();
            if (list.ValueKind != JsonValueKind.Array)
                return (false, Array.Empty<RegistryModelRow>());

            var models = new List<RegistryModelRow>();
            foreach (var m in list.EnumerateArray())
            {
                if (!m.TryReadGuid("id", out var id))
                    continue;
                if (m.TryGetProperty("isActive", out var isActive) && isActive.ValueKind == JsonValueKind.False)
                    continue;

                models.Add(new RegistryModelRow(
                    id,
                    m.ReadString("name"),
                    m.ReadString("modelIdentifier"),
                    m.ReadString("classification"),
                    m.ReadGuidArray("groupIds")));
            }

            return (true, models);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "tools_config unreachable while fetching model registry.");
            return (false, Array.Empty<RegistryModelRow>());
        }
    }

    private sealed record RegistryModelRow(
        Guid Id,
        string Name,
        string ModelIdentifier,
        string Classification,
        HashSet<Guid> GroupIds);
    
    
    public async Task<(bool Reachable, IReadOnlyList<ToolOptionDto> Tools)> GetAvailableToolsAsync(
    CancellationToken ct = default)
{
    try
    {
        var remoteRequest = BuildRequest(
            HttpMethod.Get,
            "/internal/v1/remote-mcp-servers/active");

        remoteRequest.Headers.Add("X-Service-Key", "dev-secret");

        _logger.LogInformation(
            "Calling Tools Config remote MCP endpoint: {Url}",
            remoteRequest.RequestUri);

        using var remoteResponse = await _http.SendAsync(remoteRequest, ct);

        _logger.LogInformation(
            "Remote MCP endpoint response: StatusCode={StatusCode}, Success={Success}",
            (int)remoteResponse.StatusCode,
            remoteResponse.IsSuccessStatusCode);

        var localRequest = BuildRequest(
            HttpMethod.Get,
            "/api/v1/local-tools/approved");

        using var localResponse = await _http.SendAsync(localRequest, ct);

        _logger.LogInformation(
            "Local tools endpoint response: StatusCode={StatusCode}, Success={Success}",
            (int)localResponse.StatusCode,
            localResponse.IsSuccessStatusCode);

        var results = new List<ToolOptionDto>();
        var anyOk = false;

        if (remoteResponse.IsSuccessStatusCode)
        {
            anyOk = true;

            var remoteTools = await ReadRemoteToolList(
                remoteResponse,
                ct);

            _logger.LogInformation(
                "Remote MCP tools parsed: Count={Count}",
                remoteTools.Count);

            results.AddRange(remoteTools);
        }

        if (localResponse.IsSuccessStatusCode)
        {
            anyOk = true;

            var localTools = await ReadToolList(
                localResponse,
                "Local",
                ct);

            _logger.LogInformation(
                "Local tools parsed: Count={Count}",
                localTools.Count);

            results.AddRange(localTools);
        }

        _logger.LogInformation(
            "Total available tools returned: Count={Count}",
            results.Count);

        return (anyOk, results);
    }
    catch (Exception ex)
    {
        _logger.LogWarning(
            ex,
            "Tools Config unreachable while fetching tools.");

        return (false, Array.Empty<ToolOptionDto>());
    }
}

    // public async Task<ReferenceCheck> ValidateToolVisibleAsync(
    //     Guid toolId,
    //     string toolType,
    //     IReadOnlyCollection<Guid> agentGroupIds,
    //     CancellationToken ct = default)
    // {
    //     var isLocal = toolType.Equals("Local", StringComparison.OrdinalIgnoreCase);
    //     var path = isLocal
    //         ? $"/api/v1/local-tools/{toolId}"
    //         : $"/api/v1/remote-tools/{toolId}";
    //     var expectedStatus = isLocal ? "Approved" : "Active";
    //
    //     try
    //     {
    //         using var response = await _http.SendAsync(BuildRequest(HttpMethod.Get, path), ct);
    //
    //         if (IsAuthOrServerFailure(response.StatusCode))
    //         {
    //             _logger.LogWarning("tools_config returned {Status} while validating tool {ToolId}", response.StatusCode, toolId);
    //             return ReferenceCheck.Unreachable();
    //         }
    //
    //         if (response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Forbidden)
    //             return ReferenceCheck.NotVisible();
    //
    //         if (!response.IsSuccessStatusCode)
    //             return ReferenceCheck.Unreachable();
    //
    //         using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
    //         var root = doc.RootElement;
    //         var status = root.ReadString("status");
    //         if (!string.IsNullOrEmpty(status) && !status.Equals(expectedStatus, StringComparison.OrdinalIgnoreCase))
    //             return ReferenceCheck.NotVisible();
    //
    //         // Group rule: global (no groups) or at least one group in common with the agent.
    //         // If the detail payload carries no `groupIds` field at all, fall back to the list
    //         // endpoint, which does include groups, so a missing field is never mistaken for "global".
    //         IReadOnlyCollection<Guid> toolGroups;
    //         if (root.TryGetPropertyIgnoreCase("groupIds", out _))
    //         {
    //             toolGroups = root.ReadGuidArray("groupIds");
    //         }
    //         else
    //         {
    //             var (reachable, all) = await GetAvailableToolsAsync(ct);
    //             if (!reachable)
    //                 return ReferenceCheck.Unreachable();
    //             var match = all.FirstOrDefault(t => t.Id == toolId
    //                 && t.ToolType.Equals(isLocal ? "Local" : "Remote", StringComparison.OrdinalIgnoreCase));
    //             if (match is null)
    //                 return ReferenceCheck.NotVisible();
    //             toolGroups = match.GroupIds as IReadOnlyCollection<Guid> ?? match.GroupIds.ToList();
    //         }
    //
    //         if (toolGroups.Count > 0 && !toolGroups.Any(agentGroupIds.Contains))
    //             return ReferenceCheck.NotVisible();
    //
    //         var name = root.ReadString("name");
    //         return ReferenceCheck.Valid(string.IsNullOrWhiteSpace(name) ? null : name);
    //     }
    //     catch (OperationCanceledException) when (ct.IsCancellationRequested)
    //     {
    //         throw;
    //     }
    //     catch (Exception ex)
    //     {
    //         _logger.LogWarning(ex, "tools_config unreachable while validating tool {ToolId}", toolId);
    //         return ReferenceCheck.Unreachable();
    //     }
    // }

    public async Task<ReferenceCheck> ValidateToolVisibleAsync(
        Guid toolId,
        string toolType,
        IReadOnlyCollection<Guid> agentGroupIds,
        CancellationToken ct = default)
    {
        var isLocal = toolType.Equals("Local", StringComparison.OrdinalIgnoreCase);
        var path = isLocal
            ? $"/api/v1/local-tools/{toolId}"
            : $"/api/v1/remote-tools/{toolId}";
        var expectedStatus = isLocal ? "Approved" : "Active";

        try
        {
            using var response = await _http.SendAsync(BuildRequest(HttpMethod.Get, path), ct);

            if (IsAuthOrServerFailure(response.StatusCode))
            {
                _logger.LogWarning("tools_config returned {Status} while validating tool {ToolId}", response.StatusCode, toolId);
                return ReferenceCheck.Unreachable();
            }

            if (response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Forbidden)
                return ReferenceCheck.NotVisible();

            if (!response.IsSuccessStatusCode)
                return ReferenceCheck.Unreachable();

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
            var root = doc.RootElement;
            var status = root.ReadString("status");
            if (!string.IsNullOrEmpty(status) && !status.Equals(expectedStatus, StringComparison.OrdinalIgnoreCase))
                return ReferenceCheck.NotVisible();

            var toolGroups = root.ReadGuidArray("groupIds");
            if (toolGroups.Count > 0 && !toolGroups.Overlaps(agentGroupIds))
                return ReferenceCheck.NotVisible();

            var name = root.ReadString("name");
            return ReferenceCheck.Valid(string.IsNullOrWhiteSpace(name) ? null : name);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "tools_config unreachable while validating tool {ToolId}", toolId);
            return ReferenceCheck.Unreachable();
        }
    }
    private static async Task<List<ToolOptionDto>> ReadToolList(HttpResponseMessage response, string toolType, CancellationToken ct)
    {
        var results = new List<ToolOptionDto>();
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        var list = doc.RootElement.UnwrapList();
        if (list.ValueKind != JsonValueKind.Array)
            return results;

        foreach (var t in list.EnumerateArray())
        {
            if (!t.TryReadGuid("id", out var id))
                continue;
            results.Add(new ToolOptionDto(id, t.ReadString("name"), toolType, t.ReadGuidArray("groupIds")));
        }

        return results;
    }
    
    
    private async Task<List<ToolOptionDto>> ReadRemoteToolList(
    HttpResponseMessage response,
    CancellationToken ct)
{
    var results = new List<ToolOptionDto>();

    using var doc = JsonDocument.Parse(
        await response.Content.ReadAsStringAsync(ct));

    var servers = doc.RootElement;

    if (servers.ValueKind != JsonValueKind.Array)
    {
        _logger.LogWarning(
            "Remote MCP response root is not an array. ValueKind={ValueKind}",
            servers.ValueKind);

        return results;
    }

    foreach (var server in servers.EnumerateArray())
    {
        var serverName = server.ReadString("name");
        var serverGroupIds = server.ReadGuidArray("groupIds");

        _logger.LogInformation(
            "Remote MCP server: Name={ServerName}, Groups=[{Groups}]",
            serverName,
            string.Join(",", serverGroupIds));

        if (!server.TryGetProperty("tools", out var tools) ||
            tools.ValueKind != JsonValueKind.Array)
        {
            _logger.LogWarning(
                "Remote MCP server {ServerName} has no tools array.",
                serverName);

            continue;
        }

        foreach (var tool in tools.EnumerateArray())
        {
            if (!tool.TryReadGuid("id", out var toolId))
            {
                _logger.LogWarning(
                    "Skipping remote tool because tool ID is invalid. Server={ServerName}",
                    serverName);

                continue;
            }

            var toolName = tool.ReadString("name");

            _logger.LogInformation(
                "Remote tool found: Server={ServerName}, Tool={ToolName}, ToolId={ToolId}, Groups=[{Groups}]",
                serverName,
                toolName,
                toolId,
                string.Join(",", serverGroupIds));

            results.Add(new ToolOptionDto(
                toolId,
                toolName,
                "Remote",
                serverGroupIds));
        }
    }

    return results;
}

    private static bool IsAuthOrServerFailure(HttpStatusCode status)
        => status == HttpStatusCode.Unauthorized
           || status == HttpStatusCode.BadGateway
           || status == HttpStatusCode.ServiceUnavailable
           || status == HttpStatusCode.GatewayTimeout
           || (int)status >= 500;
}
