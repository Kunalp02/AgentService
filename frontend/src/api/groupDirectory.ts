
import { store } from '../store';

type Directory = Record<string, string>;

export function readGroups(user: unknown): Directory {
  const groups = (user as { groups?: unknown } | null | undefined)?.groups;
  const out: Directory = {};
  if (!groups) return out;

  if (Array.isArray(groups)) {
    for (const g of groups) {
      if (g && typeof g === 'object') {
        const id = (g as any).id ?? (g as any).groupId;
        const name = (g as any).name ?? (g as any).groupName;
        if (id && name) out[String(id)] = String(name);
      }
    }
    return out;
  }

  if (typeof groups === 'object') {
    for (const [id, name] of Object.entries(groups as Record<string, unknown>)) {
      if (id && typeof name === 'string') out[id] = name;
    }
  }
  return out;
}

/** No-op now — group names are written to the store only through
    authSlice.loginSuccess / mergeGroupNames. Kept so existing callers
    (PlatformContext.login) keep compiling without changes. */
export function remember(_user: unknown): void {}

/** Everything known, id -> name — read live from Redux. */
export function directory(): Directory {
  const state = store.getState().auth;
  return { ...state.groupDirectory, ...state.groups };
}

export function groupName(id: string): string {
  return directory()[id] || id;
}

export function hasNames(ids: string[]): boolean {
  const d = directory();
  return ids.some((id) => !!d[id]);
}

/** No-op now — logout clears the whole auth slice, including groups. */
export function forget(): void {}

export function userGroupEntries(groups: unknown): Array<{
  id: string;
  name: string;
  isActive: boolean;
}> {
  const found: Array<{ id: string; name: string; isActive: boolean }> = [];
  const add = (id: unknown, name?: unknown) => {
    const key = String(id ?? '').trim();
    if (!key || found.some((g) => g.id === key)) return;
    found.push({
      id: key,
      name: String(name ?? directory()[key] ?? key),
      isActive: true,
    });
  };

  if (Array.isArray(groups)) {
    for (const item of groups) {
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        add(obj.id ?? obj.groupId, obj.name ?? obj.groupName);
      } else {
        add(item);
      }
    }
  } else if (groups && typeof groups === 'object') {
    for (const [id, name] of Object.entries(groups as Record<string, unknown>)) {
      add(id, name);
    }
  } else if (typeof groups === 'string') {
    for (const id of groups.split(/[,;]/)) add(id);
  }

  return found;
}

export function userGroupIds(groups: unknown): string[] {
  return userGroupEntries(groups).map((g) => g.id);
}
