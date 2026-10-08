
﻿namespace Agent.Application.Authorization;

public static class Permissions
{
    public static class Agent
    {
        public const string View = "200";
        public const string Create = "201";
        public const string Edit = "202";
        public const string Delete = "203";
        public const string Publish = "204";
    }

    public static class Platform
    {
        public const string SuperAdmin = "100";
    }

    public static IEnumerable<(string Code, string Module, string Description)> All()
    {
        yield return (Agent.View, "Agent", "View Agent");
        yield return (Agent.Create, "Agent", "Create Agent");
        yield return (Agent.Edit, "Agent", "Modify Agent");
        yield return (Agent.Delete, "Agent", "Delete/deactivate Agent");
        yield return (Agent.Publish, "Agent", "Publish/Unpublish Agent");
    }
}
