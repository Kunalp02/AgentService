


export interface KbSummary {
  id?: string;
  /** The CONTRACT's Guid, for PUT and DELETE. `id` is the engine's kb_ id and
      is not the same thing — one addresses the row, the other the store. */
  configId?: string;
  name: string;
  label?: string;
  /** The first group's NAME, for a one-line summary. Display only. */
  owner_group?: string;
  /** The group NAMES as they read today, resolved by the service from the
      caller's own token. Display only - never sent back, never matched on. */
  owner_groups?: string[];
  /** The group IDS the base is actually granted to. THIS is what a save sends
      back, and what survives a group being renamed. */
  owner_group_ids?: string[];
  strategyName?: string;
}

export interface StrategyConfig {
  chunking: string;
  top_k: number;
  guardrail: string;
  embedding?: string;
  /** The registry model that explains the pictures in a document, by id -
   *  or empty for OCR only. The engine receives it as `image_model`. */
  imageModel?: string;
  chunk_params?: Record<string, any>;
  retrieval?: string;
  reranking?: string;
}

export interface StrategyStorage {
  vector_backend: string;
  backend_config: Record<string, any>;
}

/** Engine-shaped strategy — what the table and the "will apply" panel read. */
export interface Strategy {
  id?: string;
  name: string;
  note: string;
  config: StrategyConfig;
  storage: StrategyStorage;
}

/** One setting a chunking method takes, exactly as the engine declares it.
 *
 * The engine has always published these - label, help, type, default, bounds
 * and unit - and the form threw them away, so somebody could choose
 * "Fixed-size (char)" and not say how many characters. It silently used 300
 * with an overlap of 40, which is a real decision about how documents are cut
 * being made by a default nobody could see. */
export interface ChunkParam {
  name: string;
  label: string;
  type: 'int' | 'float' | 'bool' | 'select' | 'text';
  default?: any;
  help?: string;
  /** int and float only. */
  min?: number;
  max?: number;
  step?: number;
  /** Printed after the box - "characters", "tokens". */
  unit?: string;
  /** select only. */
  options?: { value: string; label?: string }[];
}

export interface ChunkMethod {
  name: string;
  label: string;
  /** One line from the engine on what this strategy does - and, for a
   *  strategy that is a fallback today, what it falls back to. */
  description?: string;
  /** The engine runs this one as a fallback (no model attached yet). */
  /** The engine runs this one as a fallback (no model attached yet). */
  enginePending?: boolean;
  params?: ChunkParam[];
  /** Offered for a NEW choice with the engine's current reader. Every active
   *  chunker is listed, so a strategy that already uses one that is not
   *  offered can still be shown and edited with its own settings. */
  offered?: boolean;
}

export interface StorageEngine {
  key: string;
  label: string;
  available: boolean;
  driver_installed: boolean;
  needs_config: boolean;
  config_fields: {
    name: string;
    label: string;
    type?: string;
    default?: any;
    /** False for every field on an engine that needs no connection at all —
        which is how the form knows not to ask. */
    required?: boolean;
    secret?: boolean;
    help?: string;
  }[];
}

export interface DocumentRow {
  doc_key?: string;
  name?: string;
  version?: number;
  status?: string;
  /** The uploaded file is kept and can be downloaded. False for pasted
   *  text and for documents ingested before originals were kept. */
  has_original?: boolean;
  original?: { version: number; size_bytes: number; mime: string; sha256: string; uploaded_by: string };
  /** How far this document's pictures have got. Absent when it has none. */
  images?: { total: number; pending: number; explained: number; failed: number; decorative: number; ocr?: number } | null;
  /** Who added THIS version, and who archived the document. Empty for
   *  anything ingested before the columns existed - shown as "not recorded"
   *  rather than as nobody. */
  created_by?: string;
  deleted_by?: string;
  deleted_at?: string | null;
  /** How this document's recorded processing differs from the strategy NOW.
   *  Empty when it is up to date; `unknown` for one stored before strategies
   *  were recorded. Editing a strategy never re-splits old documents - this
   *  is what the Reingest button is for. */
  drift?: { setting: string; was: any; now: any }[];
  strategy?: {
    chunking?: string;
    embedding?: string;
    vector_backend?: string;
    fell_back?: boolean;
    requested?: string;
    pii?: string;
    /** The strategy row this version was ingested under, by name. */
    strategy_name?: string;
    /** strategy | recommendation | manual — verified by the engine. */
    source?: string;
    /** Present ONLY when the strategy said something else. Its absence means
        there was no disagreement; see KnowledgeBase._provenance. */
    strategy_chunking?: string;
    strategy_chunk_params?: Record<string, unknown>;
  };
}

export interface EvidenceItem {
  claim: string;
  source: string;
  found_by: string[];
  trust: string | number;
  contradicted_by: { claim: string; source: string }[];
}



export type RagTabKey =
  | 'strategies' | 'create' | 'manage' | 'add' | 'trace' | 'compare' | 'sql' | 'documents';


/** How long a stored name or description may be.
 *
 * MIRRORS Rag.Domain.Entities.Limits, and the SERVER is the authority - it
 * refuses anything longer with a 400 naming the field and both numbers. These
 * are here as an input AFFORDANCE, not as a validation: without them a reader
 * can type five thousand characters into a box and only find out on Save, and
 * a box that silently accepts what will be rejected is a box that lies.
 *
 * If the two ever disagree the UI is the stricter one, so the failure is a
 * valid name the box will not accept - visible and reportable - rather than an
 * invalid one that reaches the database.
 */
export const LIMITS = {
  name: 128,
  description: 1024,
} as const;
