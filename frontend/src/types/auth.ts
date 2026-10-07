
export type UserStatus =
  | "PendingApproval"
  | "Active"
  | "Suspended"
  | "Terminated"
  | "Rejected";
export type RolePermissionKey = string;

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthUserSummary {
  id: string;
  username: string | null;
  displayName: string | null;
  email: string | null;
  status: string | null;
  roleProfile: string | null;
  groups: Record<string, string> | string[] | null;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: AuthUserSummary;
  permissions?: string | string[] | null;
}

export interface IntrospectResponse {
  Active: boolean;
  sub: string | null;
  username: string | null;
  groups: Record<string, string> | string[] | null;
  roleProfile: string | null;
  permissions: string[] | string | null;
  exp: number | null;
}
