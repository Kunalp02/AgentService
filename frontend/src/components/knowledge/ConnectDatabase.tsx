
import React, { useEffect, useState } from 'react';
import { Server } from 'lucide-react';
import { cfg, get, msg, post } from '../../rag/apiClient';
import { tableNames } from '../../rag/ragUtils';
import { useRag } from '../../rag/RagContext';
import { BTN, BTN_PRI, Card, CardTitle, HELP, INPUT, LABEL } from '../../rag/RagUI';

/* ------------------------------------------------------------------
   WHICH databases may be used is configuration, so the list comes from
   the .NET configuration service — two, Oracle and PostgreSQL. The
   engine can open five; offering all five here would be the engine's
   capability standing in for a decision nobody made.

   The password never goes to the configuration service. It checks the
   shape and hands back a descriptor; this page adds the credential and
   gives the whole thing to the engine, which is the only process that
   has to open a socket.
------------------------------------------------------------------- */

export const ConnectDatabase: React.FC<{ onConnected?: () => void }> = ({ onConnected }) => {
  const { flash } = useRag();

  const [list, setList] = useState<any[]>([]);
  const [dialect, setDialect] = useState('');
  const [f, setF] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
   const [info, setInfo] = useState<any>(null);
  const [dbs, setDbs] = useState<any[]>([]);
  // THE MODEL FOR MEANING SEARCH COMES FROM A SAVED STRATEGY - one of the
  // caller's, with an embedding model. The column index is SQL mode's own;
  // only the model is the strategy's (engine: GET /sql/strategies).
  const [strategies, setStrategies] = useState<any[]>([]);
  const [strategy, setStrategy] = useState('');
  const [meaning, setMeaning] = useState<any>(null);

  useEffect(() => {
    get('/sql/schema').then(setInfo).catch(() => {});
    // /sql/databases answers {databases:[...]}, an object. Read as a list
    // it has no .length and the panel silently never appears.
    get('/sql/databases')
      .then((r) => {
        setDbs((r && r.databases) || []);
        setMeaning(r && r.meaning);
      })
      .catch(() => {});
    get('/sql/strategies')
      .then((r: any) => {
        const all = (r && r.strategies) || [];
        setStrategies(all);
        const first = all.find((s: any) => s.usable);
        if (first) setStrategy(first.key);
      })
      .catch(() => {});
    cfg('GET', '/database-types')
      .then((c: any[]) => {
        setList(c);
        if (c.length) setDialect(c[0].dialect);
      })
      .catch((e) => flash('Configuration service: ' + msg(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const spec = list.find((d) => d.dialect === dialect) || { fields: [] };
  const fields: any[] = spec.fields || [];
  const ready = fields
    .filter((x) => x.required && x.name !== 'port')
    .every((x) => (f[x.name] || '').trim());

  async function disconnect() {
    setBusy(true);
    try {
      const r = await post('/sql/disconnect');
      // Idempotent on the server: disconnecting when nothing is open is the
      // state the caller asked for, not an error. The screen says which
      // happened rather than claiming a close that did not occur.
      flash(r.disconnected ? 'Disconnected.' : 'Nothing was connected.');
      setDbs([]);
      setInfo(null);
      onConnected && onConnected();
    } catch (e) {
      flash(msg(e));
    }
    setBusy(false);
  }

  async function connect() {
    setBusy(true);
    try {
      // 1. the configuration service checks it and normalises it
      const planned = await cfg('POST', '/database-connections/plan', {
        dialect,
        host: f.host || '',
        port: Number(f.port) || 0,
        dbname: f.dbname || '',
        user: f.user || '',
        // THE SCHEMA GOES TO THE PLAN, not only to the engine.
        //
        // DatabaseConnectionRequest has always had it and
        // PlanDatabaseConnection has always returned it - defaulted to `public`
        // on PostgreSQL when nothing is sent, which is right. Sending it only
        // to the engine afterwards opened the RIGHT schema while `planned`,
        // and the `target` string built from it, still said `schema=public`.
        // The connection was correct and the sentence flashed over it was not.
        schema: f.schema || '',
      });
      // 2. the engine opens it, with the one thing the plan does not carry:
      //    the credential, which this page never sends anywhere else.
      //
      //    THE SCHEMA WAS BEING DROPPED. The plan is about which dialect this
      //    deployment allows and whether the request is complete, so it takes
      //    dialect, host, port, dbname and user - and `planned` was then sent
      //    to the engine as the whole connection. Whatever a reader typed in
      //    the Schema box went nowhere.
      //
      //    Measured, driving the real screens: typed `bankdemo`, connected,
      //    and the Connected row read
      //    `postgres://ccil@127.0.0.1:5440/ccil_ai_platform?schema=public`
      //    with 0 tables and 0 columns. The box was on the form, it was
      //    required by nothing, and it did nothing.
      const r = await post('/sql/connect', {
        ...planned,
        schema: f.schema || '',
        password: f.password || '',
        strategy,
      });
      setMeaning(r && r.meaning);
      /* THE ENGINE DOES NOT ANSWER `connected`.
      
         It answers {databases, selected, dialects, row_limits} - the same body
         GET /sql/databases gives - and this tested `r.connected`, which is
         always undefined. So the failure branch ran every time: a connection
         that had really been opened was reported as
         "Could not connect - unknown reason", and the panel never showed the
         connected list or told the screen above it to reload.
      
         Found by driving the real screens end to end: POST /sql/connect
         returned 200 and the form was still sitting there afterwards.
      
         `post()` throws on any non-2xx, so reaching this line IS the success.
         The list is read from the answer rather than asked for again. */
      const opened = (r && Array.isArray(r.databases) && r.databases.length > 0);
      if (!opened) {
        flash('Could not connect — ' + ((r && r.error) || 'the engine opened no session'));
      } else {
        flash('Connected to ' + planned.target);
        /* THE CONNECTION IS SHOWN FIRST, and the schema read comes after.

           These were the other way round, with the schema read AWAITED before
           the list was set - so a hiccup on GET /sql/schema threw into the
           catch below and the panel never learned that the connection had been
           opened at all. Measured: POST /sql/connect answered 200, a following
           /sql/schema answered 409, and the screen still showed the empty
           connect form with "Could not connect" flashed over it.

           A follow-up read failing must not hide a connection that succeeded.
           The list is straight from the reply - /sql/connect already answered
           with it, so asking again is a second round trip for something we
           hold. */
        setDbs(r.databases);
        onConnected && onConnected();
        try {
          setInfo(await get('/sql/schema'));
        } catch {
          // The table list is a convenience; the screens below read it
          // themselves. A failure here is not a failed connection.
        }
      }
    } catch (e) {
      flash(msg(e));
    }
    setBusy(false);
  }

  const tables = tableNames(info);

  return (
    <Card>
      <div className="flex items-center gap-2">
        <Server className="w-4 h-4 text-cyan-400" />
        <CardTitle>Connect a database</CardTitle>
      </div>
      <p className={`${HELP} mt-1.5`}>
        The schema is read from the database itself, so questions are answered against what really
        exists. The connection is read-only — nothing can be written or deleted through it.
      </p>

      <div className="flex gap-3 mt-4 items-end flex-wrap">
        <div style={{ width: 190 }}>
          <label className={LABEL}>Database</label>
          <select
            className={INPUT}
            value={dialect}
            onChange={(e) => {
              setDialect(e.target.value);
              setF({});
            }}
          >
                 {list.map((d) => (
              <option key={d.dialect} value={d.dialect}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ width: 260 }}>
          <label className={LABEL}>Strategy (model for meaning search)</label>
          <select
            className={INPUT}
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            data-testid="sql-strategy"
          >
            <option value="">None - match column names only</option>
            {strategies.map((s) => (
              <option key={s.key} value={s.key} disabled={!s.usable}>
                {s.name} · {s.model || 'no model'}
                {s.usable ? '' : ' (not a model - cannot search meanings)'}
              </option>
            ))}
          </select>
        </div>

        {fields.map((x) => (
          <div key={x.name} style={{ flex: x.name === 'port' ? '0 0 92px' : '1 1 150px' }}>
            <label className={LABEL}>{x.label}</label>
            <input
              className={INPUT}
              type={x.secret ? 'password' : 'text'}
              value={f[x.name] || ''}
              placeholder={x.name === 'port' ? (dialect === 'oracle' ? '1521' : '5432') : ''}
              onChange={(e) => setF({ ...f, [x.name]: e.target.value })}
            />
          </div>
        ))}

        <button className={`${BTN_PRI} shrink-0`} disabled={busy || !ready} onClick={connect}>
          {busy ? 'Connecting…' : 'Connect'}
        </button>
      </div>

      {!list.length && (
        <p className="text-xs text-amber-400 mt-3">
          The configuration service is not answering, so there is nothing to offer.
        </p>
      )}

      {dbs.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Connected
            </p>
            {/* THERE WAS NO WAY TO CLOSE IT.

                A reader who had finished with a customer's database left the
                socket open and the credentials they typed sitting in the
                engine until it was restarted - and this panel had no button to
                offer, because POST /sql/disconnect did not exist. */}
                   <button className={BTN} disabled={busy} onClick={disconnect}>
              Disconnect
            </button>
          </div>
          {meaning && (
            <p className={`${HELP} mt-1`} data-testid="sql-meaning">
              {meaning.used
                ? `Meaning search with ${meaning.strategy.model || meaning.strategy.embedding}, the model of strategy "${meaning.strategy.name}".`
                : `Meaning search off - ${meaning.why}.`}
            </p>
          )}
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="text-slate-400 uppercase tracking-wider text-[10px] font-mono border-b border-slate-800">
                <tr>
                  <th className="py-2 px-3 font-semibold">Name</th>
                  <th className="py-2 px-3 font-semibold">Dialect</th>
                  <th className="py-2 px-3 font-semibold">Tables</th>
                  <th className="py-2 px-3 font-semibold">Columns</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {dbs.map((d, i) => (
                  <tr key={i}>
                    <td className="py-2 px-3 text-white">{d.name || d.label || '—'}</td>
                    <td className="py-2 px-3 text-slate-400">{d.dialect || '—'}</td>
                    <td className="py-2 px-3 text-slate-400">{d.tables != null ? d.tables : '—'}</td>
                    <td className="py-2 px-3 text-slate-400">
                      {d.columns != null ? d.columns : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tables.length > 0 && (
        <div className="mt-5">
          <p className="text-xs text-slate-300">
            <b className="text-white">{tables.length} tables</b> are available to ask about.
          </p>
          <p className="font-mono text-[11px] text-slate-400 mt-1.5 break-words">
            {tables.join(' · ')}
          </p>
        </div>
      )}
    </Card>
  );
};
