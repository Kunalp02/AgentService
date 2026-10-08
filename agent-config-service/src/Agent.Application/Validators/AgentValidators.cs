
using FluentValidation;
using Agent.Application.DTOs;
using Agent.Domain.Enums;

namespace Agent.Application.Validators;

public class AgentKnowledgeBaseInputValidator : AbstractValidator<AgentKnowledgeBaseInput>
{
    private static readonly string[] Modes = { "Context", "Tool" };
    public AgentKnowledgeBaseInputValidator()
    {
        RuleFor(x => x.KnowledgeBaseId).NotEmpty();
        RuleFor(x => x.Mode).NotEmpty().Must(m => Modes.Contains(m));
    }
}

public class AgentToolInputValidator : AbstractValidator<AgentToolInput>
{
    private static readonly string[] Types = { "Remote", "Local" };
    public AgentToolInputValidator()
    {
        RuleFor(x => x.ToolId).NotEmpty();
        RuleFor(x => x.ToolType).NotEmpty().Must(t => Types.Contains(t));
    }
}

internal static class MemoryConfigRules
{
    public static void Apply<T>(AbstractValidator<T> v, Func<T, bool> memoryEnabled,
        Func<T, string?> scope, Func<T, string?> retention)
    {
        v.RuleFor(x => scope(x))
            .Must(s => !string.IsNullOrWhiteSpace(s) && Enum.TryParse<AgentMemoryScope>(s, true, out _))
            .When(memoryEnabled)
            .WithMessage("MemoryScope must be one of Session, User, Agent, Organization when memory is enabled.");

        v.RuleFor(x => retention(x))
            .Must(r => !string.IsNullOrWhiteSpace(r) && Enum.TryParse<AgentMemoryRetention>(r, true, out _))
            .When(memoryEnabled)
            .WithMessage("MemoryRetention must be one of Session, Days7, Days30, Days90, Years1, Forever when memory is enabled.");
    }
}

public class CreateAgentRequestValidator : AbstractValidator<CreateAgentRequest>
{
    public CreateAgentRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(128);
        RuleFor(x => x.ModelId).NotEmpty();
        RuleFor(x => x.Temperature).InclusiveBetween(0.0, 2.0);
        RuleFor(x => x.SystemPrompt).NotEmpty().MaximumLength(20_000);
        RuleFor(x => x.GroupIds).NotNull();
        RuleFor(x => x.KnowledgeBases).NotNull();
        RuleFor(x => x.Tools).NotNull();
        RuleForEach(x => x.KnowledgeBases).SetValidator(new AgentKnowledgeBaseInputValidator());
        RuleForEach(x => x.Tools).SetValidator(new AgentToolInputValidator());
        MemoryConfigRules.Apply(this, x => x.MemoryEnabled, x => x.MemoryScope, x => x.MemoryRetention);
    }
}

public class UpdateAgentRequestValidator : AbstractValidator<UpdateAgentRequest>
{
    public UpdateAgentRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(128);
        RuleFor(x => x.ModelId).NotEmpty();
        RuleFor(x => x.Temperature).InclusiveBetween(0.0, 2.0);
        RuleFor(x => x.SystemPrompt).NotEmpty().MaximumLength(20_000);
        RuleFor(x => x.GroupIds).NotNull();
        RuleFor(x => x.KnowledgeBases).NotNull();
        RuleFor(x => x.Tools).NotNull();
        RuleForEach(x => x.KnowledgeBases).SetValidator(new AgentKnowledgeBaseInputValidator());
        RuleForEach(x => x.Tools).SetValidator(new AgentToolInputValidator());
        MemoryConfigRules.Apply(this, x => x.MemoryEnabled, x => x.MemoryScope, x => x.MemoryRetention);
    }
}

public class PatchAgentRequestValidator : AbstractValidator<PatchAgentRequest>
{
    public PatchAgentRequestValidator()
    {
        RuleFor(x => x.Name).MaximumLength(128).When(x => x.Name is not null);
        RuleFor(x => x.Temperature).InclusiveBetween(0.0, 2.0).When(x => x.Temperature.HasValue);
        RuleFor(x => x.SystemPrompt).MaximumLength(20_000).When(x => x.SystemPrompt is not null);
        RuleForEach(x => x.KnowledgeBases).SetValidator(new AgentKnowledgeBaseInputValidator());
        RuleForEach(x => x.Tools).SetValidator(new AgentToolInputValidator());
        MemoryConfigRules.Apply(this, x => x.MemoryEnabled == true, x => x.MemoryScope, x => x.MemoryRetention);
    }
}
