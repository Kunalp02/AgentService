
import { authTokenStore } from './authTokenStore';
import { serviceUrl } from '../config/api';
import type { WorkspaceFileDto } from '../types/tools';

export const WORKSPACE_PREFIX = 'workspace://';

export const isWorkspaceRef = (v: unknown): v is string =>
  typeof v === 'string' && v.startsWith(WORKSPACE_PREFIX) && v.length > WORKSPACE_PREFIX.length;

const idOf = (reference: string) =>
  reference.startsWith(WORKSPACE_PREFIX) ? reference.slice(WORKSPACE_PREFIX.length) : reference;

const authHeader = (): Record<string, string> => {
  const token = authTokenStore.get();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const workspaceApi = {
  /** POST /api/v1/workspace-files (multipart). groupId is optional in the contract. */
  upload: async (file: File, groupId?: string): Promise<WorkspaceFileDto> => {
    const form = new FormData();
    form.append('file', file);
    const qs = groupId ? `?groupId=${encodeURIComponent(groupId)}` : '';
    const res = await fetch(serviceUrl('tools', `/api/v1/workspace-files${qs}`), {
      method: 'POST',
      headers: authHeader(),
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.message || body?.title || body?.detail || `Upload failed (${res.status})`);
    }
    return res.json();
  },

  downloadUrl: (reference: string) =>
    serviceUrl('tools', `/api/v1/workspace-files/${encodeURIComponent(idOf(reference))}`),

  /** GET /api/v1/workspace-files/{id} with the bearer token, then hands the blob to the browser. */
  download: async (reference: string, fallbackName?: string): Promise<void> => {
    const res = await fetch(workspaceApi.downloadUrl(reference), { headers: authHeader() });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        body?.message || body?.title || body?.detail ||
          (res.status === 404 ? 'File not found or expired.' : `Download failed (${res.status})`),
      );
    }
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
    const name = m ? decodeURIComponent(m[1]) : fallbackName || idOf(reference);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  },
};
