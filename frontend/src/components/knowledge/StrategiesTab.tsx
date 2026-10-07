
import React, { useEffect, useState } from 'react';
import { groupName, userGroupIds } from '../../api/groupDirectory';
import { Sliders, Trash2, Plus, Cpu, Pencil, X } from 'lucide-react';
import { get, msg, post } from '../../rag/apiClient';
import {
  configChunkers,
  configDeleteStrategy,
  configEngines,
  configSaveStrategy,
  configStrategies,
  configStrategyForEdit,
  configUpdateStrategy,
} from '../../rag/configBridge';
import {
  embeddingModels,
  imageModels,
  pipelineStages,
  StageOption,
  EmbeddingOption,
  PlatformGroup,
} from '../../rag/platformApi';
import { usePlatform } from '../../context/PlatformContext';
import { PERMISSIONS } from '../../config/permissions';
import { ChunkMethod, StorageEngine, Strategy, LIMITS } from '../../rag/ragTypes';
import { labelOf } from '../../rag/ragUtils';
import { useRag } from '../../rag/RagContext';
import {
  ConfirmDelete,
  DataTable,
  Field,
  IconButton,
  Modal,
  Panel,
  RowActions,
} from '../../rag/Overlays';
import {
  BTN,
  BTN_PRI,
  Card,
  CardTitle,
  HELP,
  INPUT,
  LABEL,
  Pill,
} from '../../rag/RagUI';

/* ------------------------------------------------------------------
   A strategy is HOW: chunking, how much evidence, guardrail, embedder, and
   which storage engine. Saved once under a name and reused by any number of
   knowledge bases.

   It deliberately does NOT hold a collection name. A strategy is shared; a
   collection is not — carrying one here would point every knowledge base built
   from this strategy at the same store, which is how two bases end up silently
   writing into each other.

   THE EMBEDDER IS THE PLATFORM'S. The list is the engine's own embedders plus
   the models ccil.aiplatform.tools_config has registered for the groups this
   person is in. A model they are not licensed for appears greyed with the
   reason rather than hidden, and is refused server-side as well, because a
   strategy is shared and a licence is not.

   EDITING. The form does two jobs now. The contract has always had PUT
   /strategies/{id} and nothing called it, so changing one number meant
   deleting the strategy and building it again — and DeleteStrategy refuses
   while any knowledge base names it. A typo in a strategy that had been used
   once was therefore permanent.

   What editing does NOT do is reach back into knowledge bases already built
   from it: ApplyStrategy copies the settings at creation, on purpose, so a
   base whose documents are already ingested is not re-configured underneath
   them. That is said on the screen, because a silent no-op is worse than a
   refusal.
------------------------------------------------------------------- */

/* HOW LONG A CHUNK MAY BE FOR THIS MODEL (engine: GET /embedding/limits).
   What the server actually reads - nomic's file says 8,192 tokens, Ollama
   reads 2,048 - times characters per token, and where retrieval was best
   (kb/embed/limits.py). Past the ceiling the end of a chunk is cut or
   averaged, so the largest chunk is checked against it. */
const ChunkLimits: React.FC<{ model: string; maxSize: number; minSize: number }> = ({
  model,
  maxSize,
  minSize,
}) => {
  const [lim, setLim] = useState<any>(null);
  useEffect(() => {
    if (!model) return;
    const t = setTimeout(() => {
      get(`/embedding/limits?model=${encodeURIComponent(model)}&max_size=${maxSize}&min_size=${minSize}`)
        .then(setLim)
        .catch(() => setLim(null));
    }, 400);
    return () => clearTimeout(t);
  }, [model, maxSize, minSize]);
  if (!lim) return null;
  if (!lim.known) {
    return (
      <p className={`${HELP} mt-2`} data-testid="chunk-limits">
        Chunk size limit for {model} not known - {lim.why}.
      </p>
    );
  }
  const n = (x: number) => x.toLocaleString();
  return (
    <div className="mt-2 text-[11px] leading-snug" data-testid="chunk-limits">
      <p className="text-slate-400">
        {lim.model} reads about {n(lim.ceiling_chars)} characters ({n(lim.context_tokens)} tokens
        {lim.declared_tokens && lim.declared_tokens !== lim.context_tokens
          ? `, though its file says ${n(lim.declared_tokens)}`
          : ''}{' '}
        × {lim.chars_per_token} characters a token): keep the largest chunk under{' '}
        {n(lim.max_chars)}. Measured: vector search alone did best at{' '}
        {n(lim.best_chars[0])}–{n(lim.best_chars[1])}; hybrid with the reranker at 3,000 -
        confirm on your documents with Compare settings. Under {n(lim.min_chars)} a chunk
        rarely holds a whole statement.
      </p>
      {(lim.advice || []).map((a: string, i: number) => (
        <p key={i} className="text-amber-400 mt-0.5">
          {a}
        </p>
      ))}
    </div>
  );
};

export const StrategiesTab: React.FC = () => {
  const { flash } = useRag();
  const { groups: directoryGroups, currentUser, hasPermission } = usePlatform();

  const [list, setList] = useState<Strategy[] | null>(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');

  /* WHO OWNS THIS RECIPE. A strategy decides which chunker splits a
     department's documents, which model embeds them and which store holds the
     result - so it belongs to a group, the same way a knowledge base does.
     Before this, every signed-in author could edit and delete every strategy
     in the platform. */
  const [chosenGroups, setChosenGroups] = useState<string[]>([]);   // group IDS
  const [engine, setEngine] = useState('own');
  const [engines, setEngines] = useState<StorageEngine[]>([]);
  const [conn, setConn] = useState<Record<string, any>>({});
  const [probe, setProbe] = useState<any>(null);
  const [methods, setMethods] = useState<ChunkMethod[]>([]);
    const [chunking, setChunking] = useState('structure');
  /* WHAT THE CHOSEN CHUNKER WAS TUNED WITH.

     The engine publishes a full description of every setting each method takes
     - label, help, type, default, bounds, unit - and this form threw all of it
     away. So a reader could choose "Fixed-size (char)" and have nowhere to say
     how many characters, and the engine quietly used 300 with an overlap of
     40. That is a real decision about how documents are cut, made by a default
     nobody could see, on the one method whose whole identity is its size. */
  const [chunkParams, setChunkParams] = useState<Record<string, any>>({});
  const [topK, setTopK] = useState<number | string>(5);
  const [guardrail, setGuardrail] = useState('bank_grade');
  const [busy, setBusy] = useState('');

  /* The strategy being edited, by its ORIGINAL name — renaming is allowed, so
     the name in the box cannot be what we address it by. Null means the form
     is building something new. */
  const [editing, setEditing] = useState<string | null>(null);
  /* The method the strategy being edited was saved with. The service lists
     every chunker and marks which are OFFERED for a new choice (docling:
     structure; own: all); a strategy on another one keeps it - it is shown,
     with its own settings, beside the offered ones, and saving it unchanged
     is accepted. Choosing a method anew offers only the offered ones. */
  const [savedChunking, setSavedChunking] = useState('');
  const offeredMethods = methods.filter((m) => m.offered !== false);
  const choosable = methods.filter(
    (m) => m.offered !== false || (editing && m.name === savedChunking),
  );
  /* THE FORM IS A MODAL NOW.

     It used to sit under the list, so building a strategy meant scrolling
     past the strategies to reach the form that adds to them, then scrolling
     back up to see the result. A form that ADDS to a list belongs on top of
     the list: the list is the thing being worked on, and it should not move
     while somebody works on it. */
  const [formOpen, setFormOpen] = useState(false);
  const [doomed, setDoomed] = useState<Strategy | null>(null);
  const [usedBy, setUsedBy] = useState(0);

  // The embedder, from the platform.
  const [embedders, setEmbedders] = useState<EmbeddingOption[]>([]);
  const [embedRef, setEmbedRef] = useState('own-tfidf');
  const [registryProblem, setRegistryProblem] = useState('');
  // The model that explains pictures. '' = OCR only, which is the default:
  // a strategy that names none still indexes every image by its words.
  const [imageModels_, setImageModels] = useState<EmbeddingOption[]>([]);
  const [imageRef, setImageRef] = useState('');
  /* HOW EVIDENCE IS FOUND, HOW IT IS ORDERED, AND IN WHICH LANGUAGE THE
     ANSWER COMES. The engine publishes the options and whether each can run
     here (/api/v1/pipeline-stages); only those that can are offered. Language
     is English only for this deployment. */
  const [retrievalOpts, setRetrievalOpts] = useState<StageOption[]>([]);
  const [rerankOpts, setRerankOpts] = useState<StageOption[]>([]);
  const [retrieval, setRetrieval] = useState('hybrid');
  const [reranking, setReranking] = useState('adaptive');
  const language = 'en';

  async function load() {
    try {
      setList(await configStrategies());
    } catch (e) {
      flash(msg(e));
    }
  }

  useEffect(() => {
    load();
    configChunkers().then(setMethods).catch(() => {});
    configEngines().then(setEngines).catch(() => {});
    embeddingModels()
      .then((reply) => {
        const options = reply.models || [];
        setEmbedders(options);
        // Default to the first thing that can actually run. Defaulting to a
        // greyed option means the Save button refuses and never says why.
        const first = options.find((m) => m.isAvailable);
        if (first) setEmbedRef(first.ref);
        setRegistryProblem(
          reply.registry?.configured ? reply.registry?.problem || '' : 'model registry not configured',
        );
      })
      .catch((e) => setRegistryProblem(msg(e)));
    imageModels()
      .then((reply) => setImageModels(reply.models || []))
      .catch(() => setImageModels([]));
    pipelineStages()
      .then((stages) => {
        const of = (name: string) =>
          ((stages.find((s) => s.stage === name) || { options: [] }).options || []).filter(
            (o) => o.isAvailable,
          );
        setRetrievalOpts(of('retrieval'));
        setRerankOpts(of('reranking'));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* The list arrives after the form's first render. If the method the form
     holds is not one that is offered (docling offers only 'structure'), move
     to the first that is - for a NEW strategy only; an edited one keeps its
     own method, which the service accepts unchanged. */
  useEffect(() => {
    if (!editing && offeredMethods.length && !offeredMethods.some((m) => m.name === chunking)) {
      setChunking(offeredMethods[0].name);
      setChunkParams(defaultsFor(offeredMethods[0].name));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [methods]);

  /** The settings the CHOSEN method takes, straight from the engine. */
  const chunkSpec = methods.find((m) => m.name === chunking)?.params || [];

  /** Every setting at its published default. Used when the method changes:
      one chunker's `size` means characters and another's means tokens, so
      carrying a value across would keep a number that no longer means what it
      did. */
  const defaultsFor = (name: string): Record<string, any> => {
    const spec = methods.find((m) => m.name === name)?.params || [];
    const out: Record<string, any> = {};
    for (const p of spec) if (p.default !== undefined) out[p.name] = p.default;
    return out;
  };

  const pickChunking = (name: string) => {
    setChunking(name);
    setChunkParams(defaultsFor(name));
  };

  const current = engines.find((e) => e.key === engine) || ({} as StorageEngine);
  const chosenEmbedder = embedders.find((m) => m.ref === embedRef);

  /* Whatever this engine calls its per-base name, it is not part of a
     strategy. */
  const perBase = ['collection', 'table', 'index', 'class_name'];
  const fields = (current.config_fields || []).filter((f) => !perBase.includes(f.name));
  const perBaseField = (current.config_fields || []).find((f) => perBase.includes(f.name));

  /* AN ENGINE THAT NEEDS NOTHING MUST NOT ASK FOR ANYTHING.

     pgvector's fields are every one of them optional: left blank it uses this
     knowledge base's own schema, on the server the engine is already connected
     to — the one from Config_AIRag.cnf. The form did not know that and printed
     Host, Port, Database, User and Password anyway, with the explanation
     squeezed underneath Host as five lines of grey text. A reader looking at
     five empty connection boxes reasonably concludes they have to be filled
     in, and goes looking for a password nobody has.

     So it is stated once, and the boxes appear only for the case they are
     actually for: putting the vectors on a SEPARATE server. */
  const optionalConn = fields.length > 0 && fields.every((f) => !f.required);
  const connFilled = fields.some((f) => conn[f.name]);
  const [separateServer, setSeparateServer] = useState(false);
  /* An edited strategy that already HAS a host is on a separate server, so its
     values are shown rather than hidden behind a toggle nobody knows to open. */
  const showConn = !optionalConn || separateServer || connFilled;

  function pickEngine(key: string) {
    const en = engines.find((x) => x.key === key);
    setEngine(key);
    setProbe(null);
    // Switching engines is a new question, so the opt-in is asked again.
    setSeparateServer(false);
    const start: Record<string, any> = {};
    ((en && en.config_fields) || []).forEach((f) => {
      if (!perBase.includes(f.name)) start[f.name] = f.default;
    });
    setConn(start);
  }

  /** Start a new one, with the form open. */
  function startNew() {
    blank();
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    blank();
  }
  function blank() {
    // THE OFFERED LIST AS IT IS NOW, not as it was when the page opened: it
    // follows the engine's reader, which can change while this page is open.
    configChunkers().then(setMethods).catch(() => {});
    setEditing(null);
    setUsedBy(0);
    setName('');
    setNote('');
     setChosenGroups([]);
    // STRUCTURE FIRST, in both modes. Measured with the engine's own parser
    // writing markdown (levels / circular, precise answers): structure 35/46
    // and 11/20, sentence-family chunkers lower (paragraph 27, recursive 31).
    // With Docling it is the only one offered. Otherwise the first offered.
    setSavedChunking('');
    const start = offeredMethods.some((m) => m.name === 'structure')
      ? 'structure'
      : (offeredMethods[0] && offeredMethods[0].name) || 'structure';
    setChunking(start);
    setChunkParams(defaultsFor(start));
    setTopK(5);
    setGuardrail('bank_grade');
    setEngine('own');
    setConn({});
    setProbe(null);
    const first = embedders.find((m) => m.isAvailable);
    setEmbedRef(first ? first.ref : 'own-tfidf');
    setImageRef('');
    setRetrieval('hybrid');
    setReranking('adaptive');
  }

  /* Loaded from the DETAIL endpoint...


  /* Loaded from the DETAIL endpoint, not from the row already on screen: the
     list carries resolved labels for reading, and every control here is keyed
     on the raw value. Feeding a <select> a label selects nothing and the first
     option quietly wins — so editing the name would also have reset the
     chunker. */
  async function edit(strategyName: string) {
    setBusy('Loading…');
    setFormOpen(true);
    configChunkers().then(setMethods).catch(() => {});   // current offer, see blank()
    try {
      const s = await configStrategyForEdit(strategyName);
      setEditing(strategyName);
      setUsedBy(s.knowledgeBaseCount);
      setName(s.name);
      setNote(s.note);
        setChunking(s.chunking);
      setSavedChunking(s.chunking);
      // What it was SAVED with, not the method's defaults - opening a strategy
      // and saving it again must not quietly retune it.
      setChunkParams({ ...defaultsFor(s.chunking), ...(s.chunkParams || {}) });
      setTopK(s.topK);
      // The IDS, straight from the row - nothing to match back, so a group
      // renamed since this strategy was saved is carried through untouched.
      setChosenGroups(s.groupIds || []);
      setEngine(s.engine);
      setConn(s.backend_config || {});
      setProbe(null);

      /* TWO CURRENCIES FOR ONE MODEL, and the form only knows one of them.
         This list is keyed on `ref` - the registry id, `m-or-embed-3-small` -
         while a saved strategy holds what the GATEWAY calls the model,
         `gateway:openai/text-embedding-3-small`, because that is what the
         engine is handed. The service does that exchange on the way in; it
         has to be undone on the way out.

         It was not. So picking a registry model and saving worked, and
         reopening the strategy showed "Own adaptive embedder" with a warning
         that the reader's own model was not one they may use - a false
         accusation about a strategy that was saved perfectly well. Worse, the
         next Update would have written that fallback in for real. */
      const stored = s.embedding || '';
      const model =
        embedders.find((m) => m.ref === stored) ||
        // The stored ref is now `gateway:<registry id>` - the id, because the
        // registry may rename an identifier and never renumbers a row.
        embedders.find((m) => 'gateway:' + m.ref === stored) ||
        // Strategies saved before that carry `gateway:<identifier>`; they
        // still reopen, and the next save writes the id.
        embedders.find(
          (m) => m.modelIdentifier && 'gateway:' + m.modelIdentifier === stored,
        );
      setEmbedRef(model ? model.ref : stored);
      // Stored as gateway:<id>; the dropdown is keyed on the id.
      const storedImage = (s.imageModel || '').replace(/^gateway:/, '');
       setImageRef(storedImage);
      setRetrieval(s.retrieval || 'hybrid');
      setReranking(s.reranking || 'adaptive');

      // The stored guardrail arrives as its LABEL.

      // The stored guardrail arrives as its LABEL. The lookup is the only
      // thing that maps one to the other, so it is asked rather than guessed.
      const known = ['bank_grade', 'strict', 'standard', 'relaxed'];
      const match = known.find(
        (g) => g === s.guardrail || g.replace('_', '-') === s.guardrail,
      );
      setGuardrail(match || 'standard');
      if (!match && s.guardrail)
        flash(`Guardrail "${s.guardrail}" was not recognised — check it before saving.`);

      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    } catch (e) {
      flash(msg(e));
    }
    setBusy('');
  }

  const admin = hasPermission(PERMISSIONS.Group.View);
  const claimedGroupIds = new Set(userGroupIds(currentUser?.groups));
  const groups = directoryGroups.map((g) => ({
    id: g.id,
    name: g.name || g.id,
    description: g.description || undefined,
    isActive: g.isActive,
    mine: claimedGroupIds.has(g.id),
  })) as PlatformGroup[];
  const selectableGroups = groups.filter((g) => g.isActive && (g.mine || admin));
  const singleGroup = selectableGroups.length === 1;

  useEffect(() => {
    if (editing === null && singleGroup && chosenGroups.length === 0) setChosenGroups([selectableGroups[0].id]);
  }, [editing, singleGroup, selectableGroups, chosenGroups.length]);

  const toggleGroup = (id: string) =>
    setChosenGroups((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  async function save() {
    if (!name.trim()) {
      flash('Give the strategy a name');
      return;
    }
    // CHECKED HERE TOO, not only on the server. The service refuses a strategy
    // with no group and says so clearly, but a form that lets somebody fill in
    // nine fields and then discovers the tenth on submit is a form that wastes
    // their time.
    if (chosenGroups.length === 0) {
      flash('Choose at least one group - a strategy is owned by a group');
      return;
    }
    setBusy(editing ? 'Updating…' : 'Saving…');
    try {
      const payload = {
        name: name.trim(),
        note: note.trim(),
        config: {
          chunking,
          // Numbers as numbers: an <input> holds a string, and "300" reaching
          // a chunker that multiplies by an overlap is a different bug in a
          // different file.
          chunk_params: Object.fromEntries(
            chunkSpec.map((p) => {
              const raw = chunkParams[p.name];
              if (p.type === 'int' || p.type === 'float') {
                const n = Number(raw);
                return [p.name, Number.isFinite(n) ? n : p.default];
              }
              return [p.name, raw === undefined ? p.default : raw];
            }),
          ),
          top_k: Number(topK) || 5,
          guardrail,
          // Both halves. The service exchanges a registry id for the model
          // identifier the engine needs; a native key travels through as is.
          embedding: embedRef,
                 embeddingSource: chosenEmbedder?.source || 'NativeList',
          imageModel: imageRef,
          retrieval,
          reranking,
          language,
        },
        storage: { vector_backend: engine, backend_config: conn },
        groupIds: chosenGroups,
      };

      if (editing) {
        await configUpdateStrategy(editing, payload);
        flash(
          usedBy > 0
                    ? `Strategy updated. The ${usedBy} knowledge base${usedBy === 1 ? '' : 's'} built from it now use${usedBy === 1 ? 's' : ''} these settings; documents already in ${usedBy === 1 ? 'it' : 'them'} keep the chunks they were split into.`
            : 'Strategy updated',
        );
      } else {
        await configSaveStrategy(payload);
          flash('Strategy saved');
      }
      // CLOSE THE MODAL. blank() resets the fields; it never closed the
      // form, so a successful save left an empty "New strategy" dialog on
      // top of the list - found by the UI walkthrough, which waited for the
      // dialog to go and saw a blank form instead. The toast said "saved";
      // the screen said "start again".
      blank();
      setFormOpen(false);
      load();
    } catch (e) {
      flash(msg(e));
    }
    setBusy('');
  }

  async function remove(n: string) {
    try {
      setDoomed(null);
      await configDeleteStrategy(n);
      flash('Strategy deleted');
      // The one on the form was just deleted; leaving it there offers an
      // Update button for a row that no longer exists.
      if (editing === n) blank();
      load();
    } catch (e) {
      // DeleteStrategy refuses while a knowledge base names it, and says
      // which ones. That sentence is the whole answer, so it is shown.
      flash(msg(e));
    }
  }

  const label = (n: string) => labelOf(methods, n);
  const fromEngine = embedders.filter((m) => m.origin === 'engine');
  const fromRegistry = embedders.filter((m) => m.origin === 'registry');

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* THE LIST IS THE SCREEN. Everything that changes it opens over the
          top of it, so this never moves and never scrolls away. */}
      <Panel
        title="Strategies"
        action={
          <button className={`${BTN_PRI} flex items-center gap-2`} onClick={startNew}>
            <Plus className="w-4 h-4" />
            <span>New strategy</span>
          </button>
        }
      >
        <DataTable
          rows={list || []}
          keyOf={(row: Strategy) => row.name}
          onRowClick={(row: Strategy) => edit(row.name)}
          empty={list ? 'No strategies yet — build the first one.' : 'Loading…'}
          columns={[
            {
              head: 'Name',
              cell: (row: Strategy) => (
                <>
                  <div className="text-xs font-semibold text-white">{row.name}</div>
                  {row.note ? (
                    <div className="text-[11px] text-slate-400 mt-0.5">{row.note}</div>
                  ) : null}
                </>
              ),
            },
            {
              head: 'Splitting',
              hide: 'sm',
              cell: (row: Strategy) => (
                <span className="text-xs text-slate-300">
                  {label((row.config || ({} as any)).chunking)}
                </span>
              ),
            },
            {
              head: 'Evidence',
              hide: 'md',
              cell: (row: Strategy) => (
                <span className="text-xs text-slate-400 font-mono">
                  top-{(row.config || ({} as any)).top_k} ·{' '}
                  {(row.config || ({} as any)).guardrail}
                </span>
              ),
            },
            {
              head: 'Vectors',
              hide: 'lg',
              cell: (row: Strategy) => (
                <span className="text-xs text-slate-400 font-mono">
                  {(row.storage || ({} as any)).vector_backend || 'own'}
                </span>
              ),
            },
            {
              head: '',
              className: 'w-24',
              cell: (row: Strategy) => (
                <RowActions>
                  <IconButton title="Edit this strategy" onClick={() => edit(row.name)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </IconButton>
                  <IconButton
                    title="Delete this strategy"
                    tone="danger"
                    onClick={() => setDoomed(row)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </IconButton>
                </RowActions>
              ),
            },
          ]}
        />
      </Panel>

      <ConfirmDelete
        open={!!doomed}
        onClose={() => setDoomed(null)}
        onConfirm={() => doomed && remove(doomed.name)}
        what="strategy"
        name={doomed ? doomed.name : ''}
        detail="Knowledge bases already built from it keep their own copy of these settings and are not affected. The configuration service refuses if one still names it."
      />

      {/* Over the top of the list, never under it. Its BODY scrolls, so a
          six-step form never moves the page behind it. */}
      <Modal
        open={formOpen}
        onClose={closeForm}
        size="lg"
        title={editing ? `Edit "${editing}"` : 'New strategy'}
        footer={
          <>
            <button className={BTN} disabled={!!busy} onClick={closeForm}>
              Cancel
            </button>
            <button
              className={`${BTN_PRI} flex items-center gap-2`}
              disabled={!!busy || !name.trim()}
              onClick={save}
            >
              <Plus className="w-4 h-4" />
              <span>{busy || (editing ? 'Update this strategy' : 'Save this strategy')}</span>
            </button>
          </>
        }
      >

          {/* Editing changes the strategy AND the bases built from it: the
            service rewrites each base's copy of the pipeline on save
            (StrategyService.UpdateAsync). This banner said the opposite - that
            they "will not change" - while the engine ran the new values. What
            does not change is a document already split: its chunks stay until
            it is added again. */}
        {editing && usedBy > 0 && (
          <div className="mb-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
            <span className="text-[11px] text-amber-200 leading-relaxed">
              <b>
                {usedBy} knowledge base{usedBy === 1 ? '' : 's'}
              </b>{' '}
              {usedBy === 1 ? 'was' : 'were'} built from this strategy and{' '}
              <b>{usedBy === 1 ? 'switches' : 'switch'} to these settings when you save</b>.
              Answering - retrieval, reranking, guardrail, top-K - changes at once for every
              document in {usedBy === 1 ? 'it' : 'them'}. How a document is split applies to
              documents added after the save: those already ingested keep their chunks until
              they are added again.
            </span>
          </div>
        )}

        {/* TWO COLUMNS, so six steps are one screenful rather than a scroll.
            The split is not arbitrary: the left column is WHAT this strategy
            is and how a document is broken up, the right is how an answer is
            judged and where the vectors go. Collapses to one column below
            `lg`, where side-by-side would just be two narrow columns. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-x-8">
        <div>
        <Field
          label="Name"
          hint="Whoever creates a knowledge base picks this strategy by this name."
          /* THE REFUSAL IS GONE, and so is the warning that announced it.

             This used to read "Renaming will be refused - N knowledge bases
             refer to this strategy by name", and it was true: the strategy's id
             was DERIVED from its name, so a rename was a new primary key and
             every base pointing at the old one would have been orphaned.

             The id comes from a permanent key now, the way a knowledge base's
             always has, so a rename is just a rename. Leaving the warning up
             would be a screen refusing something the server allows - the same
             fault in the other direction. */
          note={
            editing && usedBy > 0 && name.trim() !== editing ? (
              <span className="text-[11px] text-slate-500">
                {usedBy} knowledge base{usedBy === 1 ? '' : 's'} use this
                strategy. They stay attached — they refer to it by id, and the
                name beside each of them is updated too.
              </span>
            ) : undefined
          }
        >
          <input
            className={INPUT}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bank-grade circulars"
            maxLength={LIMITS.name}
          />
        </Field>

        <Field label="Description">
          <input
            className={INPUT}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What this is for"
            maxLength={LIMITS.description}
          />
        </Field>

        <Field
          label="Chunking method"
          hint="How a document is broken into the passages an answer is built from."
        >
          <select
            className={INPUT}
            value={chunking}
            onChange={(e) => pickChunking(e.target.value)}
          >
                  {choosable.map((m) => (
              <option key={m.name} value={m.name}>
                {m.label}
                {m.enginePending ? '  (runs as recursive for now)' : ''}
                {m.offered === false ? '  (kept from before - not offered for a new strategy)' : ''}
              </option>
            ))}
          </select>

          {/* What the chosen strategy does, in the engine's own words - and a
              plain chip when the engine runs it as a fallback. Both came from
              the API all along; the screen simply never showed them. */}
          {(() => {
            const chosen = methods.find((m) => m.name === chunking);
            if (!chosen) return null;
            return (
              <div className="mt-2 flex items-start gap-2 text-[11px] text-slate-400">
                {chosen.enginePending && (
                  <span
                    className="shrink-0 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-semibold text-amber-300"
                    title="The engine has no model attached for this strategy yet, so it splits with the recursive chunker. Your documents are still chunked - just not the way the name suggests."
                  >
                    recursive for now
                  </span>
                )}
                {chosen.description && <span>{chosen.description}</span>}
              </div>
            );
          })()}

          {/* One control per setting, in the shape the engine said it is.
              Nothing is hard-coded here: a chunker that gains a parameter
              tomorrow gets a box for it without this file changing. */}
          {chunkSpec.length > 0 && (
            <div className="mt-3 space-y-3 rounded-xl bg-slate-950/60 border border-slate-800 p-3">
              {chunkSpec.map((p) => (
                <div key={p.name}>
                  <label
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300 mb-1"
                    title={p.help}
                  >
                    {p.label || p.name}
                    {p.unit && <span className="text-slate-500 font-normal">({p.unit})</span>}
                  </label>

                  {p.type === 'bool' ? (
                    <label className="flex items-center gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        className="accent-emerald-500"
                        checked={!!chunkParams[p.name]}
                        onChange={(e) =>
                          setChunkParams({ ...chunkParams, [p.name]: e.target.checked })
                        }
                      />
                      {p.help}
                    </label>
                  ) : p.type === 'select' ? (
                    <select
                      className={INPUT}
                      value={chunkParams[p.name] ?? p.default ?? ''}
                      onChange={(e) =>
                        setChunkParams({ ...chunkParams, [p.name]: e.target.value })
                      }
                    >
                      {(p.options || []).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label || o.value}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className={INPUT}
                      type={p.type === 'text' ? 'text' : 'number'}
                      min={p.min}
                      max={p.max}
                      step={p.step}
                      value={chunkParams[p.name] ?? ''}
                      placeholder={String(p.default ?? '')}
                      onChange={(e) =>
                        setChunkParams({ ...chunkParams, [p.name]: e.target.value })
                      }
                    />
                  )}

                  {p.help && p.type !== 'bool' && (
                    <p className="text-[10px] text-slate-500 mt-1">
                      {p.help}
                      {p.min !== undefined && p.max !== undefined
                        ? ` (${p.min}–${p.max})`
                        : ''}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Field>

        <Field
          label="Top-K"
          hint="The most passages an answer may use. A ceiling, not a quota - the retrieval trace decides the real number."
        >
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={20}
              value={topK}
              onChange={(e) => setTopK(e.target.value)}
              className="flex-1 accent-emerald-500"
            />
            <span className="font-mono text-xs text-emerald-400 w-6 text-right">{topK}</span>
          </div>
        </Field>

        </div>
        <div>
        <Field
          label="Guardrail"
          hint="How sure the engine must be before it answers. bank-grade refuses unless the evidence really covers the question."
        >
          <select
            className={INPUT}
            value={guardrail}
            onChange={(e) => setGuardrail(e.target.value)}
          >
                   {['bank_grade', 'strict', 'standard', 'relaxed'].map((g) => (
              <option key={g} value={g}>
                {g.replace('_', '-')}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Retrieval"
          hint="How candidate passages are found. Hybrid fuses keyword and vector search (the measured default); keyword-only needs no embedding model at all."
        >
          <select
            className={INPUT}
            value={retrieval}
            onChange={(e) => setRetrieval(e.target.value)}
          >
            {(retrievalOpts.length ? retrievalOpts : [{ key: 'hybrid', label: 'Hybrid (RRF)' } as StageOption]).map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Reranking"
          hint="How the candidates are ordered before an answer is taken from them. Adaptive lifted the right passage to first place in 106 of 111 test questions, against 100 with none."
        >
          <select
            className={INPUT}
            value={reranking}
            onChange={(e) => setReranking(e.target.value)}
          >
            {(rerankOpts.length ? rerankOpts : [{ key: 'adaptive', label: 'Adaptive reranker' } as StageOption]).map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Language" hint="The language answers are written in. English only on this deployment.">
          <select className={INPUT} value={language} disabled>
            <option value="en">English</option>
          </select>
        </Field>

        <Field
          label="Vector store"
          hint="Where the vectors live. The collection is decided per knowledge base, not here - a shared collection name would put two bases in one store."
        >
          <select
            className={INPUT}
            value={engine}
            onChange={(e) => pickEngine(e.target.value)}
          >
              {engines.map((en) => {
                const usable = en.available || (en.driver_installed && en.needs_config);
                const tail = en.available
                  ? ''
                  : en.driver_installed && en.needs_config
                    ? ' — needs connection details'
                    : ' — not installed here';
                return (
                  <option key={en.key} value={en.key} disabled={!usable}>
                    {en.label || en.key}
                    {tail}
                  </option>
                );
              })}
          </select>

          {optionalConn && (
            <p className={`${HELP} mt-2`}>
              Uses this knowledge base&apos;s own schema, on the server from{' '}
              <span className="font-mono text-slate-300">Config_AIRag.cnf</span> — nothing to
              fill in.{' '}
              {!showConn && (
                <button
                  type="button"
                  className="text-emerald-400 hover:underline"
                  onClick={() => setSeparateServer(true)}
                >
                  Put the vectors on a separate server
                </button>
              )}
            </p>
          )}

          {fields.length > 0 && showConn && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              {fields.map((f) => (
                <div key={f.name}>
                  <label className={LABEL}>{f.label}</label>
                  <input
                    className={INPUT}
                    type={f.type === 'password' ? 'password' : 'text'}
                    value={conn[f.name] === undefined ? '' : conn[f.name]}
                    onChange={(e) => setConn({ ...conn, [f.name]: e.target.value })}
                    placeholder={String(f.default || '')}
                  />
                  {f.help && <span className="text-[10px] text-slate-500">{f.help}</span>}
                </div>
              ))}
            </div>
          )}

          {/* A password is written and never read back, so an edit cannot show
              it. Left unsaid, a blank box reads as "there is no password". */}
          {editing && fields.some((f) => f.type === 'password') && (
            <p className={`${HELP} mt-2`}>
              A stored password is never sent back, so its box is blank. Leave it empty to keep
              the one already saved.
            </p>
          )}

          {perBaseField && (
            <p className={`${HELP} mt-2.5`}>
              <b className="text-slate-200">{perBaseField.label}</b> is not set here — each
              knowledge base gets its own.
            </p>
          )}

          {current.needs_config && (
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <button className={BTN} disabled={!!busy} onClick={testConnection}>
                Test connection
              </button>
              {probe &&
                (probe.reachable ? (
                  <Pill tone="good">reachable</Pill>
                ) : (
                  <span className="flex items-center gap-2">
                    <Pill tone="crit">not reachable</Pill>
                    <span className={HELP}>{probe.reason}</span>
                  </span>
                ))}
            </div>
          )}
        </Field>

        <Field
          label="Embedding model"
          hint="The engine's own embedder needs no server and learns your corpus. The rest are the models your groups are licensed for in the platform's model registry."
        >
          <select
            className={INPUT}
            value={embedRef}
            onChange={(e) => setEmbedRef(e.target.value)}
          >
              {fromEngine.length > 0 && (
                <optgroup label="This engine">
                  {fromEngine.map((m) => (
                    <option key={m.ref} value={m.ref} disabled={!m.isAvailable}>
                      {m.name}
                      {m.isAvailable ? '' : ` — ${m.reason || 'unavailable'}`}
                    </option>
                  ))}
                </optgroup>
              )}
              {fromRegistry.length > 0 && (
                <optgroup label="Model registry">
                  {fromRegistry.map((m) => (
                    <option key={m.ref} value={m.ref} disabled={!m.isAvailable}>
                      {m.name}
                      {m.isAvailable ? '' : ` — ${m.reason || 'unavailable'}`}
                    </option>
                  ))}
                </optgroup>
              )}
          </select>

          {/* An edited strategy may hold a model this caller cannot use — the
              licence is per group and the strategy is shared. The save would
              be refused server-side; saying it here costs one round trip less. */}
          {editing && embedRef && !chosenEmbedder && (
            <p className="text-[11px] text-amber-400 mt-2.5">
              This strategy's embedder ({embedRef}) is not in the list you may use. Saving will
              be refused unless you pick another.
            </p>
          )}

          {chosenEmbedder && (
            <div className="mt-2.5 flex items-center gap-2 flex-wrap text-[11px] text-slate-400">
              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
              <Pill tone={chosenEmbedder.origin === 'registry' ? 'info' : 'muted'}>
                {chosenEmbedder.origin === 'registry' ? 'model registry' : 'engine native'}
              </Pill>
                        {chosenEmbedder.gateway && <span>via {chosenEmbedder.gateway}</span>}
            </div>
          )}
          {chosenEmbedder && chosenEmbedder.origin === 'registry' && (
            <ChunkLimits
              model={chosenEmbedder.modelIdentifier || chosenEmbedder.name}
              maxSize={Number(chunkParams.max_size ?? chunkParams.max_chars) || 0}
              minSize={Number(chunkParams.min_size ?? chunkParams.min_chars) || 0}
            />
          )}

          {fromRegistry.length === 0 && (
            <p className={`${HELP} mt-2.5`}>
              No registry models are offered here
              {registryProblem ? ` — ${registryProblem}` : ''}. The engine's own embedder still
              works and needs nothing else running.
            </p>
          )}
        </Field>

           <Field
          label="Image understanding model"
          hint={imageRef
            ? 'Explains the diagrams, tables and charts inside a document, in the place they sit, so a question can be answered from a figure.'
            : 'Optional. OCR only reads scanned pages; pick a model here only if the pictures inside documents should be described too.'}
        >
          <select
            className={INPUT}
            value={imageRef}
            onChange={(e) => setImageRef(e.target.value)}
          >
            <option value="">OCR only — scanned pages read</option>
            {imageModels_.map((m) => (
              <option key={m.ref} value={m.ref} disabled={!m.isAvailable}>
                {m.name}
                {m.isAvailable ? '' : ` — ${m.reason || 'unavailable'}`}
              </option>
            ))}
          </select>
                    {/* WHAT "OCR ONLY" REALLY DOES. The hint used to promise that every
              picture is still indexed by its OCR words; the engine does not do
              that, on purpose - measured, a figure's OCR words written into the
              text pulled text questions down (kb/process/images.pending_block).
              So say what is true. */}
          {!imageRef && (
            <p className={`${HELP} mt-2.5`}>
              OCR only: a scanned page is read by OCR and its words go into the document; a
              chart or a form is read from where its words sit. No model is called. Other
              pictures are kept as placeholders in the text. The store bar shows how many
              scanned pages were read.
            </p>
          )}
          {imageRef && (
            <p className={`${HELP} mt-2.5`}>
              Figures are explained by this model while the document is being added (up to about
              a minute); anything that did not fit waits in the store bar under Explain images.
              Every line the model writes that the words on the image do not support is marked{' '}
              <span className="font-mono">(unverified)</span>.
            </p>
          )}
        </Field>
        </div>
        </div>

        {/* LAST, AND FULL WIDTH. The mentor's call: a person fills in WHAT the
            strategy is and HOW it works first, and only then says WHOSE it
            is - ownership is the sign-off on a finished thing, not the first
            question. It sat between Name and Description before, which put a
            row of group checkboxes in front of somebody who had not yet
            decided what they were making. Outside the grid so it spans both
            columns: the groups belong to the whole strategy, not to the
            "what" column or the "how it is judged" column. */}
               <div className="mt-2 pt-4 border-t border-slate-800">
        <Field
          label="Owner groups"
          hint="The groups this strategy belongs to. Taken from your own sign-in - a strategy decides how a department's documents are cut and embedded, so it cannot belong to nobody."
        >
          {selectableGroups.length === 0 ? (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 leading-relaxed">
              Your sign-in carries no active group, so there is nothing this strategy could belong to.
              Ask an administrator to add you to a group, then sign in again.
            </div>
          ) : singleGroup ? (
            <div className="px-3 py-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-[11px] text-indigo-200">
              {selectableGroups[0].name || selectableGroups[0].id}
              <span className="text-slate-500 ml-2">Assigned from your sign-in</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {selectableGroups.map((g) => (
                <label
                  key={g.id}
                  className={`flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer
                    ${chosenGroups.includes(g.id)
                      ? 'bg-emerald-500/10 border-emerald-500/40'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700'}`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={chosenGroups.includes(g.id)}
                    onChange={() => toggleGroup(g.id)}
                  />
                  <span className="text-[11px] text-slate-200 leading-snug">
                    {g.name || g.id}
                  </span>
                </label>
              ))}
            </div>
          )}
        </Field>
        </div>

      </Modal>
    </div>
  );

  async function testConnection() {
    setBusy('Testing the connection…');
    try {
      setProbe(await post('/storage/probe', { backend: engine, config: conn }));
    } catch (e) {
      flash(msg(e));
    }
    setBusy('');
  }
};
