
import React, { useEffect, useMemo, useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { remoteToolsApi } from '../../api/remoteToolsApi';
import {
  AUTH_OPTIONS,
  SERVER_STATUSES,
  TRANSPORT_TYPES,
  type RemoteMcpServerDto,
} from '../../types/tools';
import { BTN, BTN_PRI, ErrorBanner, Field, GroupPicker, INPUT, Modal, Spinner, errText } from './ToolsUi';

interface Form {
  name: string;
  description: string;
  url: string;
  transport: string;
  auth: string;
  apiKey: string;
  status: string;
  groupIds: string[];
}

const EMPTY: Form = {
  name: '',
  description: '',
  url: '',
  transport: 'StreamableHttp',
  auth: 'None',
  apiKey: '',
  status: 'Draft',
  groupIds: [],
};

export const RemoteServerFormModal: React.FC<{
  open: boolean;
  mode: 'create' | 'edit';
  serverId?: string;
  onClose: () => void;
  onSaved: (saved: RemoteMcpServerDto, mode: 'create' | 'edit') => void;
}> = ({ open, mode, serverId, onClose, onSaved }) => {
  const { groups } = usePlatform();
  const activeGroups = useMemo(() => groups.filter((g) => g.isActive), [groups]);

  const [f, setF] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolCount, setToolCount] = useState(0);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setError(null);
    if (mode === 'edit' && serverId) {
      setLoading(true);
      remoteToolsApi
        .get(serverId)
        .then((d) => {
          if (!alive) return;
          setF({
            name: d.name ?? '',
            description: d.description ?? '',
            url: d.remoteMcpServerUrl ?? '',
            transport: d.transportType ?? 'StreamableHttp',
            auth: d.authOption ?? 'None',
            apiKey: '',
            status: d.status ?? 'Draft',
            groupIds: d.groupIds ?? [],
          });
          setToolCount(d.tools?.length ?? 0);
        })
        .catch((e) => alive && setError(errText(e, 'Could not load this server.')))
        .finally(() => alive && setLoading(false));
    } else {
      setF({ ...EMPTY, groupIds: activeGroups.length === 1 ? [activeGroups[0].id] : [] });
      setToolCount(0);
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, serverId]);

  const validate = (): string | null => {
    if (!f.name.trim()) return 'Name is required.';
    if (f.name.trim().length > 128) return 'Name must be 128 characters or fewer.';
    try {
      const u = new URL(f.url.trim());
      if (!['http:', 'https:', 'ws:', 'wss:'].includes(u.protocol)) return 'URL must start with http(s):// or ws(s)://.';
    } catch {
      return 'Enter a valid absolute MCP server URL.';
    }
    if (f.auth === 'ApiKey' && mode === 'create' && !f.apiKey.trim()) return 'An API key is required when authentication is ApiKey.';
    if (f.groupIds.length === 0) return 'Select at least one group.';
    return null;
  };

  const save = async () => {
    const problem = validate();
    if (problem) return setError(problem);
    setSaving(true);
    setError(null);
    try {
      const base = {
        name: f.name.trim(),
        description: f.description.trim() || null,
        remoteMcpServerUrl: f.url.trim(),
        transportType: f.transport,
        authOption: f.auth,
        apiKey: f.auth === 'ApiKey' && f.apiKey.trim() ? f.apiKey.trim() : null,
        groupIds: f.groupIds,
      };
      const saved =
        mode === 'edit' && serverId
          ? await remoteToolsApi.update(serverId, { ...base, status: f.status })
          : await remoteToolsApi.create(base);
      onSaved(saved, mode);
    } catch (e) {
      setError(errText(e, 'Save failed.'));
    } finally {
      setSaving(false);
    }
  };

  const busy = loading || saving;

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      size="lg"
      title={mode === 'edit' ? `Edit remote MCP server${f.name ? ` — ${f.name}` : ''}` : 'Register remote MCP server'}
      subtitle={
        mode === 'create'
          ? 'Tools are discovered from the server on save. If discovery fails the server is stored as Draft — fix the URL, then use Test / Sync.'
          : `Editing does not re-discover tools (${toolCount} cached). Use Sync after changing the URL or credentials.`
      }
      footer={
        <>
          <button className={BTN} disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button className={BTN_PRI} disabled={busy} onClick={save}>
            {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Register'}
          </button>
        </>
      }
    >
      {loading ? (
        <Spinner label="Loading server…" />
      ) : (
        <div className="space-y-3">
          <ErrorBanner message={error} />

          {/* Two columns like the RAG strategy form: WHAT the server is on the
              left, HOW to reach it and WHO owns it on the right. One column
              below lg. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-x-8">
            <div>
              <Field label="Name">
                <input className={INPUT} value={f.name} maxLength={128} disabled={busy} onChange={(e) => set('name', e.target.value)} />
              </Field>

              <Field label="MCP server URL" hint="Base URL. The client appends /tools/list and /tools/call.">
                <input
                  className={`${INPUT} font-mono`}
                  placeholder="https://mcp.internal.example.com"
                  value={f.url}
                  disabled={busy}
                  onChange={(e) => set('url', e.target.value)}
                />
              </Field>

              <Field label="Description">
                <textarea rows={5} className={INPUT} value={f.description} disabled={busy} onChange={(e) => set('description', e.target.value)} />
              </Field>

              {mode === 'edit' && (
                <Field label="Status" hint="Only Active servers appear in the agent-builder feed.">
                  <select className={INPUT} value={f.status} disabled={busy} onChange={(e) => set('status', e.target.value)}>
                    {SERVER_STATUSES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </Field>
              )}
            </div>

            <div>
              <Field
                label="Transport"
                note={
                  f.transport !== 'StreamableHttp' ? (
                    <span className="text-[11px] text-amber-300">
                      Discovery, test and invoke are only implemented for StreamableHttp — this server will stay Draft.
                    </span>
                  ) : undefined
                }
              >
                <select className={INPUT} value={f.transport} disabled={busy} onChange={(e) => set('transport', e.target.value)}>
                  {TRANSPORT_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>

              <Field label="Authentication">
                <select
                  className={INPUT}
                  value={f.auth}
                  disabled={busy}
                  onChange={(e) => {
                    set('auth', e.target.value);
                    if (e.target.value !== 'ApiKey') set('apiKey', '');
                  }}
                >
                  {AUTH_OPTIONS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>

              {f.auth === 'ApiKey' && (
                <Field
                  label="API key"
                  note={
                    mode === 'edit' ? (
                      <span className="text-[11px] text-slate-500">Stored keys are never returned. Leave blank to keep the current key.</span>
                    ) : undefined
                  }
                >
                  <input
                    type="password"
                    autoComplete="off"
                    className={`${INPUT} font-mono`}
                    value={f.apiKey}
                    disabled={busy}
                    onChange={(e) => set('apiKey', e.target.value)}
                  />
                </Field>
              )}

              <Field label="Groups" hint="Who can see and manage this server. You can only assign groups you belong to.">
                <GroupPicker groups={activeGroups} value={f.groupIds} disabled={busy} onChange={(v) => set('groupIds', v)} />
              </Field>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
