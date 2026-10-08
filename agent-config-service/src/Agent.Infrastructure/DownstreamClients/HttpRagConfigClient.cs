
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Agent.Application.DTOs;
using Agent.Application.Interfaces;
using ccil.ai.platform.common.Auth;

namespace Agent.Infrastructure.DownstreamClients;

public class HttpRagConfigClient : IRagConfigClient
{
    private readonly HttpClient _http;
    private readonly ICurrentUser _currentUser;
    private readonly ILogger<HttpRagConfigClient> _logger;

    public HttpRagConfigClient(HttpClient http, ICurrentUser currentUser, ILogger<HttpRagConfigClient> logger)
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

    public async Task<(bool Reachable, IReadOnlyList<KnowledgeBaseOptionDto> KnowledgeBases)> GetAvailableKnowledgeBasesAsync(CancellationToken ct = default)
    {
        // Knowledge / RAG page uses GET /api/v1/knowledge-bases?page=&pageSize=.
        // Studio used /available, which is a different (often empty) picker contract.
        var listed = await FetchKbListAsync("/api/v1/knowledge-bases?page=1&pageSize=200", ct);
        if (listed.Reachable && listed.KnowledgeBases.Count > 0)
            return listed;

        var available = await FetchKbListAsync("/api/v1/knowledge-bases/available", ct);
        if (available.Reachable && available.KnowledgeBases.Count > 0)
            return available;

        if (listed.Reachable)
            return listed;
        return available;
    }

    private async Task<(bool Reachable, IReadOnlyList<KnowledgeBaseOptionDto> KnowledgeBases)> FetchKbListAsync(
        string path,
        CancellationToken ct)
    {
        try
        {
            using var response = await _http.SendAsync(BuildRequest(HttpMethod.Get, path), ct);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("rag_config returned {Status} for {Path}", response.StatusCode, path);
                return (false, Array.Empty<KnowledgeBaseOptionDto>());
            }

            var body = await response.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(body);
            var list = doc.RootElement.UnwrapList();
            if (list.ValueKind != JsonValueKind.Array)
            {
                _logger.LogWarning("rag_config {Path} JSON was not a KB array (kind {Kind})", path, list.ValueKind);
                return (false, Array.Empty<KnowledgeBaseOptionDto>());
            }

            var kbs = new List<KnowledgeBaseOptionDto>();
            foreach (var k in list.EnumerateArray())
            {
                if (!k.TryReadKnowledgeBaseId(out var id) || id == Guid.Empty)
                    continue;
                var name = k.ReadString("name");
                if (string.IsNullOrEmpty(name))
                    name = k.ReadString("title");
                if (string.IsNullOrEmpty(name))
                    name = id.ToString();
                // GroupIds let the editor filter knowledge bases by the agent's selected groups.
                kbs.Add(new KnowledgeBaseOptionDto(id, name, ReadStrategy(k), ReadGroupIds(k)));
            }

            _logger.LogInformation("rag_config {Path} returned {Count} knowledge bases", path, kbs.Count);
            return (true, kbs);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "rag_config unreachable while fetching knowledge bases from {Path}", path);
            return (false, Array.Empty<KnowledgeBaseOptionDto>());
        }
    }

    // public async Task<ReferenceCheck> ValidateKnowledgeBaseVisibleAsync(
    //     Guid knowledgeBaseId,
    //     IReadOnlyCollection<Guid> agentGroupIds,
    //     CancellationToken ct = default)
    // {
    //     try
    //     {
    //         using var response = await _http.SendAsync(
    //             BuildRequest(HttpMethod.Get, $"/api/v1/knowledge-bases/{knowledgeBaseId}"), ct);
    //
    //         if (IsUnreachable(response.StatusCode))
    //         {
    //             _logger.LogWarning("rag_config returned {Status} while validating knowledge base {KbId}", response.StatusCode, knowledgeBaseId);
    //             return ReferenceCheck.Unreachable();
    //         }
    //
    //         if (response.StatusCode == HttpStatusCode.NotFound || response.StatusCode == HttpStatusCode.Forbidden)
    //             return ReferenceCheck.NotVisible();
    //
    //         if (!response.IsSuccessStatusCode)
    //             return ReferenceCheck.Unreachable();
    //
    //         using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
    //         var root = doc.RootElement;
    //         if (root.TryGetPropertyIgnoreCase("data", out var data) && data.ValueKind == JsonValueKind.Object)
    //             root = data;
    //
    //         var name = root.ReadString("name");
    //         if (string.IsNullOrWhiteSpace(name))
    //             name = root.ReadString("title");
    //         
    //         IReadOnlyCollection<Guid> kbGroups;
    //         if (root.TryGetPropertyIgnoreCase("groupIds", out _) || root.TryGetPropertyIgnoreCase("ownerGroupIds", out _))
    //         {
    //             kbGroups = ReadGroupIds(root);
    //         }
    //         else
    //         {
    //             var (reachable, all) = await GetAvailableKnowledgeBasesAsync(ct);
    //             if (!reachable)
    //                 return ReferenceCheck.Unreachable();
    //             var match = all.FirstOrDefault(k => k.Id == knowledgeBaseId);
    //             if (match is null)
    //                 return ReferenceCheck.NotVisible();
    //             kbGroups = match.GroupIds as IReadOnlyCollection<Guid> ?? match.GroupIds.ToList();
    //         }
    //
    //         if (kbGroups.Count > 0 && !kbGroups.Any(agentGroupIds.Contains))
    //             return ReferenceCheck.NotVisible();
    //
    //         return ReferenceCheck.Valid(string.IsNullOrWhiteSpace(name) ? null : name);
    //     }
    //     catch (OperationCanceledException) when (ct.IsCancellationRequested)
    //     {
    //         throw;
    //     }
    //     catch (Exception ex)
    //     {
    //         _logger.LogWarning(ex, "rag_config unreachable while validating knowledge base {KbId}", knowledgeBaseId);
    //         return ReferenceCheck.Unreachable();
    //     }
    // }
    public async Task<ReferenceCheck> ValidateKnowledgeBaseVisibleAsync(
        Guid knowledgeBaseId,
        IReadOnlyCollection<Guid> agentGroupIds,
        CancellationToken ct = default)
    {
        try
        {
            using var response = await _http.SendAsync(
                BuildRequest(HttpMethod.Get, $"/api/v1/knowledge-bases/{knowledgeBaseId}"), ct);

            if (IsUnreachable(response.StatusCode))
            {
                _logger.LogWarning("rag_config returned {Status} while validating knowledge base {KbId}", response.StatusCode, knowledgeBaseId);
                return ReferenceCheck.Unreachable();
            }

            if (response.StatusCode == HttpStatusCode.NotFound || response.StatusCode == HttpStatusCode.Forbidden)
                return ReferenceCheck.NotVisible();

            if (!response.IsSuccessStatusCode)
                return ReferenceCheck.Unreachable();

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
            var root = doc.RootElement;
            if (root.TryGetPropertyIgnoreCase("data", out var data) && data.ValueKind == JsonValueKind.Object)
                root = data;

            var groups = ReadGroupIds(root);
            if (groups.Count > 0 && !groups.Any(agentGroupIds.Contains))
                return ReferenceCheck.NotVisible();

            var name = root.ReadString("name");
            if (string.IsNullOrWhiteSpace(name))
                name = root.ReadString("title");
            return ReferenceCheck.Valid(string.IsNullOrWhiteSpace(name) ? null : name);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "rag_config unreachable while validating knowledge base {KbId}", knowledgeBaseId);
            return ReferenceCheck.Unreachable();
        }
    }
    private static IReadOnlyCollection<Guid> ReadGroupIds(JsonElement el)
    {
        var ids = el.ReadGuidArray("groupIds");
        if (ids.Count == 0)
            ids = el.ReadGuidArray("ownerGroupIds");
        return ids.ToList();
    }

    private static string ReadStrategy(JsonElement el)
    {
        var strategyName = el.ReadString("strategyName");
        if (!string.IsNullOrEmpty(strategyName))
            return strategyName;
        var strategyId = el.ReadString("strategyId");
        if (!string.IsNullOrEmpty(strategyId))
            return strategyId;
        if (el.TryGetPropertyIgnoreCase("strategy", out var strategy) && strategy.ValueKind == JsonValueKind.Object)
        {
            var nested = strategy.ReadString("name");
            if (!string.IsNullOrEmpty(nested))
                return nested;
        }

        return "";
    }

    private static bool IsUnreachable(HttpStatusCode status)
        => status == HttpStatusCode.Unauthorized
           || status == HttpStatusCode.BadGateway
           || status == HttpStatusCode.ServiceUnavailable
           || status == HttpStatusCode.GatewayTimeout
           || (int)status >= 500;
}
