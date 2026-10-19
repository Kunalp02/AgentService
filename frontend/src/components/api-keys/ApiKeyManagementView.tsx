import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';
import { PERMISSIONS } from '../../config/permissions';
import { agentsApi } from '../../api/agents';
import { localToolsApi } from '../../api/localToolsApi';
import { remoteToolsApi } from '../../api/remoteToolsApi';
import { userGroupEntries, groupName } from '../../api/groupDirectory';
import { configKnowledgeBases } from '../../rag/configBridge';
import type { AgentUi } from '../../types/agent';
import { normalizeAgent } from '../../types/agent';
import type { LocalToolListItemDto, RemoteMcpServerListItemDto } from '../../types/tools';
import type { KbSummary } from '../../rag/ragTypes';
import {
  apiKeysApi,
  ApiKeyApiNotConfiguredError,
  type ApiKeyResourceType,
  type SessionApiKey,
} from '../../api/apiKeys';

interface ResourceOption {
  id: string;
  name: string;
  groupIds: string[];
  kindLabel?: string;
  description?: string;
}

type ResourceType = ApiKeyResourceType;
type ResourceCatalog = Record<ResourceType, ResourceOption[]>;
type VisibleKeyMap = Record<string, boolean>;

const EMPTY_CATALOG: ResourceCatalog = {
  agent: [],
  tool: [],
  'knowledge-base': [],
};

const fieldClass = 'w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2 focus:ring-sky-500/20';
const labelClass = 'mb-1.5 block text-xs font-semibold';

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,;]/).map((v) => v.trim()).filter(Boolean);
  return [];
}

function normalizeGroupId(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Group access is conjunctive: every group granted to a resource must be in
 * the caller's own group set. Extra caller groups are allowed. This client-side
 * filter is for the picker UX; API-key generation and use must also be checked
 * by the backend.
 */
function withinCallerGroups(resourceGroupIds: string[], callerGroupIds: Set<string>): boolean {
  // Existing resources without group assignments are treated as unscoped.
  return resourceGroupIds.every((rawId) => {
    const id = normalizeGroupId(rawId);
    return !!id && callerGroupIds.has(id);
  });
}

function asAgentOption(agent: AgentUi): ResourceOption {
  return {
    id: agent.id,
    name: agent.name || agent.id,
    groupIds: stringList(agent.groupIds),
    kindLabel: 'Agent',
  };
}

function asLocalToolOption(tool: LocalToolListItemDto): ResourceOption {
  return {
    id: tool.id,
    name: tool.name?.trim() || tool.id,
    groupIds: stringList(tool.groupIds),
    kindLabel: 'Local Python tool',
    description: tool.status ? `Status: ${tool.status}` : undefined,
  };
}

function asRemoteToolOption(tool: RemoteMcpServerListItemDto): ResourceOption {
  return {
    id: tool.id,
    name: tool.name?.trim() || tool.id,
    groupIds: stringList(tool.groupIds),
    kindLabel: 'Remote MCP server',
    description: tool.status ? `Status: ${tool.status}` : undefined,
  };
}

function asKnowledgeBaseOption(kb: KbSummary): ResourceOption {
  const id = String(kb.configId ?? kb.id ?? kb.name);
  return {
    id,
    name: kb.label || kb.name || id,
    groupIds: stringList(kb.owner_group_ids),
    kindLabel: 'Knowledge base / RAG',
    description: kb.strategyName ? `Strategy: ${kb.strategyName}` : undefined,
  };
}

function apiResourceName(type: ResourceType): string {
  if (type === 'agent') return 'Agent';
  if (type === 'tool') return 'Tool';
  return 'KnowledgeBase';
}

function resourceTypeLabel(type: string): string {
  if (type === 'agent') return 'Agent';
  if (type === 'tool') return 'Tool';
  if (type === 'knowledge-base' || type === 'knowledgeBase' || type === 'rag') return 'Knowledge base / RAG';
  return type;
}

function dateLabel(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function localId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const ApiKeyManagementView: React.FC = () => {
  const { currentUser, hasPermission, theme, showNotification } = usePlatform();
  const light = theme === 'light';
  const surface = light ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900/45 border-slate-700/80 text-slate-100';
  const fieldTheme = light
    ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-sky-500'
    : 'bg-slate-950/70 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-sky-500';
  const muted = light ? 'text-slate-600' : 'text-slate-400';
  const overlay = 'fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm';
  const dialog = `my-auto w-full max-w-xl rounded-2xl border shadow-2xl ${light ? 'border-slate-200 bg-white text-slate-900 shadow-slate-900/20' : 'border-slate-700 bg-slate-900 text-slate-100 shadow-black/50'}`;

  const [resourceType, setResourceType] = useState<ResourceType>('agent');
  const [resourceId, setResourceId] = useState('');
  const [keyName, setKeyName] = useState('');
  const [note, setNote] = useState('');
  const [catalog, setCatalog] = useState<ResourceCatalog>(EMPTY_CATALOG);
  const [resourcesLoading, setResourcesLoading] = useState(true);
  const [resourceError, setResourceError] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [keys, setKeys] = useState<SessionApiKey[]>([]);
  const [visibleKeys, setVisibleKeys] = useState<VisibleKeyMap>({});
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<SessionApiKey | null>(null);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const callerGroupIds = useMemo(
    () => new Set(userGroupEntries(currentUser?.groups).map((group) => normalizeGroupId(group.id)).filter(Boolean)),
    [currentUser],
  );

  const allowedResourceTypes = useMemo(() => {
    const types: { value: ResourceType; label: string }[] = [];
    if (hasPermission(PERMISSIONS.Agent.View)) types.push({ value: 'agent', label: 'Agent' });
    if (hasPermission(PERMISSIONS.LocalTools.View) || hasPermission(PERMISSIONS.RemoteTools.View)) {
      types.push({ value: 'tool', label: 'Tool' });
    }
    if (hasPermission(PERMISSIONS.KnowledgeBase.View)) {
      types.push({ value: 'knowledge-base', label: 'Knowledge base / RAG' });
    }
    return types;
  }, [hasPermission]);

  const visibleCatalog = useMemo<ResourceCatalog>(() => ({
    agent: catalog.agent.filter((item) => withinCallerGroups(item.groupIds, callerGroupIds)),
    tool: catalog.tool.filter((item) => withinCallerGroups(item.groupIds, callerGroupIds)),
    'knowledge-base': catalog['knowledge-base'].filter((item) => withinCallerGroups(item.groupIds, callerGroupIds)),
  }), [catalog, callerGroupIds]);

  const selectedResources = visibleCatalog[resourceType];
  const selectedResource = selectedResources.find((item) => item.id === resourceId);

  const loadResources = useCallback(async () => {
    setResourcesLoading(true);
    setResourceError('');
    const next: ResourceCatalog = { agent: [], tool: [], 'knowledge-base': [] };
    const failures: string[] = [];
    const tasks: Promise<void>[] = [];

    if (hasPermission(PERMISSIONS.Agent.View)) {
      tasks.push((async () => {
        try {
          // Agent OpenAPI supports GroupIds. The client applies the stricter
          // all-groups subset rule again below before displaying choices.
          const result = await agentsApi.getAgents(1, 200, undefined, undefined, undefined, [...callerGroupIds]);
          next.agent = (result?.items ?? []).map(normalizeAgent).filter((agent) => agent.id).map(asAgentOption);
        } catch (error) {
          failures.push(`Agents: ${error instanceof Error ? error.message : 'failed to load'}`);
        }
      })());
    }

    if (hasPermission(PERMISSIONS.LocalTools.View)) {
      tasks.push((async () => {
        try {
          const result = await localToolsApi.list({ pageSize: 200 });
          next.tool.push(...(result?.items ?? []).map(asLocalToolOption));
        } catch (error) {
          failures.push(`Local tools: ${error instanceof Error ? error.message : 'failed to load'}`);
        }
      })());
    }

    if (hasPermission(PERMISSIONS.RemoteTools.View)) {
      tasks.push((async () => {
        try {
          const result = await remoteToolsApi.list({ pageSize: 200 });
          next.tool.push(...(result?.items ?? []).map(asRemoteToolOption));
        } catch (error) {
          failures.push(`Remote tools: ${error instanceof Error ? error.message : 'failed to load'}`);
        }
      })());
    }

    if (hasPermission(PERMISSIONS.KnowledgeBase.View)) {
      tasks.push((async () => {
        try {
          // RAG schema's KB DTO maps groupIds to owner_group_ids in configBridge.
          next['knowledge-base'] = (await configKnowledgeBases()).map(asKnowledgeBaseOption);
        } catch (error) {
          failures.push(`Knowledge bases: ${error instanceof Error ? error.message : 'failed to load'}`);
        }
      })());
    }

    await Promise.all(tasks);
    setCatalog(next);
    setResourceId('');
    setResourceError(failures.join(' · '));
    setResourcesLoading(false);
  }, [hasPermission, callerGroupIds]);

  useEffect(() => {
    void loadResources();
  }, [loadResources]);

  useEffect(() => {
    if (allowedResourceTypes.length > 0 && !allowedResourceTypes.some((type) => type.value === resourceType)) {
      setResourceType(allowedResourceTypes[0].value);
      setResourceId('');
    }
  }, [allowedResourceTypes, resourceType]);

  useEffect(() => {
    if (resourceId && !selectedResources.some((item) => item.id === resourceId)) setResourceId('');
  }, [resourceId, selectedResources]);

  // Escape closes dialogs unless an operation is in progress.
  useEffect(() => {
    if (!registerOpen && !deleteCandidate) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || saving || deleting) return;
      setRegisterOpen(false);
      setDeleteCandidate(null);
      setDeleteConfirmationName('');
      setDeleteError('');
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [registerOpen, deleteCandidate, saving, deleting]);

  const openRegister = () => {
    setFormError('');
    setRegisterOpen(true);
  };

  const closeRegister = () => {
    if (saving) return;
    setRegisterOpen(false);
    setFormError('');
  };

  const createKey = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    if (!keyName.trim()) {
      setFormError('Enter a name for this API key.');
      return;
    }
    if (!resourceId || !selectedResource) {
      setFormError('Select a resource that is available to your account.');
      return;
    }

    setSaving(true);
    try {
      const response = await apiKeysApi.generate({
        // The API request schema has resourceName/resourceId but no resourceType;
        // send the category here and the selected record's ID separately.
        resourceName: apiResourceName(resourceType),
        resourceId: selectedResource.id,
        // This is the exact string field available in the auth OpenAPI schema.
        // Note is deliberately not sent because the backend request has no note field.
        userInput: keyName.trim(),
      });
      const apiKey = String(response?.apiKey ?? '').trim();
      if (!apiKey) {
        setFormError(`The endpoint responded${response?.status ? ` with status “${response.status}”` : ''} but did not return an apiKey value.`);
        return;
      }

      const created: SessionApiKey = {
        id: localId(),
        name: keyName.trim(),
        note: note.trim(),
        resourceType,
        resourceId: selectedResource.id,
        // The API request schema has resourceName/resourceId but no resourceType;
        // send the category here and the selected record's ID separately.
        resourceName: apiResourceName(resourceType),
        apiKey,
        status: response.status || 'Generated',
        createdAt: new Date().toISOString(),
      };
      setKeys((current) => [created, ...current]);
      setVisibleKeys((current) => ({ ...current, [created.id]: false }));
      setCopiedKeyId(null);
      setKeyName('');
      setNote('');
      setRegisterOpen(false);
      showNotification('API key generated successfully. Copy it now and store it securely.');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to generate API key.');
    } finally {
      setSaving(false);
    }
  };

  const copyKey = async (key: SessionApiKey) => {
    try {
      await navigator.clipboard.writeText(key.apiKey);
      setCopiedKeyId(key.id);
      showNotification('API key copied to clipboard.');
      window.setTimeout(() => setCopiedKeyId((current) => current === key.id ? null : current), 2200);
    } catch {
      setCopiedKeyId(null);
      showNotification('Clipboard access failed. Reveal the key and copy it manually.');
    }
  };

  const requestDelete = (key: SessionApiKey) => {
    setDeleteCandidate(key);
    setDeleteConfirmationName('');
    setDeleteError('');
  };

  const confirmDelete = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!deleteCandidate || deleteConfirmationName.trim() !== deleteCandidate.name) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await apiKeysApi.delete(deleteCandidate);
      // No success path until the backend publishes a real delete/revoke endpoint.
      setKeys((current) => current.filter((item) => item.id !== deleteCandidate.id));
      setVisibleKeys((current) => {
        const next = { ...current };
        delete next[deleteCandidate.id];
        return next;
      });
      setDeleteCandidate(null);
      setDeleteConfirmationName('');
      showNotification('API key deleted.');
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Unable to delete API key.');
    } finally {
      setDeleting(false);
    }
  };

  const noResourceAccess = allowedResourceTypes.length === 0;
  const canConfirmDelete = !!deleteCandidate && deleteConfirmationName.trim() === deleteCandidate.name;

  return (
    <div id="api-key-management-view" className="mx-auto max-w-7xl space-y-5 p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${light ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-sky-500/30 bg-sky-500/10 text-sky-300'}`}>
              Identity &amp; Governance
            </span>
          </div>
          <h1 className={`text-xl font-bold ${light ? 'text-slate-900' : 'text-white'}`}>API Key Management</h1>
          <p className={`mt-1 max-w-3xl text-sm ${muted}`}>
            Generate a key for an Agent, Tool, or Knowledge Base you can access. Resource choices follow your existing role permissions and group scope.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => { void loadResources(); }}
            disabled={resourcesLoading}
            className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${light ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50' : 'border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800'}`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${resourcesLoading ? 'animate-spin' : ''}`} />Refresh resources
          </button>
          <button
            type="button"
            onClick={openRegister}
            disabled={noResourceAccess}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />Register API Key
          </button>
        </div>
      </div>

      <div className={`flex items-start gap-3 rounded-xl border p-3.5 ${light ? 'border-amber-200 bg-amber-50/80' : 'border-amber-500/20 bg-amber-500/5'}`}>
        <ShieldCheck className={`mt-0.5 h-4 w-4 shrink-0 ${light ? 'text-amber-700' : 'text-amber-300'}`} />
        <div className={`text-xs leading-5 ${light ? 'text-amber-900' : 'text-amber-100/90'}`}>
          <div className="font-semibold">Keep API keys private</div>
          Generated secrets are held in this page's memory only. Copy and store them securely; refreshing or leaving this page clears this session list. The supplied API schema does not include endpoints to list or revoke keys, so existing keys cannot yet be loaded and delete cannot be completed until the backend adds that endpoint.
        </div>
      </div>

      {resourceError && (
        <div role="status" className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${light ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-amber-500/20 bg-amber-500/5 text-amber-200'}`}>
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>Some resource lists could not be loaded: {resourceError}</span>
        </div>
      )}

      {noResourceAccess && (
        <div className={`rounded-xl border p-4 text-sm ${light ? 'border-slate-200 bg-white text-slate-600' : 'border-slate-700 bg-slate-900/50 text-slate-400'}`}>
          Your role profile does not grant view access to Agents, Tools, or Knowledge bases, so there are no resource types available here.
        </div>
      )}

      <section className={`overflow-hidden rounded-2xl border shadow-sm ${surface}`}>
        <div className={`flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${light ? 'border-slate-200' : 'border-slate-800'}`}>
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${light ? 'bg-violet-50 text-violet-700' : 'bg-violet-500/10 text-violet-300'}`}><KeyRound className="h-5 w-5" /></div>
            <div>
              <h2 className="text-sm font-bold">Generated API keys</h2>
              <p className={`mt-0.5 text-xs ${muted}`}>Keys generated during this page session · {keys.length} {keys.length === 1 ? 'key' : 'keys'}</p>
            </div>
          </div>
          <span className={`self-start rounded-full border px-2 py-1 text-[10px] font-semibold ${light ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-slate-700 bg-slate-950/50 text-slate-300'}`}>Session only</span>
        </div>

        {keys.length === 0 ? (
          <div className={`px-6 py-14 text-center ${light ? 'bg-white' : 'bg-slate-950/15'}`}>
            <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl ${light ? 'bg-slate-100 text-slate-400' : 'bg-slate-800 text-slate-500'}`}><KeyRound className="h-6 w-6" /></div>
            <h3 className="mt-3 text-sm font-semibold">No keys generated in this session</h3>
            <p className={`mx-auto mt-1 max-w-md text-xs leading-5 ${muted}`}>Select <span className="font-semibold">Register API Key</span> to choose a resource and generate a key. The backend currently has no API for listing keys after you leave or refresh this page.</p>
            {!noResourceAccess && <button type="button" onClick={openRegister} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-500"><Plus className="h-3.5 w-3.5" />Register API Key</button>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-xs">
              <thead className={light ? 'bg-slate-50 text-slate-500' : 'bg-slate-950/50 text-slate-400'}>
                <tr>
                  <th className="px-4 py-3 font-semibold">Key name / note</th>
                  <th className="px-4 py-3 font-semibold">API key</th>
                  <th className="px-4 py-3 font-semibold">Resource</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id} className={`border-t align-top ${light ? 'border-slate-200' : 'border-slate-800'}`}>
                    <td className="max-w-[220px] px-4 py-3.5">
                      <div className="break-words font-semibold">{key.name}</div>
                      {key.note && <div className={`mt-1 break-words text-[11px] leading-4 ${muted}`}>{key.note}</div>}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex min-w-[220px] items-center gap-1.5">
                        <code className={`min-w-0 flex-1 truncate rounded-md border px-2 py-1.5 font-mono text-[11px] ${light ? 'border-slate-200 bg-slate-50 text-slate-700' : 'border-slate-700 bg-slate-950/70 text-slate-200'}`} title={visibleKeys[key.id] ? key.apiKey : 'Hidden API key'}>
                          {visibleKeys[key.id] ? key.apiKey : '••••••••••••••••••••'}
                        </code>
                        <button type="button" onClick={() => setVisibleKeys((current) => ({ ...current, [key.id]: !current[key.id] }))} aria-label={visibleKeys[key.id] ? 'Hide API key' : 'Show API key'} title={visibleKeys[key.id] ? 'Hide API key' : 'Show API key'} className={`rounded-md border p-1.5 ${light ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'}`}>
                          {visibleKeys[key.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <button type="button" onClick={() => { void copyKey(key); }} aria-label="Copy API key" title="Copy API key" className={`rounded-md border p-1.5 ${light ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'}`}>
                          {copiedKeyId === key.id ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium">{resourceTypeLabel(key.resourceType)} · {key.resourceName}</div>
                      <code className={`mt-1 block max-w-[190px] truncate text-[10px] ${muted}`} title={key.resourceId}>{key.resourceId}</code>
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3.5 ${muted}`}>{dateLabel(key.createdAt)}</td>
                    <td className="px-4 py-3.5"><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${light ? 'bg-emerald-50 text-emerald-700' : 'bg-emerald-500/10 text-emerald-300'}`}>{key.status || 'Generated'}</span></td>
                    <td className="px-4 py-3.5 text-right">
                      <button type="button" onClick={() => requestDelete(key)} className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 px-2.5 py-1.5 font-semibold text-rose-500 transition-colors hover:bg-rose-500/10"><Trash2 className="h-3.5 w-3.5" />Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {registerOpen && (
        <div className={overlay} onMouseDown={(event) => { if (event.target === event.currentTarget) closeRegister(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="register-api-key-title" className={dialog}>
            <div className={`flex items-start justify-between gap-4 border-b px-5 py-4 ${light ? 'border-slate-200' : 'border-slate-800'}`}>
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${light ? 'bg-sky-50 text-sky-700' : 'bg-sky-500/10 text-sky-300'}`}><KeyRound className="h-4 w-4" /></div>
                <div>
                  <h2 id="register-api-key-title" className="text-sm font-bold">Register API Key</h2>
                  <p className={`mt-1 text-xs leading-5 ${muted}`}>Choose one resource to scope this key to.</p>
                </div>
              </div>
              <button type="button" onClick={closeRegister} disabled={saving} aria-label="Close registration form" className={`rounded-lg p-1.5 ${light ? 'text-slate-500 hover:bg-slate-100' : 'text-slate-400 hover:bg-slate-800'}`}><X className="h-4 w-4" /></button>
            </div>

            <form onSubmit={createKey}>
              <div className="space-y-4 px-5 py-5">
                {noResourceAccess ? (
                  <div className={`rounded-lg border p-3 text-xs ${light ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-slate-700 bg-slate-950/50 text-slate-400'}`}>Your role profile does not grant view access to Agents, Tools, or Knowledge bases.</div>
                ) : (
                  <>
                    <div>
                      <label htmlFor="api-key-resource-type" className={`${labelClass} ${muted}`}>Resource type <span className="text-rose-500">*</span></label>
                      <select id="api-key-resource-type" value={resourceType} onChange={(event) => { setResourceType(event.target.value as ResourceType); setResourceId(''); setFormError(''); }} className={`${fieldClass} ${fieldTheme}`} required>
                        {allowedResourceTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="api-key-resource-id" className={`${labelClass} ${muted}`}>Resource <span className="text-rose-500">*</span></label>
                      <select id="api-key-resource-id" value={resourceId} onChange={(event) => { setResourceId(event.target.value); setFormError(''); }} className={`${fieldClass} ${fieldTheme}`} required disabled={resourcesLoading || selectedResources.length === 0}>
                        <option value="">{resourcesLoading ? 'Loading available resources…' : selectedResources.length ? 'Select a resource' : 'No resources available in your groups'}</option>
                        {selectedResources.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.id}</option>)}
                      </select>
                      <p className={`mt-1.5 text-[11px] leading-4 ${muted}`}>Only resources whose entire group assignment is covered by your own groups are shown.</p>
                      {selectedResource && <p className={`mt-1 text-[11px] ${muted}`}>{selectedResource.kindLabel}{selectedResource.groupIds.length > 0 ? ` · Groups: ${selectedResource.groupIds.map((id) => groupName(id)).join(', ')}` : ' · No group assignments'}</p>}
                    </div>

                    <div>
                      <label htmlFor="api-key-name" className={`${labelClass} ${muted}`}>API key name <span className="text-rose-500">*</span></label>
                      <input id="api-key-name" value={keyName} onChange={(event) => setKeyName(event.target.value)} maxLength={100} placeholder="e.g. Order service — production" className={`${fieldClass} ${fieldTheme}`} required />
                      <p className={`mt-1 text-[11px] ${muted}`}>Sent to the API as <code>userInput</code>, the key-label field in the supplied schema.</p>
                    </div>

                    <div>
                      <label htmlFor="api-key-note" className={`${labelClass} ${muted}`}>Note <span className="font-normal">(optional)</span></label>
                      <textarea id="api-key-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={3} placeholder="Describe where this key will be used or who owns it." className={`${fieldClass} resize-y ${fieldTheme}`} />
                      <p className={`mt-1 text-[11px] leading-4 ${muted}`}>The current backend request schema has no note field, so this note is kept in this page session only.</p>
                    </div>
                  </>
                )}

                {resourceError && <div className={`flex items-start gap-2 rounded-lg border p-2.5 text-xs ${light ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-amber-500/20 bg-amber-500/5 text-amber-200'}`}><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{resourceError}</span></div>}
                {formError && <div role="alert" className={`flex items-start gap-2 rounded-lg border p-2.5 text-xs ${light ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-rose-500/20 bg-rose-500/5 text-rose-200'}`}><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{formError}</span></div>}
              </div>

              <div className={`flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end ${light ? 'border-slate-200 bg-slate-50/70' : 'border-slate-800 bg-slate-950/30'}`}>
                <button type="button" onClick={closeRegister} disabled={saving} className={`rounded-lg border px-4 py-2.5 text-xs font-semibold disabled:opacity-50 ${light ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50' : 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'}`}>Cancel</button>
                <button type="submit" disabled={saving || resourcesLoading || !resourceId || !keyName.trim() || !selectedResource || noResourceAccess} className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"><KeyRound className="h-3.5 w-3.5" />{saving ? 'Generating…' : 'Generate API key'}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {deleteCandidate && (
        <div className={overlay} onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) { setDeleteCandidate(null); setDeleteConfirmationName(''); setDeleteError(''); } }}>
          <section role="dialog" aria-modal="true" aria-labelledby="delete-api-key-title" className={dialog}>
            <div className={`flex items-start gap-3 border-b px-5 py-4 ${light ? 'border-slate-200' : 'border-slate-800'}`}>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500"><Trash2 className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1">
                <h2 id="delete-api-key-title" className="text-sm font-bold">Delete API key?</h2>
                <p className={`mt-1 text-xs leading-5 ${muted}`}>This may interrupt any application that uses this key. Type the API key name exactly to confirm.</p>
              </div>
              <button type="button" onClick={() => { setDeleteCandidate(null); setDeleteConfirmationName(''); setDeleteError(''); }} disabled={deleting} aria-label="Close delete confirmation" className={`rounded-lg p-1.5 ${light ? 'text-slate-500 hover:bg-slate-100' : 'text-slate-400 hover:bg-slate-800'}`}><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={confirmDelete}>
              <div className="space-y-3 px-5 py-5">
                <div className={`rounded-lg border p-3 ${light ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-950/50'}`}>
                  <div className={`text-[10px] font-semibold uppercase tracking-wide ${muted}`}>API key name</div>
                  <div className="mt-1 break-words text-sm font-semibold">{deleteCandidate.name}</div>
                </div>
                <div>
                  <label htmlFor="delete-api-key-name" className={`${labelClass} ${muted}`}>Confirm key name</label>
                  <input id="delete-api-key-name" autoComplete="off" value={deleteConfirmationName} onChange={(event) => { setDeleteConfirmationName(event.target.value); setDeleteError(''); }} placeholder="Type the API key name" className={`${fieldClass} ${fieldTheme}`} required />
                </div>
                <div role="status" className={`flex items-start gap-2 rounded-lg border p-3 text-xs leading-5 ${light ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-amber-500/20 bg-amber-500/5 text-amber-100'}`}><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>The supplied OpenAPI schema has no API-key delete/revoke endpoint. Confirming will report this limitation and will <strong>not</strong> remove or revoke the key.</span></div>
                {deleteError && <div role="alert" className={`rounded-lg border p-3 text-xs ${light ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-rose-500/20 bg-rose-500/5 text-rose-200'}`}>{deleteError}</div>}
              </div>
              <div className={`flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end ${light ? 'border-slate-200 bg-slate-50/70' : 'border-slate-800 bg-slate-950/30'}`}>
                <button type="button" onClick={() => { setDeleteCandidate(null); setDeleteConfirmationName(''); setDeleteError(''); }} disabled={deleting} className={`rounded-lg border px-4 py-2.5 text-xs font-semibold disabled:opacity-50 ${light ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50' : 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'}`}>Cancel</button>
                <button type="submit" disabled={!canConfirmDelete || deleting} className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />{deleting ? 'Deleting…' : 'Confirm delete'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};



