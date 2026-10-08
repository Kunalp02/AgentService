
using System.Net;
using System.Text;
using Agent.Application.DTOs;
using Agent.Infrastructure.DownstreamClients;
using ccil.ai.platform.common.Auth;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Agent.UnitTests;

public class HttpToolsConfigClientTests
{
    private static readonly Guid GroupA = Guid.Parse("ab9ea609-c290-4ceb-87df-f7d7077858f0");
    private static readonly Guid RemoteToolId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    private static HttpToolsConfigClient CreateClient(
        HttpMessageHandler handler,
        string serviceKey = "test-key")
    {
        var http = new HttpClient(handler) { BaseAddress = new Uri("http://tools.test/") };
        var user = new Mock<ICurrentUser>();
        user.SetupGet(u => u.BearerToken).Returns("jwt");
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ToolsConfigService:InternalServiceKey"] = serviceKey,
            })
            .Build();
        return new HttpToolsConfigClient(http, user.Object, config, NullLogger<HttpToolsConfigClient>.Instance);
    }

    [Fact]
    public async Task ValidateRemoteTool_UsesInternalActiveMcpEndpoint()
    {
        var payload = """
            [
              {
                "id": "22222222-2222-2222-2222-222222222222",
                "name": "mcp-server",
                "status": "Active",
                "remoteMcpServerUrl": "http://mcp.internal",
                "groupIds": ["ab9ea609-c290-4ceb-87df-f7d7077858f0"],
                "tools": [
                  { "id": "11111111-1111-1111-1111-111111111111", "name": "search" }
                ]
              }
            ]
            """;

        var handler = new StubHandler(req =>
        {
            req.Headers.TryGetValues("X-Service-Key", out var keys).Should().BeTrue();
            keys!.Single().Should().Be("test-key");
            req.RequestUri!.AbsolutePath.Should().Be("/internal/v1/remote-mcp-servers/active");
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(payload, Encoding.UTF8, "application/json"),
            };
        });

        var client = CreateClient(handler);
        var result = await client.ValidateToolVisibleAsync(RemoteToolId, "Remote", new[] { GroupA });

        result.IsValid.Should().BeTrue();
        result.Name.Should().Be("search");
    }

    [Fact]
    public async Task ValidateRemoteTool_RejectsWhenGroupsDoNotOverlap()
    {
        var otherGroup = Guid.Parse("c6362e4a-21b0-4ade-bf17-ca85ce153c03");
        var payload = """
            [
              {
                "id": "22222222-2222-2222-2222-222222222222",
                "name": "mcp-server",
                "status": "Active",
                "groupIds": ["ab9ea609-c290-4ceb-87df-f7d7077858f0"],
                "tools": [
                  { "id": "11111111-1111-1111-1111-111111111111", "name": "search" }
                ]
              }
            ]
            """;

        var handler = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json"),
        });

        var client = CreateClient(handler);
        var result = await client.ValidateToolVisibleAsync(RemoteToolId, "Remote", new[] { otherGroup });

        result.IsValid.Should().BeFalse();
        result.Status.Should().Be(ReferenceCheckStatus.NotVisible);
    }

    [Fact]
    public async Task GetAvailableTools_FallsBackToActiveForUse_AndReadsPascalCaseTools()
    {
        var forUse = """
            [
              {
                "Id": "22222222-2222-2222-2222-222222222222",
                "Name": "mcp-server",
                "Status": "Active",
                "GroupIds": ["ab9ea609-c290-4ceb-87df-f7d7077858f0"],
                "Tools": [
                  { "Id": "11111111-1111-1111-1111-111111111111", "Name": "search" }
                ]
              }
            ]
            """;

        var handler = new StubHandler(req =>
        {
            var path = req.RequestUri!.AbsolutePath;
            if (path.EndsWith("/internal/v1/remote-mcp-servers/active", StringComparison.Ordinal))
                return new HttpResponseMessage(HttpStatusCode.Unauthorized);
            if (path.EndsWith("/api/v1/remote-mcp-servers/active-for-use", StringComparison.Ordinal))
            {
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(forUse, Encoding.UTF8, "application/json"),
                };
            }

            return new HttpResponseMessage(HttpStatusCode.NotFound);
        });

        var client = CreateClient(handler);
        var (reachable, tools) = await client.GetAvailableToolsAsync();

        reachable.Should().BeTrue();
        tools.Should().ContainSingle(t => t.Id == RemoteToolId && t.ToolType == "Remote" && t.Name == "search");
    }

    private sealed class StubHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _handler;

        public StubHandler(Func<HttpRequestMessage, HttpResponseMessage> handler) => _handler = handler;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            => Task.FromResult(_handler(request));
    }
}
