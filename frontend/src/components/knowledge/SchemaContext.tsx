
import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, Send, Upload } from 'lucide-react';
import { get, msg, post } from '../../rag/apiClient';
import { readFile } from '../../rag/ragUtils';
import { useRag } from '../../rag/RagContext';
import { BTN, BTN_PRI, Card, CardTitle, HELP, MONO_AREA } from '../../rag/RagUI';

/* ------------------------------------------------------------------ *
 * The two halves of schema intelligence, as screens.
 *
 * WHAT THIS IS FOR. This service does not write the SQL — the agent
 * service owns the model, so it does. What it owns is the database's
 * MEANING: which columns a question touches, what each one is for, how
 * they join, and which of them could not be told apart.
 *
 * So there are exactly two things a person does here. They upload the
 * dictionary their bank already has, in whatever shape it is in. And
 * they check what the agent would be handed for a question, BEFORE
 * anybody wires an agent to it — because "the model picked the wrong
 * balance column" is not a thing you want to discover from a report.
 * ------------------------------------------------------------------ */

export const BusinessDictionary: React.FC<{ onLoaded?: () => void }> = ({ onLoaded }) => {
  const { flash } = useRag();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [text, setText] = useState('');
  const [name, setName] = useState('dictionary');
  const [busy, setBusy] = useState('');
  const file = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      setSummary(await get('/sql/dictionary'));
    } catch {
      /* nothing loaded yet, which the panel says */
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function take(list: FileList | null) {
    const picked = Array.from(list || [])[0];
    if (!picked) return;
    setBusy(`Reading ${picked.name}…`);
    try {
      const b64 = await readFile(picked);
      const out = await post('/sql/dictionary', {
        content_base64: b64,
        source: picked.name,
      });
      setSummary(out);
      setName(picked.name);
      flash(
        `${picked.name}: ${out.statements} statements, ${out.columns_described} columns described` +
          (out.unknown_count ? ` — ${out.unknown_count} named columns that do not exist` : ''),
      );
      onLoaded && onLoaded();
    } catch (e) {
      flash(msg(e));
    }
    setBusy('');
  }

  async function paste() {
    if (!text.trim()) return;
    setBusy('Reading it…');
    try {
      const out = await post('/sql/dictionary', { content: text, source: name });
      setSummary(out);
      flash(`${out.statements} statements, ${out.columns_described} columns described`);
      onLoaded && onLoaded();
    } catch (e) {
      flash(msg(e));
    }
    setBusy('');
  }

  async function template() {
    setBusy('Writing it from the schema…');
    try {
      const t = await get('/sql/dictionary/template?fmt=csv');
      setText(t.content || '');
      setName(t.filename || 'dictionary.csv');
    } catch (e) {
      flash(msg(e));
    }
    setBusy('');
  }

  const coverage = summary && summary.coverage;

  return (
    <Card>
      <button
        className="flex items-center gap-2 text-sm font-bold text-white"
        onClick={() => setOpen(!open)}
      >
        <BookOpen className="w-4 h-4 text-emerald-400" />
        <span>Business dictionary</span>
        {coverage && (
          <span className="text-[11px] font-mono text-slate-400">
            {coverage.described}/{coverage.columns} columns · {coverage.percent}%
          </span>
        )}
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        )}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button className={BTN} disabled={!!busy} onClick={() => file.current?.click()}>
              <Upload className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
              Choose a file
            </button>
            <button className={BTN} disabled={!!busy} onClick={template}>
              Start one from the schema
            </button>
          </div>
          <input
            ref={file}
            type="file"
            className="hidden"
            onChange={(e) => take(e.target.files)}
          />

          <textarea
            rows={8}
            className={MONO_AREA}
            placeholder={
              'TABLE_NAME,COLUMN_NAME,BUSINESS_NAME,DESCRIPTION,ALLOWED_VALUES\n' +
              'acct,avl_bal,Available Balance,"What the customer may withdraw today.",'
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className={BTN_PRI} disabled={!text.trim() || !!busy} onClick={paste}>
            {busy || 'Read this dictionary'}
          </button>

          {summary && summary.loaded && (
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px]">
              <div className="font-mono text-slate-300">
                {summary.statements} statements · {summary.columns_described} columns ·{' '}
                {summary.tables_described} tables · {summary.background_notes} background notes
              </div>
              <div className={`${HELP} mt-1`}>
                from {(summary.sources || []).map((s: any) => s.source).join(', ')}
              </div>
              {/* NAMED, not counted. "17 discarded" is not something anybody
                  can act on; the list is what gets the file corrected. */}
              {summary.unknown_count > 0 && (
                <div className="mt-2 text-amber-400">
                  {summary.unknown_count} entries name a column this database does not have, and
                  were discarded:
                  <ul className="mt-1 pl-4 list-disc font-mono">
                    {(summary.unknown || []).slice(0, 8).map((u: any, i: number) => (
                      <li key={i}>
                        {u.named} <span className="text-slate-500">({u.source}:{u.line})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.symbols && (
                <div className={`${HELP} mt-2`}>
                  {summary.symbols.surface_forms} names across{' '}
                  {summary.symbols.columns} columns.{' '}
                  {Object.keys(summary.symbols.abbreviations_learned || {}).length > 0 && (
                    <>
                      Learned from your own file:{' '}
                      <span className="font-mono text-slate-300">
                        {Object.entries(summary.symbols.abbreviations_learned)
                          .slice(0, 10)
                          .map(([k, v]) => `${k}→${v}`)
                          .join(', ')}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

/* ------------------------------------------------------------------ */

export const AgentContext: React.FC = () => {
  const { flash } = useRag();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [pack, setPack] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [raw, setRaw] = useState(false);

  async function look() {
    if (!q.trim()) return;
    setBusy('Matching the question against the schema…');
    setPack(null);
    try {
      setPack(await post('/sql/context', { question: q }));
    } catch (e) {
      flash(msg(e));
    }
    setBusy('');
  }

  const columns = pack
    ? pack.tables.flatMap((t: any) =>
        t.columns.filter((c: any) => c.selected).map((c: any) => ({ ...c, table: t.name })),
      )
    : [];

  return (
    <Card>
      <button
        className="flex items-center gap-2 text-sm font-bold text-white"
        onClick={() => setOpen(!open)}
      >
        <Send className="w-4 h-4 text-cyan-400" />
        <span>What the agent would be given</span>
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        )}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex gap-2">
            <input
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              placeholder="what is the balance for each customer"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && look()}
            />
            <button className={BTN_PRI} disabled={!q.trim() || !!busy} onClick={look}>
              {busy ? '…' : 'Look'}
            </button>
          </div>

          {pack && (
            <div className="space-y-3">
              {/* FIRST, because it is the reason this exists. An embedding
                  index ranks near-identical columns and returns the winner;
                  a near-tie and a clear win come out of a cosine looking
                  exactly the same. */}
              {pack.ambiguities.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <div className="text-xs font-bold text-amber-300">
                    Not resolved — the agent is told to ask, not to choose
                  </div>
                  {pack.ambiguities.map((a: any, i: number) => (
                    <div key={i} className="mt-2 text-[11px]">
                      <span className="font-mono text-white">“{a.term}”</span> could be{' '}
                      {a.candidates.map((c: any, j: number) => (
                        <span key={j}>
                          {j > 0 && ', '}
                          <span className="font-mono text-amber-200">{c.ref}</span>
                        </span>
                      ))}
                      <ul className="mt-1 pl-4 list-disc text-slate-400">
                        {a.candidates.map((c: any, j: number) => (
                          <li key={j}>
                            <span className="font-mono text-slate-300">{c.ref}</span>
                            {c.meaning ? ` — ${c.meaning}` : ' — nothing written about this one'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-xs font-bold text-slate-200">
                  {columns.length} column{columns.length === 1 ? '' : 's'} across{' '}
                  {pack.tables.length} table{pack.tables.length === 1 ? '' : 's'}
                </div>
                <table className="w-full mt-2 text-[11px]">
                  <tbody>
                    {columns.map((c: any, i: number) => (
                      <tr key={i} className="border-t border-slate-800/70">
                        <td className="py-1.5 pr-3 font-mono text-emerald-300 align-top whitespace-nowrap">
                          {c.table}.{c.name}
                        </td>
                        <td className="py-1.5 pr-3 text-slate-500 align-top whitespace-nowrap">
                          {c.type}
                        </td>
                        <td className="py-1.5 text-slate-400 align-top">
                          {c.meaning.length > 0 ? (
                            <span className="text-slate-300">{c.meaning[0].meaning}</span>
                          ) : (
                            <span className="italic">not in the dictionary</span>
                          )}
                          <div className="text-slate-500 mt-0.5">{c.why.join(' · ')}</div>
                          {c.values && (
                            <div className="text-slate-500 mt-0.5 font-mono">
                              {c.values.join(', ')}{' '}
                              <span className="not-italic">({c.values_from})</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {pack.joins.length > 0 && (
                  <div className="mt-3 text-[11px]">
                    <span className="text-slate-400">Joined by declared foreign keys: </span>
                    <span className="font-mono text-cyan-300">
                      {pack.joins
                        .map((j: any) => `${j.from}.${j.from_column} = ${j.to}.${j.to_column}`)
                        .join('  ·  ')}
                    </span>
                  </div>
                )}
                {pack.tables.some((t: any) => t.bridge_only) && (
                  <div className={`${HELP} mt-1`}>
                    {pack.tables
                      .filter((t: any) => t.bridge_only)
                      .map((t: any) => t.name)
                      .join(', ')}{' '}
                    appear only to connect the others; the agent is told not to select from them.
                  </div>
                )}
                {pack.notes.map((n: string, i: number) => (
                  <p key={i} className="text-[11px] text-amber-400 mt-1.5">
                    {n}
                  </p>
                ))}
                              {pack.confidence && (
                  <p className={`${HELP} mt-1.5`}>
                    {pack.confidence.with_a_written_meaning} of {pack.confidence.columns} have a
                    written meaning; {pack.confidence.reached_by_name_only} were reached by their
                    name alone.
                  </p>
                )}
                {pack.semantic && (
                  <p className={`${HELP} mt-1.5`} data-testid="sql-meaning-search">
                    {pack.semantic.used
                      ? `Also searched by meaning with ${pack.semantic.strategy ? `strategy "${pack.semantic.strategy}"'s model` : 'the chosen model'} (${pack.semantic.model}), part by part${pack.semantic.parts?.length > 1 ? ` (${pack.semantic.parts.length} parts)` : ''}: columns it found are marked "found by meaning"; ${pack.semantic.added?.length || 0} of them no word of the question names.`
                      : `Searched by name only - ${pack.semantic.why}.`}
                  </p>
                )}
              </div>

              <button className={BTN} onClick={() => setRaw(!raw)}>
                {raw ? 'Hide' : 'Show'} the exact text the agent receives
              </button>
              {raw && (
                <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[10.5px] text-slate-300 overflow-x-auto whitespace-pre-wrap">
                  {pack.for_llm}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
};
