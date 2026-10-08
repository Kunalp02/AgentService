
using System.Text.Json;

namespace Agent.Infrastructure.DownstreamClients;

internal static class JsonElementExtensions
{
    /// <summary>
    /// RAG wraps lists as { items }, { data: [...] }, or { data: { items: [...] } }.
    /// Tools Config usually uses a top-level items array.
    /// </summary>
    public static JsonElement UnwrapList(this JsonElement root)
    {
        var current = root;
        for (var depth = 0; depth < 5; depth++)
        {
            if (current.ValueKind == JsonValueKind.Array)
                return current;
            if (current.ValueKind != JsonValueKind.Object)
                return current;

            JsonElement? nestedObject = null;
            foreach (var name in new[]
                     {
                         "items", "Items",
                         "knowledgeBases", "KnowledgeBases",
                         "results", "Results",
                         "data", "Data",
                         "result", "Result",
                         "value", "Value",
                         "payload", "Payload"
                     })
            {
                if (!current.TryGetPropertyIgnoreCase(name, out var child))
                    continue;
                if (child.ValueKind == JsonValueKind.Array)
                    return child;
                if (child.ValueKind == JsonValueKind.Object && nestedObject is null)
                    nestedObject = child;
            }

            if (nestedObject is null)
                return current;
            current = nestedObject.Value;
        }

        return current;
    }

    public static bool TryGetPropertyIgnoreCase(this JsonElement el, string name, out JsonElement value)
    {
        value = default;
        if (el.ValueKind != JsonValueKind.Object)
            return false;
        if (el.TryGetProperty(name, out value))
            return true;
        foreach (var p in el.EnumerateObject())
        {
            if (string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase))
            {
                value = p.Value;
                return true;
            }
        }

        return false;
    }

    public static bool TryReadGuid(this JsonElement el, string propertyName, out Guid id)
    {
        id = default;
        return el.TryGetPropertyIgnoreCase(propertyName, out var p) && TryReadGuid(p, out id);
    }

    public static bool TryReadKnowledgeBaseId(this JsonElement el, out Guid id)
    {
        if (el.TryReadGuid("id", out id) || el.TryReadGuid("knowledgeBaseId", out id) || el.TryReadGuid("kbId", out id))
            return true;

        if (el.TryGetPropertyIgnoreCase("knowledgeBase", out var nested) && nested.ValueKind == JsonValueKind.Object)
            return nested.TryReadGuid("id", out id) || nested.TryReadGuid("knowledgeBaseId", out id);

        id = default;
        return false;
    }

    public static bool TryReadGuid(this JsonElement el, out Guid id)
    {
        id = default;
        return el.ValueKind switch
        {
            JsonValueKind.String => Guid.TryParse(el.GetString(), out id),
            JsonValueKind.Object => false,
            _ => el.TryGetGuid(out id)
        };
    }

    public static string ReadString(this JsonElement el, string propertyName)
        => el.TryGetPropertyIgnoreCase(propertyName, out var n) && n.ValueKind == JsonValueKind.String
            ? n.GetString() ?? ""
            : "";

    public static HashSet<Guid> ReadGuidArray(this JsonElement root, string propertyName)
    {
        var set = new HashSet<Guid>();
        if (!root.TryGetPropertyIgnoreCase(propertyName, out var groups) || groups.ValueKind != JsonValueKind.Array)
            return set;

        foreach (var g in groups.EnumerateArray())
        {
            if (g.TryReadGuid(out var gid) && gid != Guid.Empty)
                set.Add(gid);
        }

        return set;
    }
}
