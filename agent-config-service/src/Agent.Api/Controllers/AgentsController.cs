
using CCIL.WEBAPI.MIDDLEWARE;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ccil.ai.platform.common.Auth;
using ccil.ai.platform.common.Constants;
using Agent.Application.DTOs;
using Agent.Application.Groups;
using Agent.Application.Interfaces;
using Permissions = Agent.Application.Authorization.Permissions;

namespace Agent.Api.Controllers;

[ApiController]
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/agents")]
public class AgentsController : CCILControllerBase
{
    private readonly IAgentService _service;
    private readonly ICurrentUser _currentUser;
    private readonly ILogger<AgentsController> _logger;

    public AgentsController(IAgentService service, ICurrentUser currentUser, ILogger<AgentsController> logger)
    {
        _service = service;
        _currentUser = currentUser;
        _logger = logger;
    }

    [HttpGet]
    [SessionValidation]
    [GroupValidation]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme, Roles = Permissions.Agent.View)]
    public async Task<ActionResult<PagedResult<AgentListItemDto>>> List([FromQuery] AgentQueryParams query,
        CancellationToken ct)
    {
        _logger.LogInformation("User {UserId} ({username}) groups from the jwt token: {Groups}",
            _currentUser.UserId,
            _currentUser.Username,
            string.Join(", ", _currentUser.Groups));

        return await _service.ListAsync(query, ct);
    }

    [HttpGet("{id:guid}")]
    [SessionValidation]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme, Roles = Permissions.Agent.View)]
    public async Task<ActionResult<AgentDto>> Get(Guid id, CancellationToken ct) => Ok(await _service.GetAsync(id, ct));

    [HttpGet("groups")]
    [SessionValidation]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme, Roles = Permissions.Agent.View)]
    public async Task<ActionResult<IReadOnlyList<CallerGroupDto>>> CallerGroups(CancellationToken ct)
        => Ok(await _service.GetCallerGroupsAsync(ct));
    
    // [HttpGet("editor-options")]
    // [SessionValidation]
    // [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme, Roles = Permissions.Agent.View)]
    // public async Task<ActionResult<AgentEditorOptionsDto>> EditorOptions([FromQuery] Guid[]? groupIds, CancellationToken ct)
    // {
    //     var options = await _service.GetEditorOptionsAsync(ct);
    //
    //     var callerGroups = GroupClaimParser.ParseIds(_currentUser.Groups);
    //     var scope = (groupIds ?? Array.Empty<Guid>())
    //         .Where(g => g != Guid.Empty && callerGroups.Contains(g))
    //         .ToHashSet();
    //     if (scope.Count == 0)
    //         scope = callerGroups;
    //
    //     bool InScope(IEnumerable<Guid>? ids)
    //     {
    //         if (ids is null) return true;
    //         var list = ids as IReadOnlyCollection<Guid> ?? ids.ToList();
    //         return list.Count == 0 || list.Any(scope.Contains);
    //     }
    //
    //     return Ok(options with
    //     {
    //         Models = options.Models.Where(m => InScope(m.GroupIds)).ToList(),
    //         KnowledgeBases = options.KnowledgeBases.Where(k => InScope(k.GroupIds)).ToList(),
    //         Tools = options.Tools.Where(t => InScope(t.GroupIds)).ToList(),
    //     });
    // }
    
    [HttpGet("editor-options")]
    [SessionValidation]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme, Roles = Permissions.Agent.View)]
    public async Task<ActionResult<AgentEditorOptionsDto>> EditorOptions([FromQuery] Guid[]? groupIds, CancellationToken ct)
    {
        var options = await _service.GetEditorOptionsAsync(ct);
        var scope = (groupIds ?? Array.Empty<Guid>()).Where(g => g != Guid.Empty).ToHashSet();

        var isAdmin = _currentUser.HasPermission("*")
                      || _currentUser.HasPermission(Agent.Application.Authorization.Permissions.Platform.SuperAdmin);
        if (!isAdmin && scope.Count > 0)
        {
            var callerIds = GroupClaimParser.ParseIds(_currentUser.Groups);
            foreach (var id in scope)
            {
                if (!callerIds.Contains(id))
                    throw new AppException(ErrorCodes.ValidationFailed,
                        $"Group {id} is not in your token. You can only load resources for groups you belong to.",
                        400);
            }
        }

        bool InScope(IEnumerable<Guid>? ids)
        {
            if (ids is null)
                return scope.Count == 0;
            var list = ids as IReadOnlyCollection<Guid> ?? ids.ToList();
            if (list.Count == 0)
                return true;
            return scope.Count > 0 && list.Any(scope.Contains);
        }

        return Ok(options with
        {
            Models         = options.Models.Where(m => InScope(m.GroupIds)).ToList(),
            KnowledgeBases = options.KnowledgeBases.Where(k => InScope(k.GroupIds)).ToList(),
            Tools          = options.Tools.Where(t => InScope(t.GroupIds)).ToList(),
        });
    }

    [HttpPost]
    [SessionValidation]
    [GroupValidation]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme, Roles = Permissions.Agent.Create)]
    public async Task<ActionResult<AgentDto>> Create([FromBody] CreateAgentRequest request, CancellationToken ct)
    {
        var ownerId = _currentUser.UserId ?? throw new AppException(ErrorCodes.Unauthorized, "Could not resolve caller identity from the current token.", 401);
        var ownerUsername = _currentUser.Username ?? "unknown";
        var result = await _service.CreateAsync(request, ownerId, ownerUsername, ct);
        return CreatedAtAction(nameof(Get), new { id = result.Id, version = "1.0" }, result);
    }

    [HttpPatch("{id:guid}")]
    [SessionValidation]
    [GroupValidation]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme, Roles = Permissions.Agent.Edit)]
    public async Task<ActionResult<AgentDto>> Patch(Guid id, [FromBody] PatchAgentRequest request, CancellationToken ct)
    {
        var updatedBy = _currentUser.Username ?? "unknown";
        return Ok(await _service.PatchAsync(id, request, updatedBy, ct));
    }

    [HttpDelete("{id:guid}")]
    [SessionValidation]
    [GroupValidation]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme, Roles = Permissions.Agent.Delete)]
    public async Task<IActionResult> Delete(Guid id, [FromQuery] AgentGroupContext groupContext, CancellationToken ct)
    {
        await _service.DeleteAsync(id, ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/publish")]
    [SessionValidation]
    [GroupValidation]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme, Roles = Permissions.Agent.Publish)]
    public async Task<ActionResult<AgentDto>> Publish(Guid id, [FromQuery] AgentGroupContext groupContext, CancellationToken ct)
    {
        var publishedBy = _currentUser.Username ?? "unknown";
        return Ok(await _service.PublishAsync(id, publishedBy, ct));
    }

    [HttpPost("{id:guid}/unpublish")]
    [SessionValidation]
    [GroupValidation]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme, Roles = Permissions.Agent.Publish)]
    public async Task<ActionResult<AgentDto>> Unpublish(Guid id, [FromQuery] AgentGroupContext groupContext, CancellationToken ct)
    {
        var updatedBy = _currentUser.Username ?? "unknown";
        return Ok(await _service.UnpublishAsync(id, updatedBy, ct));
    }

    [HttpGet("{id:guid}/runtime-manifest")]
    [SessionValidation]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme, Roles = Permissions.Agent.View)]
    public async Task<ActionResult<AgentRuntimeManifestDto>> GetRuntimeManifest(Guid id, CancellationToken ct)
        => Ok(await _service.GetRuntimeManifestAsync(id, ct));
}
