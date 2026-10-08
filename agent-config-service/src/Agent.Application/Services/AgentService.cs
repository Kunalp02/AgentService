
using Agent.Application.Authorization;
using Agent.Application.DTOs;
using Agent.Application.Groups;
using Agent.Application.Interfaces;
using Agent.Domain.Entities;
using Agent.Domain.Enums;
using ccil.ai.platform.common.Auth;
using ccil.ai.platform.common.Constants;
using Microsoft.EntityFrameworkCore;

namespace Agent.Application.Services;

public class AgentService : IAgentService
{
    private readonly IAgentDbContext _db;
    private readonly IToolsConfigClient _toolsClient;
    private readonly IRagConfigClient _ragClient;
    private readonly ICurrentUser _currentUser;

    public AgentService(
        IAgentDbContext db,
        IToolsConfigClient toolsClient,
        IRagConfigClient ragClient,
        ICurrentUser currentUser)
    {
        _db = db;
        _toolsClient = toolsClient;
        _ragClient = ragClient;
        _currentUser = currentUser;
    }

    private static AgentDto ToDto(AgentDefinition a) => new(
        a.Id, a.Name, a.Description, a.ModelId, a.ModelNameCache, a.Temperature, a.SystemPrompt,
        a.Status.ToString(), a.OwnerUserId, a.OwnerUsername,
        a.AgentGroups.Select(g => g.GroupId),
        a.AgentKnowledgeBases.Select(kb => new AgentKnowledgeBaseDto(kb.KnowledgeBaseId, kb.KnowledgeBaseNameCache, kb.Mode.ToString())),
        a.AgentTools.Select(t => new AgentToolDto(t.ToolId, t.ToolNameCache, t.ToolType.ToString())),
        a.MemoryEnabled, a.MemoryScope?.ToString(), a.MemoryRetention?.ToString(), a.MemoryInstructions,
        a.CreatedAt, a.UpdatedAt);

    private static AgentListItemDto ToListItem(AgentDefinition a) => new(
        a.Id, a.Name, a.Status.ToString(), a.OwnerUsername,
        a.AgentGroups.Select(g => g.GroupId),
        a.CreatedAt);

    private bool IsAdminScoped =>
        _currentUser.HasPermission("*") || _currentUser.HasPermission(Permissions.Platform.SuperAdmin);

    private HashSet<Guid> CallerGroupIds() => GroupClaimParser.ParseIds(_currentUser.Groups);

    private void EnsureQueryGroupAllowed(Guid? groupId)
    {
        if (!groupId.HasValue || IsAdminScoped)
            return;

        if (!CallerGroupIds().Contains(groupId.Value))
            throw new AppException(ErrorCodes.ValidationFailed,
                $"Group {groupId.Value} is not in your token. You can only filter by groups you belong to.",
                400);
    }
    
    private bool IsSubsetOfCaller(AgentDefinition agent)
    {
        var caller = CallerGroupIds();
        return agent.AgentGroups.Count > 0
               && agent.AgentGroups.All(g => caller.Contains(g.GroupId));
    }

    // private IQueryable<AgentDefinition> BaseQuery()
    // {
    //     var q = _db.Agents.AsNoTracking()
    //         .Include(a => a.AgentGroups).Include(a => a.AgentKnowledgeBases).Include(a => a.AgentTools)
    //         .Where(a => !a.IsDeleted);
    //
    //     if (!IsAdminScoped)
    //     {
    //         var callerGroupIds = CallerGroupIds().ToList();
    //         q = q.Where(a =>
    //             a.AgentGroups.Any()
    //             && a.AgentGroups.All(g => callerGroupIds.Contains(g.GroupId)));
    //     }
    //
    //     return q;
    // }

    public async Task<PagedResult<AgentListItemDto>> ListAsync(AgentQueryParams query, CancellationToken ct = default)
    {
        EnsureQueryGroupAllowed(query.GroupId);

        var q = BaseQuery();
        if (!string.IsNullOrWhiteSpace(query.Status) && Enum.TryParse<AgentStatus>(query.Status, true, out var status))
            q = q.Where(a => a.Status == status);
        if (query.GroupId.HasValue)
            q = q.Where(a => a.AgentGroups.Any(g => g.GroupId == query.GroupId));
        if (!string.IsNullOrWhiteSpace(query.Search))
            q = q.Where(a => a.Name.Contains(query.Search));

        var total = await q.CountAsync(ct);
        var page = Math.Max(1, query.Page);
        var pageSize = Math.Clamp(query.PageSize, 1, 200);
        var items = await q.OrderByDescending(a => a.UpdatedAt ?? a.CreatedAt)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        return new PagedResult<AgentListItemDto>(items.Select(ToListItem), total, page, pageSize);
    }

    public async Task<AgentDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var a = await BaseQuery().FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new AppException(ErrorCodes.NotFound, "Agent not found or not accessible to your groups.", 404);

        return ToDto(a);
    }

    public async Task<AgentRuntimeManifestDto> GetRuntimeManifestAsync(Guid id, CancellationToken ct = default)
    {
        var agent = await BaseQuery().FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new AppException(ErrorCodes.NotFound, "Agent not found or not accessible to your groups.", 404);

        var groupIds = agent.AgentGroups.Select(g => g.GroupId).ToList();
        var (modelReachable, modelDetail) = await _toolsClient.GetModelAsync(agent.ModelId, ct);

        RuntimeModelConfigDto modelConfig;
        if (modelDetail is not null)
        {
            if (modelDetail.GroupIds.Count > 0 && !modelDetail.GroupIds.Overlaps(groupIds))
                throw new AppException(ErrorCodes.ValidationFailed,
                    $"Model {agent.ModelId} is not visible to this agent's groups.", 400);

            modelConfig = new RuntimeModelConfigDto(
                modelDetail.ModelId,
                modelDetail.Name ?? agent.ModelNameCache,
                string.IsNullOrWhiteSpace(modelDetail.ModelIdentifier)
                    ? agent.ModelNameCache ?? "gpt-4o-mini"
                    : modelDetail.ModelIdentifier,
                modelDetail.Provider,
                modelDetail.BaseUrl,
                modelDetail.GroupIds);
        }
        else if (!modelReachable)
        {
            throw new AppException("DOWNSTREAM_UNAVAILABLE",
                "Tools/model service is unavailable. Cannot resolve runtime model details.", 503);
        }
        else if (!string.IsNullOrWhiteSpace(agent.ModelNameCache))
        {
            modelConfig = new RuntimeModelConfigDto(
                agent.ModelId,
                agent.ModelNameCache,
                agent.ModelNameCache,
                "openai",
                null,
                Array.Empty<Guid>());
        }
        else
        {
            throw new AppException(ErrorCodes.ValidationFailed,
                $"Model {agent.ModelId} is not active, not visible, or does not exist.", 400);
        }

        var (resolveReachable, resolved) = await _toolsClient.ResolveModelAsync(agent.ModelId, ct);
        if (!resolveReachable)
            throw new AppException("DOWNSTREAM_UNAVAILABLE",
                "Tools/model service is unavailable. Cannot resolve gateway for model.", 503);

        if (resolved is not null && !string.IsNullOrWhiteSpace(resolved.GatewayUrl))
        {
            modelConfig = modelConfig with { BaseUrl = resolved.GatewayUrl };
        }

        var tools = agent.AgentTools
            .Select(t => new RuntimeAgentToolRefDto(t.ToolId, t.ToolNameCache, t.ToolType.ToString()))
            .ToList();

        var knowledgeBases = agent.AgentKnowledgeBases
            .Select(kb => new RuntimeKnowledgeBaseRefDto(
                kb.KnowledgeBaseId,
                kb.KnowledgeBaseNameCache,
                kb.Mode.ToString()))
            .ToList();

        var memory = new RuntimeMemoryConfigDto(
            agent.MemoryEnabled,
            agent.MemoryScope?.ToString(),
            agent.MemoryRetention?.ToString(),
            agent.MemoryInstructions);

        var manifestHash = RuntimeManifestHash.Compute(
            agent.SystemPrompt,
            agent.Temperature,
            modelConfig.ModelIdentifier,
            tools,
            knowledgeBases,
            memory,
            agent.Status.ToString());

        return new AgentRuntimeManifestDto(
            agent.Id,
            agent.Name,
            agent.Status.ToString(),
            groupIds,
            agent.SystemPrompt,
            agent.Temperature,
            modelConfig,
            tools,
            knowledgeBases,
            memory,
            manifestHash);
    }

    private static void EnsureReference(ReferenceCheck check, string unreachableMessage, string notVisibleMessage)
    {
        if (check.IsValid)
            return;
        if (check.Status == ReferenceCheckStatus.Unreachable)
            throw new AppException("DOWNSTREAM_UNAVAILABLE", unreachableMessage, 503);
        throw new AppException(ErrorCodes.ValidationFailed, notVisibleMessage, 400);
    }
    private async Task<(
        string? ModelName,
        List<(AgentKnowledgeBaseInput Input, string? Name)> Kbs,
        List<(AgentToolInput Input, string? Name)> Tools)>
        ValidateReferencesAsync(
            Guid modelId,
            IEnumerable<Guid> groupIds,
            IEnumerable<AgentKnowledgeBaseInput> kbs,
            IEnumerable<AgentToolInput> tools,
            CancellationToken ct)
    {
        var groups = groupIds.ToList();
        Console.WriteLine(groups);

        var modelCheck = await _toolsClient.ValidateModelVisibleAsync(modelId, groups, ct);
        EnsureReference(modelCheck,
            "Tools/model service is unavailable or rejected the caller token. Cannot validate the selected model.",
            $"Model {modelId} is not active, not available to the selected groups, or does not exist.");

        // var kbResults = new List<(AgentKnowledgeBaseInput, string?)>();
        // foreach (var kb in kbs)
        // {
        //     var check = await _ragClient.ValidateKnowledgeBaseVisibleAsync(kb.KnowledgeBaseId, groups, ct);
        //     EnsureReference(check,
        //         "RAG service is unavailable or rejected the caller token. Cannot validate knowledge bases.",
        //         $"Knowledge Base {kb.KnowledgeBaseId} is not available to the selected groups or does not exist.");
        //     kbResults.Add((kb, check.Name));
        // }
        //
        // var toolResults = new List<(AgentToolInput, string?)>();
        // foreach (var tool in tools)
        // {
        //     var check = await _toolsClient.ValidateToolVisibleAsync(tool.ToolId, tool.ToolType, groups, ct);
        //     EnsureReference(check,
        //         "Tools service is unavailable or rejected the caller token. Cannot validate tools.",
        //         $"Tool {tool.ToolId} ({tool.ToolType}) is not active/approved, not available to the selected groups, or does not exist.");
        //     toolResults.Add((tool, check.Name));
        // }

        var kbResults = new List<(AgentKnowledgeBaseInput, string?)>();
        foreach (var kb in kbs)
        {
            var check = await _ragClient.ValidateKnowledgeBaseVisibleAsync(kb.KnowledgeBaseId, groups, ct);
            EnsureReference(check,
                "RAG service is unavailable or rejected the caller token. Cannot validate knowledge bases.",
                $"Knowledge Base {kb.KnowledgeBaseId} is not visible to this agent's groups or does not exist.");
            kbResults.Add((kb, check.Name));
        }

        var toolResults = new List<(AgentToolInput, string?)>();
        foreach (var tool in tools)
        {
            var check = await _toolsClient.ValidateToolVisibleAsync(tool.ToolId, tool.ToolType, groups, ct);
            EnsureReference(check,
                "Tools service is unavailable or rejected the caller token. Cannot validate tools.",
                $"Tool {tool.ToolId} ({tool.ToolType}) is not active/approved or is not visible to this agent's groups.");
            toolResults.Add((tool, check.Name));
        }
        
        
        return (modelCheck.Name, kbResults, toolResults);
    }

    private static List<Guid> ResolveAssignedGroupIds(IEnumerable<Guid>? groupIds)
    {
        var requested = (groupIds ?? Array.Empty<Guid>())
            .Where(id => id != Guid.Empty).Distinct().ToList();

        if (requested.Count == 0)
            throw new AppException(ErrorCodes.ValidationFailed,
                "Select at least one group for this agent.", 400);

        return requested;
    }

    private void EnsureCallerMayAssign(IReadOnlyCollection<Guid> groupIds)
    {
        if (groupIds.Count == 0)
            throw new AppException(ErrorCodes.ValidationFailed,
                "At least one group id is required. It must come from the groups claim on your token.",
                400);

        if (IsAdminScoped)
            return;

        var callerIds = CallerGroupIds();
        if (callerIds.Count == 0)
            throw new AppException(ErrorCodes.ValidationFailed,
                "Your token has no group ids. JWT groups must be comma-separated GUIDs or {guid}:{label} pairs.",
                400);

        foreach (var id in groupIds)
        {
            if (!callerIds.Contains(id))
                throw new AppException(ErrorCodes.ValidationFailed,
                    $"Group {id} is not in your token. You can only attach groups you belong to.",
                    400);
        }
    }

    private static void SyncGroups(AgentDefinition agent, IReadOnlyCollection<Guid> desiredIds)
    {
        var desiredSet = desiredIds.ToHashSet();

        foreach (var row in agent.AgentGroups.Where(g => !desiredSet.Contains(g.GroupId)).ToList())
            agent.AgentGroups.Remove(row);

        var present = agent.AgentGroups.Select(g => g.GroupId).ToHashSet();
        foreach (var gid in desiredSet)
        {
            if (present.Contains(gid))
                continue;
            agent.AgentGroups.Add(new AgentGroup { AgentId = agent.Id, GroupId = gid, GroupName = null });
        }
    }

    private static void SyncKnowledgeBases(
        AgentDefinition agent,
        IEnumerable<(AgentKnowledgeBaseInput Input, string? Name)> kbs)
    {
        var desired = kbs.ToList();
        var desiredIds = desired.Select(x => x.Input.KnowledgeBaseId).ToHashSet();

        foreach (var row in agent.AgentKnowledgeBases.Where(k => !desiredIds.Contains(k.KnowledgeBaseId)).ToList())
            agent.AgentKnowledgeBases.Remove(row);

        var byId = agent.AgentKnowledgeBases.ToDictionary(k => k.KnowledgeBaseId);
        foreach (var x in desired)
        {
            var mode = Enum.Parse<KnowledgeBaseMode>(x.Input.Mode, true);
            if (byId.TryGetValue(x.Input.KnowledgeBaseId, out var row))
            {
                row.Mode = mode;
                row.KnowledgeBaseNameCache = x.Name;
            }
            else
            {
                agent.AgentKnowledgeBases.Add(new AgentKnowledgeBase
                {
                    AgentId = agent.Id,
                    KnowledgeBaseId = x.Input.KnowledgeBaseId,
                    KnowledgeBaseNameCache = x.Name,
                    Mode = mode
                });
            }
        }
    }

    private static void SyncTools(
        AgentDefinition agent,
        IEnumerable<(AgentToolInput Input, string? Name)> tools)
    {
        var desired = tools.Select(x => (
            x.Input.ToolId,
            Type: Enum.Parse<Domain.Enums.ToolType>(x.Input.ToolType, true),
            x.Name
        )).ToList();
        var desiredKeys = desired.Select(x => (x.ToolId, x.Type)).ToHashSet();

        foreach (var row in agent.AgentTools.Where(t => !desiredKeys.Contains((t.ToolId, t.ToolType))).ToList())
            agent.AgentTools.Remove(row);

        var present = agent.AgentTools.ToDictionary(t => (t.ToolId, t.ToolType));
        foreach (var x in desired)
        {
            if (present.TryGetValue((x.ToolId, x.Type), out var row))
            {
                row.ToolNameCache = x.Name;
            }
            else
            {
                agent.AgentTools.Add(new AgentTool
                {
                    AgentId = agent.Id,
                    ToolId = x.ToolId,
                    ToolNameCache = x.Name,
                    ToolType = x.Type
                });
            }
        }
    }

    private void AddAudit(Guid agentId, string action, string changedBy) =>
        _db.AgentAudits.Add(new AgentAudit
        {
            AgentId = agentId,
            Action = action,
            ChangedBy = changedBy
        });

    private async Task<AgentDto> SaveAndReturnAsync(AgentDefinition agent, CancellationToken ct)
    {
        await _db.SaveChangesAsync(ct);
        return ToDto(agent);
    }

    public async Task<AgentDto> CreateAsync(CreateAgentRequest request, Guid ownerUserId, string ownerUsername, CancellationToken ct = default)
    {
        var kbsIn = request.KnowledgeBases ?? Array.Empty<AgentKnowledgeBaseInput>();
        var toolsIn = request.Tools ?? Array.Empty<AgentToolInput>();
        var assignedGroups = ResolveAssignedGroupIds(request.GroupIds);
        EnsureCallerMayAssign(assignedGroups);
        var groupIds = assignedGroups;

        var (modelName, kbs, tools) = await ValidateReferencesAsync(
            request.ModelId, groupIds, kbsIn, toolsIn, ct);

        var agent = new AgentDefinition
        {
            Name = request.Name,
            Description = request.Description,
            ModelId = request.ModelId,
            ModelNameCache = modelName,
            Temperature = request.Temperature,
            SystemPrompt = request.SystemPrompt,
            Status = AgentStatus.Draft,
            OwnerUserId = ownerUserId,
            OwnerUsername = ownerUsername,
            CreatedBy = ownerUsername
        };

        agent.AgentGroups = groupIds.Select(gid => new AgentGroup
        {
            AgentId = agent.Id,
            GroupId = gid,
            GroupName = null
        }).ToList();
        agent.AgentKnowledgeBases = kbs.Select(x => new AgentKnowledgeBase
        {
            AgentId = agent.Id,
            KnowledgeBaseId = x.Input.KnowledgeBaseId,
            KnowledgeBaseNameCache = x.Name,
            Mode = Enum.Parse<KnowledgeBaseMode>(x.Input.Mode, true)
        }).ToList();
        agent.AgentTools = tools.Select(x => new AgentTool
        {
            AgentId = agent.Id,
            ToolId = x.Input.ToolId,
            ToolNameCache = x.Name,
            ToolType = Enum.Parse<Domain.Enums.ToolType>(x.Input.ToolType, true)
        }).ToList();
        ApplyMemoryConfig(agent, request.MemoryEnabled, request.MemoryScope, request.MemoryRetention, request.MemoryInstructions);
        AddAudit(agent.Id, "Created", ownerUsername);
        _db.Agents.Add(agent);
        return await SaveAndReturnAsync(agent, ct);
    }

    public async Task<AgentDto> PatchAsync(Guid id, PatchAgentRequest request, string updatedBy, CancellationToken ct = default)
    {
        var agent = await LoadTrackedAsync(id, ct);
        EnsureCanModify(agent); 

        var effectiveModelId = request.ModelId ?? agent.ModelId;
        var effectiveGroupIds = request.GroupIds is not null
            ? ResolveAssignedGroupIds(request.GroupIds)
            : agent.AgentGroups.Select(g => g.GroupId).ToList();
        if (request.GroupIds is not null)
            EnsureCallerMayAssign(effectiveGroupIds); 

        if (request.ModelId.HasValue || request.KnowledgeBases is not null || request.Tools is not null || request.GroupIds is not null)
        {
            var (modelName, kbs, tools) = await ValidateReferencesAsync(
                effectiveModelId, effectiveGroupIds,
                request.KnowledgeBases ?? agent.AgentKnowledgeBases.Select(kb => new AgentKnowledgeBaseInput(kb.KnowledgeBaseId, kb.Mode.ToString())),
                request.Tools ?? agent.AgentTools.Select(t => new AgentToolInput(t.ToolId, t.ToolType.ToString())),
                ct);

            agent.ModelId = effectiveModelId;
            agent.ModelNameCache = modelName;

            if (request.KnowledgeBases is not null)
                SyncKnowledgeBases(agent, kbs);
            if (request.Tools is not null)
                SyncTools(agent, tools);
        }

        if (request.Name is not null) agent.Name = request.Name;
        if (request.MemoryEnabled.HasValue || request.MemoryScope is not null || request.MemoryRetention is not null || request.MemoryInstructions is not null)
        {
            var effectiveEnabled = request.MemoryEnabled ?? agent.MemoryEnabled;
            var effectiveScope = request.MemoryScope ?? agent.MemoryScope?.ToString();
            var effectiveRetention = request.MemoryRetention ?? agent.MemoryRetention?.ToString();
            var effectiveInstructions = request.MemoryInstructions ?? agent.MemoryInstructions;
            ApplyMemoryConfig(agent, effectiveEnabled, effectiveScope, effectiveRetention, effectiveInstructions);
        }
        if (request.Description is not null) agent.Description = request.Description;
        if (request.Temperature.HasValue) agent.Temperature = request.Temperature.Value;
        if (request.SystemPrompt is not null) agent.SystemPrompt = request.SystemPrompt;
        if (request.GroupIds is not null)
            SyncGroups(agent, effectiveGroupIds);

        agent.UpdatedBy = updatedBy;
        agent.UpdatedAt = DateTimeOffset.UtcNow;
        AddAudit(agent.Id, "Updated", updatedBy);
        return await SaveAndReturnAsync(agent, ct);
    }

    public async Task<AgentDto> UpdateAsync(Guid id, UpdateAgentRequest request, string updatedBy, CancellationToken ct = default)
    {
        var agent = await LoadTrackedAsync(id, ct);
        EnsureCanModify(agent);

        var assignedGroups = ResolveAssignedGroupIds(request.GroupIds);
        EnsureCallerMayAssign(assignedGroups);

        var (modelName, kbs, tools) = await ValidateReferencesAsync(
            request.ModelId, assignedGroups, request.KnowledgeBases, request.Tools, ct);

        agent.Name = request.Name;
        agent.Description = request.Description;
        agent.ModelId = request.ModelId;
        agent.ModelNameCache = modelName;
        agent.Temperature = request.Temperature;
        agent.SystemPrompt = request.SystemPrompt;
        agent.UpdatedBy = updatedBy;
        agent.UpdatedAt = DateTimeOffset.UtcNow;

        SyncGroups(agent, assignedGroups);
        SyncKnowledgeBases(agent, kbs);
        SyncTools(agent, tools);

        AddAudit(agent.Id, "Updated", updatedBy);
        return await SaveAndReturnAsync(agent, ct);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var agent = await LoadTrackedAsync(id, ct);
        EnsureCanModify(agent);

        agent.IsDeleted = true;
        agent.ModelNameCache = null;
        agent.UpdatedBy = _currentUser.Username ?? "unknown";
        agent.UpdatedAt = DateTimeOffset.UtcNow;
        AddAudit(agent.Id, "Deleted", agent.UpdatedBy);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<AgentDto> PublishAsync(Guid id, string publishedBy, CancellationToken ct = default)
    {
        var agent = await LoadTrackedAsync(id, ct);
        EnsureCanModify(agent);

        agent.Status = AgentStatus.Published;
        agent.UpdatedBy = publishedBy;
        agent.UpdatedAt = DateTimeOffset.UtcNow;
        AddAudit(agent.Id, "Published", publishedBy);
        return await SaveAndReturnAsync(agent, ct);
    }

    private async Task<AgentDefinition> LoadTrackedAsync(Guid id, CancellationToken ct)
        => await _db.Agents
            .Include(a => a.AgentGroups)
            .Include(a => a.AgentKnowledgeBases)
            .Include(a => a.AgentTools)
            .FirstOrDefaultAsync(a => a.Id == id && !a.IsDeleted, ct)
            ?? throw new AppException(ErrorCodes.NotFound, "Agent not found.", 404);

    // private void EnsureCanModify(AgentDefinition agent)
    // {
    //     if (IsAdminScoped) return;
    //     if (IsSubsetOfCaller(agent)) return;
    //     throw new AppException(ErrorCodes.Forbidden, "You do not have access to modify this agent.", 403);
    // }

    private bool CallerCoversAgentGroups(AgentDefinition agent)
    {
        var agentGroupIds = agent.AgentGroups.Select(g => g.GroupId).ToList();
        if (agentGroupIds.Count == 0)
            return false;

        var callerGroupIds = CallerGroupIds();
        return agentGroupIds.All(callerGroupIds.Contains);
    }

    private IQueryable<AgentDefinition> BaseQuery()
    {
        var q = _db.Agents.AsNoTracking()
            .Include(a => a.AgentGroups).Include(a => a.AgentKnowledgeBases).Include(a => a.AgentTools)
            .Where(a => !a.IsDeleted);

        if (!IsAdminScoped)
        {
            var callerGroupIds = CallerGroupIds().ToList();
            q = q.Where(a =>
                a.AgentGroups.Any()
                && a.AgentGroups.All(g => callerGroupIds.Contains(g.GroupId)));
        }

        return q;
    }

    private void EnsureCanModify(AgentDefinition agent)
    {
        if (IsAdminScoped)
            return;
        if (CallerCoversAgentGroups(agent))
            return;
        throw new AppException(ErrorCodes.Forbidden, "You do not have access to modify this agent.", 403);
    }
    private static void ApplyMemoryConfig(AgentDefinition agent, bool enabled, string? scope, string? retention, string? instructions)
    {
        if (enabled)
        {
            if (string.IsNullOrWhiteSpace(scope) || !Enum.TryParse<AgentMemoryScope>(scope, true, out var scopeEnum))
                throw new AppException(ErrorCodes.ValidationFailed,
                    "MemoryScope is required and must be one of Session, User, Agent, Organization when memory is enabled.", 400);
            if (string.IsNullOrWhiteSpace(retention) || !Enum.TryParse<AgentMemoryRetention>(retention, true, out var retentionEnum))
                throw new AppException(ErrorCodes.ValidationFailed,
                    "MemoryRetention is required and must be one of Session, Days7, Days30, Days90, Years1, Forever when memory is enabled.", 400);

            agent.MemoryEnabled = true;
            agent.MemoryScope = scopeEnum;
            agent.MemoryRetention = retentionEnum;
            agent.MemoryInstructions = instructions;
        }
        else
        {
            agent.MemoryEnabled = false;
            agent.MemoryScope = null;
            agent.MemoryRetention = null;
            agent.MemoryInstructions = instructions;
        }
    }

    public async Task<AgentDto> UnpublishAsync(Guid id, string updatedBy, CancellationToken ct = default)
    {
        var agent = await LoadTrackedAsync(id, ct);
        EnsureCanModify(agent);
        agent.Status = AgentStatus.Draft;
        agent.UpdatedBy = updatedBy;
        agent.UpdatedAt = DateTimeOffset.UtcNow;
        AddAudit(agent.Id, "Unpublished", updatedBy);
        return await SaveAndReturnAsync(agent, ct);
    }

    public async Task<AgentEditorOptionsDto> GetEditorOptionsAsync(CancellationToken ct = default)
    {
        var modelsTask = _toolsClient.GetActiveModelsAsync("Chat", ct);
        var toolsTask = _toolsClient.GetAvailableToolsAsync(ct);
        var kbsTask = _ragClient.GetAvailableKnowledgeBasesAsync(ct);
        await Task.WhenAll(modelsTask, toolsTask, kbsTask);

        var (toolsConfigReachable1, models) = modelsTask.Result;
        var (toolsConfigReachable2, tools) = toolsTask.Result;
        var (ragConfigReachable, kbs) = kbsTask.Result;

        return new AgentEditorOptionsDto(
            models, kbs, tools,
            new DownstreamAvailability(toolsConfigReachable1 && toolsConfigReachable2, ragConfigReachable));
    }

    public Task<IReadOnlyList<CallerGroupDto>> GetCallerGroupsAsync(CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        IReadOnlyList<CallerGroupDto> groups = CallerGroupIds()
            .OrderBy(id => id)
            .Select(id => new CallerGroupDto(id))
            .ToList();
        return Task.FromResult(groups);
    }
}
