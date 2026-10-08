
using FluentValidation;
using FluentValidation.AspNetCore;
using Microsoft.EntityFrameworkCore;
using Agent.Application.Interfaces;
using Agent.Application.Services;
using Agent.Infrastructure.DownstreamClients;
using Agent.Infrastructure.Persistence;

namespace Agent.Api.Extensions;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddAgentPersistence(this IServiceCollection services, IConfiguration config)
    {
        services.AddDbContext<AgentDbContext>(options =>
            options.UseNpgsql(config.GetConnectionString("Postgres"), npgsql => npgsql.EnableRetryOnFailure(3)));
        services.AddScoped<IAgentDbContext>(sp => sp.GetRequiredService<AgentDbContext>());
        return services;
    }

    public static IServiceCollection AddAgentApplicationServices(this IServiceCollection services)
    {
        services.AddScoped<IAgentService, AgentService>();
        services.AddValidatorsFromAssembly(typeof(Agent.Application.Validators.CreateAgentRequestValidator).Assembly);
        services.AddFluentValidationAutoValidation();
        return services;
    }

    public static IServiceCollection AddAgentHttpClients(this IServiceCollection services, IConfiguration config)
    {
        var toolsConfigBaseUrl = config["ToolsConfigService:BaseUrl"] ?? "http://localhost:5002";
        var ragConfigBaseUrl = config["RagConfigService:BaseUrl"] ?? "http://localhost:5003";

        services.AddTransient<ForwardCallerAuthorizationHandler>();

        services.AddHttpClient<IToolsConfigClient, HttpToolsConfigClient>(c =>
            {
                c.BaseAddress = new Uri(toolsConfigBaseUrl);
                c.Timeout = TimeSpan.FromSeconds(10);
            })
            .AddHttpMessageHandler<ForwardCallerAuthorizationHandler>();

        services.AddHttpClient<IRagConfigClient, HttpRagConfigClient>(c =>
            {
                c.BaseAddress = new Uri(ragConfigBaseUrl);
                c.Timeout = TimeSpan.FromSeconds(10);
            })
            .AddHttpMessageHandler<ForwardCallerAuthorizationHandler>();

        return services;
    }
}
