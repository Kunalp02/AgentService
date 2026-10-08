
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Testcontainers.PostgreSql;
using Microsoft.Extensions.Configuration;
using Testcontainers.Redis;
using Xunit;

namespace Agent.IntegrationTests;

public class AgentApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine").WithDatabase("ccil_agent_test").WithUsername("test").WithPassword("test").Build();
    private readonly RedisContainer _redis = new RedisBuilder().WithImage("redis:7-alpine").Build();

    public async Task InitializeAsync() { await _postgres.StartAsync(); await _redis.StartAsync(); }
    public new async Task DisposeAsync() { await _postgres.DisposeAsync(); await _redis.DisposeAsync(); }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureAppConfiguration((ctx, configBuilder) =>
        {
            configBuilder.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Postgres"] = _postgres.GetConnectionString(),
                ["ConnectionStrings:Redis"] = _redis.GetConnectionString(),
                ["Database:AutoMigrateAndSeed"] = "true",
                ["AuthService:BaseUrl"] = "http://localhost:5001",
                ["ToolsConfigService:BaseUrl"] = "http://localhost:5002",
                ["ToolsConfigService:InternalServiceKey"] = "test-internal-key",
                ["RagConfigService:BaseUrl"] = "http://localhost:5003"
            });
        });
    }
}
