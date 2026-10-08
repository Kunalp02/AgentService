
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Agent.Application.DTOs;
using Agent.Application.Interfaces;
using ccil.ai.platform.common.Auth;

namespace Agent.Infrastructure.DownstreamClients;

public class HttpToolsConfigClient : IToolsConfigClient
{
    private const string ActiveRemoteMcpPath = "/internal/v1/remote-mcp-servers/active";

    private readonly HttpClient _http;
    private readonly ICurrentUser _currentUser;
    private readonly ILogger<HttpToolsConfigClient> _logger;
    private readonly string? _internalServiceKey;

    public HttpToolsConfigClient(
        HttpClient http,
        ICurrentUser currentUser,
        IConfiguration configuration,
        ILogger<HttpToolsConfigClient> logger)
    {
        _http = http;
        _currentUser = currentUser;
        _logger = logger;
        _internalServiceKey = configuration["ToolsConfigService:InternalServiceKey"]
                              ?? configuration["LocalMcpRuntime:ApiKey"];
    }

    private HttpRequestMessage BuildRequest(HttpMethod method, string path)
    {
        var request = new HttpRequestMessage(method, path);
        if (!string.IsNullOrEmpty(_currentUser.BearerToken))
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _currentUser.BearerToken);
        return request;
    }

    private HttpRequestMessage BuildInternalRemoteMcpRequest()
    {
        var request = BuildRequest(HttpMethod.Get, ActiveRemoteMcpPath);
        if (string.IsNullOrWhiteSpace(_internalServiceKey))
        {
            _logger.LogWarning(
                "Tools config internal MCP lookup skipped: configure ToolsConfigService:InternalServiceKey or LocalMcpRuntime:ApiKey.");
            return request;
        }

        request.Headers.TryAddWithoutValidation("X-Service-Key", _internalServiceKey);
        return request;
    }

    public async Task<(bool Reachable, IReadOnlyList<ModelOptionDto> Models)> GetActiveModelsAsync(string? classification, CancellationToken ct = default)
    {
        var (reachable, rows) = await FetchAvailableModelsAsync(classification, ct);
        if (!reachable)
            return (false, Array.Empty<ModelOptionDto>());

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
                return (true, null);

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

            var dto = await response.Content.ReadFromJsonAsync<ModelResolveDto>(
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true },
                ct);
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

    private sealed record RemoteMcpToolSnapshot(Guid Id, string Name, string? Description);

    private sealed record RemoteMcpServerSnapshot(
        Guid Id,
        string Name,
        string? RemoteMcpServerUrl,
        string? TransportType,
        string? AuthOption,
        string? ApiKey,
        HashSet<Guid> GroupIds,
        IReadOnlyList<RemoteMcpToolSnapshot> Tools);

    private static RemoteMcpServerSnapshot EmptyServer(Guid id, string name, HashSet<Guid> groupIds) =>
        new(id, name, null, null, null, null, groupIds, Array.Empty<RemoteMcpToolSnapshot>());

    public async Task<(bool Reachable, IReadOnlyList<RemoteMcpServerDetailDto> Servers)> GetActiveRemoteMcpServersAsync(
        CancellationToken ct = default)
    {
        var (reachable, servers) = await FetchActiveRemoteMcpServersAsync(ct);
        if (!reachable)
            return (false, Array.Empty<RemoteMcpServerDetailDto>());

        var details = servers
            .Where(s => s.Tools.Count > 0)
            .Select(s => new RemoteMcpServerDetailDto(
                s.Id,
                s.Name,
                s.RemoteMcpServerUrl,
                s.TransportType,
                s.AuthOption,
                string.IsNullOrWhiteSpace(s.ApiKey) ? null : s.ApiKey,
                s.GroupIds,
                s.Tools.Select(t => new RemoteMcpToolOptionDto(t.Id, t.Name, t.Description)).ToList()))
            .ToList();
        return (true, details);
    }

    public async Task<(bool Reachable, IReadOnlyList<ToolOptionDto> Tools)> GetAvailableToolsAsync(
        CancellationToken ct = default)
    {
        try
        {
            var results = new List<ToolOptionDto>();
            var anyOk = false;

            var localRequest = BuildRequest(HttpMethod.Get, "/api/v1/local-tools/approved");
            using var localResponse = await _http.SendAsync(localRequest, ct);

            if (localResponse.IsSuccessStatusCode)
            {
                anyOk = true;
                var localTools = await ReadToolList(localResponse, "Local", ct);
                _logger.LogInformation("Local tools parsed: Count={Count}", localTools.Count);
                results.AddRange(localTools);
            }

            _logger.LogInformation("Total available tools returned: Count={Count}", results.Count);
            return (anyOk, results);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Tools Config unreachable while fetching tools.");
            return (false, Array.Empty<ToolOptionDto>());
        }
    }

    public async Task<ReferenceCheck> ValidateToolVisibleAsync(
        Guid toolId,
        string toolType,
        IReadOnlyCollection<Guid> agentGroupIds,
        CancellationToken ct = default)
    {
        var isLocal = toolType.Equals("Local", StringComparison.OrdinalIgnoreCase);
        if (!isLocal)
            return await ValidateRemoteToolVisibleAsync(toolId, agentGroupIds, ct);

        var path = $"/api/v1/local-tools/{toolId}";
        const string expectedStatus = "Approved";

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

    private async Task<ReferenceCheck> ValidateRemoteToolVisibleAsync(
        Guid toolId,
        IReadOnlyCollection<Guid> agentGroupIds,
        CancellationToken ct)
    {
        try
        {
            var (reachable, servers) = await FetchActiveRemoteMcpServersAsync(ct);
            if (!reachable)
                return ReferenceCheck.Unreachable();

            foreach (var server in servers)
            {
                if (!GroupsAllowAssignment(server.GroupIds, agentGroupIds))
                    continue;

                var match = server.Tools.FirstOrDefault(t => t.Id == toolId);
                if (match is null)
                    continue;

                return ReferenceCheck.Valid(string.IsNullOrWhiteSpace(match.Name) ? null : match.Name);
            }

            return ReferenceCheck.NotVisible();
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "tools_config unreachable while validating remote tool {ToolId}", toolId);
            return ReferenceCheck.Unreachable();
        }
    }

    private async Task<(bool Reachable, IReadOnlyList<RemoteMcpServerSnapshot> Servers)> FetchActiveRemoteMcpServersAsync(
        CancellationToken ct)
    {
        var anyReachable = false;
        var best = Array.Empty<RemoteMcpServerSnapshot>();

        if (!string.IsNullOrWhiteSpace(_internalServiceKey))
        {
            var internalResult = await TryFetchRemoteServersAsync(ActiveRemoteMcpPath, useServiceKey: true, ct);
            if (internalResult.Reachable)
            {
                anyReachable = true;
                best = internalResult.Servers;
                if (CountTools(best) > 0)
                    return (true, best);
            }
        }
        else
        {
            _logger.LogWarning(
                "ToolsConfigService:InternalServiceKey is empty. Falling back to /api/v1/remote-mcp-servers/active-for-use with the caller token.");
        }

        // Agent editor listing uses the caller's JWT. This payload includes tools, groupIds, and remoteMcpServerUrl.
        var forUse = await TryFetchRemoteServersAsync("/api/v1/remote-mcp-servers/active-for-use", useServiceKey: false, ct);
        if (forUse.Reachable)
        {
            anyReachable = true;
            if (CountTools(forUse.Servers) > 0 || best.Length == 0)
                best = forUse.Servers;
            if (CountTools(best) > 0)
                return (true, best);
        }

        best = await HydrateMissingToolsAsync(best, ct);
        if (CountTools(best) == 0)
        {
            _logger.LogWarning(
                "Remote MCP lookup returned {ServerCount} server(s) and 0 tools. Check ToolsConfigService:InternalServiceKey and that active servers have a tools array.",
                best.Length);
        }

        return (anyReachable, best);
    }

    private async Task<(bool Reachable, RemoteMcpServerSnapshot[] Servers)> TryFetchRemoteServersAsync(
        string path,
        bool useServiceKey,
        CancellationToken ct)
    {
        try
        {
            using var request = useServiceKey
                ? BuildInternalRemoteMcpRequest()
                : BuildRequest(HttpMethod.Get, path);

            _logger.LogInformation("Calling Tools Config remote MCP endpoint: {Path}", path);
            using var response = await _http.SendAsync(request, ct);
            var body = await response.Content.ReadAsStringAsync(ct);
            _logger.LogInformation(
                "Remote MCP endpoint response: Path={Path}, StatusCode={StatusCode}, BodyLength={BodyLength}",
                path,
                (int)response.StatusCode,
                body.Length);

            if (IsAuthOrServerFailure(response.StatusCode) || !response.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "tools_config returned {Status} for {Path}. Body={Body}",
                    response.StatusCode,
                    path,
                    TrimForLog(body));
                return (false, Array.Empty<RemoteMcpServerSnapshot>());
            }

            using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "[]" : body);
            var list = doc.RootElement.UnwrapList();
            if (list.ValueKind != JsonValueKind.Array)
            {
                _logger.LogWarning(
                    "Remote MCP response for {Path} is not an array. ValueKind={ValueKind} Body={Body}",
                    path,
                    list.ValueKind,
                    TrimForLog(body));
                return (true, Array.Empty<RemoteMcpServerSnapshot>());
            }

            var servers = new List<RemoteMcpServerSnapshot>();
            foreach (var server in list.EnumerateArray())
                servers.Add(ParseRemoteMcpServer(server));

            _logger.LogInformation(
                "Parsed remote MCP servers from {Path}: Servers={ServerCount}, Tools={ToolCount}",
                path,
                servers.Count,
                CountTools(servers));
            return (true, servers.ToArray());
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "tools_config unreachable while fetching {Path}", path);
            return (false, Array.Empty<RemoteMcpServerSnapshot>());
        }
    }

    private async Task<RemoteMcpServerSnapshot[]> HydrateMissingToolsAsync(
        IReadOnlyList<RemoteMcpServerSnapshot> servers,
        CancellationToken ct)
    {
        if (servers.Count == 0 || CountTools(servers) > 0)
            return servers as RemoteMcpServerSnapshot[] ?? servers.ToArray();

        var hydrated = new List<RemoteMcpServerSnapshot>(servers.Count);
        foreach (var server in servers)
        {
            if (server.Tools.Count > 0 || server.Id == Guid.Empty)
            {
                hydrated.Add(server);
                continue;
            }

            var detail = await TryFetchServerByIdAsync(server.Id, ct);
            hydrated.Add(detail ?? server);
        }

        return hydrated.ToArray();
    }

    private async Task<RemoteMcpServerSnapshot?> TryFetchServerByIdAsync(Guid serverId, CancellationToken ct)
    {
        try
        {
            using var response = await _http.SendAsync(
                BuildRequest(HttpMethod.Get, $"/api/v1/remote-mcp-servers/{serverId}"), ct);
            if (!response.IsSuccessStatusCode)
                return null;

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
                return null;
            return ParseRemoteMcpServer(doc.RootElement);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load remote MCP server {ServerId}", serverId);
            return null;
        }
    }

    private RemoteMcpServerSnapshot ParseRemoteMcpServer(JsonElement server)
    {
        server.TryReadGuid("id", out var serverId);
        var serverName = server.ReadString("name");
        var serverGroupIds = server.ReadGuidArray("groupIds");
        var status = server.ReadString("status");

        if (IsInactiveRemoteServerStatus(status))
        {
            _logger.LogInformation(
                "Skipping remote MCP server {ServerName} with status {Status}",
                serverName,
                status);
            return EmptyServer(serverId, serverName, serverGroupIds);
        }

        var serverUrl = NullIfBlank(server.ReadString("remoteMcpServerUrl"));
        var transportType = NullIfBlank(server.ReadString("transportType"));
        var authOption = NullIfBlank(server.ReadString("authOption"));
        var apiKey = NullIfBlank(server.ReadString("apiKey"));

        if (!server.TryGetPropertyIgnoreCase("tools", out var tools) || tools.ValueKind != JsonValueKind.Array)
        {
            _logger.LogWarning(
                "Remote MCP server {ServerName} ({ServerId}) has no tools array. Url={Url}",
                serverName,
                serverId,
                serverUrl);
            return new RemoteMcpServerSnapshot(
                serverId, serverName, serverUrl, transportType, authOption, apiKey, serverGroupIds, Array.Empty<RemoteMcpToolSnapshot>());
        }

        var parsedTools = new List<RemoteMcpToolSnapshot>();
        foreach (var tool in tools.EnumerateArray())
        {
            if (!tool.TryReadGuid("id", out var toolId) && !tool.TryReadGuid("toolId", out toolId))
            {
                _logger.LogWarning(
                    "Skipping remote tool because tool ID is invalid. Server={ServerName}",
                    serverName);
                continue;
            }

            var toolName = tool.ReadString("name");
            if (string.IsNullOrWhiteSpace(toolName))
                toolName = tool.ReadString("toolName");

            var description = NullIfBlank(tool.ReadString("description"));
            parsedTools.Add(new RemoteMcpToolSnapshot(toolId, toolName, description));
        }

        _logger.LogInformation(
            "Remote MCP server {ServerName} parsed {ToolCount} tools. Groups=[{Groups}]",
            serverName,
            parsedTools.Count,
            string.Join(",", serverGroupIds));

        return new RemoteMcpServerSnapshot(
            serverId, serverName, serverUrl, transportType, authOption, apiKey, serverGroupIds, parsedTools);
    }

    private static string? NullIfBlank(string value) => string.IsNullOrWhiteSpace(value) ? null : value;

    private static int CountTools(IEnumerable<RemoteMcpServerSnapshot> servers)
        => servers.Sum(s => s.Tools.Count);

    private static string TrimForLog(string body)
        => body.Length <= 500 ? body : body[..500];

    private static bool GroupsAllowAssignment(HashSet<Guid> resourceGroupIds, IReadOnlyCollection<Guid> agentGroupIds)
    {
        if (resourceGroupIds.Count == 0)
            return true;
        return resourceGroupIds.Overlaps(agentGroupIds);
    }

    private static bool IsInactiveRemoteServerStatus(string status)
        => status.Equals("Inactive", StringComparison.OrdinalIgnoreCase)
           || status.Equals("Disabled", StringComparison.OrdinalIgnoreCase)
           || status.Equals("Deleted", StringComparison.OrdinalIgnoreCase)
           || status.Equals("Draft", StringComparison.OrdinalIgnoreCase);

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

    private static bool IsAuthOrServerFailure(HttpStatusCode status)
        => status == HttpStatusCode.Unauthorized
           || status == HttpStatusCode.BadGateway
           || status == HttpStatusCode.ServiceUnavailable
           || status == HttpStatusCode.GatewayTimeout
           || (int)status >= 500;
}
