
import React, { useCallback, useEffect, useState } from 'react';
import { Clock, FileText, Trash2, Upload } from 'lucide-react';

import { del, get, msg, post } from '../../rag/apiClient';
import { useRag } from '../../rag/RagContext';
import { BTN, BTN_PRI, Card, CardTitle, HELP } from '../../rag/RagUI';

/**
 * WHAT IS WAITING, AND THE TWO THINGS YOU CAN DO WITH IT.
 *
 * Adding files is two steps in the engine: the whole document is read and
 * STAGED server-side, and only then ingested - so the recommendation is made
 * on the real document rather than on a 20,000-character preview. The screen
 * did both in one go and showed neither, which was fine until a run did not
 * finish. Close the tab while eight files are reading, lose the connection
 * mid-batch, or hit a chunker that refuses one of them, and those documents
 * stay staged: holding their bytes, invisible, with no way to finish them and
 * no way to clear them. The only evidence was a row in a table nobody looks at.
 *
 * So it is shown, with both endings a reader might want - ADD them, or THROW
 * THEM AWAY - and nothing is decided for them. It appears only when something
 * is actually waiting; an empty staging area is not news.
 *
 * Scoped to the base in the store bar. Staging used to be keyed by filename
 * alone across the whole deployment, so two people staging `report.pdf` into
 * two bases overwrote each other and one could ingest the other's bytes -
 * see EngineStore._scope_staging_to_kb. Every call here carries ?kb=.
 */

export interface StagedRow {
  name: string;
  kb?: string;
  chars?: number;
  created_at?: string;
}

const when = (iso?: string) => {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!then) return '';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

export const StagedFiles: React.FC<{
  /** Told when the list empties or a document is added, so the page around
   *  this one can refresh its counts. */
  onChanged?: () => void;
}> = ({ onChanged }) => {
  const { flash, bump, activeKb, tick } = useRag();
  const [rows, setRows] = useState<StagedRow[] | null>(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const out = await get('/staging');
      setRows(Array.isArray(out) ? out : []);
    } catch {
      // A staging list that cannot be read is not worth a toast: the reader
      // came here to add files, and this panel is an extra. It simply does
      // not appear.
      setRows([]);
    }
  }, []);

  // Re-read when the store bar changes base - what is staged for one base is
  // not staged for another - and when anything else on the page adds or
  // removes documents, because that is usually a staging run finishing.
  useEffect(() => {
    load();
  }, [load, activeKb, tick]);

  if (!rows || rows.length === 0) return null;

  const act = async (row: StagedRow, what: 'ingest' | 'remove') => {
    setBusy(row.name + what);
    try {
      if (what === 'ingest') {
        const r = await post('/staging/' + encodeURIComponent(row.name) + '/ingest', {});
        if (r && r.error) throw new Error(r.error);
        flash(
          `${row.name} added — ${r?.atoms ?? 0} facts, split by ${r?.used_pipeline ?? 'the strategy'}`,
        );
        bump();
      } else {
        await del('/staging/' + encodeURIComponent(row.name));
        flash(`${row.name} removed from staging — it was never added`);
      }
      await load();
      onChanged?.();
    } catch (e) {
      flash(row.name + ': ' + msg(e));
    }
    setBusy('');
  };

  const all = async (what: 'ingest' | 'remove') => {
    setBusy(what + '-all');
    let ok = 0;
    for (const row of rows) {
      try {
        if (what === 'ingest')
          await post('/staging/' + encodeURIComponent(row.name) + '/ingest', {});
        else await del('/staging/' + encodeURIComponent(row.name));
        ok++;
      } catch (e) {
        // One failure must not cost the rest - the same rule the batch
        // ingest on this screen already follows.
        flash(row.name + ': ' + msg(e));
      }
    }
    flash(
      what === 'ingest'
        ? `${ok} of ${rows.length} added`
        : `${ok} of ${rows.length} removed from staging`,
    );
    if (what === 'ingest') bump();
    await load();
    onChanged?.();
    setBusy('');
  };

  return (
    <Card className="border-amber-500/40">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <CardTitle>
              Waiting in staging ({rows.length})
            </CardTitle>
          </div>
          <p className={`${HELP} mt-1.5`}>
            {rows.length === 1 ? 'This file was' : 'These files were'} read into this knowledge
            base but never added — usually a run that did not finish.{' '}
            {rows.length === 1 ? 'It is' : 'They are'} taking up space and answering nothing.
            Add {rows.length === 1 ? 'it' : 'them'}, or throw {rows.length === 1 ? 'it' : 'them'}{' '}
            away.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            className={BTN_PRI}
            disabled={!!busy}
            onClick={() => all('ingest')}
            title="Add every staged file using this base's strategy"
          >
            {busy === 'ingest-all' ? 'Adding…' : 'Add all'}
          </button>
          <button
            className={BTN}
            disabled={!!busy}
            onClick={() => all('remove')}
            title="Throw every staged file away without adding it"
          >
            {busy === 'remove-all' ? 'Removing…' : 'Remove all'}
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {rows.map((row) => (
          <div
            key={row.name}
            className="flex items-center gap-3 rounded-xl bg-slate-950/70 border border-slate-800 px-3.5 py-2.5"
          >
            <FileText className="w-4 h-4 text-slate-500 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white truncate" title={row.name}>
                {row.name}
              </div>
              <div className="text-[11px] text-slate-500 font-mono">
                {(row.chars ?? 0).toLocaleString()} characters read
                {when(row.created_at) ? ` · staged ${when(row.created_at)}` : ''}
              </div>
            </div>
            <button
              className={`${BTN_PRI} shrink-0`}
              disabled={!!busy}
              onClick={() => act(row, 'ingest')}
              title="Add this document to the knowledge base"
            >
              <Upload className="w-3.5 h-3.5 inline mr-1" />
              {busy === row.name + 'ingest' ? 'Adding…' : 'Ingest'}
            </button>
            <button
              className={`${BTN} shrink-0`}
              disabled={!!busy}
              onClick={() => act(row, 'remove')}
              title="Throw this file away without adding it"
            >
              <Trash2 className="w-3.5 h-3.5 inline mr-1" />
              {busy === row.name + 'remove' ? 'Removing…' : 'Remove'}
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
};
