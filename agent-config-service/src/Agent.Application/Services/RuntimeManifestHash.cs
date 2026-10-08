
﻿using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Agent.Application.DTOs;

namespace Agent.Application.Services;

internal static class RuntimeManifestHash
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        WriteIndented = false,
    };

    public static string Compute(
        string systemPrompt,
        double temperature,
        string modelIdentifier,
        IReadOnlyList<RuntimeAgentToolRefDto> tools,
        IReadOnlyList<RuntimeKnowledgeBaseRefDto> knowledgeBases,
        RuntimeMemoryConfigDto memory,
        string status)
    {
        var payload = new SortedDictionary<string, object?>
        {
            ["kbs"] = knowledgeBases
                .Select(kb => (object)new SortedDictionary<string, object?>
                {
                    ["knowledge_base_id"] = kb.KnowledgeBaseId,
                    ["knowledge_base_name"] = kb.KnowledgeBaseName,
                    ["mode"] = kb.Mode,
                })
                .ToList(),
            ["memory"] = new SortedDictionary<string, object?>
            {
                ["enabled"] = memory.Enabled,
                ["instructions"] = memory.Instructions,
                ["retention"] = memory.Retention,
                ["scope"] = memory.Scope,
            },
            ["model"] = modelIdentifier,
            ["status"] = status,
            ["system_prompt"] = systemPrompt,
            ["temperature"] = temperature,
            ["tools"] = tools
                .Select(tool => (object)new SortedDictionary<string, object?>
                {
                    ["tool_id"] = tool.ToolId,
                    ["tool_name"] = tool.ToolName,
                    ["tool_type"] = tool.ToolType,
                })
                .ToList(),
        };

        var json = JsonSerializer.Serialize(payload, JsonOptions);
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(json));
        return Convert.ToHexString(hash).ToLowerInvariant()[..16];
    }
}
