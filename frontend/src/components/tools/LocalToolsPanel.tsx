
import React, { useEffect, useState } from 'react';
import { Ban, CheckCircle2, Code2, Eye, Pencil, Plus, RefreshCw, Search, Send, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';
import { PERMISSIONS } from '../../config/permissions';
import { localToolsApi } from '../../api/localToolsApi';
import { useLocalToolList, type LocalView, type LocalToolRow } from '../../api/useToolsRegistry';
import { LOCAL_TOOL_STATUSES, type LocalToolDetailDto, type LocalToolExecutionDetailsDto } from '../../types/tools';
import { ToolPlayground, reasonOf } from './ToolPlayground';
import { SchemaPreview, summarizeParams } from './SchemaForm';
import {
  BTN, BTN_DANGER, BTN_OK, BTN_PRI, BTN_SM, CARD, Chip, ConfirmDialog, DataTable, Drawer, EmptyState, ErrorBanner, GroupChips,
  IconButton, INPUT, JsonBlock, Modal, Pagination, RowActions, SegmentedTabs, Spinner, StatusBadge, errText, fmtDate,
} from './ToolsUi';

/** Statuses a tool can be edited and sent back to the approval queue from. */
const isResubmittable = (status?: string | null) => status === 'Revoked' || status === 'Rejected';

/* ------------------------------------------------------------ detail drawer */

const ToolDrawer: React.FC<{
  id: string | null;
  refreshKey: number;
  onClose: () => void;
  canManage: boolean;
  busy: boolean;
  onEdit: (id: string) => void;
  onReview: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string, name: string) => void;
  onRevoke: (id: string, name: string) => void;
  onDelete: (id: string, name: string) => void;
}> = ({ id, refreshKey, onClose, canManage, busy, onEdit, onReview, onApprove, onReject, onRevoke, onDelete }) => {
  const [d, setD] = useState<LocalToolDetailDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exec, setExec] = useState<LocalToolExecutionDetailsDto | null>(null);
  const [execLoading, setExecLoading] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setExec(null);
    setExecError(null);
    localToolsApi
      .get(id)
      .then((r) => alive && setD(r))
      .catch((e) => alive && setError(errText(e, 'Could not load this tool.')))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id, refreshKey]);

  const loadExec = async () => {
    if (!id) return;
    setExecLoading(true);
    setExecError(null);
    try {
      setExec(await localToolsApi.executionDetails(id));
    } catch (e) {
      setExecError(errText(e, 'Could not load runtime details.'));
    } finally {
      setExecLoading(false);
    }
  };

  const name = d?.name ?? '';
  const params = summarizeParams(d?.parametersSchemaJson);
  const findings = (json?: string | null): string[] => {
    try {
      const v = json ? JSON.parse(json) : [];
      return Array.isArray(v) ? v.map(String) : [];
    } catch {
      return json ? [json] : [];
    }
  };
  const resubmit = isResubmittable(d?.status);
  const reason = reasonOf(d);
  const verb = d?.status === 'Revoked' ? 'revoked' : 'rejected';

  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      title={d?.name || 'Local tool'}
      subtitle={d ? <StatusBadge status={d.status} /> : undefined}
      footer={
        d && canManage ? (
          <>
            {d.status === 'PendingApproval' && (
              <>
                <button className={BTN_PRI} disabled={busy} onClick={() => onReview(d.id)}>
                  <ShieldCheck className="h-3.5 w-3.5" /> Review & verify
                </button>
                <button className={BTN_OK} disabled={busy} onClick={() => onApprove(d.id)}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Quick approve
                </button>
                <button className={BTN_DANGER} disabled={busy} onClick={() => onReject(d.id, name)}>
                  <XCircle className="h-3.5 w-3.5" /> Reject
                </button>
              </>
            )}
            {d.status === 'Approved' && (
              <button className={BTN} disabled={busy} onClick={() => onRevoke(d.id, name)}>
                <Ban className="h-3.5 w-3.5" /> Revoke
              </button>
            )}
            <button className={BTN} onClick={() => onDelete(d.id, name)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
            {resubmit ? (
              <button className={BTN_OK} onClick={() => onEdit(d.id)}>
                <Send className="h-3.5 w-3.5" /> Edit & re-submit
              </button>
            ) : (
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
          {resubmit && (
            <div className="space-y-2">
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
                <div className="text-[11px] font-bold uppercase tracking-wide text-rose-300">
                  {d.status === 'Revoked' ? 'Revoked' : 'Rejected'}
                  {d.reviewedBy ? ` by ${d.reviewedBy}` : ''}
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-rose-100">
                  {reason ?? <span className="italic text-rose-300/80">No reason was recorded by the API.</span>}
                </p>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                This tool was {verb} and cannot be used by agents. Use <b>Edit & re-submit</b> to fix it, re-run the evaluation and send it back
                to the approval queue.
              </div>
            </div>
          )}
          <div className="divide-y divide-slate-700/50 rounded-xl border border-slate-700/60 bg-slate-950/60">
            {[
              ['Submitted by', d.submittedBy || '—'],
              ['Reviewed by', d.reviewedBy || '—'],
              ['Created', fmtDate(d.createdAt)],
              ['Origin', d.llmGenerationFlag ? 'AI-generated draft' : 'Hand-written'],
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
            <h4 className="mb-2 text-xs font-bold text-white">Audit results</h4>
            {(d.auditResults ?? []).length === 0 && <p className="text-[11px] italic text-slate-500">No audit recorded.</p>}
            <div className="space-y-2">
              {(d.auditResults ?? []).map((a, i) => (
                <div key={i} className="space-y-2 rounded-xl border border-slate-700/60 bg-slate-950/60 p-3">
                  <div className="flex flex-wrap gap-2">
                    <Chip tone={a.staticCheckPassed ? 'good' : 'bad'}>static: {a.staticCheckPassed ? 'pass' : 'fail'}</Chip>
                    <Chip tone={a.llmAuditPassed ? 'good' : 'bad'}>LLM audit: {a.llmAuditPassed ? 'pass' : 'fail'}</Chip>
                  </div>
                  {findings(a.staticCheckNotesJson).length > 0 && (
                    <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-amber-300">
                      {findings(a.staticCheckNotesJson).map((f, j) => (
                        <li key={j}>{f}</li>
                      ))}
                    </ul>
                  )}
                  {a.llmAuditNotes && <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-[11px] text-slate-300">{a.llmAuditNotes}</pre>}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-bold text-white">Python code</h4>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-700 bg-[#070c17] p-3 font-mono text-[11px] text-emerald-300">
              {d.pythonCode || '—'}
            </pre>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-bold text-white">Parameters</h4>
            {params.length === 0 ? (
              <p className="text-[11px] italic text-slate-500">No parameters schema defined.</p>
            ) : (
              <>
                <div className="mb-2 flex flex-wrap gap-1">
                  {params.map((p) => (
                    <Chip key={p.name} tone={p.required ? 'warn' : 'default'}>
                      {p.name}
                      {p.required ? '*' : ''}: {p.type}
                    </Chip>
                  ))}
                </div>
                <details>
                  <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-300">Form preview</summary>
                  <div className="mt-2 rounded-xl border border-slate-700/60 bg-slate-950/60 p-3">
                    <SchemaPreview schemaJson={d.parametersSchemaJson} />
                  </div>
                </details>
                <details className="mt-1">
                  <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-300">Raw schema</summary>
                  <div className="mt-2">
                    <JsonBlock value={d.parametersSchemaJson} maxHeight={200} />
                  </div>
                </details>
              </>
            )}
          </div>

          {canManage && (
            <div>
              <h4 className="mb-1 text-xs font-bold text-white">Runtime view</h4>
              <p className="mb-2 text-[11px] text-slate-500">What the execution service receives (Approved tools only).</p>
              <button className={BTN} disabled={execLoading} onClick={() => void loadExec()}>
                {execLoading ? 'Loading…' : 'Load execution details'}
              </button>
              {execError && (
                <div className="mt-2">
                  <ErrorBanner message={execError} />
                </div>
              )}
              {exec && (
                <div className="mt-2">
                  <JsonBlock value={exec} maxHeight={240} />
                </div>
              )}
            </div>
          )}
        </>
      ) : null}
    </Drawer>
  );
};

/* ------------------------------------------------------------------ panel */

export const LocalToolsPanel: React.FC = () => {
  const { hasPermission, showNotification } = usePlatform();
  const P = PERMISSIONS.LocalTools;
  const canList = hasPermission(P.View);
  const canCreate = hasPermission(P.Create);
  const canManage = hasPermission(P.Manage);

  const [view, setView] = useState<LocalView>('all');
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

  const { rows, totalCount, pendingCount, revokedCount, loading, error, reload } = useLocalToolList({
    view, status, search, page, pageSize, enabled: canList, canManage,
  });

  const [playground, setPlayground] = useState<{ mode: 'create' | 'edit' | 'review'; id?: string } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailKey, setDetailKey] = useState(0);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [reasonFor, setReasonFor] = useState<{ kind: 'reject' | 'revoke'; id: string; name: string } | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const refreshAll = async () => {
    await reload();
    setDetailKey((k) => k + 1);
  };

  const openPlayground = (mode: 'create' | 'edit' | 'review', id?: string) => {
    setDetailId(null);
    setPlayground({ mode, id });
  };
  const askReason = (kind: 'reject' | 'revoke', id: string, name: string) => {
    setReason('');
    setReasonError(null);
    setReasonFor({ kind, id, name });
  };
  const askDelete = (id: string, name: string) => {
    setDeleteError(null);
    setDeleting({ id, name });
  };

  const approve = async (id: string) => {
    setActing(true);
    setActionError(null);
    try {
      const r = await localToolsApi.approve(id);
      showNotification(`Approved ${r.name}.`);
      await refreshAll();
    } catch (e) {
      setActionError(errText(e, 'Approve failed.'));
      throw e;
    } finally {
      setActing(false);
    }
  };

  const submitReason = async () => {
    if (!reasonFor) return;
    if (!reason.trim()) return setReasonError('A reason is required.');
    if (reason.length > 1024) return setReasonError('Reason must be 1024 characters or fewer.');
    setActing(true);
    setReasonError(null);
    try {
      const fn = reasonFor.kind === 'reject' ? localToolsApi.reject : localToolsApi.revoke;
      await fn(reasonFor.id, { reason: reason.trim() });
      showNotification(`${reasonFor.kind === 'reject' ? 'Rejected' : 'Revoked'} ${reasonFor.name}.`);
      setReasonFor(null);
      setReason('');
      await refreshAll();
    } catch (e) {
      setReasonError(errText(e, 'Action failed.'));
    } finally {
      setActing(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy('Deleting…');
    setDeleteError(null);
    try {
      await localToolsApi.remove(deleting.id);
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

  if (!canList)
    return <EmptyState title="No access" hint="You do not have permission to view local tools." />;

  const tabs = [
    { id: 'all' as LocalView, label: 'All tools', hint: 'Everything you can manage' },
    ...(canManage ? [{ id: 'pending' as LocalView, label: 'Pending review', hint: 'Awaiting approval', badge: pendingCount }] : []),
    { id: 'approved' as LocalView, label: 'Approved', hint: 'Management scope' },
    { id: 'revoked' as LocalView, label: 'Revoked', hint: 'Withdrawn tools — edit and re-submit', badge: revokedCount },
    { id: 'use' as LocalView, label: 'For agents', hint: 'What the agent builder can attach' },
  ];

  const emptyTitle =
    view === 'pending' ? 'Nothing is waiting for review' : view === 'revoked' ? 'No revoked tools' : 'No local tools match';
  const emptyHint =
    view === 'pending'
      ? 'New submissions will show up here.'
      : view === 'revoked'
        ? 'Tools that are revoked appear here so they can be fixed and re-submitted.'
        : 'Try another filter, or create a tool.';

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-center">
        <SegmentedTabs
          items={tabs}
          value={view}
          onChange={(v) => {
            setView(v);
            setPage(1);
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input className={`${INPUT} w-56 pl-8`} placeholder="Search tools…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </div>
          {view === 'all' && (
            <select
              className={`${INPUT} w-44`}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {LOCAL_TOOL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === 'PendingApproval' ? 'Pending approval' : s}
                </option>
              ))}
            </select>
          )}
          <button className={BTN} disabled={loading} onClick={() => void reload()}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          {canCreate && (
            <button className={BTN_PRI} onClick={() => openPlayground('create')}>
              <Plus className="h-3.5 w-3.5" /> Create tool
            </button>
          )}
        </div>
      </div>

      <ErrorBanner message={error} onRetry={() => void reload()} />
      <ErrorBanner message={actionError} />

      <div className={`${CARD} overflow-hidden`}>
        {loading && rows.length === 0 ? (
          <Spinner label="Loading local tools…" />
        ) : (
          <DataTable<LocalToolRow>
            rows={rows}
            keyOf={(r) => r.id}
            onRowClick={(r) => setDetailId(r.id)}
            empty={<EmptyState title={emptyTitle} hint={emptyHint} />}
            columns={[
              {
                head: 'Tool',
                cell: (r) => {
                  const params = summarizeParams(r.parametersSchemaJson);
                  return (
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-2 text-indigo-300">
                        <Code2 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-white">{r.name || r.id}</div>
                        {r.description && <div className="max-w-md truncate text-[11px] text-slate-500">{r.description}</div>}
                        {params.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {params.slice(0, 5).map((p) => (
                              <Chip key={p.name}>
                                {p.name}
                                {p.required ? '*' : ''}
                              </Chip>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                },
              },
              { head: 'Status', className: 'w-40', cell: (r) => <StatusBadge status={r.status} /> },
              { head: 'Submitted by', hide: 'md', cell: (r) => <span className="text-xs text-slate-300">{r.submittedBy || '—'}</span> },
              { head: 'Groups', hide: 'lg', cell: (r) => (r.groupIds ? <GroupChips ids={r.groupIds} /> : <span className="text-slate-600">—</span>) },
              { head: 'Created', hide: 'lg', cell: (r) => <span className="text-[11px] text-slate-500">{r.createdAt ? fmtDate(r.createdAt) : '—'}</span> },
              {
                head: '',
                className: 'w-72',
                cell: (r) => (
                  <RowActions>
                    {canManage && view !== 'use' && r.status === 'PendingApproval' && (
                      <button className={`${BTN_PRI} ${BTN_SM}`} disabled={acting} onClick={() => openPlayground('review', r.id)}>
                        <ShieldCheck className="h-3.5 w-3.5" /> Review
                      </button>
                    )}
                    {canManage && view !== 'use' && isResubmittable(r.status) && (
                      <button className={`${BTN_OK} ${BTN_SM}`} disabled={acting} onClick={() => openPlayground('edit', r.id)}>
                        <Send className="h-3.5 w-3.5" /> Re-submit
                      </button>
                    )}
                    <IconButton title="View details" onClick={() => setDetailId(r.id)}>
                      <Eye className="h-3.5 w-3.5" />
                    </IconButton>
                    {canManage && view !== 'use' && (
                      <>
                        {r.status === 'Approved' && (
                          <IconButton title="Revoke…" disabled={acting} onClick={() => askReason('revoke', r.id, r.name || r.id)}>
                            <Ban className="h-3.5 w-3.5 text-amber-400" />
                          </IconButton>
                        )}
                        <IconButton title="Edit tool" onClick={() => openPlayground('edit', r.id)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton title="Delete tool" tone="danger" onClick={() => askDelete(r.id, r.name || r.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconButton>
                      </>
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

      <ToolDrawer
        id={detailId}
        refreshKey={detailKey}
        onClose={() => setDetailId(null)}
        canManage={canManage}
        busy={acting}
        onEdit={(id) => openPlayground('edit', id)}
        onReview={(id) => openPlayground('review', id)}
        onApprove={(id) => void approve(id).catch(() => undefined)}
        onReject={(id, name) => askReason('reject', id, name)}
        onRevoke={(id, name) => askReason('revoke', id, name)}
        onDelete={askDelete}
      />

      <ToolPlayground
        open={!!playground}
        mode={playground?.mode ?? 'create'}
        toolId={playground?.id}
        onClose={() => setPlayground(null)}
        onSaved={(saved, mode) => {
          setPlayground(null);
          showNotification(mode === 'create' ? `Submitted ${saved.name} for approval.` : `Saved ${saved.name} — status: ${saved.status}.`);
          void refreshAll();
        }}
        onApprove={async (id) => {
          await approve(id);
        }}
        onReject={(id, name) => askReason('reject', id, name)}
        onRevoke={(id, name) => askReason('revoke', id, name)}
      />

      <Modal
        open={!!reasonFor}
        onClose={() => !acting && setReasonFor(null)}
        size="sm"
        title={`${reasonFor?.kind === 'reject' ? 'Reject' : 'Revoke'} “${reasonFor?.name ?? ''}”`}
        subtitle={reasonFor?.kind === 'reject' ? 'The submitter will see this reason.' : 'The tool stops being usable by agents immediately.'}
        footer={
          <>
            <button className={BTN} disabled={acting} onClick={() => setReasonFor(null)}>
              Cancel
            </button>
            <button className={BTN_DANGER} disabled={acting} onClick={() => void submitReason()}>
              {acting ? 'Working…' : reasonFor?.kind === 'reject' ? 'Reject tool' : 'Revoke tool'}
            </button>
          </>
        }
      >
        <ErrorBanner message={reasonError} />
        <label className="mb-1.5 mt-2 block text-xs font-semibold text-slate-300">Reason (required)</label>
        <textarea rows={4} className={INPUT} maxLength={1024} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        title="Delete this local tool?"
        busy={deleteBusy}
        message={
          <>
            <b className="text-white">{deleting?.name}</b> will be soft-deleted; its audit and status history are kept for compliance.
            {deleteError && <div className="mt-2 text-rose-300">{deleteError}</div>}
          </>
        }
      />
    </div>
  );
};
