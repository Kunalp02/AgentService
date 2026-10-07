
import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ListOrdered, RotateCcw, X } from 'lucide-react';
import { get, msg, post } from '../../rag/apiClient';
import { duration } from '../../rag/ragUtils';
import { useRag } from '../../rag/RagContext';
import { Card, CardTitle, HELP } from '../../rag/RagUI';
import { UploadProgress, jobsToShow } from './UploadProgress';
/* THE SERVER'S INGEST QUEUE FOR THIS BASE (engine: app/ingest_queue.py).

   Files are added by the engine, not by this tab: close it, refresh, sign
   out, and the queue carries on. This panel only WATCHES - every few seconds
   while anything is running, rarely when nothing is - so opening the screen
   on another machine shows the same state. A job whose registry model needs
   its owner waits for them to sign in again and then continues by itself. */

const TONE: Record<string, string> = {
  queued: 'text-slate-300 bg-slate-800',
  reading: 'text-cyan-300 bg-cyan-950/60',
  adding: 'text-emerald-300 bg-emerald-950/60',
  done: 'text-emerald-400 bg-emerald-950/40',
  failed: 'text-amber-300 bg-amber-950/50',
  cancelled: 'text-slate-500 bg-slate-900',
  waiting_for_owner: 'text-violet-300 bg-violet-950/60',
};
const WORD: Record<string, string> = { waiting_for_owner: 'waiting for sign-in' };
const ACTIVE = ['queued', 'reading', 'adding', 'waiting_for_owner'];

const since = (iso?: string) => (iso ? Math.max(0, (Date.now() - Date.parse(iso)) / 1000) : 0);

/* The day a finished job belongs to, as a reader says it. */
const dayOf = (iso?: string) => {
  if (!iso) return 'Earlier';
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(new Date()) - start(d)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};
const timeOf = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';

/* Per-viewer conveniences only - which groups are folded. Browser storage can
   be missing or refuse (private windows), so every access is guarded. */
const KEY = 'rag.queue.folded';
const readFolded = (): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
};
const saveFolded = (v: Record<string, boolean>) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* not remembered - fine */
  }
};

export const IngestQueue: React.FC<{ refreshKey?: number }> = ({ refreshKey }) => {
  const { bump, flash } = useRag();
  const [view, setView] = useState<any>(null);
  const [, tick] = useState(0);
  const done = useRef<Set<string>>(new Set());
  // THE LIST GREW WITH EVERY FILE EVER ADDED. Grouped by day, folded except
  // what is running and today's; the whole card folds to its summary line.
  const [folded, setFolded] = useState<Record<string, boolean>>(readFolded);
  const fold = (k: string, v: boolean) => {
    const next = { ...folded, [k]: v };
    setFolded(next);
    saveFolded(next);
  };
  const first = useRef(true);
  const [, closed] = useState(0);

  const load = () =>
    get('/ingest/jobs?limit=100')
      .then((v) => {
        // A job that finished since the last look: the documents list and the
        // counts elsewhere on the screen are stale now.
        let fresh = false;
        for (const j of v.jobs || []) {
          if (j.status === 'done' && !done.current.has(j.id)) {
            if (!first.current) fresh = true;
            done.current.add(j.id);
          }
        }
        first.current = false;
        if (fresh) bump();
        setView(v);
      })
      .catch(() => {});

  const busy = (view?.jobs || []).some(
    (j: any) => ACTIVE.includes(j.status) && j.status !== 'waiting_for_owner',
  );

   useEffect(() => {
    load();
    // Not while the tab is hidden: every open tab of this app shares the
    // browser's few connections to this origin, and a hidden tab polling
    // them is how other screens ended up waiting on "Loading...".
    const t = setInterval(() => {
      if (!document.hidden) load();
    }, busy ? 3000 : 15000);
    const onShow = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onShow);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onShow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, refreshKey]);

  // the elapsed clocks move between polls
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const act = async (id: string, what: 'cancel' | 'retry') => {
    try {
      await post(`/ingest/jobs/${id}/${what}`);
      load();
    } catch (e) {
      flash(msg(e));
    }
  };

  const jobs: any[] = view?.jobs || [];
  if (!jobs.length) return null;
  const c = view.counts || {};
  const waiting = (c.queued || 0) + (c.reading || 0) + (c.adding || 0);
  const open = !folded.__card;
  const active = jobs.filter((j) => ACTIVE.includes(j.status));
  const groups: { day: string; jobs: any[] }[] = [{ day: 'In progress', jobs: active }];
  for (const j of jobs.filter((x) => !ACTIVE.includes(x.status))) {
    const day = dayOf(j.finished_at || j.created_at);
    const g = groups.find((x) => x.day === day);
    if (g) g.jobs.push(j);
    else groups.push({ day, jobs: [j] });
  }
  const isFolded = (day: string) =>
    day === 'In progress' ? false : day in folded ? folded[day] : day !== 'Today';

  const shown = jobsToShow(jobs);
  const queued = jobs.filter((j) => j.status === 'queued').length;
  return (
    <>
    {shown.map((job, i) => (
      <UploadProgress
        key={job.id}
        job={job}
        others={i === 0 ? queued : 0}
        onClose={() => closed((n) => n + 1)}
      />
    ))}
    <Card>
       <div className="flex items-center gap-2">
        <ListOrdered className="w-4 h-4 text-emerald-400" />
        <CardTitle>
          {view?.queue === 'off' ? 'Added files — queue is off' : 'Ingest queue — on the server'}
        </CardTitle>
        <button
          className="ml-auto text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
          onClick={() => fold('__card', open)}
          data-testid="queue-fold"
        >
          {open ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
          {open ? 'Collapse' : `Show ${jobs.length} file${jobs.length === 1 ? '' : 's'}`}
        </button>
      </div>
      <p className={`${HELP} mt-1`} data-testid="queue-summary">
         {waiting
          ? `${waiting} file${waiting === 1 ? '' : 's'} in progress or waiting` +
            (view.queue_done_in_s ? ` · all done in about ${duration(view.queue_done_in_s)}` : '') +
            (view.queue === 'off'
              ? '. The queue is off (config.yaml ingest.queue): keep this page open until each file is added.'
              : '. You can close this page or sign out — the server keeps going.')
          : 'Nothing running.'}
        {c.waiting_for_owner
          ? ` ${c.waiting_for_owner} read and waiting for their owner to sign in (the embedding model is used on their behalf); they continue on their own after that.`
          : ''}
      </p>

      {open && (
        <div className="mt-3 space-y-2" data-testid="queue-jobs">
          {groups
            .filter((g) => g.jobs.length)
            .map((g) => {
              const shut = isFolded(g.day);
              const failed = g.jobs.filter((j) => j.status === 'failed').length;
              return (
                <div key={g.day} className="rounded-lg border border-slate-800">
                  <button
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-slate-300 hover:bg-slate-800/50"
                    onClick={() => g.day !== 'In progress' && fold(g.day, !shut)}
                    data-testid="queue-group"
                  >
                    {shut ? (
                      <ChevronRight className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                    <span className="font-semibold">{g.day}</span>
                    <span className="text-slate-500">
                      · {g.jobs.length} file{g.jobs.length === 1 ? '' : 's'}
                      {failed ? ` · ${failed} failed` : ''}
                    </span>
                  </button>
                  {!shut && (
                    <div className="divide-y divide-slate-800 px-3">
                      {g.jobs.map((j) => {
                        const running = j.status === 'reading' || j.status === 'adding';
                        const r = j.result || {};
                        return (
                          <div key={j.id} className="py-2 text-xs">
                            <div className="flex items-center gap-3">
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase ${
                                  TONE[j.status] || ''
                                }`}
                              >
                                {WORD[j.status] || j.status}
                              </span>
                              <span className="flex-1 min-w-0 truncate text-slate-200">
                                {j.doc_key}
                              </span>
                              <span
                                className="text-slate-600 font-mono whitespace-nowrap"
                                title={j.finished_at || j.created_at}
                              >
                                {timeOf(j.finished_at || j.started_at || j.created_at)}
                              </span>
                              <span className="text-slate-500 font-mono">
                                {j.status === 'queued' && j.position
                                  ? `#${j.position} · starts in ~${duration(j.starts_in_s || 0)}`
                    : running
                      ? `${duration(since(j.started_at))}${
                          j.longer_than_expected
                            ? ' · longer than expected'
                            : j.done_in_s
                              ? ` · ~${duration(j.done_in_s)} left`
                              : ''
                        }`
                                    : j.status === 'done' && j.started_at && j.finished_at
                                      ? duration(
                                          (Date.parse(j.finished_at) - Date.parse(j.started_at)) /
                                            1000,
                                        )
                                      : ''}
                              </span>
                              {(j.status === 'queued' ||
                                running ||
                                j.status === 'waiting_for_owner') && (
                                <button
                                  title="Cancel"
                                  className="text-slate-500 hover:text-amber-300"
                                  onClick={() => act(j.id, 'cancel')}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {(j.status === 'failed' || j.status === 'cancelled') && (
                                <button
                                  title="Try again"
                                  className="text-slate-500 hover:text-emerald-300"
                                  onClick={() => act(j.id, 'retry')}
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 pl-1">
                              {j.status === 'done' ? (
                                r.changed === false ? (
                                  'already here, unchanged — nothing re-split'
                                ) : (
                                  `${r.chunks ?? 0} chunk${r.chunks === 1 ? '' : 's'} · split by ${
                                    r.used_pipeline || 'the strategy'
                                  }` +
                                  (r.read?.pages ? ` · ${r.read.pages} pages` : '') +
                                  (r.read?.read_seconds != null
                                    ? ` · read in ${duration(r.read.read_seconds)}`
                                    : '')
                                )
                              ) : j.error && j.status !== 'waiting_for_owner' ? (
                                <span className="text-amber-400">{j.error}</span>
                              ) : (
                                j.stage
                              )}
                              {j.submitted_by ? (
                                <span className="text-slate-600"> · by {j.submitted_by}</span>
                              ) : null}
                            </p>
                            {/* DOCLING CHOSEN, OURS USED. The file was read anyway - an
                                outage must not lose a document - but a stopped docling-serve
                                looked exactly like a good day. The engine says which reader
                                ran and why (app/routes/documents._reader_report). */}
                            {j.status === 'done' && r.read?.reader?.fellBack && (
                              <p className="text-[11px] text-amber-400 mt-0.5 pl-1">
                                Not read by Docling:{' '}
                                {r.read.reader.why || "the engine's own parser read it instead"}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                         </div>
          );
        })}
      </div>
      )}
    </Card>
    </>
  );
};
