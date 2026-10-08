
using Agent.Api.Extensions;
using Agent.Infrastructure.Persistence;
using ccil.ai.platform.common.Middleware;
using CCIL.CACHE.REDIS;
using CCIL.COMMON.CACHE;
using CCIL.COMMON.Configuration;
using CCIL.WEBAPI.MIDDLEWARE;
using HealthChecks.UI.Client;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.EntityFrameworkCore;
using System.Reflection;

var builder = WebApplication.CreateBuilder(args);
builder.Logging.AddConsole(); 
builder.Logging.SetMinimumLevel(LogLevel.Information);

APICommonMethods.InitWebAPI("AIAgent", builder.Host);
ConfigManager configMgr = ConfigManager.GetInstance("AIAgent");

IConfiguration config = ((ConfigApplication)configMgr.AppConfig[ConfigConstants.CLI_APPDATA]).Configuration;

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

builder.Services.AddApiVersioning(o =>
{
    o.DefaultApiVersion = new Microsoft.AspNetCore.Mvc.ApiVersion(1, 0);
    o.AssumeDefaultVersionWhenUnspecified = true;
    o.ReportApiVersions = true;
});
builder.Services.AddVersionedApiExplorer(o => { o.GroupNameFormat = "'v'VVV"; o.SubstituteApiVersionInUrl = true; });

builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new Microsoft.OpenApi.Models.OpenApiInfo
    {
        Title = "ccil.aiplatform.agent_config", Version = "v1",
        Description = "Agent registration microservice - composes Models, Knowledge Bases, and Tools into Agents."
    });
    c.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
    {
        Description = "JWT Bearer token issued by ccil.aiplatform.auth.",
        Name = "Authorization", In = Microsoft.OpenApi.Models.ParameterLocation.Header,
        Type = Microsoft.OpenApi.Models.SecuritySchemeType.ApiKey, Scheme = "Bearer"
    });
    c.AddSecurityRequirement(new Microsoft.OpenApi.Models.OpenApiSecurityRequirement
    {
        { new Microsoft.OpenApi.Models.OpenApiSecurityScheme { Reference = new Microsoft.OpenApi.Models.OpenApiReference
            { Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme, Id = "Bearer" } }, Array.Empty<string>() }
    });
    var xmlFile = $"{Assembly.GetExecutingAssembly().GetName().Name}.xml";
    var xmlPath = Path.Combine(AppContext.BaseDirectory, xmlFile);
    if (File.Exists(xmlPath)) c.IncludeXmlComments(xmlPath);
});

builder.Services.AddPlatformAuthServices(config);
builder.Services.AddAgentPersistence(config);
builder.Services.AddAgentApplicationServices();
builder.Services.AddAgentHttpClients(config);

var corsOrigins = config.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();

builder.Services.AddCors(options =>
    options.AddPolicy("FrontendPolicy", policy => policy.WithOrigins(corsOrigins).AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

builder.Services.AddHealthChecks()
    .AddNpgSql(config.GetConnectionString("Postgres")!, name: "postgres", tags: new[] { "ready" })
    .AddRedis(config.GetConnectionString("Redis") ?? "localhost:6379", name: "redis", tags: new[] { "ready" })
    .AddUrlGroup(new Uri((config["AuthService:BaseUrl"] ?? "http://localhost:5001") + "/.well-known/jwks.json"),
        name: "auth-jwks", tags: new[] { "ready" })
    .AddUrlGroup(new Uri((config["ToolsConfigService:BaseUrl"] ?? "http://localhost:5002").TrimEnd('/') + "/health/live"),
        name: "tools-config", tags: new[] { "ready" })
    .AddUrlGroup(new Uri((config["RagConfigService:BaseUrl"] ?? "http://localhost:5003").TrimEnd('/') + "/api/v1/health"),
        name: "rag-config", tags: new[] { "ready" });

var app = builder.Build();

//app.UseMiddleware<ExceptionHandlingMiddleware>();

{
    app.UseSwagger();
    app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "ccil.aiplatform.agent_config v1"));
}

app.UseCors("FrontendPolicy");
app.UsePlatformMiddleWare();
//app.UseCommonMiddleWare();
//app.UseAuthentication();
//app.UseCCILAuthentication();
//app.UseAuthorization();

app.MapControllers();
app.MapHealthChecks("/health/live", new HealthCheckOptions
{
    Predicate = _ => false,
    ResponseWriter = UIResponseWriter.WriteHealthCheckUIResponse
});

app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = c => c.Tags.Contains("ready"),
    ResponseWriter = UIResponseWriter.WriteHealthCheckUIResponse
});
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AgentDbContext>();
}
app.Run();

public partial class Program { }
