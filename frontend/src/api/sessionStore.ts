
import { store } from '../store';
import { mergeGroupDirectory } from '../store/authSlice';
import type { AuthUserSummary } from '../types/auth';

export interface AuthSessionSnapshot {
  user: AuthUserSummary;
  permissions: string[];
  groupDirectory: Record<string, string>;
  savedAt: number;
}

export const authSessionStore = {
  get(): AuthSessionSnapshot | null {
    const state = store.getState().auth;
    if (!state.user) return null;
    return {
      user: { ...state.user, groups: state.groups } as unknown as AuthUserSummary,
      permissions: state.permissions,
      groupDirectory: state.groups,
      savedAt: 0,
    };
  },
  set(_user: AuthUserSummary, _permissions: string[], _groupDirectory: Record<string, string>): void {
    // No-op: writing happens through authSlice.loginSuccess (see
    // PlatformContext.login()). Kept so existing callers keep compiling.
  },
  mergeGroups(groups: unknown): void {
    const merged: Record<string, string> = {};
    if (Array.isArray(groups)) {
      for (const item of groups) {
        if (!item || typeof item !== 'object') continue;
        const obj = item as Record<string, unknown>;
        const id = obj.id ?? obj.groupId;
        const name = obj.name ?? obj.groupName;
        if (id && name) merged[String(id)] = String(name);
      }
    } else if (groups && typeof groups === 'object') {
      for (const [id, name] of Object.entries(groups as Record<string, unknown>)) {
        if (id && name) merged[id] = String(name);
      }
    }
        if (Object.keys(merged).length) store.dispatch(mergeGroupDirectory(merged));
  },
  clear(): void {
    // No-op: authSlice.logout() clears everything (see PlatformContext.logout()).
  },
};
