
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface AuthUser {
  id: string;
  username: string | null;
  displayName: string | null;
  email: string | null;
  status: string | null;
  roleProfile: string | null;
}

export interface AuthState {
  accessToken: string | null;
  expiresIn: number | null;
  /** Local clock time (ms) when the current token arrived. Lets us work out
      expiry from the token's own lifetime, so a PC with a wrong clock still
      schedules renewal correctly. */
  tokenReceivedAt: number | null;
  permissions: string[];
  user: AuthUser | null;
  /** ONLY the groups this user is actually a member of, id -> name, straight
      from /login. Never merge admin-directory data into this — this decides
      membership everywhere in the app. */
  groups: Record<string, string>;
  groupIds: string[];
  /** A label cache for every group name this app has seen. Resolves an id to a
      readable name only — never used to decide membership. */
  groupDirectory: Record<string, string>;
}

const initialState: AuthState = {
  accessToken: null,
  expiresIn: null,
  tokenReceivedAt: null,
  permissions: [],
  user: null,
  groups: {},
  groupIds: [],
  groupDirectory: {},
};

function parsePermissions(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string')
    return raw.split(',').map((p) => p.trim()).filter(Boolean);
  return [];
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    loginSuccess: (
      state,
      action: PayloadAction<{
        accessToken: string;
        expiresIn?: number;
        permissions?: string | string[] | null;
        user: {
          id: string;
          username?: string | null;
          displayName?: string | null;
          email?: string | null;
          status?: string | null;
          roleProfile?: string | null;
          groups?: Record<string, string> | string[] | null;
        };
      }>,
    ) => {
      const { accessToken, expiresIn, permissions, user } = action.payload;
      state.accessToken = accessToken || null;
      state.expiresIn = expiresIn ?? null;
      state.tokenReceivedAt = accessToken ? Date.now() : null;
      state.permissions = parsePermissions(permissions);
      state.user = {
        id: user.id,
        username: user.username ?? null,
        displayName: user.displayName ?? null,
        email: user.email ?? null,
        status: user.status ?? null,
        roleProfile: user.roleProfile ?? null,
      };
      if (user.groups && !Array.isArray(user.groups)) {
        state.groups = user.groups;
        state.groupIds = Object.keys(user.groups);
      } else if (Array.isArray(user.groups)) {
        state.groups = {};
        state.groupIds = user.groups.map(String);
      } else {
        state.groups = {};
        state.groupIds = [];
      }
      // Own groups are always known by name — seed the directory with them.
      state.groupDirectory = { ...state.groups };
    },
    /** Admin-fetched (or otherwise discovered) group names. Never touches
        `groups`/`groupIds` — only resolves labels. */
    mergeGroupDirectory: (state, action: PayloadAction<Record<string, string>>) => {
      state.groupDirectory = { ...state.groupDirectory, ...action.payload };
    },
    refreshSuccess: (
      state,
      action: PayloadAction<{ accessToken: string; expiresIn?: number; receivedAt?: number }>,
    ) => {
      state.accessToken = action.payload.accessToken;
      state.tokenReceivedAt = action.payload.receivedAt ?? Date.now();
      if (action.payload.expiresIn !== undefined) {
        state.expiresIn = action.payload.expiresIn;
      }
    },
    logout: () => initialState,
  },
});

export const { loginSuccess, mergeGroupDirectory, refreshSuccess, logout } = authSlice.actions;
export default authSlice.reducer;
