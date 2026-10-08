
﻿using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Agent.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "agents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    ModelId = table.Column<Guid>(type: "uuid", nullable: false),
                    ModelNameCache = table.Column<string>(type: "text", nullable: true),
                    Temperature = table.Column<double>(type: "double precision", nullable: false),
                    SystemPrompt = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    OwnerUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerUsername = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    MemoryEnabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    MemoryScope = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    MemoryRetention = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    MemoryInstructions = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_agents", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "agent_audits",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AgentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Action = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ChangedBy = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    ChangedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    DetailsJson = table.Column<string>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_agent_audits", x => x.Id);
                    table.ForeignKey(
                        name: "FK_agent_audits_agents_AgentId",
                        column: x => x.AgentId,
                        principalTable: "agents",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "agent_groups",
                columns: table => new
                {
                    AgentId = table.Column<Guid>(type: "uuid", nullable: false),
                    GroupId = table.Column<Guid>(type: "uuid", nullable: false),
                    GroupName = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_agent_groups", x => new { x.AgentId, x.GroupId });
                    table.ForeignKey(
                        name: "FK_agent_groups_agents_AgentId",
                        column: x => x.AgentId,
                        principalTable: "agents",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "agent_knowledge_bases",
                columns: table => new
                {
                    AgentId = table.Column<Guid>(type: "uuid", nullable: false),
                    KnowledgeBaseId = table.Column<Guid>(type: "uuid", nullable: false),
                    KnowledgeBaseNameCache = table.Column<string>(type: "text", nullable: true),
                    Mode = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_agent_knowledge_bases", x => new { x.AgentId, x.KnowledgeBaseId });
                    table.ForeignKey(
                        name: "FK_agent_knowledge_bases_agents_AgentId",
                        column: x => x.AgentId,
                        principalTable: "agents",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "agent_tools",
                columns: table => new
                {
                    AgentId = table.Column<Guid>(type: "uuid", nullable: false),
                    ToolId = table.Column<Guid>(type: "uuid", nullable: false),
                    ToolType = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    ToolNameCache = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_agent_tools", x => new { x.AgentId, x.ToolId, x.ToolType });
                    table.ForeignKey(
                        name: "FK_agent_tools_agents_AgentId",
                        column: x => x.AgentId,
                        principalTable: "agents",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_agent_audits_AgentId",
                table: "agent_audits",
                column: "AgentId");

            migrationBuilder.CreateIndex(
                name: "IX_agent_groups_GroupId",
                table: "agent_groups",
                column: "GroupId");

            migrationBuilder.CreateIndex(
                name: "IX_agents_OwnerUserId",
                table: "agents",
                column: "OwnerUserId");

            migrationBuilder.CreateIndex(
                name: "IX_agents_Status",
                table: "agents",
                column: "Status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "agent_audits");

            migrationBuilder.DropTable(
                name: "agent_groups");

            migrationBuilder.DropTable(
                name: "agent_knowledge_bases");

            migrationBuilder.DropTable(
                name: "agent_tools");

            migrationBuilder.DropTable(
                name: "agents");
        }
    }
}
