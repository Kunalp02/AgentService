# Agent configuration service (.NET)

ASP.NET Core agent definition and runtime-manifest API (`ccil.ai.platform.AgentConfigService`).

- **Solution:** [ccil.ai.platform.AgentConfigService.sln](./ccil.ai.platform.AgentConfigService.sln)
- **Runtime config:** [Config_AIAgent.cnf](./Config_AIAgent.cnf) (Bifrost/JSON `ToolsConfigService` and `RagConfigService` base URLs)

Build and run from this directory with the .NET 8 SDK:

```bash
dotnet build ccil.ai.platform.AgentConfigService.sln
dotnet run --project src/Agent.Api/Agent.Api.csproj
```
