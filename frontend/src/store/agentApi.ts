import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
import { agentsApi } from "../api/agents";
import {
  normalizeAgent,
  normalizeEditorOptions,
  type AgentEditorOptionsDto,
  type AgentListItemDto,
  type AgentUi,
  type CreateAgentRequest,
  type PagedResult,
  type PatchAgentRequest,
} from "../types/agent";

export interface AgentListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  groupId?: string;
}

export interface AgentEditorOptionsQuery {
  groupIds: string[];
}

interface AgentApiError {
  status: "CUSTOM_ERROR";
  error: string;
}

async function queryResult<T>(
  request: () => Promise<T>,
): Promise<{ data: T } | { error: AgentApiError }> {
  try {
    return { data: await request() };
  } catch (error) {
    return {
      error: {
        status: "CUSTOM_ERROR",
        error:
          error instanceof Error ? error.message : "Agent request failed.",
      },
    };
  }
}

export function agentErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  if ("error" in error && typeof error.error === "string") return error.error;
  if ("message" in error && typeof error.message === "string")
    return error.message;
  return fallback;
}

export const agentApi = createApi({
  reducerPath: "agentApi",
  baseQuery: fakeBaseQuery<AgentApiError>(),
  tagTypes: ["Agent"],
  endpoints: (build) => ({
    getAgents: build.query<
      PagedResult<AgentListItemDto>,
      AgentListQuery
    >({
      queryFn: (query) => {
        return queryResult(() =>
          agentsApi.getAgents(
            query.page ?? 1,
            query.pageSize ?? 25,
            query.search,
            query.status,
            query.groupId,
          ),
        );
      },
      providesTags: (result) => [
        { type: "Agent", id: "LIST" },
        ...(result?.items.map(({ id }) => ({ type: "Agent" as const, id })) ??
          []),
      ],
    }),
    getAgent: build.query<AgentUi, string>({
      queryFn: (id) =>
        queryResult(async () => normalizeAgent(await agentsApi.getAgent(id))),
      providesTags: (_result, _error, id) => [{ type: "Agent", id }],
    }),
    getEditorOptions: build.query<
      AgentEditorOptionsDto,
      AgentEditorOptionsQuery
    >({
      serializeQueryArgs: ({ queryArgs }) =>
        `editor-options:${[...new Set(queryArgs.groupIds)].sort().join(",")}`,
      queryFn: ({ groupIds }) =>
        queryResult(async () =>
          normalizeEditorOptions(
            await agentsApi.getEditorOptions(
              [...new Set(groupIds)].filter(Boolean).sort(),
            ),
          ),
        ),
    }),
    createAgent: build.mutation<AgentUi, CreateAgentRequest>({
      queryFn: (request) =>
        queryResult(async () =>
          normalizeAgent(await agentsApi.createAgent(request)),
        ),
      invalidatesTags: [{ type: "Agent", id: "LIST" }],
    }),
    patchAgent: build.mutation<
      AgentUi,
      { id: string; data: PatchAgentRequest }
    >({
      queryFn: ({ id, data }) =>
        queryResult(async () =>
          normalizeAgent(await agentsApi.patchAgent(id, data)),
        ),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "Agent", id },
        { type: "Agent", id: "LIST" },
      ],
    }),
    deleteAgent: build.mutation<void, string>({
      queryFn: (id) => queryResult(() => agentsApi.deleteAgent(id)),
      invalidatesTags: (_result, _error, id) => [
        { type: "Agent", id },
        { type: "Agent", id: "LIST" },
      ],
    }),
    publishAgent: build.mutation<AgentUi, string>({
      queryFn: (id) =>
        queryResult(async () =>
          normalizeAgent(await agentsApi.publishAgent(id)),
        ),
      invalidatesTags: (_result, _error, id) => [
        { type: "Agent", id },
        { type: "Agent", id: "LIST" },
      ],
    }),
    unpublishAgent: build.mutation<AgentUi, string>({
      queryFn: (id) =>
        queryResult(async () =>
          normalizeAgent(await agentsApi.unpublishAgent(id)),
        ),
      invalidatesTags: (_result, _error, id) => [
        { type: "Agent", id },
        { type: "Agent", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetAgentsQuery,
  useGetAgentQuery,
  useLazyGetAgentQuery,
  useGetEditorOptionsQuery,
  useCreateAgentMutation,
  usePatchAgentMutation,
  useDeleteAgentMutation,
  usePublishAgentMutation,
  useUnpublishAgentMutation,
} = agentApi;
