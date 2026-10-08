
﻿namespace Agent.Application.DTOs;

public enum ReferenceCheckStatus
{
    Valid,
    NotVisible,
    Unreachable
}

public readonly record struct ReferenceCheck(ReferenceCheckStatus Status, string? Name)
{
    public bool IsValid => Status == ReferenceCheckStatus.Valid;

    public static ReferenceCheck Valid(string? name) => new(ReferenceCheckStatus.Valid, name);
    public static ReferenceCheck NotVisible() => new(ReferenceCheckStatus.NotVisible, null);
    public static ReferenceCheck Unreachable() => new(ReferenceCheckStatus.Unreachable, null);
}
