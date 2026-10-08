
﻿//using System;
//using System.Collections.Generic;
//using Agent.Application.Interfaces;
//using ccil.ai.platform.common.Auth;

//namespace Agent.Infrastructure.Groups;

//public sealed class JwtCallerGroupIds : ICallerGroupIds
//{
//    private readonly ICurrentUser _currentUser;

//    public JwtCallerGroupIds(ICurrentUser currentUser)
//    {
//        _currentUser = currentUser;
//    }

//    public HashSet<Guid> Get() => JwtGroupClaimParser.ParseIds(_currentUser.Groups);
//}
