
import { useCallback, useEffect, useRef, useState } from 'react';
import { remoteToolsApi } from './remoteToolsApi';
import { localToolsApi } from './localToolsApi';
import type { RemoteMcpServerListItemDto } from '../types/tools';

export type RemoteView = 'all' | 'active' | 'use';
export type LocalView = 'all' | 'pending' | 'approved' | 'revoked' | 'use';

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const slicePage = <T,>(arr: T[], page: number, size: number) => arr.slice((page - 1) * size, page * size);

// ------------------------------------------------------------------ Remote

export function useRemoteToolList(p: {
  view: RemoteView;
  status?: string;
  search?: string;
  page: number;
  pageSize: number;
  enabled: boolean;
}) {
  const { view, status, search, page, pageSize, enabled } = p;
  const [items, setItems] = useState<RemoteMcpServerListItemDto[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!enabled) return;
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      let rows: RemoteMcpServerListItemDto[];
      let total: number;
      if (view === 'all') {
        const r = await remoteToolsApi.list({
          status: status || undefined,
          search: search || undefined,
          page,
          pageSize,
        });
        rows = r.items ?? [];
        total = r.totalCount ?? rows.length;
      } else {
        const all = view === 'active' ? await remoteToolsApi.active() : await remoteToolsApi.activeForUse();
        const q = (search || '').trim().toLowerCase();
        const filtered = (all ?? []).filter((x) => !q || (x.name ?? '').toLowerCase().includes(q));
        total = filtered.length;
        rows = slicePage(filtered, page, pageSize);
      }
      if (id !== seq.current) return;
      setItems(rows);
      setTotalCount(total);
    } catch (e) {
      if (id === seq.current) setError(errMsg(e, 'Failed to load remote MCP servers.'));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [enabled, view, status, search, page, pageSize]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { items, totalCount, loading, error, reload };
}

// ------------------------------------------------------------------- Local

/** One shape for every local-tool view (list, pending, approved, revoked, approved-for-use). */
export interface LocalToolRow {
  id: string;
  name: string | null;
  status: string | null;
  submittedBy: string | null;
  llmGenerationFlag?: boolean;
  groupIds: string[] | null;
  createdAt?: string;
  description?: string | null;
  parametersSchemaJson?: string | null;
}

/**
 * Fetches the FULL local-tool list once (a single network call), then every
 * tab (all/pending/approved/revoked/for-agents), the status dropdown, and the
 * search box all filter that one in-memory array, so switching tabs is instant.
 *
 * `reload()` re-fetches from the server; it is called after mutations
 * (approve/reject/revoke/delete/save) and by the manual Refresh button.
 */
export function useLocalToolList(p: {
  view: LocalView;
  status?: string;
  search?: string;
  page: number;
  pageSize: number;
  enabled: boolean;
  canManage: boolean;
}) {
  const { view, status, search, page, pageSize, enabled } = p;
  const [all, setAll] = useState<LocalToolRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!enabled) return;
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const r = await localToolsApi.list({ page: 1, pageSize: 500 });
      if (id !== seq.current) return;
      setAll((r.items ?? []) as LocalToolRow[]);
    } catch (e) {
      if (id === seq.current) setError(errMsg(e, 'Failed to load local tools.'));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const pendingCount = all.filter((t) => t.status === 'PendingApproval').length;
  const revokedCount = all.filter((t) => t.status === 'Revoked').length;

  let base = all;
  if (view === 'pending') base = all.filter((t) => t.status === 'PendingApproval');
  else if (view === 'approved' || view === 'use') base = all.filter((t) => t.status === 'Approved');
  else if (view === 'revoked') base = all.filter((t) => t.status === 'Revoked');
  else if (status) base = all.filter((t) => t.status === status);

  const q = (search || '').trim().toLowerCase();
  const filtered = q
    ? base.filter(
        (t) => (t.name ?? '').toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q),
      )
    : base;

  const rows = slicePage(filtered, page, pageSize);
  const totalCount = filtered.length;

  return { rows, totalCount, pendingCount, revokedCount, loading, error, reload };
}
