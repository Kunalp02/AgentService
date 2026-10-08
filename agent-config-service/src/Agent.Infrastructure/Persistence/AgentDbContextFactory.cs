
﻿using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Agent.Infrastructure.Persistence;
public class AgentDbContextFactory : IDesignTimeDbContextFactory<AgentDbContext>
{
    private const string DefaultConnectionString =
        "Host=172.19.204.37;Port=5434;Database=NoCodeAIPlatform;Username=postgres;Password=Tcs@082026;SearchPath=public;Pooling=true;Minimum Pool Size=5;Maximum Pool Size=50";

    public AgentDbContext CreateDbContext(string[] args)
    {
        var connectionString =
            Environment.GetEnvironmentVariable("POSTGRES_CONNECTION_STRING")
            ?? DefaultConnectionString;

        var optionsBuilder = new DbContextOptionsBuilder<AgentDbContext>();
        optionsBuilder.UseNpgsql(connectionString);

        return new AgentDbContext(optionsBuilder.Options);
    }
}
