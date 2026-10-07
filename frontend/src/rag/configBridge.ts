


import { cfg } from './apiClient';
import { ChunkMethod, KbSummary, Strategy, StorageEngine } from './ragTypes';

let LOOK: Promise<{ topP: any[]; vdb: any[]; chunk: any[] }> | null = null;

export function lookups() {
  if (!LOOK) {
    LOOK = (async () => {
      const [topP, vdb, chunk] = await Promise.all([
        cfg('GET', '/top-p-options'),
        cfg('GET', '/vector-db-types'),
        cfg('GET', '/chunking-methods'),
      ]);
      return { topP, vdb, chunk };
    })();

    LOOK.catch(() => {
      LOOK = null;
    });
  }
  return LOOK;
}


export const forgetLookups = () => {
  LOOK = null;
};


export const asStrategy = (s: any): Strategy => ({
  id: s.id,
  name: s.name,
  note: s.description || '',
  config: { chunking: s.chunkingLabel, top_k: s.topK, guardrail: s.topPLabel },
  storage: { vector_backend: s.vectorDbTypeName, backend_config: {} },
});


export const asChunker = (c: any): ChunkMethod => ({
  name: c.key,
  label: c.label,
  description: typeof c.description === 'string' ? c.description : '',
  enginePending: c.enginePending === true,
  params: Array.isArray(c.params) ? c.params : [],
  // absent from an older service, which listed only the offered ones
  offered: c.isOffered !== false,
});
/* The engine's /storage says which drivers are installed; the contract does not
   carry that, so nothing is marked "not installed here" — an engine that needs
   connection details still says so, which is the part that changes what you
   have to type. */
export const asEngine = (t: any): StorageEngine => ({
  key: t.name,
  label: t.name,
  available: t.isPlatformManaged,
  driver_installed: true,
  needs_config: !t.isPlatformManaged,
  config_fields: ((t.connectionSchema || {}).fields) || [],
});

export async function configStrategies(): Promise<Strategy[]> {
  const list = await cfg('GET', '/strategies?pageSize=200');
  return (list.items || []).map(asStrategy);
}

/* THE CHUNKING METHODS ARE NOT CACHED FOR THE SESSION, unlike the two lists
   above. Which of them are OFFERED follows the engine's reader: the .NET
   service re-reads it every 15 s (EngineReaderWatch) and changes the list the
   moment ingest.document_backend moves between `own` and `docling`. Cached for
   the session, a page opened while the engine read with `own` kept offering
   all 24 after it switched to Docling - and made no request at all, so the
   network tab showed nothing to explain it. Fetched each time a form needs
   them; calls that overlap share one request. */
let CHUNK: Promise<any[]> | null = null;

export async function configChunkers(): Promise<ChunkMethod[]> {
  if (!CHUNK) {
    CHUNK = cfg('GET', '/chunking-methods');
    const done = () => {
      CHUNK = null;
    };
    CHUNK.then(done, done);
  }
  return (await CHUNK).map(asChunker);
}

export async function configEngines(): Promise<StorageEngine[]> {
  return (await lookups()).vdb.map(asEngine);
}

const connSettings = (raw: any): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw || {})) {
    if (v === '' || v === null || v === undefined || v === 0 || v === false) continue;
    out[k] = String(v);
  }
  return out;
};

/** One of the contract's two named chunk numbers, or null when this chunker
    does not take it. Sent as a number, never as the string an <input> holds. */
const numberOr = (params: any, key: string): number | null => {
  const raw = (params || {})[key];
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

export async function configSaveStrategy(p: any) {
  const L = await lookups();
  const topP = L.topP.find((o: any) => o.guardrail === p.config.guardrail) || L.topP[0];
  const type = L.vdb.find((t: any) => t.name === p.storage.vector_backend) || L.vdb[0];
  const meth: any = L.chunk.find((c: any) => c.key === p.config.chunking) || {};
  const host = (p.storage.backend_config || {}).host || '';

  return cfg('POST', '/strategies', {
    name: p.name,
    description: p.note,
    chunking: {
      method: meth.method || p.config.chunking,
     
      chunkSize: numberOr(p.config.chunk_params, 'size'),
      chunkOverlap: numberOr(p.config.chunk_params, 'overlap'),
      params: p.config.chunk_params || {},
    },

    groupIds: p.groupIds || [],
    topK: p.config.top_k,
    topPOptionId: topP.id,


    embeddingModelSource: p.config.embeddingSource || 'NativeList',
    embeddingModelRef: p.config.embedding,
    

   
    imageModelRef: p.config.imageModel || null,
        retrieval: p.config.retrieval || null,
    reranking: p.config.reranking || null,
    language: p.config.language || null,

    vectorDbMode: host ? 'Own' : 'Platform',
    vectorDbTypeId: type.id,
    vectorDbConfig: {
      extraSettings: connSettings(p.storage.backend_config),
      connectionHost: host,
    },
  });
}


export async function configDeleteStrategy(name: string) {
  return cfg('DELETE', '/strategies/' + (await strategyId(name)));
}


export async function configCreateKb(p: any) {

  let strategyId: string | null = null;
  if (p.strategy) {
    try {
      strategyId = (await cfg('GET', '/strategies/' + encodeURIComponent(p.strategy))).id;
    } catch {
      strategyId = null;
    }
  }
  const made = await cfg('POST', '/knowledge-bases', {
    name: p.label,
    strategyId,
    groupIds: p.owner_groups || [],
    collectionName: p.collection || null,

    database: p.database || 'sqlite',
  });
return { created: true, name: made.slug || made.name, storage: null as any };
}


export const asKb = (k: any): KbSummary => ({
  id: k.id,
  configId: k.id,
  name: k.slug || k.name,
  label: k.name,

  owner_groups: k.groupIds || [],
  owner_group: (k.groupIds || [])[0],
  owner_group_ids: k.groupIds || [],
  strategyName: k.strategyName,
});

export async function configKnowledgeBases(): Promise<KbSummary[]> {
  const list = await cfg('GET', '/knowledge-bases?pageSize=200');
  return (list.items || []).map(asKb);
}

async function strategyId(name: string): Promise<string> {
  const found = await cfg('GET', '/strategies/' + encodeURIComponent(name));
  if (!found || !found.id) throw new Error('no strategy named ' + name);
  return found.id;
}


export async function configStrategyForEdit(name: string) {
  const [detail, L] = await Promise.all([
    cfg('GET', '/strategies/' + (await strategyId(name))) as Promise<any>,
    lookups(),
  ]);
  const vector = detail.vectorDbConfig || {};

  const option =
    L.topP.find((o: any) => o.id === detail.topPOptionId) ||
    L.topP.find((o: any) => o.label === detail.topPLabel);
  return {
    id: detail.id,
    name: detail.name,
    note: detail.description || '',
    chunking: (detail.chunking || {}).key || 'sentence',
 
    chunkParams: {
      ...((detail.chunking || {}).params || {}),
      ...((detail.chunking || {}).chunkSize !== null
        && (detail.chunking || {}).chunkSize !== undefined
        ? { size: (detail.chunking || {}).chunkSize } : {}),
      ...((detail.chunking || {}).chunkOverlap !== null
        && (detail.chunking || {}).chunkOverlap !== undefined
        ? { overlap: (detail.chunking || {}).chunkOverlap } : {}),
    },
    topK: detail.topK || 5,

    guardrail: (option && option.guardrail) || '',
    topPOptionId: detail.topPOptionId,
    embedding: detail.embeddingModelRef || 'own-tfidf',
    embeddingSource: detail.embeddingModelSource || 'NativeList',
    imageModel: detail.imageModelRef || '',
       retrieval: detail.retrieval || '',
    reranking: detail.reranking || '',
    language: detail.language || '',
    engine: detail.vectorDbTypeName || 'own',
    backend_config: {
      ...(vector.extraSettings || {}),
      ...(vector.connectionHost ? { host: vector.connectionHost } : {}),
      ...(vector.indexName ? { index: vector.indexName } : {}),
    },
    // The groups that own it, as IDS. The form re-sends these on save, so a
    // group renamed since is carried through untouched - there is nothing to
    // match back.
    groupIds: detail.groupIds || [],
    knowledgeBaseCount: detail.knowledgeBaseCount || 0,
  };
}

/** The same body as configSaveStrategy, through PUT. */
export async function configUpdateStrategy(originalName: string, p: any) {
  const L = await lookups();
  const topP = L.topP.find((o: any) => o.guardrail === p.config.guardrail) || L.topP[0];
  const type = L.vdb.find((t: any) => t.name === p.storage.vector_backend) || L.vdb[0];
  const meth: any = L.chunk.find((c: any) => c.key === p.config.chunking) || {};
  const host = (p.storage.backend_config || {}).host || '';

  return cfg('PUT', '/strategies/' + (await strategyId(originalName)), {
    name: p.name,
    description: p.note,
    chunking: {
      method: meth.method || p.config.chunking,
      /* WHAT THE READER ACTUALLY CHOSE. These three were hard-coded to
         null/empty, so "Fixed-size (char)" was saved with no size and the
         engine fell back to 300 characters with an overlap of 40 - a real
         decision about how documents are cut, made by a default nobody could
         see or change.

         chunkSize and chunkOverlap are the contract's two named fields; every
         other setting a chunker takes rides in `params`, which is why both are
         sent rather than one. */
      chunkSize: numberOr(p.config.chunk_params, 'size'),
      chunkOverlap: numberOr(p.config.chunk_params, 'overlap'),
      params: p.config.chunk_params || {},
    },
    // THE GROUPS THAT WILL OWN IT. A strategy is scoped the same way a
    // knowledge base is now: it decides which chunker splits a department's
    // documents and which store holds the result, so it cannot belong to
    // nobody. The service refuses a body without one.
    groupIds: p.groupIds || [],
    topK: p.config.top_k,
    topPOptionId: topP.id,
    embeddingModelSource: p.config.embeddingSource || 'NativeList',
    embeddingModelRef: p.config.embedding,
    imageModelRef: p.config.imageModel || null,

    retrieval: p.config.retrieval || null,
    reranking: p.config.reranking || null,
    language: p.config.language || null,
        vectorDbMode: host ? 'Own' : 'Platform',
    vectorDbTypeId: type.id,
    vectorDbConfig: {
      extraSettings: connSettings(p.storage.backend_config),
      connectionHost: host,
    },
  });
}

/* Knowledge bases. `id` here is the contract's Guid, which KbOut puts on
   every row — not the slug and not the engine's kb_ id. */
export async function configUpdateKb(id: string, p: any) {
  const list = await cfg('GET', '/strategies?pageSize=200');
  const found = (list.items || []).find((x: any) => x.name === p.strategy);
  return cfg('PUT', '/knowledge-bases/' + id, {
    name: p.label,
    strategyId: found ? found.id : null,
    groupIds: p.owner_groups || [],
    collectionName: p.collection || null,
    // Not sent on update by design — UpdateKnowledgeBase ignores it. Moving a
    // base between engines is a migration, not a form field.
  });
}

export const configDeleteKb = (id: string) => cfg('DELETE', '/knowledge-bases/' + id);
