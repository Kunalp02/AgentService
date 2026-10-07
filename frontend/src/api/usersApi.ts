
import { authApiClient } from './authClient';
import { UserListItemDtoPagedResult, UserDetailDto, ApproveUserRequest, RejectUserRequest, ChangeUserStatusRequest, UpdateUserAssignmentsRequest } from '../types/admin';

export interface UserListParams { status?: string; groupId?: string; roleProfileId?: string; search?: string; page?: number; pageSize?: number; }

function buildQuery(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') qs.set(k, String(v)); });
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export const usersApi = {
  list: (params: UserListParams = {}) => authApiClient.get<UserListItemDtoPagedResult>(
    `/api/v1/users${buildQuery({ Status: params.status, GroupId: params.groupId, RoleProfileId: params.roleProfileId, Search: params.search, Page: params.page, PageSize: params.pageSize })}`
  ),
  pending: (page = 1, pageSize = 25) => authApiClient.get<UserListItemDtoPagedResult>(`/api/v1/users/pending${buildQuery({ page, pageSize })}`),
  get: (id: string) => authApiClient.get<UserDetailDto>(`/api/v1/users/${id}`),
  approve: (id: string, payload: ApproveUserRequest) => authApiClient.post<UserDetailDto>(`/api/v1/users/${id}/approve`, payload),
  reject: (id: string, payload: RejectUserRequest) => authApiClient.post<UserDetailDto>(`/api/v1/users/${id}/reject`, payload),
  changeStatus: (id: string, payload: ChangeUserStatusRequest) => authApiClient.post<UserDetailDto>(`/api/v1/users/${id}/status`, payload),
  updateAssignments: (id: string, payload: UpdateUserAssignmentsRequest) => authApiClient.put<UserDetailDto>(`/api/v1/users/${id}/assignments`, payload),
};
