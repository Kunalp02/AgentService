
using System.Net.Http.Headers;
using Microsoft.AspNetCore.Http;

namespace Agent.Infrastructure.DownstreamClients;

public sealed class ForwardCallerAuthorizationHandler : DelegatingHandler
{
    private readonly IHttpContextAccessor _accessor;
    //ME: Check later
    public ForwardCallerAuthorizationHandler(IHttpContextAccessor accessor) => _accessor = accessor;

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        if (request.Headers.Authorization is null)
        {
            var header = _accessor.HttpContext?.Request.Headers.Authorization.ToString();
            if (!string.IsNullOrWhiteSpace(header))
            {
                if (header.StartsWith(" ", StringComparison.OrdinalIgnoreCase))
                    request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", header["Bearer ".Length..].Trim());
                else
                    request.Headers.TryAddWithoutValidation("Authorization", header);
            }
        }
        return base.SendAsync(request, cancellationToken);
    }
}
