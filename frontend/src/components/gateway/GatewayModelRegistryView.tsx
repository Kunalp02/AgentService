
import React, { useEffect, useMemo, useState } from 'react';
import { Cpu, Plus, RefreshCw, Trash2, Edit2, AlertTriangle, Loader2, Lock } from 'lucide-react';
import { AiGatewayDto, ModelRegistryDto, ModelUsageDto  } from '../../types/gatewayModelRegistry';
import { useGatewayRegistry } from '../../hooks/useGatewayRegistry';
import { usePlatform } from '../../context/PlatformContext';
import { PERMISSIONS } from '@/src/config/permissions';
import { ApiError } from '@/src/api/client';

const emptyGatewayForm = { name: '', url: '', apiKey: '' };
const emptyModelForm = {
  name: '',
  gatewayId: '',
  modelIdentifier: '',
  classificationId: '',
  groupIds: [] as string[],
  contextLength: 0,
};

export const GatewayModelRegistryView: React.FC = () => {
  const { hasPermission, theme } = usePlatform();
  const canViewGateways = hasPermission(PERMISSIONS.Gateway.View) || hasPermission(PERMISSIONS.Gateway.Manage);
  const canManageGateways = hasPermission(PERMISSIONS.Gateway.Manage);
  const canViewModels = hasPermission(PERMISSIONS.ModelRegistry.View) || hasPermission(PERMISSIONS.ModelRegistry.Manage);
  const canManageModels = hasPermission(PERMISSIONS.ModelRegistry.Manage);

  const {
    gateways,
    gatewayOptions,
    models,
    groups,
    classifications,
    loading,
    error,
    savingGateway,
    savingModel,
    syncingGatewayId,
    reload,
    addGateway,
    updateGateway,
    removeGateway,
    syncGatewayModels,
    discoveredModels,
    discoveredModelsError,
    clearDiscoveredModels,
    addModel,
    updateModel,
    removeModel,
    toggleModel,
    checkModelUsage,
  } = useGatewayRegistry({ canViewGateways, canViewModels });

  const groupNameById = useMemo(() => {
   const map = new Map<string, string>();
   groups.forEach((g) => map.set(g.id, g.name ?? g.id));
    return map;
  }, [groups]);

  const activeGroups = useMemo(() => groups.filter((g) => g.isActive), [groups]);
  const singleGroup = activeGroups.length === 1;
  // ---------- Gateway modal (create + edit share one modal) ----------
  const [isGatewayModalOpen, setIsGatewayModalOpen] = useState(false);
  const [editingGateway, setEditingGateway] = useState<AiGatewayDto | null>(null);
  const [gatewayFormData, setGatewayFormData] = useState(emptyGatewayForm);
  const [gatewayActiveOnEdit, setGatewayActiveOnEdit] = useState(true);

  const openCreateGateway = () => {
    setEditingGateway(null);
    setGatewayFormData(emptyGatewayForm);
    setGatewayActiveOnEdit(true);
    setIsGatewayModalOpen(true);
  };

  const openEditGateway = (gw: AiGatewayDto) => {
    setEditingGateway(gw);
    setGatewayFormData({ name: gw.name ?? '', url: gw.url ?? '', apiKey: '' });
    setGatewayActiveOnEdit(gw.isActive);
    setIsGatewayModalOpen(true);
  };

  const handleGatewaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingGateway) {
        // Only send apiKey if the user actually typed a new one — leave unchanged otherwise
        const payload: Record<string, unknown> = {
          name: gatewayFormData.name,
          url: gatewayFormData.url,
          isActive: gatewayActiveOnEdit,
        };
        if (gatewayFormData.apiKey.trim()) payload.apiKey = gatewayFormData.apiKey;
        await updateGateway(editingGateway.id, payload);
      } else {
        await addGateway(gatewayFormData);
      }
      setIsGatewayModalOpen(false);
    } catch {
      // keep modal open so the user can retry; error surfaces via banner
    }
  };

  // ---------- Model modal (create + edit share one modal) ----------
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelRegistryDto | null>(null);
  const [modelFormData, setModelFormData] = useState(emptyModelForm);
  const [selectedDiscoveredIdentifier, setSelectedDiscoveredIdentifier] = useState('');
  const [modelFormError, setModelFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!editingModel && singleGroup && modelFormData.groupIds.length === 0) {
      setModelFormData((f) => ({ ...f, groupIds: [activeGroups[0].id] }));
    }
  }, [editingModel, singleGroup, activeGroups, modelFormData.groupIds.length]);

  const isSyncingForModal = syncingGatewayId !== null && syncingGatewayId === modelFormData.gatewayId;

  const openCreateModel = () => {
    setEditingModel(null);
    setModelFormData({ ...emptyModelForm, gatewayId: gateways[0]?.id ?? '', groupIds: singleGroup ? [activeGroups[0].id] : [] });
    setModelFormData({ ...emptyModelForm, gatewayId: gatewayOptions[0]?.id ?? '' });
    setSelectedDiscoveredIdentifier('');
    clearDiscoveredModels();
    setIsModelModalOpen(true);
    setModelFormError(null);
  };

const openEditModel = (model: ModelRegistryDto) => {
  setEditingModel(model);
  setModelFormData({
    name: model.name ?? '',
    gatewayId: model.gatewayId,
    modelIdentifier: model.modelIdentifier ?? '',
    classificationId: model.classificationId ?? '',   // was: classification: model.classification
    groupIds: model.groupIds ?? [],
    contextLength: model.contextLength ?? 0,
  });
  setSelectedDiscoveredIdentifier('');
  clearDiscoveredModels();
  setIsModelModalOpen(true);
};

  /** Selecting a gateway in the form pulls the live model list straight from
   *  that gateway (via /models/sync). Those are candidates to register —
   *  not existing registry entries. */
  const handleGatewayChangeInModelForm = (gatewayId: string) => {
    setModelFormData((f) => ({ ...f, gatewayId }));
    setSelectedDiscoveredIdentifier('');
    clearDiscoveredModels();
  };

  // Fetch models for the currently selected gateway when the user clicks the button
  const fetchModelsForSelectedGateway = async () => {
    const gwId = modelFormData.gatewayId;
    if (!gwId) return;
    await syncGatewayModels(gwId);
  };

  const handleSelectDiscoveredModel = (modelIdentifier: string) => {
    setSelectedDiscoveredIdentifier(modelIdentifier);
    const found = discoveredModels.find((m) => m.modelIdentifier === modelIdentifier);
    if (found) {
      setModelFormData((f) => ({
        ...f,
        name: found.name || f.name,
        modelIdentifier: found.modelIdentifier,
      }));
    }
  };

  const toggleGroupId = (groupId: string) => {
    setModelFormData((f) => ({
      ...f,
      groupIds: f.groupIds.includes(groupId) ? f.groupIds.filter((id) => id !== groupId) : [...f.groupIds, groupId],
    }));
    setModelFormError(null);
  };

  const handleModelSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setModelFormError(null);

  if (modelFormData.groupIds.length === 0) {
    setModelFormError('Select at least one group.');
    return;
  }
  if (!modelFormData.classificationId) {
    setModelFormError('Select a classification.');
    return;
  }

  try {
    if (editingModel) {
      await updateModel(editingModel.id, {
        gatewayId: modelFormData.gatewayId,
        name: modelFormData.name,
        modelIdentifier: modelFormData.modelIdentifier,
        classificationId: modelFormData.classificationId,
        groupIds: modelFormData.groupIds,
        contextLength: modelFormData.contextLength,
        isActive: editingModel.isActive,   // otherwise every edit can deactivate the model
      });
    } else {
      await addModel({
        gatewayId: modelFormData.gatewayId,
        name: modelFormData.name,
        modelIdentifier: modelFormData.modelIdentifier,
        classificationId: modelFormData.classificationId,
        groupIds: modelFormData.groupIds,
        contextLength: modelFormData.contextLength,
      });
    }
    setIsModelModalOpen(false);
  } catch (err) {
    setModelFormError(getErrorMessage(err, 'Failed to save the model. Please try again.'));
  }
};
  //Delete Modal 

  type DeleteTarget = { kind: 'model' | 'gateway'; id: string; name: string };

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [usage, setUsage] = useState<ModelUsageDto | null>(null);
  const [checkingUsage, setCheckingUsage] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const getErrorMessage = (err: unknown, fallback: string): string => {
    const e = err as any;
    const body = e?.body ?? e?.response?.data;
    const fromBody = body?.Message ?? body?.message ?? body?.detail ?? body?.Detail;
    if (typeof fromBody === 'string' && fromBody.trim()) return fromBody;
    if (typeof e?.message === 'string' && e.message.trim()) return e.message;
    return fallback;
  };

  const openDelete = async (target: DeleteTarget) => {
    setDeleteTarget(target);
    setUsage(null);
    setDeleteError(null);
    if (target.kind !== 'model') return;       // gateways: backend check on confirm
    setCheckingUsage(true);
    try {
      setUsage(await checkModelUsage(target.id));
    } catch {
      // not fatal: the delete call is still guarded by the DB
    } finally {
      setCheckingUsage(false);
    }
  };

  const closeDelete = () => {
    setDeleteTarget(null);
    setUsage(null);
    setDeleteError(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      if (deleteTarget.kind === 'model') await removeModel(deleteTarget.id);
      else await removeGateway(deleteTarget.id);
      closeDelete();
    } catch (err) {
     console.error('delete failed', err, (err as any)?.constructor?.name);
     setDeleteError(getErrorMessage(err, 'Delete failed. Please try again.'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div id="gateway-model-registry-view" className={`p-5 space-y-5 max-w-7xl mx-auto `}>
{/* GATEWAY MODAL (create + edit) */}
      {isGatewayModalOpen && (
        <div className={`fixed inset-0 z-50 backdrop-blur-sm flex items-center justify-center p-4 bg-slate-950/80`}>
          <div className={`w-full max-w-lg rounded-2xl border border-slate-700 shadow-2xl ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-900'}`}>
            <div className={`p-5 border-b flex items-center justify-between ${theme === 'light' ? 'border-slate-400/50' : 'border-slate-800'}`}>
              <h3 className={`text-sm font-bold flex items-center gap-2 ${theme === 'light' ? 'text-sky-950' : 'text-sky-50'}`}>
                {editingGateway ? `Edit Gateway (${editingGateway.name})` : 'Register Enterprise AI Gateway'}
              </h3>
              <button onClick={() => setIsGatewayModalOpen(false)} className={` ${theme === 'light' ? 'text-slate-400 hover:text-slate-600' : 'text-slate-400 hover:text-slate-300'}`}>
                ✕
              </button>
            </div>

            <form onSubmit={handleGatewaySubmit} className="p-5 space-y-4">
              <div>
                <label className={`${theme === 'light' ? 'label-light' : 'label-dark'}`}>Gateway Name</label>
                <input
                  type="text"
                  value={gatewayFormData.name}
                  onChange={(e) => setGatewayFormData({ ...gatewayFormData, name: e.target.value })}
                  placeholder="e.g. Azure OpenAI Hub"
                  className={`pl-3 ${theme === 'light' ? 'input-base-light' : 'input-base-dark'}`}
                  required
                />
              </div>

              <div>
                <label className={`${theme === 'light' ? 'label-light' : 'label-dark'}`}>Gateway URL</label>
                <input
                  type="text"
                  value={gatewayFormData.url}
                  onChange={(e) => setGatewayFormData({ ...gatewayFormData, url: e.target.value })}
                  placeholder="https://ai-gateway.corp.internal/v1"
                  className={`pl-3 ${theme === 'light' ? 'input-base-light' : 'input-base-dark'}`}
                  required
                />
              </div>

              <div>
                <label className={`${theme === 'light' ? 'label-light' : 'label-dark'}`}>
                  API Key {editingGateway && <span className="text-slate-500 font-normal">(leave blank to keep existing)</span>}
                </label>
                <input
                  type="password"
                  value={gatewayFormData.apiKey}
                  onChange={(e) => setGatewayFormData({ ...gatewayFormData, apiKey: e.target.value })}
                  placeholder="••••••••••••••••••••••••"
                  className={`pl-3 ${theme === 'light' ? 'input-base-light' : 'input-base-dark'}`}
                  required={!editingGateway}
                />
              </div>

              {editingGateway && (
                <label className={`flex items-center gap-2 ${theme === 'light' ? 'label-light' : 'label-dark'}`}>
                  <input
                    type="checkbox"
                    checked={gatewayActiveOnEdit}
                    onChange={(e) => setGatewayActiveOnEdit(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                  />
                  Gateway is active
                </label>
              )}

              <div className="pt-3 border-t border-slate-800 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsGatewayModalOpen(false)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-semibold text-slate-200`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingGateway}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 btn-primary-dark text-xs w-auto font-bold shadow-md disabled:opacity-50">
                  {savingGateway && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{savingGateway ? 'Saving…' : editingGateway ? 'Save Changes' : 'Save Gateway'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODEL MODAL (create + edit) */}
      {isModelModalOpen && (
        <div className={`fixed inset-0 z-50 backdrop-blur-sm flex items-center justify-center p-4 bg-slate-950/80`}>
          <div className={`w-full max-w-lg rounded-2xl border border-slate-700 shadow-2xl ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-900'}`}>
            <div className={`p-5 border-b flex items-center justify-between ${theme === 'light' ? 'border-slate-400/50' : 'border-slate-800'}`}>
              <h3 className={`text-sm font-bold flex items-center gap-2 ${theme === 'light' ? 'text-sky-950' : 'text-sky-50'}`}>
                {editingModel ? `Edit Model (${editingModel.name})` : 'Register Foundation Model'}
              </h3>
              <button onClick={() => setIsModelModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleModelSubmit} className="p-5 space-y-4">
              <div>
                <label className={`${theme === 'light' ? 'label-light' : 'label-dark'}`}>Target AI Gateway</label>
                <select
                  value={modelFormData.gatewayId}
                  onChange={(e) => handleGatewayChangeInModelForm(e.target.value)}
                  className={`pl-3 ${theme === 'light' ? 'input-base-light' : 'input-base-dark'}`}
                  required
                >
                  <option value="" disabled>
                    Select a gateway…
                  </option>
                  {gateways.map((gw) => (
                    <option key={gw.id} value={gw.id}>
                      {gw.name}
                    </option>
                  ))}
                </select>
                {/* Button to manually fetch models from the selected gateway */}
                <button
                  type="button"
                  onClick={fetchModelsForSelectedGateway}
                  disabled={isSyncingForModal || !modelFormData.gatewayId}
                  className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-semibold text-slate-200"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Fetch Models
                </button>
              </div>

              {/* Discovered models dropdown — pulled live from the gateway itself via /models/sync */}
              {modelFormData.gatewayId && (
                <div>
                  <label className={`${theme === 'light' ? 'label-light' : 'label-dark'}`}>
                    <span>Discovered Model</span>
                    {isSyncingForModal && (
                      <span className="flex items-center gap-1 text-[10px] text-indigo-400 font-normal">
                        <Loader2 className="w-3 h-3 animate-spin" /> fetching from gateway…
                      </span>
                    )}
                  </label>
                  <select
                    value={selectedDiscoveredIdentifier}
                    onChange={(e) => handleSelectDiscoveredModel(e.target.value)}
                    disabled={isSyncingForModal}
                    className={`pl-3 ${theme === 'light' ? 'input-base-light' : 'input-base-dark'}`}
                  >
                    <option value="">
                      {isSyncingForModal
                        ? 'Fetching models from gateway…'
                        : discoveredModels.length === 0
                          ? 'No models returned by this gateway — enter details manually below'
                          : 'Select a model from the gateway, or enter details manually below…'}
                    </option>
                    {discoveredModels.map((m) => (
                      <option key={m.modelIdentifier} value={m.modelIdentifier}>
                        {m.name} ({m.modelIdentifier})
                      </option>
                    ))}
                  </select>
                  {discoveredModelsError && (
                    <p className="text-[10px] text-rose-400 mt-1">{discoveredModelsError}</p>
                  )}
                </div>
              )}

              <div>
                <label className={`${theme === 'light' ? 'label-light' : 'label-dark'}`}>Model Name</label>
                <input
                  type="text"
                  value={modelFormData.name}
                  onChange={(e) => setModelFormData({ ...modelFormData, name: e.target.value })}
                  placeholder="e.g. Claude Sonnet 5 (Reasoning)"
                  className={`pl-3 ${theme === 'light' ? 'input-base-light' : 'input-base-dark'}`}
                  required
                />
              </div>

              <div>
                <label className={`${theme === 'light' ? 'label-light' : 'label-dark'}`}>Model Identifier</label>
                <input
                  type="text"
                  value={modelFormData.modelIdentifier}
                  onChange={(e) => setModelFormData({ ...modelFormData, modelIdentifier: e.target.value })}
                  placeholder="e.g. claude-sonnet-5"
                  className={`pl-3 ${theme === 'light' ? 'input-base-light' : 'input-base-dark'}`}
                  required
                />
              </div>

              <div>
                <label className={`${theme === 'light' ? 'label-light' : 'label-dark'}`}>Classification</label>
                <select
                  value={modelFormData.classificationId}
                  onChange={(e) => setModelFormData({ ...modelFormData, classificationId: e.target.value })}
                  className={`pl-3 ${theme === 'light' ? 'input-base-light' : 'input-base-dark'}`}
                >
                  <option value="">No classification</option>
                  {classifications.map((c) => (
                    <option key={c.id} value={c.id}>{c.displayName}</option>
                  ))}
                </select>
              </div>
             <div>
              <label className={`${theme === 'light' ? 'label-light' : 'label-dark'}`}>Context Length</label>
              <input
                type="number"
                min={0}
                value={modelFormData.contextLength || ''}
                onChange={(e) =>
                  setModelFormData({
                    ...modelFormData,
                    contextLength: e.target.value === '' ? 0 : Number(e.target.value),
                  })
                }
                className={`pl-3 ${theme === 'light' ? 'input-base-light' : 'input-base-dark'}`}
                placeholder="0"
              />
            </div>

              <div>
                <label className={`${theme === 'light' ? 'label-light' : 'label-dark'}`}>
                  {singleGroup ? 'Group' : 'Restrict to Groups (optional)'}
                </label>
                {activeGroups.length === 0 ? (
                  <p className="text-[11px] text-slate-500">No active groups available for this account.</p>
                ) : singleGroup ? (
                  <div className="px-2.5 py-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 text-[11px] text-indigo-200">
                    {activeGroups[0].name || activeGroups[0].id}
                    <span className="text-slate-500 ml-2">Assigned from your sign-in</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                    {activeGroups.map((g) => (
                      <label key={g.id} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={modelFormData.groupIds.includes(g.id)}
                          onChange={() => toggleGroupId(g.id)}
                          className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                        />
                        {g.name || g.id}
                      </label>
                    ))}
                  </div>
                )}
                {/* {!singleGroup && <p className="text-[10px] text-slate-500 mt-1">Leave all unchecked to make this model available to every group.</p>} */}
              </div>
              {modelFormError && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{modelFormError}</span>
                </div>
              )}

              <div className="pt-3 border-t border-slate-800 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsModelModalOpen(false)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-semibold text-slate-200`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingModel}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 btn-primary-dark text-xs w-auto font-bold shadow-md disabled:opacity-50">
                  {savingModel && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{savingModel ? 'Saving…' : editingModel ? 'Save Changes' : 'Register Model'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

<div className={`panel ${theme === 'light' ? 'backdrop-blur-sm bg-slate-950/5 border-neutral-900/5 shadow-none' : 'backdrop-blur-sm bg-slate-100/5 border-neutral-100/10'}`}>
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 ${theme === 'light' ? 'text-indigo-800' : 'text-indigo-300'}`}>
              Model Infrastructure
            </span>
            <span className={`text-xs ${theme === 'light' ? 'text-slate-600' : 'text-slate-400'}`}>Gateway Routing • Model Governance</span>
          </div>
          <h1 className={`header ${theme === 'light' ? 'text-sky-950' : 'text-sky-50'}`}>
            {/* <Cpu className="w-5 h-5 text-indigo-400" /> */}
            AI Gateways & Model Registry
          </h1>
          <p className={`header-disciption max-w-full ${theme === 'light' ? 'text-gray-800' : 'text-gray-200'}`}>
            Connect enterprise AI gateways and register the foundation models agents are allowed to call through them.
          </p>
        </div>

        <button
          onClick={() => reload()}
          disabled={loading}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-semibold text-slate-200`}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 flex items-center gap-2 text-xs">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
          <button onClick={() => reload()} className="ml-auto underline decoration-dotted hover:text-white">
            Retry
          </button>
        </div>
      )}

      {loading && gateways.length === 0 && models.length === 0 ? (
        <div className="flex items-center justify-center py-24 text-slate-400 gap-2 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading gateways and models…</span>
        </div>
      ) : (
        <>
          {/* Gateways row */}
          <div className="space-y-3 mt-5">
            <div className="flex items-center justify-between">
              <h3 className={`text-sm font-bold flex items-center gap-2 ${theme === 'light' ? 'text-sky-950' : 'text-sky-50'}`}>
                Enterprise AI Gateways ({gateways.length})
              </h3>
              {canManageGateways && (
                <button
                  onClick={openCreateGateway}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-semibold text-slate-200"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add AI Gateway</span>
                </button>
              )}
            </div>

            {gateways.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400">
                No gateways registered yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {gateways.map((gw) => (
                  <div key={gw.id} className={`rounded-xl  border  ${theme === 'light' ? 'bg-slate-900/10 border-slate-400/50' : 'bg-slate-950/50 border-slate-800'}`}><div className={`p-3`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-semibold truncate ${theme === 'light' ? 'text-slate-800' : 'text-slate-200'}`}>{gw.name ?? 'Untitled Gateway'}</span>
                      <span
                        className={`text-xs font-semibold shrink-0 ${
                          gw.isActive ? 'text-emerald-600' : 'text-slate-400' }`} >
                        {gw.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className={`text-xs min-h-10 ${theme === 'light' ? 'text-slate-600' : 'text-slate-500'}`}>{gw.url}</div>
                    <div className={`text-xs text-slate-500 mt-1 ${theme === 'light' ? 'text-slate-600' : 'text-slate-500'}`}>
                      Registered {new Date(gw.createdAt).toLocaleDateString()}
                    </div></div>

                    {canManageGateways && (
                      <div className={`flex items-center gap-2 px-3 py-2 border-t ${theme === 'light' ? 'border-slate-400/50' : 'border-slate-800'}`}>
                        <button
                          onClick={() => openEditGateway(gw)}
                          className={`w-full text-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-semibold text-slate-200`}
                        >
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => openDelete({ kind: 'gateway', id: gw.id, name: gw.name ?? 'Untitled Gateway' })}
                          className={`p-1.5 rounded-lg  ${theme === 'light' ? ' hover:text-rose-800 text-rose-600' : 'hover:text-rose-500 text-rose-300'}`}
                          title="Deactivate / Remove Gateway"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

            {deleteTarget && (
    <div className="fixed inset-0 z-50 backdrop-blur-sm flex items-center justify-center p-4 bg-slate-950/80">
      <div className={`w-full max-w-md rounded-2xl border border-slate-700 shadow-2xl ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-900'}`}>
        <div className="p-5 space-y-3">
          <h3 className={`text-sm font-bold ${theme === 'light' ? 'text-sky-950' : 'text-sky-50'}`}>
            Delete {deleteTarget.kind} “{deleteTarget.name}”?
          </h3>

          {checkingUsage && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking where this model is used…
            </div>
          )}

          {!checkingUsage && !usage?.inUse && !deleteError && (
            <p className="text-xs text-slate-400">This action cannot be undone.</p>
          )}

          {usage?.inUse && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200 space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                This model is in use and cannot be deleted.
              </div>
              <ul className="list-disc pl-5 space-y-0.5 max-h-32 overflow-y-auto">
                {usage.usages.map((u) => (
                  <li key={`${u.resourceId}-${u.usedAs}`}>
                    <span className="font-semibold">{u.resourceType}:</span> {u.resourceName}
                    <span className="text-rose-300/70"> ({u.usedAs})</span>
                  </li>
                ))}
              </ul>
              <p className="text-rose-300/80">Switch these to another model, then try again.</p>
            </div>
          )}

          {deleteError && !usage?.inUse && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{deleteError}</span>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-800 flex justify-end gap-2">
          <button onClick={closeDelete}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-semibold text-slate-200">
            Cancel
          </button>
          <button onClick={confirmDelete}
            disabled={checkingUsage || deleting || !!usage?.inUse}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white disabled:opacity-50">
            {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{deleting ? 'Deleting…' : 'Delete'}</span>
          </button>
        </div>
      </div>
    </div>
  )}

          {/* Registered Models Catalog */}
          <div className="space-y-3 mt-5">
            <div className="flex items-center justify-between">
              <h3 className={`text-sm font-bold flex items-center gap-2 ${theme === 'light' ? 'text-sky-950' : 'text-sky-50'}`}>
                Registered Foundation Models ({models.length})
              </h3>
              {canManageModels && (
                <button
                  onClick={openCreateModel}
                  disabled={gateways.length === 0}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 btn-primary-dark text-xs w-auto font-bold shadow-md disabled:opacity-50"
                  title={gateways.length === 0 ? 'Add a gateway first' : undefined}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Register Model</span>
                </button>
              )}
            </div>

            {models.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400">
                No models registered yet. Register one — selecting its gateway will pull in its available models automatically.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {models.map((model) => (
                  <div
                    key={model.id}
                    className={`panel flex flex-col space-y-4 ${theme === 'light' ? 'backdrop-blur-lg bg-slate-950/5 border-neutral-900/5 shadow-none' : 'backdrop-blur-lg bg-slate-100/5 border-neutral-100/10'}`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className={`text-sm font-semibold truncate ${theme === 'light' ? 'text-slate-800' : 'text-slate-200'}`}>{model.name ?? 'Untitled Model'}</h4>
                          <span className={`text-xs min-h-10 ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>{model.modelIdentifier}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {canManageModels && (
                            <>
                              <button
                                onClick={() => openEditModel(model)}
                                className="p-1 rounded-lg text-sky-500 hover:text-indigo-300 hover:bg-slate-800"
                                title="Edit Model"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => openDelete({ kind: 'model', id: model.id, name: model.name ?? 'Untitled Model' })}
                                className={`p-1.5 rounded-lg  ${theme === 'light' ? ' hover:text-rose-800 text-rose-600' : 'hover:text-rose-500 text-rose-300'}`}
                                title="Remove Model"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          {/* <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={model.isActive}
                              onChange={() => toggleModel(model.id)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-sky-500/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-600"></div>
                          </label> */}
                        </div>
                      </div>

                      <div className={`flex items-center justify-between gap-3 p-3 rounded-xl  border  ${theme === 'light' ? 'bg-slate-300/8 border-slate-400/50' : 'bg-slate-950/50 border-slate-800'}`}>
                        <div>
                          <div className={`text-xs truncate ${theme === 'light' ? 'text-slate-600' : 'text-slate-500'}`}>Gateway</div>
                          <div className={`text-sm font-semibold truncate ${theme === 'light' ? 'text-slate-800' : 'text-slate-200'}`}>{model.gatewayName ?? '—'}</div>
                        </div>
                        {model.classification && (
                          <span className="px-2 py-0.5 rounded bg-slate-500/20 text-slate-400/80 text-[10px] font-bold uppercase">
                            {model.classification}
                          </span>
                        )}
                      </div>

                      {model.groupIds && model.groupIds.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {model.groupIds.map((gid) => (
                            <span key={gid} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-mono">
                              {groupNameById.get(gid) ?? gid}
                            </span>
                          ))}
                        </div>
                      )}
                       {model.contextLength !== undefined && model.contextLength > 0 && (
                        <div className="mt-1 text-xs text-gray-400">
                          Context Length: {model.contextLength}
                        </div>
                      )}
                      
                      
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      </div>
    </div>
  );
};
