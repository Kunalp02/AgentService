
import React, { useEffect, useState } from 'react';
import { Database, Terminal, Download, Save } from 'lucide-react';
import { del, get, msg, post, withKb, fileHeaders } from '../../rag/apiClient';
import { tableNames } from '../../rag/ragUtils';
import { useRag } from '../../rag/RagContext';
import { AgentContext, BusinessDictionary } from './SchemaContext';
import {
  BTN,
  BTN_PRI,
  Card,
  CardTitle,
  HELP,
  INPUT,
  Markdown,
  MONO_AREA,
  Pill,
} from '../../rag/RagUI';
import { ConnectDatabase } from './ConnectDatabase';

/* ------------------------------------------------------------------
   The same engine the full console uses, with every dial taken off the
   screen. A non-technical reader gets a question box; the guardrail, the
   row limit and whether a model may draft the query are decided here
   rather than asked, and the answer still arrives with the query that
   produced it attached.
------------------------------------------------------------------- */

const EXPORTS: [string, string][] = [
  ['xlsx', 'Excel'],
  ['csv', 'CSV'],
  ['docx', 'Word'],
  ['pdf', 'PDF'],
];

/* Offered only for one label column and one number column. A chart of
   anything else draws a relationship the question never asked for. */
const ResultChart: React.FC<{ rows: any[] }> = ({ rows }) => {
  if (!rows || rows.length < 2 || rows.length > 40) return null;
  const columns = Object.keys(rows[0] || {});
  if (columns.length !== 2) return null;
  const isNum = (c: string) => rows.every((r) => typeof r[c] === 'number');
  const value = columns.find(isNum);
  const label = columns.find((c) => c !== value && !isNum(c));
  if (!value || !label) return null;
  const top = Math.max(...rows.map((r) => r[value])) || 1;
  const h = 26;
  const pad = 8;
  const w = 520;

  return (
    <Card className="mt-4">
      <CardTitle>
        {value} by {label}
      </CardTitle>
      [INLINE SVG REMOVED]
      <p className={HELP}>Drawn from the rows above — the same numbers, nothing added.</p>
    </Card>
  );
};

/* WHICH MODEL SEARCHES COLUMN MEANINGS - a saved strategy's, changed here
   without reconnecting (engine: POST /sql/strategy). */
const MeaningPicker: React.FC<{ info: any; onChange: () => void }> = ({ info, onChange }) => {
  const { flash } = useRag();
  const [list, setList] = useState<any[]>([]);
  useEffect(() => {
    get('/sql/strategies').then((r: any) => setList((r && r.strategies) || [])).catch(() => {});
  }, []);
  const m = (info && info.meaning) || {};
  const current = (m.strategy && m.strategy.key) || '';
  return (
    <span className="flex items-center gap-2 text-xs text-slate-400 min-w-0" data-testid="sql-meaning">
      Meaning search:
      <select
        className={`${INPUT} !py-1 !text-xs max-w-[320px]`}
        value={current}
        onChange={async (e) => {
          try {
            const r = await post('/sql/strategy', { strategy: e.target.value });
            flash(r.used ? `Meaning search with ${r.strategy.model || r.strategy.embedding}` : `Meaning search off - ${r.why}`);
          } catch (err) {
            flash(msg(err));
          }
          onChange();
        }}
      >
        <option value="">off - names only</option>
        {list.map((s) => (
          <option key={s.key} value={s.key} disabled={!s.usable}>
            {s.name} · {s.model || 'no model'}
          </option>
        ))}
      </select>
      {current && !m.used && <span className="text-amber-400">{m.why}</span>}
    </span>
  );
};

export const AskDatabaseTab: React.FC = () => {
  const { flash } = useRag();

  const [info, setInfo] = useState<any>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [res, setRes] = useState<any>(null);
  const [showRows, setShowRows] = useState(false);

  /* The three things SQL mode has that this screen never showed: the query
     can be edited and re-run, an answer can be saved as a report, and the
     columns can be given business meanings. All three are the engine's,
     already built and already tested; only the door was missing. */
  const [edit, setEdit] = useState<string | null>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [saveName, setSaveName] = useState('');

  async function load() {
    try {
      setInfo(await get('/sql/schema'));
    } catch {
      /* not connected yet — the connect panel below says so */
    }
  }

  async function loadReports() {
    try {
      const r = await get('/sql/reports');
      setReports((r && r.reports) || r || []);
    } catch {
      /* no reports yet */
    }
    /* Every question asked, saved or not. Saving is what makes one
       findable by name; the history is what makes "what did we ask last
       week" answerable at all. */
    try {
      const h = await get('/sql/history?limit=25');
      setHistory((h && h.queries) || h || []);
    } catch {
      /* no history yet */
    }
  }

  useEffect(() => {
    load();
    loadReports();
  }, []);

  const tables = tableNames(info);

  /** What the connection is to, for the bar above the question box. The engine
      already describes it - dialect://user@host/db?schema=x - so nothing is
      reassembled here out of the form fields, which would drift. */
  const connectedTo = (info && info.target) || 'a database';

  async function disconnect() {
    setBusy('Disconnecting…');
    try {
      const r = await post('/sql/disconnect');
      flash(r.disconnected ? 'Disconnected.' : 'Nothing was connected.');
      setInfo(null);
      setRes(null);
    } catch (e) {
      flash(msg(e));
    }
    setBusy('');
  }

  async function ask() {
    if (!q.trim()) return;
    setBusy('Reading the schema, writing the query, checking it…');
    setRes(null);
    setShowRows(false);
    try {
      // Everything the full console exposes as a control is decided here.
      // bank_grade is the strictest guardrail; a model may draft, because
      // whatever it drafts is verified against the real schema before it runs.
      setRes(await post('/sql', { question: q, guardrail: 'bank_grade', row_limit: 1000, allow_model: true }));
      loadReports();
    } catch (e) {
      flash(msg(e));
    }
    setBusy('');
  }

  async function runEdited() {
    setBusy('Checking the query, then running it…');
    try {
      const r = await post('/sql/run', { sql: edit, question: q, row_limit: 1000 });
      setRes(r);
      setEdit(null);
      setShowRows(false);
      loadReports();
    } catch (e) {
      flash(msg(e));
    }
    setBusy('');
  }

  async function saveReport() {
    setBusy('Saving…');
    try {
      await post('/sql/reports', { query_id: res.query_id, name: saveName.trim() });
      setSaveName('');
      await loadReports();
      flash('Saved');
    } catch (e) {
      flash(msg(e));
    }
    setBusy('');
  }

  async function unsave(id: string) {
    try {
      await del('/sql/reports/' + encodeURIComponent(id));
      await loadReports();
    } catch (e) {
      flash(msg(e));
    }
  }

  async function download(fmt: string) {
    setBusy('Building the ' + fmt.toUpperCase() + '…');
    try {
      const r = await fetch(withKb('/sql/export'), {
        method: 'POST',
        headers: fileHeaders(),
        body: JSON.stringify({
          question: q,
          /* THE SQL THAT PRODUCED WHAT IS ON SCREEN, when a reader rewrote it.

             This used to send only the question, so somebody who edited the
             query and ran it was looking at one result and downloading
             another - while the panel beside this button said "a download is
             always the database's own answer". It was; just not the answer in
             front of them. The engine re-runs whatever it is given through the
             same verifier /sql/run uses, so sending the SQL is not the same as
             trusting it. */
          sql: (res && res.path === 'edited' && res.sql) || '',
          guardrail: 'bank_grade',
          row_limit: 1000,
          allow_model: true,
          fmt,
        }),
      });
      if (r.status === 401) {
        // Every other call reaches this through apiClient.guard. This one uses
        // fetch directly for the blob, so without this an expired session
        // during an export reads as "Export failed" - a server problem for
        // something that is a sign-in problem.
        flash('Your session has expired - sign in again.');
      } else if (!r.ok) {
        const said = (await r.json().catch(() => ({}))) as any;
        flash((said.detail && (said.detail.detail || said.detail.title))
              || said.detail || 'Export failed');
      } else {
        const name = (r.headers.get('Content-Disposition') || '').match(/filename="(.+?)"/);
        const url = URL.createObjectURL(await r.blob());
        const a = document.createElement('a');
        a.href = url;
        a.download = (name && name[1]) || 'result.' + fmt;
        document.body.appendChild(a);
        a.click();
        a.remove();
        /* REVOKED ON THE NEXT TICK, not on this one. Chrome copes with an
           immediate revoke; Firefox and Safari can cancel a download whose
           object URL disappeared in the same task. */
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }
    } catch (e) {
      flash(msg(e));
    }
    setBusy('');
  }

  const rows: any[] = (res && res.rows) || [];
  const answered = res && res.decision === 'answer';

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {!tables.length && <ConnectDatabase onConnected={load} />}

      {/* ONCE CONNECTED, THE PANEL THAT HELD DISCONNECT IS GONE.

          ConnectDatabase renders only while there are no tables, which is
          right - a form for a thing that is already done is clutter. But the
          Disconnect button lived inside it, so the moment a connection
          succeeded there was no way to close it from the screen a reader is
          actually on. Found by driving the flow end to end: connect, and both
          the panel and the button vanish together.

          So the state and the way out are one line above the question box:
          what is open, and how to close it. */}
      {tables.length > 0 && (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 shadow-xl
                        px-4 py-3 flex items-center gap-3 flex-wrap">
          <Database className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="text-xs text-slate-300 min-w-0">
            Connected ·{' '}
            <b className="text-white font-mono break-all">{connectedTo}</b>{' '}
                <span className="text-slate-500">
              · {tables.length} table{tables.length === 1 ? '' : 's'}
            </span>
          </span>
          <MeaningPicker info={info} onChange={load} />
          <button className={`${BTN} ml-auto shrink-0`} disabled={!!busy}
                  onClick={disconnect}>
            Disconnect
          </button>
        </div>
      )}

      {/* What the columns MEAN, in business terms. The schema is always
          read from the database; this is the layer above it, and it is
          what lets a question asked in the bank's own words find the
          right column. */}
      {/* The dictionary, and the pack it produces.
          THE SCHEMA IS ALWAYS READ FROM THE DATABASE - that is not
          optional and never will be. These two are the layer above it:
          what the columns MEAN, and what the agent service is handed as a
          result. The old panel took one Markdown shape and fed only this
          engine's own linker; a bank's dictionary is whatever it already
          is, and the consumer that matters is the agent. */}
      {tables.length > 0 && <BusinessDictionary onLoaded={load} />}
      {tables.length > 0 && <AgentContext />}

      {/* Everything asked, saved or not — including the ones that were
          refused. This used to sit inside "Keep this answer", which only
          exists when there IS an answer, so the refusals it was built to
          show could never appear. */}
      {history.length > 0 && (
        <Card>
          <CardTitle>Asked recently</CardTitle>
          <p className={`${HELP} mt-1`}>
            The last {history.length}. A refused question is kept too — a history of only the
            successful ones reads as a system that never says no.
          </p>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="text-slate-400 uppercase tracking-wider text-[10px] font-mono border-b border-slate-800">
                <tr>
                  <th className="py-2 px-3 font-semibold">Question</th>
                  <th className="py-2 px-3 font-semibold w-20">Rows</th>
                  <th className="py-2 px-3 font-semibold w-28">Answered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {history.slice(0, 10).map((h, i) => (
                  <tr key={i}>
                    <td className="py-2.5 px-3">{h.question}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">
                      {h.rows != null ? h.rows : '—'}
                    </td>
                    <td className="py-2.5 px-3">
                      {h.ok === false ? <Pill tone="warn">refused</Pill> : <Pill tone="good">yes</Pill>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tables.length > 0 && (
        <Card>
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <CardTitle>Your question</CardTitle>
            <span className={HELP}>· {tables.length} tables connected</span>
          </div>
          <textarea
            rows={2}
            className={`${INPUT} mt-3`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="How many loans were disbursed by each branch last quarter?"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ask();
            }}
          />
          <button className={`${BTN_PRI} mt-3`} disabled={!!busy || !q.trim()} onClick={ask}>
            {busy || 'Ask'}
          </button>
        </Card>
      )}

      {res && !answered && (
        <Card className="border-amber-500/40">
          <CardTitle>It did not answer this one</CardTitle>
          <p className={`${HELP} mt-1.5`}>
            {res.clarify ||
              'The question could not be tied to the schema with enough certainty to run a query.'}
          </p>
          <p className={`${HELP} mt-2.5`}>
            Refusing is deliberate. A number produced from a query nobody could check is worse than
            no number, and this screen is built for a bank.
          </p>
        </Card>
      )}

      {answered && (
        <div className="space-y-4">
          <Card>
            <div className="flex gap-2 items-center flex-wrap">
              <Pill tone="good">verified against the schema</Pill>
              <Pill tone="info">read-only</Pill>
              {res.limit_added && <Pill tone="info">a row limit was added</Pill>}
              {/* `pii` is a report keyed by column, not a count — read as a
                  number it was always falsy and the masking never showed. */}
              {res.pii && Object.keys(res.pii).length > 0 && (
                <Pill tone="warn">personal data masked in {Object.keys(res.pii).join(', ')}</Pill>
              )}
              <Pill tone="info">
                {res.path === 'rules'
                  ? 'written by rules'
                  : res.path === 'edited'
                    ? 'edited by hand'
                    : 'drafted by a model, then verified'}
              </Pill>
            </div>
            <div className="mt-3">
              <Markdown text={res.markdown} />
            </div>
          </Card>

          <ResultChart rows={rows} />

          {/* The answer above already carries the first 20 rows and the
              query that produced them. A second copy of both is noise on a
              screen whose whole job is to be simple — so the full table
              appears only when the answer had to truncate it. */}
          {rows.length > 20 && (
            <Card>
              <button className={BTN} onClick={() => setShowRows(!showRows)}>
                {showRows ? 'Hide the rest' : `Show all ${rows.length} rows`}
              </button>
              {showRows && (
                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="text-slate-400 uppercase tracking-wider text-[10px] font-mono border-b border-slate-800">
                      <tr>
                        {Object.keys(rows[0]).map((c) => (
                          <th key={c} className="py-2 px-3 font-semibold">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {rows.map((r, i) => (
                        <tr key={i}>
                          {Object.keys(rows[0]).map((c) => (
                            <td key={c} className="py-2 px-3">
                              {String(r[c])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {/* The query, open for editing. An analyst who can read SQL will
              want to adjust it, and refusing that sends them to a database
              client where nothing is checked at all. /sql/run puts a
              hand-written query through the SAME verifier the model's
              drafts go through. */}
          {res.sql && (
            <Card>
              <CardTitle>The query</CardTitle>
              <p className={`${HELP} mt-1`}>
                Edit it and run it again. It goes through the same check either way — one
                statement, SELECT only, every table real, a row cap applied. Being written by a
                person does not make a string safe.
              </p>
              {edit === null ? (
                <div className="mt-3">
                  <pre className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-emerald-300 whitespace-pre-wrap overflow-x-auto">
                    {res.sql}
                  </pre>
                  <button className={`${BTN} mt-3`} onClick={() => setEdit(res.sql)}>
                    Edit this query
                  </button>
                </div>
              ) : (
                <div className="mt-3">
                  <textarea
                    rows={5}
                    className={MONO_AREA}
                    value={edit}
                    onChange={(e) => setEdit(e.target.value)}
                  />
                  <div className="flex gap-2 mt-3">
                    <button className={BTN_PRI} disabled={!!busy} onClick={runEdited}>
                      {busy || 'Run it'}
                    </button>
                    <button className={BTN} onClick={() => setEdit(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Saved reports. The history row is kept either way; saving is
              what makes a question findable again by name. */}
          {res.query_id && (
            <Card>
              <div className="flex items-center gap-2">
                <Save className="w-4 h-4 text-emerald-400" />
                <CardTitle>Keep this answer</CardTitle>
              </div>
              <p className={`${HELP} mt-1`}>
                Saved under a name you choose, in the workspace — so the same question can be
                re-run later against whatever the data says then.
              </p>
              <div className="flex gap-2 mt-3">
                <input
                  className={INPUT}
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Loans by branch, quarterly"
                />
                <button
                  className={`${BTN_PRI} shrink-0`}
                  disabled={!saveName.trim() || !!busy}
                  onClick={saveReport}
                >
                  Save
                </button>
              </div>

              {reports.length > 0 && (
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="text-slate-400 uppercase tracking-wider text-[10px] font-mono border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3 font-semibold">Saved</th>
                        <th className="py-2 px-3 font-semibold">Question</th>
                        <th className="py-2 px-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {reports.map((r, i) => (
                        <tr key={i}>
                          <td className="py-2.5 px-3 font-semibold text-white">{r.name}</td>
                          <td className="py-2.5 px-3 text-slate-400">{r.question}</td>
                          <td className="py-2.5 px-3 text-right">
                            <button className={BTN} onClick={() => unsave(r.query_id || r.id)}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {rows.length > 0 && (
            <Card>
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-emerald-400" />
                <CardTitle>Take it away</CardTitle>
              </div>
              <p className={`${HELP} mt-1`}>
                Every row, not the ones on screen. It is re-run against the database for the
                file, so a download is always the database's own answer - and when the query
                has been edited by hand, it is <b className="text-slate-200">that</b> query
                that is re-run, not the original question.
              </p>
              <div className="flex gap-2 mt-3 flex-wrap">
                {EXPORTS.map(([fmt, label]) => (
                  <button key={fmt} className={BTN} disabled={!!busy} onClick={() => download(fmt)}>
                    {label}
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};
