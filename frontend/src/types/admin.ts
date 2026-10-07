
export interface GroupDto {
  id: string;
  name: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CreateGroupRequest {
  name: string;
  description?: string;
}

export interface UpdateGroupRequest {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface RoleAttributeDto {
  id: string;
  code: string | null;
  name?: string | null;
  description: string | null;
  module: string | null;
}

export interface CreateRoleAttributeRequest {
  code?: string;
  name?: string;
  description?: string;
  module?: string;
}

export interface RoleProfileDto {
  id: string;
  name: string | null;
  description: string | null;
  isActive: boolean;
  attributes: RoleAttributeDto[] | null;
}

export interface CreateRoleProfileRequest {
  name: string;
  description?: string;
  roleAttributeIds?: string[];
}

export interface UpdateRoleProfileRequest {
  name?: string;
  description?: string;
  isActive?: boolean;
  roleAttributeIds?: string[];
}

export interface UserListItemDto {
  id: string;
  username: string | null;
  displayName: string | null;
  email: string | null;
  status: string | null;
  roleProfile: string | null;
  groups: string[] | null;
  createdAt: string;
}

export interface UserListItemDtoPagedResult {
  items: UserListItemDto[] | null;
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface UserDetailDto {
  id: string;
  username: string | null;
  displayName: string | null;
  email: string | null;
  status: string | null;
  roleProfileId: string | null;
  roleProfile: string | null;
  groupIds: string[] | null;
  groups: string[] | null;
  approvedBy: string | null;
  approvedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface ApproveUserRequest {
  roleProfileId: string;
  groupIds?: string[];
}

export interface RejectUserRequest {
  reason?: string;
}

export interface ChangeUserStatusRequest {
  newStatus?: string;
  reason?: string;
}

export interface UpdateUserAssignmentsRequest {
  roleProfileId?: string | null;
  groupIds?: string[];
}
