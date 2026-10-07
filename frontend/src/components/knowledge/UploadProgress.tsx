
import React, { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { fileHeaders, get, withKb } from '../../rag/apiClient';
import { duration } from '../../rag/ragUtils';

/* WHAT A PERSON SEES WHILE THEIR FILE IS ADDED.

   Not the machine's numbers - CPU and memory stay on the administrator's
   panel (ResourcePanel) - but the document's: which step it is on, what the
   reader found in it, and each figure as the image model explains it. All of
   it comes from the engine's job (GET /ingest/jobs, `progress`: app/
   ingest_queue.py and kb/system_resources.activity), so it is what the
   engine actually did, not an animation.

   Shown for the file being added now; once it is done the panel stays with
   the finished file, saying it is ready to ask, until the reader closes it
   or adds another. */

type Job = any;

const STEP_ORDER = ['uploaded', 'read', 'figures', 'store', 'ready'] as const;
const STEP_NAME: Record<string, string> = {
  uploaded: 'Uploaded',
  read: 'Read',
  figures: 'Explaining charts',
  store: 'Split and made searchable',
  ready: 'Ready to ask',
};

const since = (t?: number) => (t ? Math.max(0, Date.now() / 1000 - t) : 0);
const size = (n?: number) =>
  !n
    ? ''
    : n > 1024 * 1024
      ? `${(n / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(n / 1024))} KB`;

/* Closed panels, per viewer. Storage can be missing or refuse; guarded. */
const KEY = 'rag.upload.closed';
const closedIds = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') || [];
  } catch {
    return [];
  }
};
const close = (id: string) => {
  try {
    localStorage.setItem(KEY, JSON.stringify([id, ...closedIds()].slice(0, 50)));
  } catch {
    /* not remembered - fine */
  }
};

/* Which jobs get a panel: EVERY file being added now, then the ones that
   finished in the last half hour and were not closed - newest first, at most
   MAX_PANELS. It used to be one job only, so when several files were added
   together the reader saw the last one and wondered where the others went. */
const MAX_PANELS = 6;
export function jobsToShow(jobs: Job[]): Job[] {
  const running = jobs.filter((j) => j.status === 'reading' || j.status === 'adding');
  const shut = closedIds();
  const recent = jobs
    .filter((j) => (j.status === 'done' || j.status === 'failed') && j.progress && !shut.includes(j.id))
    .filter((j) => j.finished_at && Date.now() - Date.parse(j.finished_at) < 30 * 60 * 1000)
    .sort((a, b) => Date.parse(b.finished_at) - Date.parse(a.finished_at));
  return [...running, ...recent].slice(0, MAX_PANELS);
}
export function jobToShow(jobs: Job[]): Job | null {
  return jobsToShow(jobs)[0] || null;
}

const Thumb: React.FC<{ sha: string; dim?: boolean }> = ({ sha, dim }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let blob: string | null = null;
    fetch(withKb('/images/' + sha), { headers: fileHeaders() })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (b && alive) {
          blob = URL.createObjectURL(b);
          setUrl(blob);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (blob) URL.revokeObjectURL(blob);
    };
  }, [sha]);
  return url ? (
    <img
      src={url}
      alt=""
      className={`w-full h-28 object-contain rounded-lg bg-white ${dim ? 'opacity-40' : ''}`}
    />
  ) : (
    <div className="w-full h-28 rounded-lg bg-slate-800/60" />
  );
};

const Fact: React.FC<{
  value: React.ReactNode;
  label: string;
  note?: React.ReactNode;
  tone?: string;
}> = ({ value, label, note, tone = 'text-slate-500' }) => (
  <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5 min-w-0">
    <div className="text-xl font-bold text-slate-100 leading-tight">{value}</div>
    <div className="text-[11px] text-slate-400">{label}</div>
    {note && <div className={`text-[10.5px] mt-1 leading-snug ${tone}`}>{note}</div>}
  </div>
);

export const UploadProgress: React.FC<{ job: Job; others: number; onClose: () => void }> = ({
  job,
  others,
  onClose,
}) => {
  const p = job.progress || { steps: {}, found: {}, figures: [] };
  const steps = p.steps || {};
  const f = p.found || {};
  // Page order, then the order on the page once the model has numbered it.
  const figs: any[] = [...(p.figures || [])].sort(
    (a, b) => (a.page ?? 0) - (b.page ?? 0) || (a.ordinal ?? 1e9) - (b.ordinal ?? 1e9),
  );
  const running = job.status === 'reading' || job.status === 'adding';
  const failed = job.status === 'failed';
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  // Charts only appear as a step when the document has some, or the step ran.
  const order = STEP_ORDER.filter(
    (s) => s !== 'figures' || p.plan?.explain_figures || steps.figures || (f.figures || 0) > 0,
  );
  // TEXT FIRST, FIGURES ON THE SERVER: the job is done and its figures step
  // says mode "after" - the explanations are added to the same version as
  // they finish, outside this job. Their count is read from the document
  // itself (GET /documents), every few seconds until all are explained; the
  // panel used to say "none in this file" and 0/60 here.
  const afterMode = steps.figures?.mode === 'after';
  const afterCount = Number(steps.figures?.count || f.figures || 0);
  const [onServer, setOnServer] = useState<{ explained: number; failed: number } | null>(null);
  useEffect(() => {
    if (!(job.status === 'done' && afterMode && afterCount)) return;
    let alive = true;
    const look = async () => {
      try {
        const rows: any[] = await get('/documents');
        const row = (rows || []).find((r) => r.doc_key === job.doc_key);
        const im = row?.images || {};
        if (alive) setOnServer({ explained: Number(im.explained || 0), failed: Number(im.failed || 0) });
        return Number(im.explained || 0) + Number(im.failed || 0) >= afterCount;
      } catch {
        return false;
      }
    };
    let timer: any;
    const loop = async () => {
      if (!(await look()) && alive) timer = setTimeout(loop, 5000);
    };
    loop();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [job.id, job.status, afterMode, afterCount]);
  const serverLeft =
    afterMode && afterCount ? afterCount - (onServer ? onServer.explained + onServer.failed : 0) : 0;

  // A FINISHED FILE IS FINISHED. When its figures are explained after the
  // text is stored (text first: many figures), or wait for the Explain button
  // (no image model), the file is searchable while the figures step is still
  // open - that used to leave the bar half green on a file that was done.
  const finished = job.status === 'done';
  const isDone = (s: string) =>
    s === 'figures' && afterMode
      ? serverLeft <= 0 && onServer !== null
      : !!steps[s]?.done || (finished && s !== 'figures');
  const figuresOpen =
    finished && order.includes('figures') && (!steps.figures?.done || (afterMode && serverLeft > 0));
  const current = order.find((s) => !isDone(s));
  const explained = figs.filter((x) => x.status === 'explained').length;
  const reading = figs.filter((x) => x.status === 'reading').length;
  const waiting = figs.filter((x) => x.status === 'waiting').length;
  const failedFigs = figs.filter((x) => x.status === 'failed').length;
  const leftForButton = figs.filter((x) => x.status === 'pending').length;

  const detail = (s: string): string => {
    const st = steps[s] || {};
    const secs = st.done ? st.seconds : st.started ? since(st.started) : null;
    const t = secs != null ? duration(secs) : '';
    if (s === 'uploaded') return [size(st.size), t].filter(Boolean).join(' · ');
    if (s === 'read')
      return [f.pages ? `${f.pages} page${f.pages === 1 ? '' : 's'}` : '', t].filter(Boolean).join(' · ');
    if (s === 'figures') {
      if (afterMode && afterCount)
        return serverLeft > 0
          ? `${onServer ? onServer.explained : 0} of ${afterCount} · being explained on the server`
          : `${afterCount} explained on the server`;
      if (figuresOpen)
        return leftForButton && !reading && !waiting
          ? `${explained} of ${figs.length} · rest for the Explain button`
          : `${explained} of ${figs.length || f.figures || 0} · continuing on the server`;
      if (st.done && !figs.length) return 'none in this file';
      if (!st.started && !figs.length) return f.figures === 0 ? 'none in this file' : '';
      return `${explained} of ${figs.length || f.figures || 0}${t ? ' · ' + t : ''}`;
    }
    if (s === 'store') return st.done ? `${st.chunks ?? f.chunks ?? 0} parts · ${t}` : t;
    if (s === 'ready') return st.done ? 'you can ask now' : '';
    return t;
  };

  const pct = finished
    ? 100
    : Math.round(
        (order.filter((s) => isDone(s)).length / order.length) * 100 +
          (current === 'figures' && figs.length ? (explained / figs.length) * (100 / order.length) : 0),
      );

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 mb-3" data-testid="upload-progress">
      <div className="flex items-start gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-100 truncate">{job.doc_key}</div>
          <div className="text-[11px] text-slate-500">
            {running
              ? 'being added'
              : failed
                ? 'could not be added'
                : figuresOpen
                  ? 'added · searchable now · charts still being explained'
                  : 'added · ready to ask'}
            {job.submitted_by ? ` · by ${job.submitted_by}` : ''}
            {others > 0 ? ` · ${others} more file${others === 1 ? '' : 's'} waiting` : ''}
          </div>
        </div>
        {running && job.longer_than_expected ? (
          <span
            className="text-[11px] font-semibold text-amber-300 whitespace-nowrap"
            title="This step is taking longer than this engine's timings predicted. It is still working."
          >
            taking longer than expected
          </span>
        ) : running && job.done_in_s ? (
          <span className="text-[11px] font-semibold text-emerald-400 whitespace-nowrap">
            about {duration(job.done_in_s)} left
          </span>
        ) : null}
        {!running && (
          <button
            title="Close"
            className="text-slate-500 hover:text-slate-300"
            onClick={() => {
              close(job.id);
              onClose();
            }}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 1 - THE STEPS */}
      <div className="flex items-start" data-testid="upload-steps">
        {order.map((s, i) => {
          const done = isDone(s);
          const open = figuresOpen && s === 'figures';
          const now = (!done && s === current && running) || open;
          return (
            <div key={s} className="flex-1 text-center relative min-w-0">
              {i < order.length - 1 && (
                <div
                  className={`absolute top-3.5 h-0.5 ${done || open ? 'bg-emerald-500' : 'bg-slate-800'}`}
                  style={{ left: 'calc(50% + 16px)', right: 'calc(-50% + 16px)' }}
                />
              )}
              <div
                className={`w-7 h-7 rounded-full mx-auto mb-1.5 flex items-center justify-center text-xs font-bold ${
                  done
                    ? 'bg-emerald-500 text-emerald-950'
                    : now
                      ? 'bg-emerald-950 text-emerald-300 ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-900'
                      : failed && s === current
                        ? 'bg-amber-900 text-amber-200'
                        : 'bg-slate-800 text-slate-500'
                }`}
              >
                {done ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <div
                className={`text-xs font-semibold ${
                  done ? 'text-slate-200' : now ? 'text-emerald-300' : 'text-slate-500'
                }`}
              >
                {STEP_NAME[s]}
              </div>
              <div className="text-[10.5px] text-slate-500 mt-0.5 truncate px-1">{detail(s)}</div>
            </div>
          );
        })}
      </div>
      <div className="h-1.5 mt-3 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full transition-all ${failed ? 'bg-amber-500' : 'bg-emerald-500'}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      {failed && job.error && <p className="text-[11px] text-amber-400 mt-2">{job.error}</p>}

      {/* 2 - WHAT WAS FOUND */}
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mt-4 mb-2">
        What we found in this document
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2" data-testid="upload-found">
        <Fact
          value={f.pages ?? '…'}
          label={f.pages === 1 ? 'page' : 'pages'}
          note={
            f.pages != null
              ? f.scanned
                ? `${f.scanned} scanned, read by OCR`
                : 'all have text · 0 scanned'
              : 'reading…'
          }
          tone={f.scanned ? 'text-amber-400' : 'text-emerald-400'}
        />
        <Fact
          value={f.sections ?? '…'}
          label="sections"
          note={(f.section_names || []).slice(0, 3).join(' · ') || (f.sections === 0 ? 'no headings found' : '')}
        />
        <Fact value={f.tables ?? '…'} label="tables" note={f.tables ? 'kept as tables, rows and columns' : ''} />
        {afterMode && afterCount ? (
          <Fact
            value={
              <>
                {onServer ? onServer.explained : 0}
                <span className="text-sm text-slate-500">/{afterCount}</span>
              </>
            }
            label="charts explained"
            note={serverLeft > 0 ? 'on the server · added to this same version' : 'all explained'}
            tone={serverLeft > 0 ? 'text-amber-300' : 'text-emerald-400'}
          />
        ) : (
          <Fact
            value={
              !figs.length && f.figures === 0 ? (
                0
              ) : f.figures != null || figs.length ? (
                <>
                  {explained}
                  <span className="text-sm text-slate-500">/{figs.length || f.figures || 0}</span>
                </>
              ) : (
                '…'
              )
            }
            label="charts explained"
            note={
              reading || waiting
                ? `${reading} being read · ${waiting} waiting`
                : failedFigs
                  ? `${failedFigs} failed`
                  : leftForButton
                    ? `${leftForButton} left for the Explain button`
                    : figs.length
                      ? 'all explained'
                      : f.figures === 0
                        ? 'none in this file'
                        : ''
            }
            tone={failedFigs ? 'text-amber-400' : reading || waiting ? 'text-amber-300' : 'text-emerald-400'}
          />
        )}
        <Fact
          value={f.personal_data ?? '…'}
          label="personal data found"
          note={
            f.personal_data
              ? `${Object.entries(f.personal_kinds || {})
                  .map(([k, n]) => `${n} ${k}`)
                  .join(', ')}${f.personal_action === 'redact' ? ' · masked when stored' : ''}`
              : f.personal_data === 0
                ? 'no phone, PAN or account numbers'
                : ''
          }
        />
        <Fact
          value={f.chunks ?? '—'}
          label="searchable parts"
          note={f.chunks != null ? 'in the knowledge base' : 'after the steps above'}
        />
      </div>

      {/* 3 - EACH FIGURE AS THE MODEL EXPLAINS IT */}
      {figs.length > 0 && (
        <>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mt-4 mb-2 flex justify-between">
            <span>Charts and images</span>
            <span className="normal-case tracking-normal font-normal">
              each explanation is placed where the chart is in the document
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2" data-testid="upload-figures">
            {figs.map((x) => (
              <div
                key={x.sha}
                className={`rounded-xl border p-2 flex flex-col min-w-0 ${
                  x.status === 'reading' ? 'border-emerald-800' : 'border-slate-800'
                } ${x.status === 'waiting' ? 'opacity-60' : ''} bg-slate-950/60`}
              >
                <Thumb sha={x.sha} dim={x.status !== 'explained'} />
                <div className="text-xs font-semibold text-slate-200 mt-2 leading-snug">
                  {x.title || `Figure on page ${x.page ?? '?'}`}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 leading-snug flex-1">
                  {x.status === 'explained' ? (
                    x.meaning
                  ) : x.status === 'reading' ? (
                    <span className="text-emerald-400">● the model is reading this figure…</span>
                  ) : x.status === 'failed' ? (
                    <span className="text-amber-400">{x.problem || 'could not be explained'}</span>
                  ) : x.status === 'pending' ? (
                    'left for the Explain button'
                  ) : (
                    'waiting'
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-2 text-[10px]">
                  <span className="text-slate-500">page {x.page ?? '?'}</span>
                  {x.status === 'explained' &&
                    (x.doubts && x.doubts.length ? (
                      <span
                        className="px-1.5 py-0.5 rounded-full bg-amber-950 text-amber-300 font-semibold"
                        title={x.doubts.join('; ')}
                      >
                        ⚠ {x.doubts.length} unclear
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 font-semibold">
                        ✓ checked
                      </span>
                    ))}
                  {x.seconds != null && <span className="ml-auto text-slate-500">{x.seconds} s</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
