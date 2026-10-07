
import React, { useEffect, useState } from 'react';
import { Download, FileText, RotateCcw, Trash2 } from 'lucide-react';
import { del, fileHeaders, get, msg, post, withKb } from '../../rag/apiClient';
import { ChunkMethod, DocumentRow } from '../../rag/ragTypes';
import { labelOf } from '../../rag/ragUtils';
import { useRag } from '../../rag/RagContext';
import { BTN, BTN_PRI, Card, HELP, Pill } from '../../rag/RagUI';
import {
  ConfirmDelete,
  DataTable,
  Drawer,
  IconButton,
  Panel,
  RowActions,
} from '../../rag/Overlays';

export const DocumentsTab: React.FC = () => {
  // `bump` so the store bar's counts (documents, facts, vectors, images)
  // follow a remove, restore or permanent delete instead of going stale.
  const { flash, tick, bump } = useRag();

  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [stats, setStats] = useState<any>(null);
  /* Which document's panel is open. Named `detail` rather than `open` because
     the drawer's own prop is called open and the two meant different things. */
  const [detail, setDetail] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, any[]>>({});
  const [methods, setMethods] = useState<ChunkMethod[]>([]);

  async function load(alive: () => boolean = () => true) {
    try {
      const [rows, numbers] = await Promise.all([get('/documents'), get('/stats')]);
      // ONE await instead of two, and the second no longer waits for the
      // first: the list and the counts are independent reads, so doing them in
      // sequence doubled the time the table stayed empty for no reason.
      if (!alive()) return;
      setDocs(rows);
      setStats(numbers);
    } catch (e) {
      if (alive()) flash(msg(e));
    }
  }

  /* See ActiveStoreBar for what `alive` prevents. `tick` is bumped when the
     knowledge base changes, so this list follows the picker - which means two
     stores' replies can be in flight together, and the slower one must not
     paint another base's documents under this one's name. */
  useEffect(() => {
    let current = true;
    load(() => current);
    get('/chunkers').then((m) => {
      if (current) setMethods(m);
    }).catch(() => {});
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const label = (n: string) => labelOf(methods, n);

  /* THE ORIGINAL FILE, byte for byte. Fetched with the bearer header (a
     plain <a href> cannot carry one) and handed to the browser as a blob;
     the engine's Content-Disposition names it. */
  async function download(key: string) {
    try {
      const r = await fetch(withKb('/document/' + encodeURIComponent(key) + '/original'), {
        headers: fileHeaders(),
      });
      if (!r.ok) throw new Error((await r.json()).detail?.detail || r.statusText);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = key.split('/').pop() || key;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      flash(msg(e));
    }
  }

  async function remove(key: string) {
    try {
      await del('/document/' + encodeURIComponent(key));
      flash('Removed — archived, not destroyed');
      load();
      bump();
    } catch (e) {
      flash(msg(e));
    }
  }

  /* PERMANENT. Two clicks on purpose: Remove archives (restorable, above);
     this destroys - every version, its atoms, its images - and the engine
     refuses it for a document that is still active. There is no timer
     anywhere: an archive is kept until somebody does this, and the panel
     says so. */
  const [purging, setPurging] = useState<string | null>(null);
  const [purgeBusy, setPurgeBusy] = useState('');
  async function purge(key: string) {
    setPurgeBusy('Deleting…');
    try {
      const out = await del('/document/' + encodeURIComponent(key) + '/purge');
      flash(`Deleted permanently — ${out.versions_removed} version(s), ${out.atoms_removed} passage(s) gone`);
      setPurging(null);
      load();
      bump();
    } catch (e) {
      flash(msg(e));
    }
    setPurgeBusy('');
  }

  /* REINGEST: read the kept original again (or the stored text of a pasted
     document) and split it under the strategy AS IT IS NOW. Editing a
     strategy re-embeds by itself but never re-splits what is already here.
     The work goes through the server queue, like an upload - the Add screen's
     queue panel shows it. */
  const [reingesting, setReingesting] = useState(false);
  async function reingest(key: string | null) {
    setReingesting(true);
    try {
      if (key) {
        const job = await post('/document/' + encodeURIComponent(key) + '/reingest');
        flash(`Reingest queued — ${key} is read again from its ${job.reingest?.from || 'file'}`);
      } else {
        const out = await post('/documents/reingest', { stale_only: true });
        flash(
          `${out.jobs.length} document${out.jobs.length === 1 ? '' : 's'} queued for reingest` +
            (out.skipped.length ? ` · ${out.skipped.length} skipped` : ''),
        );
      }
      bump();
    } catch (e) {
      flash(msg(e));
    }
    setReingesting(false);
  }

  /* What differs, in words, for a tooltip and the drawer. */
  const driftText = (d: DocumentRow) =>
    (d.drift || [])
      .map((x) =>
        x.setting === 'unknown'
          ? 'how it was split was not recorded'
          : x.setting === 'chunking'
            ? `split by ${label(x.was)}, the strategy now says ${label(x.now)}`
            : 'chunk settings ' +
              Array.from(new Set([...Object.keys(x.was || {}), ...Object.keys(x.now || {})]))
                .filter((k) => (x.was || {})[k] !== (x.now || {})[k])
                .map((k) => `${k.replace(/_/g, ' ')} ${(x.was || {})[k] ?? '—'} → ${(x.now || {})[k] ?? '—'}`)
                .join(', '),
      )
      .join('; ');
  const changed = (d: DocumentRow) => (d.drift || []).some((x) => x.setting !== 'unknown');

  async function restore(key: string) {
    try {
      await post('/document/' + encodeURIComponent(key) + '/restore');
      flash('Restored');
      bump();
      load();
    } catch (e) {
      flash(msg(e));
    }
  }

  /** Open the panel, and fetch the versions the first time it is asked for. */
  async function openDetail(key: string) {
    setDetail(key);
    if (!history[key]) await toggle(key);
  }

  /** Fetch this document's versions, once. The panel decides when to show
      them; this only decides when to ask for them. */
  async function toggle(key: string) {
    if (!history[key]) {
      try {
        const h = await get('/document/' + encodeURIComponent(key) + '/history');
        setHistory((prev) => ({ ...prev, [key]: h }));
      } catch (e) {
        flash(msg(e));
      }
    }
  }

  /* Removing archives rather than destroys, and /documents returns the
     archived rows too — but they are shown here, with Restore, because a
     reader who removed the wrong file needs a way back that does not
     involve a database. */
  const live = (docs || []).filter((d) => (d.status || 'ACTIVE') === 'ACTIVE');
  const gone = (docs || []).filter((d) => (d.status || 'ACTIVE') !== 'ACTIVE');

  /* A document ingested before the strategy was recorded has none, and
     inventing one from the knowledge base's CURRENT setting is exactly
     the lie this column exists to stop. */
  const strategyOf = (d: DocumentRow) => {
    const s = d.strategy || {};
    if (!s.chunking) return null;
    return s;
  };

  /* THE ROW OPENS A DRAWER.

     Version history used to expand INSIDE the table, as a row spanning four
     columns holding a second list. Two lists in one table is a shape nobody
     can scan, and opening one pushed every document below it down the page.
     Now a row is a row, and everything about one document is in a panel
     beside the list it came from. */
  const chosen = docs?.find((d) => (d.doc_key || d.name) === detail) || null;
  const chosenKey = chosen ? ((chosen.doc_key || chosen.name) as string) : '';
  const chosenGone = !!chosen && (chosen.status || '').toUpperCase() === 'ARCHIVED';
  const chosenStrategy = chosen ? strategyOf(chosen) : null;

  /* WHO CHOSE THE SPLITTING, in the words a reader uses. The engine already
     verified this against the strategy the base was bound to, so it is read
     straight rather than re-derived here from two values that would then have
     to agree with the engine's own comparison. */
  const SOURCE: Record<string, string> = {
    strategy: 'from the strategy',
    recommendation: 'recommended for this file',
    manual: 'chosen for this ingest',
  };

  const columns = (archived: boolean) => [
    {
      head: 'Document',
      cell: (d: DocumentRow) => {
        const key = (d.doc_key || d.name) as string;
        const st = strategyOf(d);
        return (
          <>
            <div className="text-xs font-semibold text-white truncate max-w-md">{key}</div>
            {st ? (
              <div className="text-[11px] text-slate-400 mt-0.5">
                split by <b className="text-slate-200">{label(st.chunking as string)}</b>
                {st.strategy_name ? (
                  <span className="text-slate-500"> · {st.strategy_name}</span>
                ) : null}
                {/* THE DISAGREEMENT, and only when there was one. A row with
                    nothing here followed its strategy; there is no third
                    state to read, because what ran is always written down in
                    full whether or not the two agreed. */}
                {st.strategy_chunking ? (
                  <span className="ml-1.5">
                    <Pill tone="info">
                      strategy says {label(st.strategy_chunking as string)}
                    </Pill>
                  </span>
                       ) : null}
                {changed(d) ? (
                  <span className="ml-1.5" title={driftText(d)}>
                    <Pill tone="warn">strategy changed — reingest to re-split</Pill>
                  </span>
                ) : null}
                {st.fell_back ? (
                  <span className="ml-1.5">
                    <Pill tone="warn">{st.requested} was not available</Pill>
                  </span>
                ) : null}
              </div>
            ) : (
              <div className="text-[11px] text-slate-500 italic mt-0.5">
                strategy not recorded — added before this was kept
              </div>
            )}
          </>
        );
      },
    },
    {
      /* THE PICTURES, per document. A document whose figures are still
         pending answers differently from one whose are done, and "3 of 4
         explained · 1 failed" beside the row is how a reader knows which
         they are looking at. Nothing for a document with no pictures. */
      head: 'Images',
      hide: 'sm' as const,
      className: 'w-36',
      cell: (d: DocumentRow) => {
        const im = d.images;
        if (!im || !im.total) return <span className="text-xs text-slate-600">—</span>;
        const ocr = im.ocr || 0;
        const done = im.explained + ocr;
        const work = done + im.pending + im.failed;
        const tone = im.pending ? 'text-amber-300' : im.failed ? 'text-red-300' : 'text-emerald-300';
        return (
          <div
            title={`${im.explained} explained, ${ocr} scanned pages read by OCR, ${im.pending} waiting, ${im.failed} failed, ${im.decorative} decorative (never sent to a model)`}
          >
            <span className={`text-xs font-semibold ${tone}`}>{done}/{work} {ocr && !im.explained ? 'read' : 'explained'}</span>
            <div className="text-[10px] text-slate-500 leading-snug">
              {im.pending ? `${im.pending} waiting` : im.failed ? `${im.failed} failed` : ocr ? `${ocr} scanned page${ocr === 1 ? '' : 's'} by OCR` : 'done'}
              {im.decorative ? ` · ${im.decorative} decorative` : ''}
            </div>
          </div>
        );
      },
    },
    {
      head: 'Version',
      hide: 'sm' as const,
      className: 'w-28',
      cell: (d: DocumentRow) => (
        <span className="font-mono text-xs text-slate-400">
          v{d.version != null ? d.version : 1}
        </span>
      ),
    },
    {
      /* WHO PUT THIS DOCUMENT IN. Kept per version on the document row, not
         only on the uploaded file - a pasted document has an author too, and
         until this column existed only files had one. "not recorded" is said
         out loud for documents older than the column, because an empty cell
         reads as "nobody" and this is the first question an auditor asks. */
      head: 'Added by',
      hide: 'md' as const,
      className: 'w-36',
      cell: (d: DocumentRow) =>
        d.created_by ? (
          <span className="text-xs text-slate-300">{d.created_by}</span>
        ) : (
          <span className="text-xs text-slate-600 italic">not recorded</span>
        ),
    },
    {
      head: 'Status',
      className: 'w-24',
      cell: (d: DocumentRow) =>
        archived ? (
              <span title={d.deleted_by ? 'archived by ' + d.deleted_by : undefined}>
            <Pill tone="warn">archived</Pill>
            {d.deleted_at && (
              <div className="text-[10px] text-slate-500 mt-0.5">
                {new Date(d.deleted_at).toLocaleDateString()}
              </div>
            )}
          </span>
        ) : (
          <Pill tone="good">active</Pill>
        ),
    },
    {
      head: '',
      className: 'w-28',
      cell: (d: DocumentRow) => {
        const key = (d.doc_key || d.name) as string;
        return (
          <RowActions>
                   {archived ? (
              <>
                <button className={BTN} onClick={() => restore(key)}>
                  Restore
                </button>
                <IconButton
                  title="Delete permanently — every version, its passages and images. Cannot be undone."
                  tone="danger"
                  onClick={() => setPurging(key)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </IconButton>
              </>
            ) : (
              <>
                {d.has_original && (
                  <IconButton
                    title={`Download the file that was uploaded (${Math.round(((d.original && d.original.size_bytes) || 0) / 1024)} KB${d.original && d.original.uploaded_by ? ', by ' + d.original.uploaded_by : ''})`}
                    onClick={() => download(key)}
                  >
                                   <Download className="w-3.5 h-3.5" />
                  </IconButton>
                )}
                <IconButton
                  title={
                    'Reingest with the strategy as it is now' +
                    (changed(d) ? ' — ' + driftText(d) : '') +
                    (d.has_original ? ' (reads the uploaded file again)' : ' (splits the stored text again)')
                  }
                  onClick={() => reingest(key)}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </IconButton>
                <IconButton title="Remove this document" tone="danger" onClick={() => remove(key)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </IconButton>
              </>
            )}
          </RowActions>
        );
      },
    },
  ];

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      <Panel
        title="Documents"
        action={
             stats ? (
            <span className="flex items-center gap-3">
            {live.filter(changed).length > 0 && (
              <button
                className={BTN}
                disabled={reingesting}
                onClick={() => reingest(null)}
                title="Every document split under an older version of the strategy is read again and split the way the strategy says now"
                data-testid="reingest-stale"
              >
                <RotateCcw className="w-3.5 h-3.5 inline mr-1" />
                Reingest {live.filter(changed).length} out of date
              </button>
            )}
            <span className="text-[11px] text-slate-400 font-mono">
              {live.length} active
              {gone.length > 0 ? ` · ${gone.length} archived` : ''}
              {stats.atoms != null ? ` · ${stats.atoms} facts` : ''}
            </span>
            </span>
          ) : undefined
        }
      >
        <DataTable
          rows={live}
          keyOf={(d: DocumentRow) => (d.doc_key || d.name) as string}
          onRowClick={(d: DocumentRow) => openDetail((d.doc_key || d.name) as string)}
          columns={columns(false)}
          empty={
            docs ? (
              <>
                Nothing yet — add something from{' '}
                <b className="text-slate-200">Add knowledge</b>.
              </>
            ) : (
              'Loading…'
            )
          }
        />
      </Panel>

      {gone.length > 0 && (
              <Panel
          title="Archived"
          subtitle="Hidden from every answer, kept for Restore. Nothing here expires on its own — an archived document stays until it is deleted permanently."
        >
          <DataTable
            rows={gone}
            keyOf={(d: DocumentRow) => (d.doc_key || d.name) as string}
            onRowClick={(d: DocumentRow) => openDetail((d.doc_key || d.name) as string)}
            columns={columns(true)}
          />
           </Panel>
      )}

      <ConfirmDelete
        open={!!purging}
        onClose={() => setPurging(null)}
        onConfirm={() => purging && purge(purging)}
        what="document permanently"
        name={purging || ''}
        busy={purgeBusy}
        requireTyping
        detail="Every version of this document, its passages, its images and the uploaded file are destroyed. Restore will have nothing to bring back. This cannot be undone."
      />

      <Drawer
        open={!!chosen}
        onClose={() => setDetail(null)}
        title={chosenKey}
        subtitle={
          chosen ? (
            <>
              version {chosen.version != null ? chosen.version : 1} ·{' '}
              {chosenGone ? 'archived' : 'active'}
            </>
          ) : undefined
        }
footer={
  chosen ? (
    chosenGone ? (
      <button className={BTN_PRI} onClick={() => restore(chosenKey)}>
        Restore this document
      </button>
    ) : (
      <div className="flex gap-2">
        <button
          className={BTN_PRI}
          disabled={reingesting}
          onClick={() => reingest(chosenKey)}
        >
          Reingest with current strategy
        </button>

        <button
          className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
          onClick={() => {
            remove(chosenKey);
            setDetail(null);
          }}
        >
          Remove from the knowledge base
        </button>
      </div>
    )
  ) : undefined
}

      >
        {chosen && (
          <>
            <div className="rounded-xl bg-slate-950/80 border border-slate-800 divide-y divide-slate-800/70">
              {[
                ['Strategy', (chosenStrategy && chosenStrategy.strategy_name) || '—'],
                [
                  'Split by',
                  chosenStrategy
                    ? label(chosenStrategy.chunking as string) +
                      (chosenStrategy.source
                        ? ' · ' + (SOURCE[chosenStrategy.source] || chosenStrategy.source)
                        : '')
                    : '—',
                ],
                /* Only when the two differed. See the table cell above. */
                ...(chosenStrategy && chosenStrategy.strategy_chunking
                  ? [
                      [
                        'The strategy says',
                        label(chosenStrategy.strategy_chunking as string),
                      ],
                    ]
                  : []),
                ['Embedded with', (chosenStrategy && chosenStrategy.embedding) || '—'],
                ['Vectors in', (chosenStrategy && chosenStrategy.vector_backend) || 'own store'],
                            ['PII handling', (chosenStrategy && chosenStrategy.pii) || '—'],
                ...(!chosenGone && changed(chosen) ? [['Out of date', driftText(chosen)]] : []),
              ].map(([k, v]) => (
                <div key={k as string} className="flex items-center justify-between px-3.5 py-2">
                  <span className="text-[11px] text-slate-400">{k}</span>
                  <span className="text-xs font-semibold text-white font-mono">{v}</span>
                </div>
              ))}
            </div>

            <div>
              <h4 className="text-xs font-bold text-white">Every version</h4>
              <p className={`${HELP} mt-1`}>
                And how each one was processed. A strategy changed later does not rewrite what
                already ran — which is why this is recorded per version rather than read from
                the knowledge base now.
              </p>
              <div className="mt-2.5 rounded-xl bg-slate-950/80 border border-slate-800 divide-y divide-slate-800/70">
                {(history[chosenKey] || [])
                  .slice()
                  .reverse()
                  .map((h, j) => (
                    <div key={j} className="flex gap-3 px-3.5 py-2.5">
                      <span className="font-mono text-xs text-emerald-300 shrink-0">
                        v{h.version}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs text-slate-300">
                          {h.strategy && h.strategy.chunking ? (
                            <>
                              split by{' '}
                              <b className="text-white">{label(h.strategy.chunking)}</b>
                              {h.strategy.source ? (
                                <span className="text-slate-500">
                                  {' '}
                                  · {SOURCE[h.strategy.source] || h.strategy.source}
                                </span>
                              ) : null}
                              {h.strategy.pii ? (
                                <span className="text-slate-500"> · PII {h.strategy.pii}</span>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-slate-500 italic">strategy not recorded</span>
                          )}
                        </span>
                        <span className="block text-[10px] text-slate-500 font-mono truncate">
                          {h.created_at} · {h.hash}
                        </span>
                      </span>
                    </div>
                  ))}
                {!(history[chosenKey] || []).length && (
                  <div className={`${HELP} px-3.5 py-3`}>Loading…</div>
                )}
              </div>
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
};
