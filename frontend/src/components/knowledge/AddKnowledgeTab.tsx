
import React, { useEffect, useRef, useState } from 'react';
import { FileText, Database, Upload, CheckCircle2, Globe } from 'lucide-react';
import { get, msg, post } from '../../rag/apiClient';
import { ChunkMethod } from '../../rag/ragTypes';
import { duration, fileSize, labelOf, pdfPages, readFile } from '../../rag/ragUtils';
import { useRag } from '../../rag/RagContext';
import { Bar, BTN, BTN_PRI, Card, CardTitle, EtaBar, HELP } from '../../rag/RagUI';
import { ConnectDatabase } from './ConnectDatabase';
import { StagedFiles } from './StagedFiles';

import { IngestQueue } from './IngestQueue';

/* Two places knowledge can come from. Pick one. */

/** A chunker's parameters as a reader sees them - "max_size: 2000 · context:
 *  yes" - in a stable order, instead of raw JSON: the JSON had no spaces to
 *  break at, ran out of its card and was printed over the card beside it. */
const paramsText = (params: Record<string, unknown>): string => {
  const keys = Object.keys(params || {}).sort();
  if (!keys.length) return 'defaults';
  return keys
    .map((k) => {
      const v = params[k];
      return `${k}: ${v === true ? 'yes' : v === false ? 'no' : String(v)}`;
    })
    .join(' · ');
};

export const AddKnowledgeTab: React.FC = () => {
  const [src, setSrc] = useState<'files' | 'db' | null>(null);

  const tile = (
    key: 'files' | 'db',
    icon: React.ReactNode,
    title: string,
    detail: string,
  ) => (
    <button
      onClick={() => setSrc(key)}
      className={`p-5 rounded-2xl border text-left transition-all ${
        src === key
          ? 'bg-emerald-950/40 border-emerald-500/50 shadow-lg shadow-emerald-600/10'
          : 'bg-slate-900 border-slate-800 hover:border-slate-700'
      }`}
    >
      <div className="mb-2.5">{icon}</div>
      <div className="font-bold text-sm text-white">{title}</div>
      <div className={`${HELP} mt-1`}>{detail}</div>
    </button>
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tile(
          'files',
          <FileText className="w-6 h-6 text-emerald-400" />,
          'Files or a web address',
          'PDF, Word, Excel, PowerPoint, email, text, ZIP, CHM - or a URL.',
        )}
        {tile(
          'db',
          <Database className="w-6 h-6 text-cyan-400" />,
          'A database',
          'Ask questions in plain English. Read-only, always.',
        )}
      </div>

      {src === 'files' && <FromFiles />}
      {src === 'db' && <ConnectDatabase />}
    </div>
  );
};

/* ------------------------------------------------------------------ */

const FromFiles: React.FC = () => {
  const { flash, bump } = useRag();

  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const [reading, setReading] = useState('');
  const [plan, setPlan] = useState<any>(null); // the recommended pipeline
  const [useRec, setUseRec] = useState(false);   // the reader took it for these files
  const [saved, setSaved] = useState<any>(null); // the strategy chosen in Set up
  const [methods, setMethods] = useState<ChunkMethod[]>([]);
  const [busy, setBusy] = useState('');
  const [queued, setQueued] = useState(0); // bumps the queue panel after a submit
  /* Files the engine would not read, and WHY - by name.

     This used to be a toast and nothing else. A toast is gone in four
     seconds, and what stayed on the screen was the refused file sitting in
     the list looking exactly like the six that were fine, above a button
     offering to add all seven. */
  const [refused, setRefused] = useState<Record<string, string>>({});
  // What /extract found inside each file: how many pictures, how many will
  // be explained, how many were the letterhead. Said beside the file at
  // once, so "5 images found, 4 to explain" is known before Add is clicked.
  const [pictures, setPictures] = useState<Record<string, any>>({});
  /* HOW LONG THE WAIT WILL BE. POST /estimate answers from rates this engine
     has timed (kb/ingest_estimate.py); after every file the rest of the
     estimate is scaled by how the files so far actually went. */
  const [wait, setWait] = useState<{
    label: string;
    startedAt: number;
    estimate: number;
    basis: string;
  } | null>(null);
  const [perFile, setPerFile] = useState<Record<string, { read_s: number; ingest_s: number }>>({});
  const [readInfo, setReadInfo] = useState<Record<string, { chars: number; figures: number }>>({});
  const input = useRef<HTMLInputElement>(null);

  /* One estimate call; never fatal - no estimate is a plain spinner. */
  async function estimateFor(
    list: { name: string; size: number; pages?: number; chars?: number; figures?: number }[],
  ): Promise<any | null> {
    try {
      return await post('/estimate', { files: list });
    } catch {
      return null;
    }
  }

  /* Scale what is left by how the files so far went against their estimate. */
  const replan = (startedAt: number, predictedDone: number, predictedLeft: number) => {
    const actual = (Date.now() - startedAt) / 1000;
    const ratio = predictedDone > 0 ? Math.min(5, Math.max(0.2, actual / predictedDone)) : 1;
    return actual + predictedLeft * ratio;
  };

  useEffect(() => {
    get('/chunkers').then(setMethods).catch(() => {});
    get('/pipeline')
      .then((p) => setSaved(p.config))
      .catch(() => {});
  }, []);

  const label = (n: string) => labelOf(methods, n);

  /* What actually gets used. The strategy saved in the knowledge base is
     the default and stays the default: switching to the recommendation on
     arrival threw away a decision the reader had already made, silently,
     one screen earlier. */
  const strategyChunking = (saved && saved.chunking) || 'sentence';
  const chunking = useRec && plan ? plan.config.chunking : strategyChunking;

  /* Dropping files only LISTS them, with how long each should take. Nothing
     is read in this tab any more unless the reader asks to compare the
     chunking first (readFirst); the normal path hands the files to the
     server's queue (queueAll). */
  async function take(list: FileList | null) {
    const picked = Array.from(list || []);
    if (!picked.length) return;
    setFiles(picked);
    setPlan(null);
    setRefused({});
    setPictures({});
    const pages = await Promise.all(picked.map(pdfPages));
    const est = await estimateFor(
      picked.map((f, i) => ({ name: f.name, size: f.size, pages: pages[i] })),
    );
    if (est) setPerFile(Object.fromEntries(picked.map((f, i) => [f.name, est.files[i]])));
  }

  /* THE NORMAL PATH: upload each file into the server's ingest queue and
     let go. Uploading is seconds; the reading and adding happen on the
     server whether or not this tab stays open. */
  async function queueAll(list: File[] = files, extra: any = { source: 'strategy' }, staged = false) {
    const failed: string[] = [];
    for (let i = 0; i < list.length; i++) {
      setBusy(`Uploading ${list[i].name} (${i + 1} of ${list.length})…`);
      try {
        // staged = read in this tab already (readFirst): only the add is left
        const b64 = staged ? '' : await readFile(list[i]);
        await post('/ingest/jobs', { doc_key: list[i].name, content_base64: b64, ...extra });
      } catch (e) {
        failed.push(list[i].name);
        flash(list[i].name + ': ' + msg(e));
      }
    }
    setBusy('');
    const sent = list.length - failed.length;
    if (sent)
      flash(
        `${sent} file${sent === 1 ? '' : 's'} queued on the server — progress below; you can close this page.`,
      );
    setFiles([]);
    setPlan(null);
    setRefused({});
    setPictures({});
    setReadInfo({});
    setQueued((n) => n + 1);
  }

  /* THE OTHER PATH: read here first, to see what is inside and how the
     recommender would split it, before anything is added. */
  async function readFirst() {
    const picked = files;
    if (!picked.length) return;
    try {
      // Stage every file first: the whole extracted text is held
      // server-side, so the recommendation is made on the real document
      // and not on a preview.
      //
      // A file the engine will not read is refused HERE, with its reason,
      // and is then excluded from everything downstream: it is not counted
      // in the button, not offered to the recommender, and not ingested.
      let first: string | null = null;
      const bad: Record<string, string> = {};
      const seen: Record<string, any> = {};
      const info: Record<string, { chars: number; figures: number }> = {};
      const pages = await Promise.all(picked.map(pdfPages));
      const est = await estimateFor(
        picked.map((f, i) => ({ name: f.name, size: f.size, pages: pages[i] })),
      );
      const reads: number[] = picked.map((_f, i) => (est ? est.files[i].read_s : 0));
      const startedAt = Date.now();
      let doneRead = 0;
      if (est) {
        setPerFile(Object.fromEntries(picked.map((f, i) => [f.name, est.files[i]])));
      }
      for (let i = 0; i < picked.length; i++) {
        const f = picked[i];
        const label = `Reading ${f.name} (${i + 1} of ${picked.length})`;
        setReading(label);
        if (est) {
          const left = reads.slice(i).reduce((a, b) => a + b, 0);
          setWait({
            label,
            startedAt,
            estimate: i === 0 ? est.read_s : replan(startedAt, doneRead, left),
            basis: est.basis,
          });
        }
        const b64 = await readFile(f);
        let r: any;
        try {
          r = await post('/extract', { doc_key: f.name, content_base64: b64, stage: true });
        } catch (e) {
          // One unreadable file must not cost the reader the other six.
          bad[f.name] = msg(e);
          continue;
        }
        if (r && r.error) {
          bad[f.name] = r.error;
          continue;
        }
        doneRead += reads[i];
        if (r && r.images && r.images.total) seen[f.name] = r.images;
        info[f.name] = {
          chars: r.chars || 0,
          figures: (r.images && r.images.model && r.images.pending) || 0,
        };
        // The FIRST READABLE one, not the first one. Recommending from a
        // file that was refused asks the engine to classify a document it
        // never staged, and it answered "Scanned / image" - for a batch
        // whose readable files were plain policy text.
        if (first === null) first = f.name;
      }
      setWait(null);
      setRefused(bad);
      setPictures(seen);
      setReadInfo(info);

      if (first === null) {
        setReading('');
        flash(
          picked.length === 1
            ? 'That file could not be read - the reason is beside it.'
            : 'None of those files could be read - the reasons are beside them.',
        );
        return;
      }

      setReading('Working out the best way to split these documents…');
      const rec = await post('/pipeline/recommend?verify=false', { doc_key: first });
      // Offered, not applied. The reader opts in below.
      setPlan(rec);
      setUseRec(false);            // offered, never applied on arrival
      setReading('');
    } catch (e) {
      setReading('');
      setWait(null);
      flash(msg(e));
    }
  }

  /* A WEB ADDRESS, the URL twin of a file. The ENGINE fetches it (inside the
     bank's network, with its own checks: scheme, private ranges, every
     redirect, a size cap - kb/ingest/web_fetch.py), reads the bytes with the
     same document backend as an upload (Docling for a PDF or a page), and
     stages the text. The staged page then goes through the same server queue
     as a file, with no bytes to send. */
  const [url, setUrl] = useState('');
  const [urlBusy, setUrlBusy] = useState('');
  async function fromUrl() {
    const address = url.trim();
    if (!address) return;
    setUrlBusy('Fetching ' + address + '…');
    try {
      const r = await post('/fetch', { url: address, queue: true });
      if (r && r.error) {
        flash(address + ': ' + r.error);
        return;
      }
      const kb = r.fetched ? Math.max(1, Math.round((r.fetched.bytes || 0) / 1024)) : 0;
      flash(`${r.doc_key} queued on the server (${kb} KB fetched) — it is read there. Progress below.`);
      setUrl('');
      setQueued((n) => n + 1);
    } catch (e) {
      flash(msg(e));
    } finally {
      setUrlBusy('');
    }
  }

  /* Only the files that actually read. Everything downstream counts these. */
  const readable = files.filter((f) => !refused[f.name]);

  /* ADD WHAT WAS READ - through the same server queue. The files are
     already staged, so each job only splits, embeds and stores; the chunker
     chosen here travels with each job and is recorded on the document. */
  async function ingest() {
    const body = useRec && plan
      ? {
          chunking: plan.config.chunking,
          chunk_params: plan.config.chunk_params || {},
          source: 'recommendation',
        }
      : { source: 'strategy' };
    await queueAll(readable, body, true);
  }

  return (
    <div className="space-y-5">
      {/* WHAT IS ALREADY WAITING, before the reader adds more. Staging is
          server-side and survives a closed tab, so a run that did not finish
          leaves documents here holding their bytes and answering nothing.
          This renders nothing at all when staging is empty. */}
          <StagedFiles />
      <IngestQueue refreshKey={queued} />
      <Card>
        <div
          className={`rounded-xl border border-dashed p-8 text-center cursor-pointer transition-colors ${
            over
              ? 'border-emerald-500 bg-emerald-950/30'
              : 'border-slate-700 bg-slate-950/60 hover:border-slate-600'
          }`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            take(e.dataTransfer.files);
          }}
        >
          <Upload className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
          <div className="text-sm font-bold text-white">Drop files here, or click to choose</div>
          <div className={`${HELP} mt-1`}>You can select several at once</div>
        </div>
           <input
          ref={input}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => take(e.target.files)}
        />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Globe className="w-4 h-4 text-cyan-400 shrink-0" />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fromUrl()}
            placeholder="…or a web address: https://intranet/policy.pdf"
            className="flex-1 min-w-[16rem] bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            data-testid="url-input"
          />
          <button className={BTN} disabled={!url.trim() || !!urlBusy} onClick={fromUrl} data-testid="url-add">
            {urlBusy ? 'Fetching…' : 'Add from URL'}
          </button>
          <span className={`${HELP} basis-full`}>
            {urlBusy ||
              'The engine fetches the page or file itself and reads it with the same reader as an upload (Docling for PDFs and pages). Private and internal addresses are refused unless the deployment allows them.'}
          </span>
        </div>

        {files.length > 0 && (
          <div className="mt-4 divide-y divide-slate-800">
            {files.map((f, i) => (
              <div key={i} className="py-2 text-xs">
                <div className="flex items-center gap-3">
                  <span
                    className={`flex-1 min-w-0 truncate ${
                      refused[f.name] ? 'text-amber-300 line-through' : 'text-slate-200'
                    }`}
                  >
                    {f.name}
                  </span>
                           <span className="text-slate-400 font-mono">{fileSize(f.size)}</span>
                  {perFile[f.name] && !refused[f.name] && (
                    <span
                      className="text-slate-500 font-mono"
                      title="Estimated read + add time on this engine"
                    >
                      ~{duration(perFile[f.name].read_s + perFile[f.name].ingest_s)}
                    </span>
                  )}
                </div>
                {/* The engine's own sentence, kept where the file is. It
                    already names the format and lists what is supported,
                    so paraphrasing it here could only lose detail. */}
                {refused[f.name] && (
                  <p className="text-[11px] text-amber-400 mt-1 pr-16">{refused[f.name]}</p>
                )}
                {pictures[f.name] && (
                  <p className="text-[11px] text-slate-400 mt-1 pr-16">
                    {pictures[f.name].total} image{pictures[f.name].total === 1 ? '' : 's'} found
                    {pictures[f.name].decorative ? ` · ${pictures[f.name].decorative} decorative skipped` : ''}
                    {pictures[f.name].scanned
                      ? ` · ${pictures[f.name].scanned} scanned page${pictures[f.name].scanned === 1 ? '' : 's'} read by OCR (searchable at once, no model call)`
                      : ''}
                    {pictures[f.name].pending
                                     ? pictures[f.name].model
                        ? ` · ${pictures[f.name].pending} will be explained by the image model while adding (a hosted model ~4 s each, a CPU model minutes; what does not fit the upload budget waits in the store bar)`
                        : ` · ${pictures[f.name].pending} other picture${pictures[f.name].pending === 1 ? '' : 's'} kept as placeholders (OCR only)`
                      : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

          {files.length > 0 && !plan && !reading && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className={BTN_PRI} disabled={!!busy} onClick={() => queueAll()} data-testid="queue-add">
              {busy ||
                `Add ${files.length} file${files.length === 1 ? '' : 's'} — on the server`}
            </button>
            <button className={BTN} disabled={!!busy} onClick={readFirst}>
              Read first and compare the chunking
            </button>
            <span className={`${HELP} basis-full`}>
              {(() => {
                const t = files.reduce(
                  (a, f) => a + (perFile[f.name] ? perFile[f.name].read_s + perFile[f.name].ingest_s : 0),
                  0,
                );
                return t ? `About ${duration(t)} of server time. ` : '';
              })()}
              The upload takes seconds; reading and adding run on the server, so you can close
              this page or sign out and come back to the queue above.
            </span>
          </div>
        )}

        {reading && wait && !busy && (
          <EtaBar
            label={wait.label}
            startedAt={wait.startedAt}
            estimate={wait.estimate}
            basis={wait.basis}
          />
        )}
        {reading && !wait && (
          <div>
            <p className={`${HELP} mt-3`}>{reading}</p>
            <Bar />
          </div>
        )}
                {/* The machine-load panel (ResourcePanel, /system/resources) is
            hidden for now: two screens polled it every 2 s each, and the
            office log was that call and little else. Kept in the code. */}
      </Card>

      {plan && (
        <Card>
          <CardTitle>How these documents will be split</CardTitle>

          <div className="mt-3 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
            <span className="text-[11px] text-emerald-300 font-semibold uppercase tracking-wider">
              {useRec && plan && plan.config.chunking !== strategyChunking
                ? 'Using the recommendation for these documents'
                : 'Using your saved strategy'}
            </span>
            <div className="text-sm font-bold text-white mt-1">{label(chunking)}</div>
            <span className={`${HELP} block mt-0.5`}>
              {useRec && plan && plan.config.chunking !== strategyChunking
                ? `ticked below — your strategy says ${label(strategyChunking)}; both are recorded on each document`
                : 'chosen in the strategy — nothing here has changed it'}
            </span>
          </div>

          {/* SIDE BY SIDE, ALWAYS: what the strategy says and what the
              files suggest. The recommendation is information, not a switch
              - it used to be a tick that split these documents differently
              from the rest of the base. The place to act on it is the
              strategy, where a change applies to everything; but a reader
              must still SEE both, or the recommendation is pointless. */}
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs [&>*]:min-w-0">
            <div className="p-3.5 rounded-xl border border-slate-700">
              <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                In your strategy
              </span>
              <div className="text-sm font-bold text-white mt-1">{label(strategyChunking)}</div>
                         <span className={`${HELP} block mt-1 font-mono break-words [overflow-wrap:anywhere]`}>
                {paramsText((saved && saved.chunk_params) || {})}
              </span>
              <span className={`${HELP} block mt-1`}>
                {useRec && plan && plan.config.chunking !== strategyChunking
                  ? 'not used for these documents — see the tick below'
                  : 'this is what will be used'}
              </span>
            </div>
            <div
              className={`p-3.5 rounded-xl border ${
                plan.config.chunking !== chunking ? 'border-amber-500/40' : 'border-slate-700'
              }`}
            >
              <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                Recommended for these files
              </span>
              <div className="text-sm font-bold text-white mt-1">{label(plan.config.chunking)}</div>
                         <span className={`${HELP} block mt-1 font-mono break-words [overflow-wrap:anywhere]`}>
                {paramsText(plan.config.chunk_params || {})}
              </span>
              <span className={`${HELP} block mt-1`}>
                {plan.category.label} — {plan.category.signals.join(', ')}. {plan.why.chunking}
              </span>
            </div>
          </div>
          {plan.config.chunking !== strategyChunking ? (
            <label className="flex gap-3 items-start mt-3 p-3.5 rounded-xl border border-slate-700 hover:border-emerald-500 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={useRec}
                onChange={(e) => setUseRec(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-700 bg-slate-800 accent-emerald-500"
              />
              <span className="text-xs">
                <b className="text-white">Use the recommendation for these documents.</b>
                <span className={`${HELP} block mt-1`}>
                  Leave it, and your saved strategy is used. Either way each document records
                  what split it and what the strategy said, so the choice is always traceable.
                  To change it for every document, edit the strategy instead.
                </span>
              </span>
            </label>
          ) : (
            <p className={`${HELP} mt-2`}>They agree — nothing to choose.</p>
          )}

          {/* Not adjustable, but not hidden either. A screen that quietly
              decides things and does not say what it decided is the one
              people stop trusting. */}
          <div className="mt-4 p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
            <b className="text-xs font-bold text-slate-200">
              Everything comes from your saved strategy
            </b>
            <ul className="mt-2 pl-4 list-disc text-[11px] text-slate-400 space-y-1 font-mono">
              <li>Search: {(saved && saved.retrieval) || 'hybrid'}</li>
              <li>Ranking: {(saved && saved.reranking) || 'adaptive'}</li>
              <li>Safety: {(saved && saved.guardrail) || 'standard'}</li>
              <li>Evidence ceiling: top-{(saved && saved.top_k) || 3}</li>
            </ul>
          </div>

                <button className={`${BTN_PRI} mt-4`} disabled={!!busy} onClick={ingest}>
            {busy || `Add ${readable.length} document${readable.length === 1 ? '' : 's'}`}
          </button>
          {busy && wait && (
            <EtaBar
              label={wait.label}
              startedAt={wait.startedAt}
              estimate={wait.estimate}
              basis={wait.basis}
            />
          )}
          {readable.length < files.length && (
            <p className="text-[11px] text-amber-400 mt-2">
              {files.length - readable.length} of the {files.length} you chose cannot be read and
              will not be added.
            </p>
          )}
        </Card>
      )}
    </div>
  );
};
