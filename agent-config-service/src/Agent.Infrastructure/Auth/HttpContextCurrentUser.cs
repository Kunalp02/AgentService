
using Microsoft.AspNetCore.Http;
using Agent.Application.Interfaces;
using ccil.ai.platform.common.Auth;

namespace Agent.Infrastructure.Auth;
public class HttpContextCurrentUser : ICurrentUser
{
    private readonly IHttpContextAccessor _accessor;
    public HttpContextCurrentUser(IHttpContextAccessor accessor) => _accessor = accessor;
    private System.Security.Claims.ClaimsPrincipal? Principal => _accessor.HttpContext?.User;

    public Guid? UserId
    {
        get
        {
            var sub = Principal?.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)?.Value;
            return Guid.TryParse(sub, out var id) ? id : null;
        }
    }
    public string? Username => Principal?.FindFirst("preferred_username")?.Value;
    public IReadOnlyCollection<string> Groups => Principal?.FindAll("groups").Select(c => c.Value).ToList() ?? new List<string>();
    public IReadOnlyCollection<string> Permissions => Principal?.FindAll("permissions").Select(c => c.Value).ToList() ?? new List<string>();
    public bool HasPermission(string code) => Permissions.Contains(code) || Permissions.Contains("*");
    public bool IsAdminScoped => HasPermission("*") || HasPermission("agent:delete");

    public string? BearerToken
    {
        get
        {
            var header = _accessor.HttpContext?.Request.Headers.Authorization.ToString();
            return header?.StartsWith("Bearer ") == true ? header["Bearer ".Length..] : null;
        }
    }
}
