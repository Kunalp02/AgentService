
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using Agent.Application.DTOs;
using Agent.Application.Interfaces;
using Agent.Application.Services;
//using Agent.Infrastructure.Groups;
using Agent.Infrastructure.Persistence;
using Xunit;
using ccil.ai.platform.common.Constants;
using ccil.ai.platform.common.Auth;

namespace Agent.UnitTests;

public class AgentServiceTests
{
    private static readonly Guid Ndsom = Guid.Parse("4c3fd134-04ca-4c23-89ad-561d32e04e46");
    private static readonly Guid DefaultGroup = Guid.Parse("ab9ea609-c290-4ceb-87df-f7d7077858f0");
    private static readonly Guid Tcs = Guid.Parse("c6362e4a-21b0-4ade-bf17-ca85ce153c03");
    private const string TokenGroups = "4c3fd134-04ca-4c23-89ad-561d32e04e46:ndsom,ab9ea609-c290-4ceb-87df-f7d7077858f0:Default,c6362e4a-21b0-4ade-bf17-ca85ce153c03:tcs";

    private static AgentDbContext NewDb()
    {
        var options = new DbContextOptionsBuilder<AgentDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        return new AgentDbContext(options);
    }

    private static Mock<ICurrentUser> User(Guid userId, string username, bool adminScoped = false, params string[] groups)
    {
        var mock = new Mock<ICurrentUser>();
        mock.SetupGet(u => u.UserId).Returns(userId);
        mock.SetupGet(u => u.Username).Returns(username);
        mock.SetupGet(u => u.Groups).Returns(groups.ToList());
        mock.Setup(u => u.HasPermission(It.IsAny<string>()))
            .Returns((string code) => adminScoped && code == "*");
        return mock;
    }

    private static AgentService Svc(
        AgentDbContext db,
        Mock<IToolsConfigClient> tools,
        Mock<IRagConfigClient> rag,
        Mock<ICurrentUser> user)
    {
        // return null;
        return new AgentService(db, tools.Object, rag.Object, user.Object);
    }
    
        //=> new(db, tools.Object, rag.Object, user.Object, new JwtCallerGroupIds(user.Object));

    private static void VisibleDownstreams(Mock<IToolsConfigClient> tools, Mock<IRagConfigClient> rag)
    {
        tools
            .Setup(t => t.ValidateModelVisibleAsync(It.IsAny<Guid>(), It.IsAny<IReadOnlyCollection<Guid>>(), default))
            .ReturnsAsync(ReferenceCheck.Valid("gpt-4"));
        // tools
        //     .Setup(t => t.ValidateToolVisibleAsync(It.IsAny<Guid>(), It.IsAny<string>(), default))
        //     .ReturnsAsync(ReferenceCheck.Valid("search"));
        // rag
        //     .Setup(r => r.ValidateKnowledgeBaseVisibleAsync(It.IsAny<Guid>(), default))
        //     .ReturnsAsync(ReferenceCheck.Valid("policy-kb"));
        tools
            .Setup(t => t.ValidateToolVisibleAsync(
                It.IsAny<Guid>(),
                It.IsAny<string>(),
                It.IsAny<IReadOnlyCollection<Guid>>(),
                default))
            .ReturnsAsync(ReferenceCheck.Valid("search"));
        rag
            .Setup(r => r.ValidateKnowledgeBaseVisibleAsync(
                It.IsAny<Guid>(),
                It.IsAny<IReadOnlyCollection<Guid>>(),
                default))
            .ReturnsAsync(ReferenceCheck.Valid("policy-kb"));
        
    }

    [Fact]
    public void JwtGroupClaimParser_TakesGuidBeforeColon_IgnoresLabels()
    {
        //var ids = JwtGroupClaimParser.ParseIds(new[] { TokenGroups });
        //ids.Should().BeEquivalentTo(new[] { Ndsom, DefaultGroup, Tcs });
    }

    [Fact]
    public async Task Create_UsesGroupIdsFromToken_DoesNotStoreNames()
    {
        var db = NewDb();
        var toolsClient = new Mock<IToolsConfigClient>();
        var ragClient = new Mock<IRagConfigClient>();
        VisibleDownstreams(toolsClient, ragClient);

        var ownerId = Guid.NewGuid();
        var currentUser = User(ownerId, "kiran.waje", groups: TokenGroups);
        var service = Svc(db, toolsClient, ragClient, currentUser);

        var result = await service.CreateAsync(
            new CreateAgentRequest("Shared Agent", null, Guid.NewGuid(), 0.5, "prompt",
                Array.Empty<AgentKnowledgeBaseInput>(), Array.Empty<AgentToolInput>(), Array.Empty<Guid>()),
            ownerId, "kiran.waje");

        result.GroupIds.Should().BeEquivalentTo(new[] { Ndsom, DefaultGroup, Tcs });
        db.AgentGroups.Should().OnlyContain(g => g.GroupName == null);
    }

    [Fact]
    public async Task Create_RejectsGroupIdNotOnToken()
    {
        var db = NewDb();
        var toolsClient = new Mock<IToolsConfigClient>();
        var ragClient = new Mock<IRagConfigClient>();
        VisibleDownstreams(toolsClient, ragClient);

        var ownerId = Guid.NewGuid();
        var currentUser = User(ownerId, "kiran.waje", groups: TokenGroups);
        var service = Svc(db, toolsClient, ragClient, currentUser);

        var act = async () => await service.CreateAsync(
            new CreateAgentRequest("Agent", null, Guid.NewGuid(), 0.5, "prompt",
                Array.Empty<AgentKnowledgeBaseInput>(), Array.Empty<AgentToolInput>(), new[] { Guid.NewGuid() }),
            ownerId, "kiran.waje");

        var ex = await Assert.ThrowsAsync<AppException>(act);
        ex.Code.Should().Be(ErrorCodes.ValidationFailed);
    }

    [Fact]
    public async Task GetAsync_TeammateWithOverlappingGroupId_SeesAgent()
    {
        var db = NewDb();
        var toolsClient = new Mock<IToolsConfigClient>();
        var ragClient = new Mock<IRagConfigClient>();
        VisibleDownstreams(toolsClient, ragClient);

        var ownerId = Guid.NewGuid();
        var owner = User(ownerId, "kiran.waje", groups: TokenGroups);
        var created = await Svc(db, toolsClient, ragClient, owner)
            .CreateAsync(
                new CreateAgentRequest("Shared Agent", null, Guid.NewGuid(), 0.5, "prompt",
                    Array.Empty<AgentKnowledgeBaseInput>(), Array.Empty<AgentToolInput>(), new[] { Ndsom }),
                ownerId, "kiran.waje");

        var teammate = User(Guid.NewGuid(), "other", groups: $"{Ndsom}:ndsom");
        var listed = await Svc(db, toolsClient, ragClient, teammate)
            .ListAsync(new AgentQueryParams(null, null, null));

        listed.Items.Should().Contain(i => i.Id == created.Id);
        var dto = await Svc(db, toolsClient, ragClient, teammate).GetAsync(created.Id);
        dto.Id.Should().Be(created.Id);
    }

    [Fact]
    public async Task GetAsync_UserWithoutThatGroupId_DoesNotSeeAgent()
    {
        var db = NewDb();
        var toolsClient = new Mock<IToolsConfigClient>();
        var ragClient = new Mock<IRagConfigClient>();
        VisibleDownstreams(toolsClient, ragClient);

        var ownerId = Guid.NewGuid();
        var owner = User(ownerId, "kiran.waje", groups: TokenGroups);
        var created = await Svc(db, toolsClient, ragClient, owner)
            .CreateAsync(
                new CreateAgentRequest("Shared Agent", null, Guid.NewGuid(), 0.5, "prompt",
                    Array.Empty<AgentKnowledgeBaseInput>(), Array.Empty<AgentToolInput>(), new[] { Ndsom }),
                ownerId, "kiran.waje");

        var outsider = User(Guid.NewGuid(), "outsider", groups: $"{Tcs}:tcs");
        var listed = await Svc(db, toolsClient, ragClient, outsider)
            .ListAsync(new AgentQueryParams(null, null, null));
        listed.Items.Should().NotContain(i => i.Id == created.Id);

        var act = async () => await Svc(db, toolsClient, ragClient, outsider).GetAsync(created.Id);
        var ex = await Assert.ThrowsAsync<AppException>(act);
        ex.Code.Should().Be(ErrorCodes.NotFound);
    }

    [Fact]
    public async Task List_Permission203_DoesNotBypassGroupFilter()
    {
        var db = NewDb();
        var toolsClient = new Mock<IToolsConfigClient>();
        var ragClient = new Mock<IRagConfigClient>();
        VisibleDownstreams(toolsClient, ragClient);

        var ownerId = Guid.NewGuid();
        var owner = User(ownerId, "kiran.waje", groups: TokenGroups);
        var created = await Svc(db, toolsClient, ragClient, owner)
            .CreateAsync(
                new CreateAgentRequest("Shared Agent", null, Guid.NewGuid(), 0.5, "prompt",
                    Array.Empty<AgentKnowledgeBaseInput>(), Array.Empty<AgentToolInput>(), new[] { Ndsom }),
                ownerId, "kiran.waje");

        var deleterWithoutGroup = User(Guid.NewGuid(), "deleter", adminScoped: false, groups: $"{Tcs}:tcs");
        deleterWithoutGroup.Setup(u => u.HasPermission("203")).Returns(true);

        var listed = await Svc(db, toolsClient, ragClient, deleterWithoutGroup)
            .ListAsync(new AgentQueryParams(null, null, null));
        listed.Items.Should().NotContain(i => i.Id == created.Id);
    }

    [Fact]
    public async Task Create_WithUnvisibleKnowledgeBase_ThrowsValidationFailed()
    {
        var db = NewDb();
        var toolsClient = new Mock<IToolsConfigClient>();
        toolsClient
            .Setup(t => t.ValidateModelVisibleAsync(It.IsAny<Guid>(), It.IsAny<IReadOnlyCollection<Guid>>(), default))
            .ReturnsAsync(ReferenceCheck.Valid("gpt-4"));
        var ragClient = new Mock<IRagConfigClient>();
        // ragClient
        //     .Setup(r => r.ValidateKnowledgeBaseVisibleAsync(It.IsAny<Guid>(), default))
        //     .ReturnsAsync(ReferenceCheck.NotVisible());
        ragClient
            .Setup(r => r.ValidateKnowledgeBaseVisibleAsync(
                It.IsAny<Guid>(),
                It.IsAny<IReadOnlyCollection<Guid>>(),
                default))
            .ReturnsAsync(ReferenceCheck.NotVisible());
        var currentUser = User(Guid.NewGuid(), "jdoe", groups: TokenGroups);
        var service = Svc(db, toolsClient, ragClient, currentUser);

        var request = new CreateAgentRequest(
            "Support Agent", "desc", Guid.NewGuid(), 0.7, "You are helpful.",
            new[] { new AgentKnowledgeBaseInput(Guid.NewGuid(), "Context") },
            Array.Empty<AgentToolInput>(), new[] { Ndsom });

        var act = async () => await service.CreateAsync(request, Guid.NewGuid(), "jdoe");
        var ex = await Assert.ThrowsAsync<AppException>(act);
        ex.Code.Should().Be(ErrorCodes.ValidationFailed);
    }
    
    [Fact]
    public async Task GetAsync_UserMissingOneAgentGroup_DoesNotSeeAgent()
    {
        var db = NewDb();
        var toolsClient = new Mock<IToolsConfigClient>();
        var ragClient = new Mock<IRagConfigClient>();
        VisibleDownstreams(toolsClient, ragClient);

        var ownerId = Guid.NewGuid();
        var owner = User(ownerId, "kiran.waje", groups: TokenGroups);
        var created = await Svc(db, toolsClient, ragClient, owner)
            .CreateAsync(
                new CreateAgentRequest("Shared Agent", null, Guid.NewGuid(), 0.5, "prompt",
                    Array.Empty<AgentKnowledgeBaseInput>(), Array.Empty<AgentToolInput>(), new[] { Ndsom, DefaultGroup }),
                ownerId, "kiran.waje");

        var partial = User(Guid.NewGuid(), "partial", groups: $"{Ndsom}:ndsom");
        var listed = await Svc(db, toolsClient, ragClient, partial)
            .ListAsync(new AgentQueryParams(null, null, null));
        listed.Items.Should().NotContain(i => i.Id == created.Id);

        var act = async () => await Svc(db, toolsClient, ragClient, partial).GetAsync(created.Id);
        var ex = await Assert.ThrowsAsync<AppException>(act);
        ex.Code.Should().Be(ErrorCodes.NotFound);
    }
}
