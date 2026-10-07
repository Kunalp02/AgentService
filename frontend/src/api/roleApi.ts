
import { authApiClient } from './authClient';
import { RoleProfileDto, CreateRoleProfileRequest, UpdateRoleProfileRequest, RoleAttributeDto, CreateRoleAttributeRequest } from '../types/admin';

export const roleProfilesApi = {
  list: (includeInactive = false) => authApiClient.get<RoleProfileDto[]>(`/api/v1/role-profiles${includeInactive ? '?includeInactive=true' : ''}`),
  create: (payload: CreateRoleProfileRequest) => authApiClient.post<RoleProfileDto>('/api/v1/role-profiles', payload),
  update: (id: string, payload: UpdateRoleProfileRequest) => authApiClient.put<RoleProfileDto>(`/api/v1/role-profiles/${id}`, payload),
  remove: (id: string) => authApiClient.delete<void>(`/api/v1/role-profiles/${id}`),
};

export const roleAttributesApi = {
  list: (module?: string) => authApiClient.get<RoleAttributeDto[]>(`/api/v1/role-attributes${module ? `?module=${encodeURIComponent(module)}` : ''}`),
  create: (payload: CreateRoleAttributeRequest) => authApiClient.post<RoleAttributeDto>('/api/v1/role-attributes', payload),
};
