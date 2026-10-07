
import { useCallback, useEffect, useState } from 'react';
import {
  AiGatewayDto,
  AiGatewayPublicDto,
  ModelRegistryDto,
  CreateAiGatewayRequest,
  UpdateAiGatewayRequest,
  CreateModelRegistryRequest,
  UpdateModelRegistryRequest,
  ModelClassificationDto,
} from '../types/gatewayModelRegistry';
import { gatewaysApi, DiscoveredGatewayModel } from '../api/gatewaysApi';
import { modelRegistryApi } from '../api/modelRegistryApi';
import { usePlatform } from '../context/PlatformContext';
import { ApiError } from '../api/client';

export interface GatewayOption {
  id: string;
  name: string;
}

interface State {
  gateways: AiGatewayDto[];
  gatewayOptions: GatewayOption[];
  models: ModelRegistryDto[];
  classifications: ModelClassificationDto[];
  loading: boolean;
  error: string | null;
}

export interface UseGatewayRegistryOptions {
  canViewGateways: boolean;
  canViewModels: boolean;
}

export function useGatewayRegistry({ canViewGateways, canViewModels }: UseGatewayRegistryOptions) {
  const { groups } = usePlatform(); // already-loaded array — no fetch needed here

  const [state, setState] = useState<State>({
    gateways: [],
    gatewayOptions: [],
    models: [],
    classifications: [],
    loading: true,
    error: null,
  });

  const [syncingGatewayId, setSyncingGatewayId] = useState<string | null>(null);
  const [savingGateway, setSavingGateway] = useState(false);
  const [savingModel, setSavingModel] = useState(false);

  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredGatewayModel[]>([]);
  const [discoveredModelsError, setDiscoveredModelsError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));

    const errors: string[] = [];

    let gateways: AiGatewayDto[] = [];
    let gatewayOptions: GatewayOption[] = [];
    if (canViewGateways) {
      try {
        gateways = await gatewaysApi.list();
        if (!Array.isArray(gateways)) gateways = [];
        gatewayOptions = gateways.map((g) => ({ id: g.id, name: g.name ?? 'Untitled Gateway' }));
      } catch (err) {
        errors.push(err instanceof ApiError ? err.message : 'Failed to load gateways.');
      }
    } else {
      try {
        const publicGateways: AiGatewayPublicDto[] = await gatewaysApi.listPublic();
        gatewayOptions = Array.isArray(publicGateways)
          ? publicGateways.map((g) => ({ id: g.id, name: g.name ?? 'Untitled Gateway' }))
          : [];
      } catch {
        // no gateway permission, or public endpoint unavailable — picker stays empty
      }
    }

    let models: ModelRegistryDto[] = [];
    if (canViewModels) {
      try {
        models = await modelRegistryApi.list({ activeOnly: false });
        if (!Array.isArray(models)) models = [];
      } catch (err) {
        errors.push(err instanceof ApiError ? err.message : 'Failed to load models.');
      }
    }

    let classifications: ModelClassificationDto[] = [];
    try {
      classifications = await modelRegistryApi.listClassifications();
      if (!Array.isArray(classifications)) classifications = [];
    } catch {
      classifications = [];
    }

    setState({
      gateways,
      gatewayOptions,
      models,
      classifications,
      loading: false,
      error: errors.length > 0 ? errors.join(' ') : null,
    });
  }, [canViewGateways, canViewModels]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const addGateway = useCallback(async (payload: CreateAiGatewayRequest) => {
    setSavingGateway(true);
    try {
      const created = await gatewaysApi.create(payload);
      setState((s) => ({
        ...s,
        gateways: [...s.gateways, created],
        gatewayOptions: [...s.gatewayOptions, { id: created.id, name: created.name ?? 'Untitled Gateway' }],
      }));
      return created;
    } finally {
      setSavingGateway(false);
    }
  }, []);

  const removeGateway = useCallback(async (id: string) => {
    await gatewaysApi.remove(id);
    const gateways = await gatewaysApi.list();
    setState((s) => ({
      ...s,
      gateways,
      gatewayOptions: gateways.map((g) => ({ id: g.id, name: g.name ?? 'Untitled Gateway' })),
    }));
  }, []);

  const updateGateway = useCallback(async (id: string, payload: UpdateAiGatewayRequest) => {
    setSavingGateway(true);
    try {
      const updated = await gatewaysApi.update(id, payload);
      setState((s) => ({
        ...s,
        gateways: s.gateways.map((g) => (g.id === id ? updated : g)),
        gatewayOptions: s.gatewayOptions.map((g) =>
          g.id === id ? { id: updated.id, name: updated.name ?? 'Untitled Gateway' } : g
        ),
      }));
      return updated;
    } finally {
      setSavingGateway(false);
    }
  }, []);

  const syncGatewayModels = useCallback(async (gatewayId: string) => {
    setSyncingGatewayId(gatewayId);
    setDiscoveredModelsError(null);
    try {
      const found = await gatewaysApi.syncModels(gatewayId);
      setDiscoveredModels(found);
      return found;
    } catch (err) {
      setDiscoveredModels([]);
      setDiscoveredModelsError(
        err instanceof ApiError ? err.message : 'Failed to fetch models from this gateway.'
      );
      return [];
    } finally {
      setSyncingGatewayId(null);
    }
  }, []);

  const clearDiscoveredModels = useCallback(() => {
    setDiscoveredModels([]);
    setDiscoveredModelsError(null);
  }, []);

  const addModel = useCallback(async (payload: CreateModelRegistryRequest) => {
    setSavingModel(true);
    try {
      const created = await modelRegistryApi.create(payload);
      setState((s) => ({ ...s, models: [...s.models, created] }));
      return created;
    } finally {
      setSavingModel(false);
    }
  }, []);

  const removeModel = useCallback(async (id: string) => {
    await modelRegistryApi.remove(id);
    setState((s) => ({ ...s, models: s.models.filter((m) => m.id !== id) }));
  }, []);
  

  const updateModel = useCallback(async (id: string, payload: UpdateModelRegistryRequest) => {
    setSavingModel(true);
    try {
      const updated = await modelRegistryApi.update(id, payload);
      setState((s) => ({ ...s, models: s.models.map((m) => (m.id === id ? updated : m)) }));
      return updated;
    } finally {
      setSavingModel(false);
    }
  }, []);

  const toggleModel = useCallback(async (id: string) => {
    let previous: ModelRegistryDto | undefined;
    setState((s) => {
      previous = s.models.find((m) => m.id === id);
      return {
        ...s,
        models: s.models.map((m) => (m.id === id ? { ...m, isActive: !m.isActive } : m)),
      };
    });

    if (!previous) return;

    try {
      await modelRegistryApi.update(id, {
        gatewayId: previous.gatewayId,
        name: previous.name ?? undefined,
        modelIdentifier: previous.modelIdentifier ?? undefined,
        classificationId: previous.classificationId ?? undefined,
        groupIds: previous.groupIds ?? undefined,
        isActive: !previous.isActive,
        contextLength: previous.contextLength
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        models: s.models.map((m) => (m.id === id && previous ? previous! : m)),
        error: err instanceof ApiError ? err.message : 'Failed to update model.',
      }));
    }
  }, []);

  const checkModelUsage = useCallback((id: string) => modelRegistryApi.getUsage(id), []);

  return {
    ...state,
    groups, 
    savingGateway,
    savingModel,
    syncingGatewayId,
    reload: loadAll,
    addGateway,
    removeGateway,
    updateGateway,
    syncGatewayModels,
    discoveredModels,
    discoveredModelsError,
    clearDiscoveredModels,
    addModel,
    removeModel,
    updateModel,
    toggleModel,
    checkModelUsage,
  };
}
