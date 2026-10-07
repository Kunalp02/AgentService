
import { cfg } from './apiClient';
import { hasNames } from '../api/groupDirectory';



export interface PlatformGroup {
  id: string;
  name: string;
  description?: string;
  isActive?: boolean;

  mine: boolean;
}

export interface GroupsReply {
  source: string;
  authoritative: boolean;
  problem?: string;
  groups: PlatformGroup[];

  fromToken?: boolean;
}

export interface EmbeddingOption {
  /** What to send back as embeddingModelRef: an engine key, or a registry id. */
  ref: string;
  name: string;
  /** "NativeList" (the engine's own) or "ModelRegistry" (Yash's registry). */
  source: string;
  isAvailable: boolean;
  reason?: string;
  origin: 'engine' | 'registry';
  gateway?: string | null;
  /** What the GATEWAY calls this model. A saved strategy holds
      `gateway:<modelIdentifier>`, while this list is keyed on `ref` (the
      registry id) — so reopening a saved strategy has to come back through
      this field. See StrategiesTab.edit. */
  modelIdentifier?: string | null;
}

export interface EmbeddingReply {
  models: EmbeddingOption[];
  registry: { configured: boolean; url: string; problem?: string | null };
}

export interface SessionReply {
  authenticated: boolean;
  username?: string;
  roleProfile?: string;
  permissions: string[];
  isAdminScoped: boolean;
  claimedGroups: string[];
  groups: { id: string; name: string; mine: boolean }[];
  services: {
    auth: { configured: boolean; url: string; problem?: string | null };
    tools: { configured: boolean; url: string; problem?: string | null };
  };
}

export const platformGroups = (): Promise<GroupsReply> => cfg('GET', '/groups');


export const groupsReadAsIds = (reply: GroupsReply): string =>
  reply.groups.length > 0
  && reply.groups.every((g) => g.name === g.id)
  && !hasNames(reply.groups.map((g) => g.id))
    ? 'Group names are not available in this session, so each group is shown '
      + 'as its id. The names arrive with your sign-in; signing out and in '
      + 'again will restore them.'
    : '';

export const embeddingModels = (): Promise<EmbeddingReply> => cfg('GET', '/embedding-models');

/** The registry models that can read an image - same reply shape, so the
 *  strategy form's second dropdown is the first one's twin. */
export const imageModels = (): Promise<EmbeddingReply> => cfg('GET', '/image-models');

/** The engine's own options for each pipeline stage - retrieval, reranking,
 *  language - with whether each one can run here. */
export interface StageOption {
  key: string;
  label: string;
  isAvailable: boolean;
  reason: string;
}
export const pipelineStages = (): Promise<{ stage: string; options: StageOption[] }[]> =>
  cfg('GET', '/pipeline-stages');

export const mySession = (): Promise<SessionReply> => cfg('GET', '/my/session');
