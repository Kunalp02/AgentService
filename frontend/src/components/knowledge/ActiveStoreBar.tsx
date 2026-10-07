
import React, { useEffect, useState } from 'react';
import { groupName } from '../../api/groupDirectory';
import { AlertTriangle, Database, RefreshCw } from 'lucide-react';
import { get, post } from '../../rag/apiClient';
import { useRag } from '../../rag/RagContext';
import { Stat, StatStrip } from '../../rag/Overlays';

/* ------------------------------------------------------------------
   What the active knowledge base actually IS, on every screen.

   The page used to open with a paragraph explaining what a RAG module
   does, to somebody who had clicked into the RAG module. What a reader
   wants at that moment is the state of the thing they are about to work
   on: how much is in it, how it was split, what embedded it, and where
   the vectors live.

   All four are read from the engine's own /stats and /pipeline, so this
   is the base's REAL configuration and not the strategy's current
   settings — a base keeps the copy it was created with, and the
   difference between those two is a support call that repeats.
------------------------------------------------------------------- */

const NICE: Record<string, string> = {
  own: 'own store',
  pgvector: 'pgvector',
  'own-tfidf': 'own TF-IDF',
  'own-fusion': 'own fusion',
  'own-hypervector': 'own hypervector',
  'splade-lite': 'own SPLADE-lite',
};

const imagesHint = (i: any) =>
  `${i.explained} explained, ${i.ocr || 0} scanned pages read by OCR, ${i.pending} waiting, ${i.failed} failed, ${i.decorative} decorative (logos and rules, never sent to a model).`
  + (i.problems && i.problems.length ? ` Last problem: ${i.problems[0]}` : '')
  + ' Every line the model writes that the words on the image do not support is marked (unverified) in the text.';

const pretty = (v: string) =>
  NICE[v] || (v || '').replace(/^gateway:/, '').replace(/^.*\//, '') || '—';

export const ActiveStoreBar: React.FC<{ engineReady: boolean }> = ({ engineReady }) => {
  const { activeKb, tick, bump } = useRag();
  const [stats, setStats] = useState<any>(null);
   /* THE FIGURES ARE EXPLAINED ON THE SERVER (engine: app/explain_jobs.py).
     This bar used to run the loop itself - eight figures per request, each
     request minutes long - so leaving the screen stopped it, coming back
     showed the Explain button again with no sign of what had happened, and
     the long requests held the browser's few connections to this origin
     until every other screen said "Loading...". Now a click starts the run
     on the server and answers at once; this bar only LOOKS, a few seconds
     apart and never while the tab is hidden, so any screen, any tab and any
     person sees the same run. Explained figures join their document's
     current version - no version 2. */
  const [run, setRun] = useState<any>(null);          // GET /images/explain
  const [explainNote, setExplainNote] = useState('');
  const explaining = !!run && run.state === 'running';
  const progress = null as any;

  async function explainImages(retry = false) {
    setExplainNote('');
    try {
      setRun(await post('/images/explain', { retry }));
    } catch (e: any) {
      setExplainNote(String(e?.message || e));
    }
  }

  async function cancelExplain() {
    try {
      setRun(await post('/images/explain/cancel', {}));
    } catch (e: any) {
      setExplainNote(String(e?.message || e));
    }
  }

  /* WHILE A RUN IS GOING: its state and the numbers every 3 s. Otherwise the
     numbers every 15 s, so the bar follows uploads and other people's work
     without a reload. Nothing is asked while the tab is hidden. */
  useEffect(() => {
    if (!activeKb || !engineReady) return;
    let alive = true;
    let wasRunning = false;
    const look = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const r = await get('/images/explain');
        if (!alive) return;
        setRun(r && r.state !== 'idle' ? r : null);
        const running = r && r.state === 'running';
        const s = await get('/stats');
        if (alive) setStats(s);
        // A run that just finished changed documents: tell the other screens.
        if (wasRunning && !running) bump();
        wasRunning = !!running;
      } catch {
        /* the next look tries again */
      }
    };
    look();
    const t = setInterval(look, explaining ? 3000 : 15000);
    const onShow = () => { if (!document.hidden) look(); };
    document.addEventListener('visibilitychange', onShow);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [activeKb, engineReady, explaining]);
  const [pipeline, setPipeline] = useState<any>(null);
  const [model, setModel] = useState<any>(null);   // /pipeline/model-status
  const [busy, setBusy] = useState(false);

  /* `alive` is what stops a REPLY FOR THE WRONG STORE landing here.

     Switching knowledge base starts a new fetch while the previous one is
     still out. If the first server answers last - a slow query, a cold index,
     one base on a busier schema - its numbers arrive after the new ones and
     overwrite them, and the bar then describes a store the picker is no longer
     pointing at.

     Reproduced deterministically by delaying one base's /stats: the picker read
     "Gateway Embedding Demo 3" and the bar showed engineering-handbook's 13
     documents. Nothing errors, nothing looks wrong, and a reader makes
     decisions on those numbers - in a bank that is Risk's corpus counted under
     Engineering's name.

     The effect's cleanup runs before the next effect does, so a reply that
     belongs to a store nobody is looking at any more is dropped rather than
     rendered. */
  async function load(alive: () => boolean) {
    if (!activeKb || !engineReady) return;
    setBusy(true);
    try {
      const [s, p, m] = await Promise.all([
        get('/stats'),
        get('/pipeline'),
        // Is the embedding model reachable RIGHT NOW? One cached probe a
        // minute. Without it "Embedded with nomic-embed-text" sat beside
        // answers the model had no part in, and nobody could tell.
        get('/pipeline/model-status').catch(() => null),
      ]);
      if (!alive()) return;
      setStats(s);
      setPipeline((p && p.config) || null);
      setModel(m);
    } catch {
      /* The bar is a summary. A summary that throws is worse than one
         that is briefly blank — the screens below say what is wrong. */
    }
    if (alive()) setBusy(false);
  }

  useEffect(() => {
    let current = true;
    setStats(null);
    setPipeline(null);
    load(() => current);
    // `tick` is bumped whenever a screen changes the corpus, so the numbers
    // here follow an ingest without anybody reloading the page.
    return () => {
      current = false;
    };
  }, [activeKb, engineReady, tick]);

  if (!engineReady) {
    return (
      <div className="rounded-2xl bg-slate-900 border border-amber-500/30 shadow-xl px-4 py-3 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="text-xs text-amber-200">
          The engine is not answering, so the live numbers for this store are unavailable.
        </span>
      </div>
    );
  }

  // The pipeline carries the model's NAME beside its id (the ref is
  // gateway:<guid> now); the name is what a person reads.
  const embedding = pipeline
    ? pipeline.embedding_model_name || pretty(pipeline.embedding)
    : '—';
  const gateway = pipeline && String(pipeline.embedding || '').startsWith('gateway:');

  return (
       <StatStrip cols={stats && stats.images && stats.images.total > 0 ? 7 : 6}>
      <Stat
        label="Documents"
        value={stats ? stats.documents : busy ? '…' : '—'}
        hint="Every document this base has read, including archived ones."
      />
      <Stat
        label="Facts indexed"
        value={stats ? stats.atoms : busy ? '…' : '—'}
        tone="emerald"
        hint="Atoms — the passages an answer can be built from."
      />
      <Stat
        label="Split by"
        value={pipeline ? pretty(pipeline.chunking) : '—'}
        hint="The chunker this base was bound to when it was created."
      />
      <Stat
        label="Embedded with"
        value={embedding}
        tone={gateway ? 'amber' : 'default'}
        hint={
          gateway
            ? 'Served through the platform model gateway — entitlement is checked per person, per request.'
            : "The engine's own embedder. No model server, no key."
        }
      />
      <Stat
        label="Model reachable"
        value={
          !model ? '—'
            : model.kind === 'built-in' ? 'built-in'
            : model.available ? `yes · ${model.latency_ms ?? '?'} ms`
            : 'NO'
        }
        tone={!model ? 'default' : model.kind === 'built-in' || model.available ? 'emerald' : 'red'}
        hint={
          !model
            ? 'Not checked yet.'
            : model.kind === 'built-in'
              ? "The engine's own embedder runs in-process; nothing to reach."
              : model.available
                ? `Probed ${model.checked_at}: the gateway answered an embedding for ${model.model}.`
                : `Probed ${model.checked_at}: ${model.problem || 'no answer'}. Until it returns, hybrid answers are keyword-only and vector-only searches are refused - the reply says so.`
        }
          />
      {/* WHETHER THE EMBEDDING HAPPENED. "Facts indexed 3", "Embedded
          with nomic-embed-text", "model reachable yes" - and nothing said
          whether the three had actually been embedded by nomic, by the
          built-in after a fallback, or not at all. The vectors table held
          the answer; this is it, beside the atom count. */}
      {stats && stats.vectors && (() => {
        const v = stats.vectors;
        const rows = v.rows ?? 0;
        const atoms = v.atoms ?? 0;
        const sig = String(v.signature || '');
        const dense = sig.startsWith('dense:');
        const askedGateway = !!gateway;
        // The strategy names a gateway model but the vectors are in the
        // built-in space: a fallback happened, and this is the one place
        // it shows.
        const wrongSpace = askedGateway && !dense;
        // A dense space whose rows are NOT in the database yet is amber, not
        // green: this process has them and a restart would not.
        const unwritten = typeof v.persisted === 'number' && atoms > 0 && v.persisted < atoms;
        const tone = v.problem || wrongSpace ? 'red' : (atoms && rows < atoms) || unwritten ? 'amber' : atoms ? 'emerald' : 'default';
        const spaceName = dense ? sig.split(':')[1] : sig;
        return (
          <Stat
            label="Vectors"
            value={v.problem ? '?' : `${rows}/${atoms}`}
            tone={tone}
            hint={
              v.problem
                ? `The vector store could not be read: ${v.problem}`
                : [
                    `${rows} of ${atoms} atoms have a vector in the space "${sig}"` +
                      (v.dims ? ` (${v.dims} dimensions)` : ''),
                    dense
                      ? `Embedded by ${spaceName} - a dense space; the table is ${v.where === 'memory' ? 'in memory' : `${v.where} in this base's own schema`}.`
                      : `Embedded by the engine's built-in ${spaceName}; held in memory, no table.`,
                    typeof v.persisted === 'number'
                      ? `${v.persisted} of them are written to PostgreSQL — that is what survives a restart.`
                      : '',
                    wrongSpace
                      ? 'THE STRATEGY NAMES A GATEWAY MODEL BUT THESE VECTORS ARE NOT IN ITS SPACE - the ingest fell back. Re-ingest with the model reachable.'
                      : atoms && rows < atoms
                        ? `${atoms - rows} atom(s) have no vector yet - re-ingest, or the space changed since they were added.`
                        : '',
                  ].filter(Boolean).join(' ')
            }
          />
        );
      })()}

      <Stat
        label="Evidence bar"
        value={pipeline ? pipeline.guardrail : '—'}
        hint="bank_grade refuses rather than answering on thin evidence."
      />
      {stats && stats.images && stats.images.total > 0 && (() => {
        const im = progress || stats.images;
        // A scanned page read by OCR is DONE - its words are in the index
        // from version 1 and no model will look at it - so it counts with
        // the explained, and the caption says which is which.
        const done = im.explained + (im.ocr || 0);
        const work = done + im.pending + im.failed;
          const pct = work ? Math.round((done / work) * 100) : 100;
        /* OCR ONLY: THE STRATEGY CHOSE NOT TO EXPLAIN PICTURES, so nothing
           here talks about explaining. What OCR did - scanned pages read -
           is the figure; other pictures are simply kept as placeholders.
           The explain wording, counts and buttons belong to a strategy with
           an image model. */
        if (!im.model && !explaining) {
          return (
            <div
              className="px-4 py-3 min-w-0"
              title="OCR only on this strategy: scanned pages are read and their words indexed; other pictures stay as placeholders. Choose an image model in the strategy to have figures described."
              data-testid="images-ocr-only"
            >
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold truncate">
                Scanned pages (OCR)
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold leading-tight whitespace-nowrap text-slate-200">
                  {im.ocr || 0}
                </span>
                <span className="text-[10px] text-slate-500">read</span>
              </div>
              <div className="text-[10px] text-slate-400 leading-snug mt-1">
                OCR only
                {im.pending ? ` · ${im.pending} other picture${im.pending === 1 ? '' : 's'} kept as placeholders` : ''}
                {im.decorative ? ` · ${im.decorative} decorative skipped` : ''}
              </div>
            </div>
          );
        }
        return (
          <div className="px-4 py-3 min-w-0" title={imagesHint(im)}>

            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold truncate">
              Images
            </div>
            <div className="flex items-center gap-2">
              {explaining && <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin shrink-0" />}
                       <span
                className={`text-lg font-bold leading-tight whitespace-nowrap ${
                  im.pending && !im.model
                    ? 'text-slate-300'
                    : im.pending ? 'text-amber-300' : im.failed ? 'text-red-300' : 'text-emerald-300'
                }`}
              >
                {done}/{work}
              </span>
              <span className="text-[10px] text-slate-500">{explaining ? 'explaining' : im.ocr && !im.explained ? 'read' : 'explained'}</span>
            </div>
            {/* The bar: what is done, what failed, what is still waiting -
                three colours, always adding up to the whole, so "stuck at
                7/12" and "5 failed" never look the same. */}
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden flex">
              <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
              <div className="h-full bg-red-500" style={{ width: `${work ? (im.failed / work) * 100 : 0}%` }} />
            </div>
            <div className="text-[10px] text-slate-400 leading-snug mt-1">
              {explaining
               ? `explaining on the server… ${im.explained} done · ${im.pending} waiting${im.failed ? ` · ${im.failed} failed` : ''}${run && run.left_s ? ` · about ${Math.max(1, Math.round(run.left_s / 60))} min left` : ''}`
                            : im.pending
                  ? im.model
                  ? `${im.pending} waiting${im.ocr ? ` · ${im.ocr} scanned page${im.ocr === 1 ? '' : 's'} read by OCR` : ''}${im.failed ? ` · ${im.failed} failed` : ''}`
                  : `${im.pending} waiting`
                  : im.failed
                    ? `${im.failed} could not be explained${im.pending ? ` · ${im.pending} waiting` : ''}`
                    : `${im.ocr ? `${im.ocr} scanned page${im.ocr === 1 ? '' : 's'} read by OCR${im.explained ? ` · ${im.explained} explained` : ''}` : 'all explained'}${im.decorative ? ` · ${im.decorative} decorative skipped` : ''}`}
            </div>
            {/* WHY, in the bar itself. "4 could not be explained" with the
                reason only in a tooltip left a reader guessing whether the
                upload was still running or had failed. The engine records
                the reason per image; the last one is shown here. */}
          {(explainNote || (run && run.problem) || (im.failed > 0 && im.problems && im.problems[0])) && (
  <div className="text-[10px] text-red-300 leading-snug mt-0.5">
    {explainNote || (run && run.problem) || im.problems[0]}
  </div>
)}

{explaining && (
  <div className="flex items-center gap-1.5 mt-1.5">
    <button
      className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 whitespace-nowrap disabled:opacity-50"
      onClick={cancelExplain}
      disabled={!!run.stopping}
      title="Stop now. What was explained is kept and already searchable."
    >
      {run.stopping ? 'Stopping…' : 'Stop'}
    </button>
    <span className="text-[10px] text-slate-500">
      {run.started_by ? `started by ${run.started_by}` : ''}
      {run.reason === 'after upload' ? ' · after an upload' : ''}
    </span>
  </div>
)}
{!explaining && run && run.state === 'cancelled' && (
  <div className="text-[10px] text-slate-400 leading-snug mt-0.5">
    Stopped - {run.explained} explained and kept.
  </div>
)}

            {!explaining && im.model && (im.pending > 0 || im.failed > 0) && (
              <div className="flex gap-1.5 mt-1.5">
                {im.pending > 0 && (
                  <button
                    className="text-[11px] px-2 py-0.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white whitespace-nowrap"
                    onClick={() => explainImages(false)}
                   title="Explain the waiting pictures on the server, on your sign-in. You can leave this screen; the pictures join their documents as they are explained - no new version."
                  >
                    Explain images
                  </button>
                )}
                {im.failed > 0 && (
                  <button
                    className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 whitespace-nowrap"
                    onClick={() => explainImages(true)}
                    title="Ask again for the pictures that failed - after the gateway's credit, key or model has been fixed."
                  >
                    Retry {im.failed} failed
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })()}
    </StatStrip>
  );
};

/** The picker, kept beside the numbers it describes. */
export const StorePicker: React.FC<{
  onManage?: () => void;
}> = ({ onManage }) => {
  const { kbs, activeKb, pickKb, loading, refreshKbs } = useRag();
  const active = kbs.find((k) => k.name === activeKb);

  return (
    <div className="flex flex-wrap items-center gap-2.5 min-w-0">
      <Database className="w-4 h-4 text-emerald-400 shrink-0" />
      <select
        value={activeKb}
        onChange={(e) => pickKb(e.target.value)}
        className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-emerald-500 max-w-[16rem]"
      >
        {!kbs.length && <option value="">{loading ? 'Loading…' : 'None yet'}</option>}
        {kbs.map((k) => (
          <option key={k.name} value={k.name}>
            {k.label || k.name}
            {/* THE OWNING TEAM'S NAME. An <option> cannot carry a tooltip, so
                unlike the chips there is no id beside it - and that is right
                here: this is the line somebody reads while CHOOSING which base
                to open, and "settle1 · c71a09b2-3c2d-4b4e-8f88-1a2b3c4d5e6f"
                is what it read before, which is unreadable in a 16rem select
                and identical for every base one team owns. */}
            {k.owner_group ? ' · ' + groupName(k.owner_group) : ''}
          </option>
        ))}
      </select>

      {/* WHO OWNS THE OPEN BASE, by name. This is the bar a person looks at
          before dropping a document in, so "Engineering" and
          "c71a09b2-3c2d-4b4e-8f88-1a2b3c4d5e6f" are not equally useful
          answers to "am I about to put this in the right place".

          See api/groupDirectory.ts: the map arrives once, in the login
          response body, and the id is the fallback when a name is not
          known. It stays in the tooltip either way. */}
      {active &&
        (active.owner_groups || []).map((g) => (
          <span
            key={g}
            title={g}
            className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-semibold text-emerald-300"
          >
            {groupName(g)}
          </span>
        ))}

      {active && active.id && (
        <span
          className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-500 hidden lg:block"
          title="permanent id — this never changes, even if the knowledge base is renamed"
        >
          {active.id}
        </span>
      )}

      <button
        onClick={() => refreshKbs()}
        title="Reload the list"
        className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5" />
      </button>

      {/* The list is scoped to this caller's groups, so empty has THREE
          meanings, not one: none exist, none are theirs, or one was granted
          after this sign-in began and the token has not caught up. The third
          is the commonest and it used to be the only one the screen said
          nothing about - somebody an administrator has just added to a group
          sees exactly this, and "Create one" is the wrong advice for them. */}
      {!kbs.length && !loading && (
        <span className="text-[11px] text-amber-400">
          No knowledge base you can open.{' '}
          {onManage && (
            <button className="underline hover:text-amber-300" onClick={onManage}>
              Create one
            </button>
          )}
          <span className="text-slate-500">
            {' '}· Groups come from your sign-in — if you were just added to one,
            sign out and in again.
          </span>
        </span>
      )}
    </div>
  );
};
