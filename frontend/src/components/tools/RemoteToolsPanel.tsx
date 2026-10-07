
import React, { useEffect, useState } from 'react';
import { Activity, Eye, Pencil, Play, Plus, RefreshCw, Search, Server, Trash2 } from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';
import { PERMISSIONS } from '../../config/permissions';
import { remoteToolsApi } from '../../api/remoteToolsApi';
import { useRemoteToolList, type RemoteView } from '../../api/useToolsRegistry';
import {
  SERVER_STATUSES,
  type RemoteMcpServerDto,
  type SyncResultDto,
  type TestRemoteMcpServerResult,
} from '../../types/tools';
import { InvokeToolModal } from './InvokeToolModal';
import { RemoteServerFormModal } from './RemoteServerFormModal';
import { parseSchema, summarizeParams } from './SchemaForm';
import {
  BTN, BTN_PRI, CARD, Chip, ConfirmDialog, DataTable, Drawer, EmptyState, ErrorBanner, GroupChips, IconButton, INPUT,
  JsonBlock, Modal, Pagination, RowActions, SegmentedTabs, Spinner, StatusBadge, errText, fmtDate,
} from './ToolsUi';

const CLASSIFICATIONS = ['Initial', 'NonBreaking', 'Breaking', 'Removed'];
const classificationName = (c: unknown) =>
  typeof c === 'number' ? CLASSIFICATIONS[c] ?? String(c) : String(c);

/* ------------------------------------------------------------ detail drawer */

const ServerDrawer: React.FC<{
  id: string | null;
  refreshKey: number;
  onClose: () => void;
  canEdit: boolean;
  canTest: boolean;
  canSync: boolean;
  canInvoke: boolean;
  onEdit: (id: string) => void;
  onTest: (id: string, name: string) => void;
  onSync: (id: string, name: string) => void;
  onInvoke: (id: string, name: string, tool: string) => void;
}> = ({ id, refreshKey, onClose, canEdit, canTest, canSync, canInvoke, onEdit, onTest, onSync, onInvoke }) => {
  const [d, setD] = useState<RemoteMcpServerDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    setError(null);
    remoteToolsApi
      .get(id)
      .then((r) => alive && setD(r))
      .catch((e) => alive && setError(errText(e, 'Could not load this server.')))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id, refreshKey]);

  const name = d?.name ?? '';
  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      title={d?.name || 'Remote MCP server'}
      subtitle={d ? <StatusBadge status={d.status} /> : undefined}
      footer={
        d ? (
          <>
            {canTest && (
              <button className={BTN} onClick={() => onTest(d.id, name)}>
                <Activity className="h-3.5 w-3.5" /> Test
              </button>
            )}
            {canSync && (
              <button className={BTN} onClick={() => onSync(d.id, name)}>
                <RefreshCw className="h-3.5 w-3.5" /> Sync
              </button>
            )}
            {canEdit && (
              <button className={BTN_PRI} onClick={() => onEdit(d.id)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            )}
          </>
        ) : undefined
      }
    >
      {loading && !d ? (
        <Spinner label="Loading…" />
      ) : error ? (
        <ErrorBanner message={error} />
      ) : d ? (
        <>
          <div className="divide-y divide-slate-700/50 rounded-xl border border-slate-700/60 bg-slate-950/60">
            {[
              ['URL', <span className="break-all font-mono">{d.remoteMcpServerUrl}</span>],
              ['Transport', d.transportType],
              ['Authentication', d.authOption],
              ['Created', fmtDate(d.createdAt)],
              ['Groups', <GroupChips ids={d.groupIds} />],
            ].map(([k, v], i) => (
              <div key={i} className="flex items-start justify-between gap-4 px-3.5 py-2.5">
                <span className="shrink-0 text-[11px] text-slate-400">{k as string}</span>
                <span className="min-w-0 text-right text-xs text-slate-200">{v as React.ReactNode}</span>
              </div>
            ))}
          </div>
          {d.description && <p className="text-xs leading-relaxed text-slate-400">{d.description}</p>}

          <div>
            <h4 className="mb-2 text-xs font-bold text-white">Tools ({d.tools?.length ?? 0})</h4>
            {(d.tools ?? []).length === 0 && (
              <p className="text-[11px] italic text-slate-500">
                No tools cached. Run <b>Test</b> to check connectivity, then <b>Sync</b> to import them.
              </p>
            )}
            <div className="space-y-2">
              {(d.tools ?? []).map((t) => {
                const params = summarizeParams(t.inputSchemaJson);
                return (
                  <div key={t.id} className="space-y-2 rounded-xl border border-slate-700/60 bg-slate-950/60 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="break-all font-mono text-xs font-semibold text-indigo-300">{t.name}</div>
                        {t.description && <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{t.description}</p>}
                      </div>
                      {canInvoke && t.name && (
                        <button className={BTN_PRI} onClick={() => onInvoke(d.id, name, t.name!)}>
                          <Play className="h-3.5 w-3.5" /> Invoke
                        </button>
                      )}
                    </div>
                    {params.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {params.map((p) => (
                          <Chip key={p.name} tone={p.required ? 'warn' : 'default'}>
                            {p.name}
                            {p.required ? '*' : ''}: {p.type}
                          </Chip>
                        ))}
                      </div>
                    )}
                    <details>
                      <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-300">Cached input schema</summary>
                      <div className="mt-2">
                        <JsonBlock value={parseSchema(t.inputSchemaJson).schema ?? t.inputSchemaJson} maxHeight={200} />
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : null}
    </Drawer>
  );
};

/* ------------------------------------------------------------------ panel */

export const RemoteToolsPanel: React.FC = () => {
  const { hasPermission, showNotification } = usePlatform();
  const P = PERMISSIONS.RemoteTools;
  const canList = hasPermission(P.View);
  const canAdd = hasPermission(P.Add);
  const canEdit = hasPermission(P.Edit);
  const canDelete = hasPermission(P.Delete);
  const canTest = hasPermission(P.Test);
  const canSync = hasPermission(P.Sync);
  const canInvoke = hasPermission(P.Invoke);

  const [view, setView] = useState<RemoteView>('all');
  const [status, setStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const { items, totalCount, loading, error, reload } = useRemoteToolList({
    view, status, search, page, pageSize, enabled: canList,
  });

  const [form, setForm] = useState<{ mode: 'create' | 'edit'; id?: string } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailKey, setDetailKey] = useState(0);
  // returnTo = the server drawer to bring back when the invocation workspace closes.
  const [invoke, setInvoke] = useState<{
    serverId: string;
    serverName: string;
    toolName: string;
    returnTo: string | null;
  } | null>(null);

  const [testing, setTesting] = useState<string | null>(null);
  const [testOut, setTestOut] = useState<{ name: string; result?: TestRemoteMcpServerResult; error?: string } | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncOut, setSyncOut] = useState<{ name: string; result?: SyncResultDto; error?: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const runTest = async (id: string, name: string) => {
    setTesting(id);
    try {
      setTestOut({ name, result: await remoteToolsApi.test(id) });
    } catch (e) {
      setTestOut({ name, error: errText(e, 'Test failed.') });
    } finally {
      setTesting(null);
    }
  };

  const runSync = async (id: string, name: string) => {
    setSyncing(id);
    try {
      const result = await remoteToolsApi.sync(id);
      setSyncOut({ name, result });
      await reload();
      setDetailKey((k) => k + 1);
    } catch (e) {
      setSyncOut({ name, error: errText(e, 'Sync failed.') });
    } finally {
      setSyncing(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy('Deleting…');
    setDeleteError(null);
    try {
      await remoteToolsApi.remove(deleting.id);
      showNotification(`Deleted ${deleting.name}.`);
      if (detailId === deleting.id) setDetailId(null);
      setDeleting(null);
      await reload();
    } catch (e) {
      setDeleteError(errText(e, 'Delete failed.'));
    } finally {
      setDeleteBusy('');
    }
  };

  const openInvoke = (serverId: string, serverName: string, toolName: string) => {
    // The drawer is closed first so the workspace never sits on top of it.
    setDetailId(null);
    setInvoke({ serverId, serverName, toolName, returnTo: serverId });
  };

  const closeInvoke = () => {
    const back = invoke?.returnTo ?? null;
    setInvoke(null);
    if (back) setDetailId(back);
  };

  if (!canList) return <EmptyState title="No access" hint="You do not have permission to view remote MCP servers." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-center">
        <SegmentedTabs
          items={[
            { id: 'all' as RemoteView, label: 'All servers', hint: 'Everything you can manage' },
            { id: 'active' as RemoteView, label: 'Active', hint: 'Management scope, Active only' },
            { id: 'use' as RemoteView, label: 'For agents', hint: 'What the agent builder can attach' },
          ]}
          value={view}
          onChange={(v) => {
            setView(v);
            setPage(1);
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              className={`${INPUT} w-56 pl-8`}
              placeholder="Search servers…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          {view === 'all' && (
            <select
              className={`${INPUT} w-40`}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {SERVER_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          )}
          <button className={BTN} disabled={loading} onClick={() => void reload()}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          {canAdd && (
            <button className={BTN_PRI} onClick={() => setForm({ mode: 'create' })}>
              <Plus className="h-3.5 w-3.5" /> Register server
            </button>
          )}
        </div>
      </div>

      <ErrorBanner message={error} onRetry={() => void reload()} />

      <div className={`${CARD} overflow-hidden`}>
        {loading && items.length === 0 ? (
          <Spinner label="Loading remote MCP servers…" />
        ) : (
          <DataTable
            rows={items}
            keyOf={(r) => r.id}
            onRowClick={(r) => setDetailId(r.id)}
            empty={<EmptyState title="No remote MCP servers match" hint="Register a server to import its tools." />}
            columns={[
              {
                head: 'Server',
                cell: (r) => (
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-2 text-cyan-300">
                      <Server className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-white">{r.name || r.id}</div>
                      <div className="font-mono text-[10px] text-slate-500">{r.id.slice(0, 8)}</div>
                    </div>
                  </div>
                ),
              },
              { head: 'Status', className: 'w-36', cell: (r) => <StatusBadge status={r.status} /> },
              { head: 'Transport', hide: 'sm', cell: (r) => <span className="text-xs text-slate-300">{r.transportType || '—'}</span> },
              { head: 'Tools', hide: 'sm', className: 'w-20', cell: (r) => <span className="font-mono text-xs text-slate-300">{r.toolCount}</span> },
              { head: 'Groups', hide: 'md', cell: (r) => <GroupChips ids={r.groupIds} /> },
              {
                head: '',
                className: 'w-56',
                cell: (r) => (
                  <RowActions>
                    <IconButton title="View details & tools" onClick={() => setDetailId(r.id)}>
                      <Eye className="h-3.5 w-3.5" />
                    </IconButton>
                    {canEdit && (
                      <IconButton title="Edit server" onClick={() => setForm({ mode: 'edit', id: r.id })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </IconButton>
                    )}
                    {canTest && (
                      <IconButton
                        title="Test connection (not saved)"
                        disabled={testing === r.id}
                        onClick={() => void runTest(r.id, r.name || r.id)}
                      >
                        <Activity className={`h-3.5 w-3.5 ${testing === r.id ? 'animate-pulse text-cyan-300' : ''}`} />
                      </IconButton>
                    )}
                    {canSync && (
                      <IconButton
                        title="Sync tools (diff & save)"
                        disabled={syncing === r.id}
                        onClick={() => void runSync(r.id, r.name || r.id)}
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${syncing === r.id ? 'animate-spin' : ''}`} />
                      </IconButton>
                    )}
                    {canDelete && (
                      <IconButton
                        title="Delete server"
                        tone="danger"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleting({ id: r.id, name: r.name || r.id });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    )}
                  </RowActions>
                ),
              },
            ]}
          />
        )}
        <Pagination
          page={page}
          pageSize={pageSize}
          total={totalCount}
          onPage={setPage}
          onPageSize={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />
      </div>

      <ServerDrawer
        id={detailId}
        refreshKey={detailKey}
        onClose={() => setDetailId(null)}
        canEdit={canEdit}
        canTest={canTest}
        canSync={canSync}
        canInvoke={canInvoke}
        onEdit={(id) => {
          setDetailId(null);
          setForm({ mode: 'edit', id });
        }}
        onTest={(id, name) => void runTest(id, name)}
        onSync={(id, name) => void runSync(id, name)}
        onInvoke={openInvoke}
      />

      <RemoteServerFormModal
        open={!!form}
        mode={form?.mode ?? 'create'}
        serverId={form?.id}
        onClose={() => setForm(null)}
        onSaved={(saved, mode) => {
          setForm(null);
          showNotification(
            mode === 'create'
              ? `Registered ${saved.name} — ${saved.status}, ${saved.tools?.length ?? 0} tool(s) discovered.`
              : `Saved ${saved.name}.`,
          );
          void reload();
          setDetailKey((k) => k + 1);
        }}
      />

      {invoke && (
        <InvokeToolModal
          open
          serverId={invoke.serverId}
          serverName={invoke.serverName}
          toolName={invoke.toolName}
          onClose={closeInvoke}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        title="Delete this remote MCP server?"
        busy={deleteBusy}
        message={
          <>
            <b className="text-white">{deleting?.name}</b> is soft-deleted and disappears from every list and from the agent builder.
            {deleteError && <div className="mt-2 text-rose-300">{deleteError}</div>}
          </>
        }
      />

      {/* TEST RESULT */}
      <Modal
        open={!!testOut}
        onClose={() => setTestOut(null)}
        size="md"
        title={`Test — ${testOut?.name ?? ''}`}
        subtitle="Live discovery against the MCP server. Nothing was saved."
        footer={
          <button className={BTN} onClick={() => setTestOut(null)}>
            Close
          </button>
        }
      >
        {testOut?.error && <ErrorBanner message={testOut.error} />}
        {testOut?.result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Chip tone={testOut.result.success ? 'good' : 'bad'}>{testOut.result.success ? 'reachable' : 'failed'}</Chip>
              <span className="text-xs text-slate-400">{(testOut.result.discoveredTools ?? []).length} tool(s) discovered</span>
            </div>
            {testOut.result.error && <ErrorBanner message={testOut.result.error} />}
            <div className="space-y-1.5">
              {(testOut.result.discoveredTools ?? []).map((t) => (
                <div key={t.id} className="rounded-lg border border-slate-700/60 bg-slate-950/60 p-2.5">
                  <div className="font-mono text-xs text-indigo-300">{t.name}</div>
                  {t.description && <div className="mt-0.5 text-[11px] text-slate-400">{t.description}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* SYNC RESULT */}
      <Modal
        open={!!syncOut}
        onClose={() => setSyncOut(null)}
        size="md"
        title={`Sync — ${syncOut?.name ?? ''}`}
        footer={
          <button className={BTN} onClick={() => setSyncOut(null)}>
            Close
          </button>
        }
      >
        {syncOut?.error && <ErrorBanner message={syncOut.error} />}
        {syncOut?.result && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center gap-2">
              <Chip tone={syncOut.result.status === 'Success' ? 'good' : 'bad'}>{syncOut.result.status}</Chip>
              <span className="text-slate-500">{fmtDate(syncOut.result.lastSyncedAtUtc)}</span>
            </div>
            {syncOut.result.errorMessage && <ErrorBanner message={syncOut.result.errorMessage} />}

            {[
              ['Added', syncOut.result.added, 'good'],
              ['Removed / disabled', syncOut.result.removedOrDisabled, 'bad'],
            ].map(([label, list, tone]) => (
              <div key={label as string}>
                <div className="mb-1 text-[11px] font-bold text-slate-300">
                  {label as string} ({(list as string[] | null)?.length ?? 0})
                </div>
                <div className="flex flex-wrap gap-1">
                  {((list as string[] | null) ?? []).map((n) => (
                    <Chip key={n} tone={tone as 'good' | 'bad'}>
                      {n}
                    </Chip>
                  ))}
                  {!(list as string[] | null)?.length && <span className="text-[11px] italic text-slate-500">none</span>}
                </div>
              </div>
            ))}

            <div>
              <div className="mb-1 text-[11px] font-bold text-slate-300">
                Changed ({syncOut.result.changed?.length ?? 0})
              </div>
              <div className="space-y-1.5">
                {(syncOut.result.changed ?? []).map((c) => (
                  <div key={c.toolId} className="rounded-lg border border-slate-700/60 bg-slate-950/60 p-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-indigo-300">{c.toolName}</span>
                      <Chip>
                        v{c.fromVersion} → v{c.toVersion}
                      </Chip>
                      <Chip tone={classificationName(c.classification) === 'Breaking' ? 'bad' : 'default'}>
                        {classificationName(c.classification)}
                      </Chip>
                    </div>
                    {c.notes && <div className="mt-1 text-[11px] text-slate-400">{c.notes}</div>}
                  </div>
                ))}
                {!(syncOut.result.changed ?? []).length && (
                  <span className="text-[11px] italic text-slate-500">none</span>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
