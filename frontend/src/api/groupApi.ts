
import { authApiClient } from './authClient';
import { GroupDto, CreateGroupRequest, UpdateGroupRequest } from '../types/admin';

export const groupsApi = {
  list: (includeInactive = false) => authApiClient.get<GroupDto[]>(`/api/v1/groups${includeInactive ? '?includeInactive=true' : ''}`),
  get: (id: string) => authApiClient.get<GroupDto>(`/api/v1/groups/${id}`),
  create: (payload: CreateGroupRequest) => authApiClient.post<GroupDto>('/api/v1/groups', payload),
  update: (id: string, payload: UpdateGroupRequest) => authApiClient.put<GroupDto>(`/api/v1/groups/${id}`, payload),
  remove: (id: string) => authApiClient.delete<void>(`/api/v1/groups/${id}`),
};
