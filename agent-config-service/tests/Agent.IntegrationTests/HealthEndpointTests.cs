
using System.Net;
using FluentAssertions;
using Xunit;

namespace Agent.IntegrationTests;

public class HealthEndpointTests : IClassFixture<AgentApiFactory>
{
    private readonly AgentApiFactory _factory;
    public HealthEndpointTests(AgentApiFactory factory) => _factory = factory;

    [Fact]
    public async Task LivenessEndpoint_ReturnsOk()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/health/live");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Agents_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/v1/agents");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
