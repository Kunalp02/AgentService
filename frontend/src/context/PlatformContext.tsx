
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { PERMISSIONS } from "../config/permissions";
import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "../store";
import { loginSuccess, logout as logoutAction } from "../store/authSlice";
import { authApi, AuthLoginError } from "../api/auth";
import { groupsApi } from "../api/groupApi";
import { authSessionStore } from "../api/sessionStore";
import { roleProfilesApi, roleAttributesApi } from "../api/roleApi";
import { usersApi } from "../api/usersApi";
import { localToolsApi } from "../api/localToolsApi";
import { remoteToolsApi } from "../api/remoteToolsApi";
import { agentsApi } from "../api/agents";
import { decodeJwtPayload, isJwtExpired } from "../api/jwt";
import {
  forget as forgetGroupNames,
  remember as rememberGroupNames,
  userGroupEntries,
} from "../api/groupDirectory";
import type {
  AuthUserSummary,
  LoginResponse,
  RolePermissionKey,
} from "../types/auth";
import type {
  GroupDto,
  CreateGroupRequest,
  UpdateGroupRequest,
  RoleProfileDto,
  CreateRoleProfileRequest,
  UpdateRoleProfileRequest,
  RoleAttributeDto,
  UserListItemDto,
  ApproveUserRequest,
  RejectUserRequest,
  ChangeUserStatusRequest,
  UpdateUserAssignmentsRequest,
} from "../types/admin";
import type {
  AiGatewayDto,
  ModelRegistryDto,
} from "../types/gatewayModelRegistry";
import type {
  LocalToolListItemDto,
  RemoteToolListItemDto,
} from "../types/tools";
import {
  normalizeAgent,
  type AgentUi,
  type CreateAgentRequest,
  type PatchAgentRequest,
} from "../types/agent";
import { useSessionRefresh } from "../hooks/useSessionRefresh";

export interface PlatformContextType {
  currentUser: AuthUserSummary | null;
  currentRole: { name: string; code: string; color: string } | null;
  isAuthenticated: boolean;
  authLoading: boolean;
  authError: string | null;
  sessionRestoring: boolean;
  login: (
    username: string,
    password: string,
  ) => Promise<{ success: boolean; isPending?: boolean; error?: string }>;
  logout: () => void;
  permissions: string[];
  hasPermission: (permission: RolePermissionKey | string) => boolean;
  canAccessView: (view: string) => boolean;

  users: UserListItemDto[];
  pendingRegistrations: UserListItemDto[];
  usersLoading: boolean;
  usersError: string | null;
  refetchUsers: () => Promise<void>;
  approveUserRegistration: (
    userId: string,
    payload: ApproveUserRequest,
  ) => Promise<void>;
  rejectUserRegistration: (
    userId: string,
    payload: RejectUserRequest,
  ) => Promise<void>;
  updateUserAssignments: (
    userId: string,
    payload: UpdateUserAssignmentsRequest,
  ) => Promise<void>;
  getUserDetail: (userId: string) => Promise<any>;
  changeUserStatus: (
    userId: string,
    payload: ChangeUserStatusRequest,
  ) => Promise<void>;

  groups: GroupDto[];
  groupsLoading: boolean;
  addGroup: (data: CreateGroupRequest) => Promise<void>;
  updateGroup: (id: string, data: UpdateGroupRequest) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;

  roles: RoleProfileDto[];
  roleAttributes: RoleAttributeDto[];
  rolesLoading: boolean;
  addRole: (data: CreateRoleProfileRequest) => Promise<void>;
  updateRole: (id: string, data: UpdateRoleProfileRequest) => Promise<void>;
  deleteRole: (id: string) => Promise<void>;

  localTools: LocalToolListItemDto[];
  mcpServers: RemoteToolListItemDto[];
  gateways: AiGatewayDto[];
  models: ModelRegistryDto[];
  knowledgeBases: any[];
  agents: AgentUi[];
  strategies: any[];
  ingestedDocs: any[];
  auditLogs: any[];

  reloadPlatformData: (view?: string) => Promise<void>;
  addAgent: (data: CreateAgentRequest) => Promise<void>;
  updateAgent: (id: string, data: PatchAgentRequest) => Promise<void>;
  deleteAgent: (agentId: string) => Promise<void>;
  publishAgent: (agentId: string) => Promise<void>;
  unpublishAgent: (agentId: string) => Promise<void>;
  selectedPlaygroundAgentId: string | null;
  setSelectedPlaygroundAgentId: (id: string | null) => void;

  activeView: string;
  setActiveView: (view: string) => void;
  notification: string | null;
  showNotification: (message: string) => void;
  theme: "light" | "dark" | "enterprise";
  setTheme: (theme: "light" | "dark" | "enterprise") => void;
}

const PlatformContext = createContext<PlatformContextType | undefined>(
  undefined,
);

function asList(value: unknown): string[] {
  if (Array.isArray(value))
    return value
      .map(String)
      .map((v) => v.trim())
      .filter(Boolean);
  if (typeof value === "string")
    return value
      .split(/[,;]/)
      .map((v) => v.trim())
      .filter(Boolean);
  return [];
}

function extractPermissions(source: any): string[] {
  const candidates = [
    source?.roles,
    source?.Roles,
    source?.permissions,
    source?.Permissions,
    source?.permissionCodes,
    source?.PermissionCodes,
    source?.permissionsJson,
  ];
  for (const value of candidates) {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch {}
      return asList(value);
    }
  }
  return [];
}

function normalizeStatus(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function groupsFromClaim(value: unknown): GroupDto[] {
  return userGroupEntries(value).map((g) => ({
    id: g.id,
    name: g.name,
    description: null,
    isActive: g.isActive,
    createdAt: "",
  }));
}

function firstViewForPermissions(perms: string[]): string {
  const has = (p: string) => perms.includes(p);
  if (
    has(PERMISSIONS.Users.View) &&
    has(PERMISSIONS.RoleProfile.View) &&
    has(PERMISSIONS.Group.View)
  )
    return "dashboard";
  if (has(PERMISSIONS.LocalTools.View)) return "tools";
  if (has(PERMISSIONS.Users.View) || has(PERMISSIONS.Group.View))
    return "users";
  if (has(PERMISSIONS.KnowledgeBase.View)) return "knowledge";
  if (has(PERMISSIONS.Agent.View)) return "agents";
  if (has(PERMISSIONS.ModelRegistry.View)) return "model-registry";
  return "tools";
}

export const PlatformProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const dispatch = useDispatch();
  const accessToken = useSelector((s: RootState) => s.auth.accessToken);
  const reduxUser = useSelector((s: RootState) => s.auth.user);
  const reduxGroups = useSelector((s: RootState) => s.auth.groups);
  const permissions = useSelector((s: RootState) => s.auth.permissions);
  useSessionRefresh();
  const currentUser = useMemo<AuthUserSummary | null>(
    () =>
      reduxUser
        ? {
            id: reduxUser.id,
            username: reduxUser.username,
            displayName: reduxUser.displayName,
            email: reduxUser.email,
            status: reduxUser.status,
            roleProfile: reduxUser.roleProfile,
            groups: reduxGroups,
          }
        : null,
    [reduxUser, reduxGroups],
  );
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionRestoring, setSessionRestoring] = useState(true);

  const [users, setUsers] = useState<UserListItemDto[]>([]);
  const [pendingRegistrations, setPendingRegistrations] = useState<
    UserListItemDto[]
  >([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [groups, setGroups] = useState<GroupDto[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [roles, setRoles] = useState<RoleProfileDto[]>([]);
  const [roleAttributes, setRoleAttributes] = useState<RoleAttributeDto[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  const [localTools, setLocalTools] = useState<LocalToolListItemDto[]>([]);
  const [mcpServers, setMcpServers] = useState<RemoteToolListItemDto[]>([]);
  const [gateways, setGateways] = useState<AiGatewayDto[]>([]);
  const [models, setModels] = useState<ModelRegistryDto[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<any[]>([]);
  const [strategies, setStrategies] = useState<any[]>([]);
  const [ingestedDocs, setIngestedDocs] = useState<any[]>([]);
  const [agents, setAgents] = useState<AgentUi[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const [selectedPlaygroundAgentId, setSelectedPlaygroundAgentId] = useState<
    string | null
  >(null);
  const [activeViewState, setActiveViewState] = useState("tools");
  const [notification, setNotification] = useState<string | null>(null);
  const [theme, setThemeState] = useState<"light" | "dark" | "enterprise">(
    () => (localStorage.getItem("ai_platform_theme") as any) || "dark",
  );

  const showNotification = useCallback((message: string) => {
    setNotification(message);
    window.setTimeout(() => setNotification(null), 4000);
  }, []);

  const normalizedPermissions = useMemo(
    () => new Set(permissions.map(String)),
    [permissions],
  );

  const hasPermission = useCallback(
    (permission: RolePermissionKey | string) => {
      if (!currentUser || normalizeStatus(currentUser.status) !== "active")
        return false;
      return normalizedPermissions.has(String(permission));
    },
    [currentUser, normalizedPermissions],
  );

  const requiredPermissionForView = useCallback(
    (view: string): string | null => {
      switch (view) {
        case "tools":
          return PERMISSIONS.LocalTools.View;
        case "users":
          return PERMISSIONS.Users.View;
        case "groups":
          return PERMISSIONS.Group.View;
        case "roles":
          return PERMISSIONS.RoleProfile.View;
        case "knowledge":
          return PERMISSIONS.KnowledgeBase.View;
        case "agents":
        case "playground":
          return PERMISSIONS.Agent.View;
        case "model-registry":
          return PERMISSIONS.ModelRegistry.View;
        case "audit":
          return PERMISSIONS.Users.View;
        case "dashboard":
          return null;
        default:
          return null;
      }
    },
    [],
  );

  const canAccessView = useCallback(
    (view: string) => {
      if (!currentUser || normalizeStatus(currentUser.status) !== "active")
        return false;
      if (view === "dashboard") {
        return (
          hasPermission(PERMISSIONS.Users.View) &&
          hasPermission(PERMISSIONS.RoleProfile.View) &&
          hasPermission(PERMISSIONS.Group.View)
        );
      }
      const p = requiredPermissionForView(view);
      return p ? hasPermission(p) : false;
    },
    [currentUser, hasPermission, requiredPermissionForView],
  );

  const setActiveView = useCallback(
    (view: string) => {
      if (canAccessView(view)) setActiveViewState(view);
    },
    [canAccessView],
  );

  const currentRole = useMemo(
    () =>
      currentUser?.roleProfile
        ? {
            name: currentUser.roleProfile,
            code: currentUser.roleProfile,
            color: "#6366f1",
          }
        : null,
    [currentUser],
  );

  const refetchUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const allRes = await usersApi.list({ pageSize: 200 });
      setUsers(allRes.items ?? []);

      // The approval queue is only useful (and only authorized) when the
      // caller can approve registrations. Do not make a predictable 403
      // request for every read-only user.
      if (hasPermission(PERMISSIONS.Users.Approve)) {
        const pendingRes = await usersApi.pending(1, 200);
        setPendingRegistrations(pendingRes.items ?? []);
      } else {
        setPendingRegistrations([]);
      }
    } catch (e) {
      setUsersError(e instanceof Error ? e.message : "Failed to load users.");
    } finally {
      setUsersLoading(false);
    }
  }, [hasPermission]);

  const refetchGroups = useCallback(async () => {
    setGroupsLoading(true);
    try {
      // Used only by the dedicated admin Groups screen. All other modules
      // consume the login/session group distributor and never call this.
      const directoryRows = await groupsApi.list(true);
      setGroups(directoryRows);
      authSessionStore.mergeGroups(directoryRows);
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  const refetchRoles = useCallback(async () => {
    setRolesLoading(true);
    try {
      const r = await roleProfilesApi.list(true);
      setRoles(r);

      // Attribute definitions are needed for the permission editor, not for
      // simply viewing role profiles. Avoid an unnecessary 403 for a caller
      // that only has RoleProfile.View.
      if (
        hasPermission(PERMISSIONS.RoleAttribute.View) ||
        hasPermission(PERMISSIONS.RoleProfile.Manage)
      ) {
        setRoleAttributes(await roleAttributesApi.list());
      } else {
        setRoleAttributes([]);
      }
    } finally {
      setRolesLoading(false);
    }
  }, [hasPermission]);

  const reloadPlatformData = useCallback(
    async (view = activeViewState) => {
      // Load only what the currently visible screen needs. The previous
      // implementation loaded every permitted service immediately after login,
      // even though React only renders one view at a time.
      const tasks: Promise<void>[] = [];

      if (view === "dashboard") {
        if (hasPermission(PERMISSIONS.Users.View)) tasks.push(refetchUsers());
        if (hasPermission(PERMISSIONS.RoleProfile.View))
          tasks.push(refetchRoles());
        return void (await Promise.allSettled(tasks));
      }

      if (view === "users") {
        if (hasPermission(PERMISSIONS.Users.View)) tasks.push(refetchUsers());
        if (hasPermission(PERMISSIONS.RoleProfile.View))
          tasks.push(refetchRoles());
      } else if (view === "groups") {
        if (hasPermission(PERMISSIONS.Group.View)) tasks.push(refetchGroups());
      } else if (view === "roles") {
        if (hasPermission(PERMISSIONS.RoleProfile.View))
          tasks.push(refetchRoles());
      } else if (view === "model-registry" || view === "knowledge") {
        // Groups come from the login/session distributor. Do not call the
        // admin-only Groups endpoint just to populate a picker.
      } else if (view === "tools") {
        if (hasPermission(PERMISSIONS.LocalTools.View)) {
          tasks.push(
            (async () => {
              const remoteAllowed =
                hasPermission(PERMISSIONS.RemoteTools.View) ||
                hasPermission(PERMISSIONS.RemoteTools.Add) ||
                hasPermission(PERMISSIONS.RemoteTools.Edit) ||
                hasPermission(PERMISSIONS.RemoteTools.Delete);
              const [local, remote] = await Promise.all([
                localToolsApi.list({ pageSize: 200 }),
                remoteAllowed
                  ? remoteToolsApi.list({ pageSize: 200 })
                  : Promise.resolve({ items: [] }),
              ]);
              setLocalTools(local.items ?? []);
              setMcpServers(remote.items ?? []);
            })(),
          );
        }
      } else if (
        view === "agents" ||
        view === "playground" ||
        view === "audit"
      ) {
        if (hasPermission(PERMISSIONS.Agent.View)) {
          tasks.push(
            (async () => {
              const result = await agentsApi.getAgents(1, 200);
              setAgents(
                (result?.items ?? []).map(normalizeAgent).filter((a) => a.id),
              );
            })(),
          );
        }
      }

      await Promise.allSettled(tasks);
    },
    [activeViewState, hasPermission, refetchUsers, refetchGroups, refetchRoles],
  );

  useEffect(() => {
    // Rehydration now happens before this component ever mounts — see
    // <PersistGate> in main.tsx. Nothing left to restore here.
    setSessionRestoring(false);
  }, []);

  // Keeps the local `groups` list (what Tools/Knowledge/Agents/etc read as
  // "the groups I belong to") in step with Redux. Covers both login AND a
  // page refresh — a refresh restores Redux via redux-persist, but nothing
  // else was refilling this local list afterward, which is why every
  // service screen went blank after reloading the page.
  useEffect(() => {
    setGroups(reduxUser ? groupsFromClaim(reduxGroups) : []);
  }, [reduxUser, reduxGroups]);

  useEffect(() => {
    if (!currentUser || sessionRestoring) return;
    void reloadPlatformData(activeViewState);
  }, [currentUser, sessionRestoring, activeViewState, reloadPlatformData]);

  const login = useCallback(
    async (username: string, password: string) => {
      setAuthLoading(true);
      setAuthError(null);
      dispatch(logoutAction());
      setUsers([]);
      setPendingRegistrations([]);
      setGroups([]);
      setRoles([]);
      setRoleAttributes([]);
      setLocalTools([]);
      setMcpServers([]);
      setGateways([]);
      setModels([]);
      setKnowledgeBases([]);
      setStrategies([]);
      setAgents([]);
      setActiveViewState("tools");
      try {
        const response: LoginResponse = await authApi.login(username, password);
        if (normalizeStatus(response.user.status) !== "active") {
          dispatch(
            loginSuccess({
              accessToken: "",
              user: {
                id: response.user.id,
                username: response.user.username,
                displayName: response.user.displayName,
                email: response.user.email,
                status: response.user.status,
                roleProfile: response.user.roleProfile,
                groups: response.user.groups,
              },
            }),
          );
          return {
            success: false,
            isPending:
              normalizeStatus(response.user.status) === "pendingapproval",
          };
        }

        const tokenClaims = decodeJwtPayload<any>(response.accessToken);
        // Auth's OpenAPI contract returns permissions as a nullable string.
        // Prefer it, but fall back to token/user permissions if it is empty or absent.
        const responsePermissions = extractPermissions(response.permissions);
        const tokenPermissions = extractPermissions(tokenClaims);
        const userPermissions = extractPermissions(response.user);
        const nextPermissions = responsePermissions.length
          ? responsePermissions
          : tokenPermissions.length
            ? tokenPermissions
            : userPermissions;
        const user = response.user;

        dispatch(
          loginSuccess({
            accessToken: response.accessToken,
            expiresIn: response.expiresIn,
            permissions: nextPermissions,
            user: {
              id: String(tokenClaims?.UserId ?? user.id),
              username: user.username,
              displayName: user.displayName,
              email: user.email,
              status: user.status,
              roleProfile: user.roleProfile,
              groups: user.groups,
            },
          }),
        );
        // Non-admin users get only their own groups from the login response.
        // An admin with Group.View may subsequently replace this with the full
        // directory through refetchGroups().
        setGroups(groupsFromClaim(user.groups));

        const firstView = firstViewForPermissions(nextPermissions);
        setActiveViewState(firstView);

        showNotification(
          `Welcome back, ${user.displayName || user.username || username}.`,
        );
        return { success: true };
      } catch (e) {
        const message = e instanceof Error ? e.message : "Login failed.";
        setAuthError(message);
        return {
          success: false,
          isPending:
            e instanceof AuthLoginError && e.code === "PENDING_APPROVAL",
          error: message,
        };
      } finally {
        setAuthLoading(false);
      }
    },
    [showNotification],
  );

  const logout = useCallback(() => {
    const token = accessToken;
    dispatch(logoutAction());
    setUsers([]);
    setPendingRegistrations([]);
    setGroups([]);
    setRoles([]);
    setRoleAttributes([]);
    setLocalTools([]);
    setMcpServers([]);
    setGateways([]);
    setModels([]);
    setKnowledgeBases([]);
    setStrategies([]);
    setAgents([]);
    void authApi.logout(token);
    showNotification("Logged out.");
  }, [accessToken, dispatch, showNotification]);

  const addGroup = async (data: CreateGroupRequest) => {
    await groupsApi.create(data);
    await refetchGroups();
  };
  const updateGroup = async (id: string, data: UpdateGroupRequest) => {
    await groupsApi.update(id, data);
    await refetchGroups();
  };
  const deleteGroup = async (id: string) => {
    await groupsApi.remove(id);
    await refetchGroups();
  };

  const addRole = async (data: CreateRoleProfileRequest) => {
    await roleProfilesApi.create(data);
    await refetchRoles();
  };
  const updateRole = async (id: string, data: UpdateRoleProfileRequest) => {
    await roleProfilesApi.update(id, data);
    await refetchRoles();
  };
  const deleteRole = async (id: string) => {
    await roleProfilesApi.remove(id);
    await refetchRoles();
  };

  const approveUserRegistration = async (
    id: string,
    payload: ApproveUserRequest,
  ) => {
    await usersApi.approve(id, payload);
    await refetchUsers();
  };
  const rejectUserRegistration = async (
    id: string,
    payload: RejectUserRequest,
  ) => {
    await usersApi.reject(id, payload);
    await refetchUsers();
  };
  const updateUserAssignments = async (
    id: string,
    payload: UpdateUserAssignmentsRequest,
  ) => {
    await usersApi.updateAssignments(id, payload);
    await refetchUsers();
  };
  const getUserDetail = async (id: string) => usersApi.get(id);
  const changeUserStatus = async (
    id: string,
    payload: ChangeUserStatusRequest,
  ) => {
    await usersApi.changeStatus(id, payload);
    await refetchUsers();
  };

  const addAgent = async (data: CreateAgentRequest) => {
    await agentsApi.createAgent(data);
    showNotification("Agent created.");
    const result = await agentsApi.getAgents(1, 200);
    setAgents((result?.items ?? []).map(normalizeAgent).filter((a) => a.id));
  };
  const updateAgent = async (id: string, data: PatchAgentRequest) => {
    await agentsApi.patchAgent(id, data);
    showNotification("Agent saved.");
    const result = await agentsApi.getAgents(1, 200);
    setAgents((result?.items ?? []).map(normalizeAgent).filter((a) => a.id));
  };
  const deleteAgent = async (agentId: string) => {
    await agentsApi.deleteAgent(agentId);
    showNotification("Agent deleted.");
    setAgents((prev) => prev.filter((a) => a.id !== agentId));
  };

  const publishAgent = async (agentId: string) => {
    await agentsApi.publishAgent(agentId);
    const result = await agentsApi.getAgents(1, 200);
    setAgents((result?.items ?? []).map(normalizeAgent).filter((a) => a.id));
  };
  const unpublishAgent = async (agentId: string) => {
    await agentsApi.unpublishAgent(agentId);
    const result = await agentsApi.getAgents(1, 200);
    setAgents((result?.items ?? []).map(normalizeAgent).filter((a) => a.id));
  };
  const setTheme = (theme: "light" | "dark" | "enterprise") => {
    setThemeState(theme);
    localStorage.setItem("ai_platform_theme", theme);
  };

  const value: PlatformContextType = {
    currentUser,
    currentRole,
    isAuthenticated:
      !!accessToken &&
      !!currentUser &&
      normalizeStatus(currentUser.status) === "active",
    authLoading,
    authError,
    sessionRestoring,
    login,
    logout,
    permissions,
    hasPermission,
    canAccessView,
    users,
    pendingRegistrations,
    usersLoading,
    usersError,
    refetchUsers,
    approveUserRegistration,
    rejectUserRegistration,
    updateUserAssignments,
    getUserDetail,
    changeUserStatus,
    groups,
    groupsLoading,
    addGroup,
    updateGroup,
    deleteGroup,
    roles,
    roleAttributes,
    rolesLoading,
    addRole,
    updateRole,
    deleteRole,
    localTools,
    mcpServers,
    gateways,
    models,
    knowledgeBases,
    agents,
    strategies,
    ingestedDocs,
    auditLogs,
    reloadPlatformData,
    addAgent,
    updateAgent,
    deleteAgent,
    publishAgent,
    unpublishAgent,
    selectedPlaygroundAgentId,
    setSelectedPlaygroundAgentId,
    activeView: activeViewState,
    setActiveView,
    notification,
    showNotification,
    theme,
    setTheme,
  };
  return (
    <PlatformContext.Provider value={value}>
      {children}
    </PlatformContext.Provider>
  );
};
export const usePlatform = () => {
  const context = useContext(PlatformContext);
  if (!context)
    throw new Error("usePlatform must be used within a PlatformProvider");
  return context;
};
