
import React, { useEffect, useState } from 'react';
import { groupName, userGroupIds } from '../../api/groupDirectory';
import { Database, Plus, Users, AlertTriangle } from 'lucide-react';
import { get, msg } from '../../rag/apiClient';
import { configChunkers, configCreateKb, configStrategies } from '../../rag/configBridge';
import { PlatformGroup } from '../../rag/platformApi';
import { ChunkMethod, Strategy, LIMITS } from '../../rag/ragTypes';
import { labelOf } from '../../rag/ragUtils';
import { useRag } from '../../rag/RagContext';
import { usePlatform } from '../../context/PlatformContext';
import { PERMISSIONS } from '../../config/permissions';
import { Field, Modal } from '../../rag/Overlays';
import { Bar, BTN, BTN_PRI, Card, HELP, INPUT } from '../../rag/RagUI';

/* ------------------------------------------------------------------
   Name, the groups it belongs to, the strategy to build it from, and its own
   collection. Nothing else — everything else came from the strategy.

   GROUPS ARE NO LONGER TYPED. They come from ccil.aiplatform.auth, which owns
   them, and only the ones the signed-in person belongs to can be chosen. The
   free-text box this replaces let anyone invent a group by misspelling one,
   and the knowledge base that came out belonged to a group that existed in
   exactly one row of one table — invisible to every picker, including its own
   author's.
------------------------------------------------------------------- */

/* A MODAL, NOT A TAB.
   Creating a knowledge base is a form that ADDS to the list on Manage KBs, so
   it belongs on top of that list rather than behind a tab of its own. One
   fewer tab, and the list a reader was looking at is still there underneath
   when the form closes - with the new row in it. */
export const CreateKbTab: React.FC<{
  open: boolean;
  onClose: () => void;
  onCreated: (name: string) => void;
}> = ({ open, onClose, onCreated }) => {
  const { flash, kbs } = useRag();
    const { groups: directoryGroups, currentUser, hasPermission } = usePlatform();
  const [label, setLabel] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);   // platform group IDS
 
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [picked, setPicked] = useState('');
  const [collection, setCollection] = useState('');
  const [known, setKnown] = useState<any>(null);
  const [collMode, setCollMode] = useState<'new' | 'existing'>('new');
  const [methods, setMethods] = useState<ChunkMethod[]>([]);
  const [busy, setBusy] = useState('');

  const [database, setDatabase] = useState('sqlite');
  const [dbOptions, setDbOptions] = useState<any>(null);

  useEffect(() => {
    configStrategies().then(setStrategies).catch(() => {});
    configChunkers().then(setMethods).catch(() => {});
    // Offering a choice that cannot work is how a screen ends up with an error
    // message where a knowledge base should be, so the page asks first.
    get('/kbs/databases').then(setDbOptions).catch(() => setDbOptions(null));
  }, []);
  const strategy = strategies.find((s) => s.name === picked);
  const store = (strategy && strategy.storage) || ({} as any);
  const engine = store.vector_backend || 'own';
  /* pgvector ON THE KNOWLEDGE BASE'S OWN SERVER keeps its vectors in a table
     called `vectors` inside the base's own schema - the schema is the
     namespace, and the engine never reads a collection name for it
     (kb/store/vector_backends.py, PgVectorBackend). Asking for one there was
     a field that did nothing. Only a separate vector server needs a name. */
  const storeCfg = (store.backend_config || {}) as any;
  const pgInOwnSchema = engine === 'pgvector' && !storeCfg.host && !storeCfg.url;
  const needsCollection = engine !== 'own' && !pgInOwnSchema;
  const label2 = (n: string) => labelOf(methods, n);
  const taken = kbs.some(
    (k) => (k.label || k.name || '').trim().toLowerCase() === label.trim().toLowerCase(),
  );

  const admin = hasPermission(PERMISSIONS.Group.View);
  const claimedGroupIds = new Set(userGroupIds(currentUser?.groups));
  const groups = directoryGroups.map((g) => ({
    id: g.id,
    name: g.name || g.id,
    description: g.description || undefined,
    isActive: g.isActive,
    mine: claimedGroupIds.has(g.id),
  })) as PlatformGroup[];
  const fromToken = !admin;

  const selectable = (g: PlatformGroup) => g.mine || admin;
  const mine = (groups || []).filter(selectable);
  const others = (groups || []).filter((g) => !selectable(g));
  const singleGroup = mine.filter((g) => g.isActive).length === 1;
    useEffect(() => {                                          // 👈 YAHIN DAALNA HAI
    const active = groups.filter((g) => g.isActive && (g.mine || admin));
    if (active.length === 1 && chosen.length === 0) setChosen([active[0].id]);
  }, [groups, admin, chosen.length]);


  const offered = ((dbOptions && dbOptions.options) || []).filter((o: any) => o.available);

  function toggle(id: string) {
    setChosen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function lookExisting() {
    setBusy('Looking for existing collections…');
    try {
      const q =
        '/storage/collections?backend=' +
        encodeURIComponent(engine) +
        '&path=' +
        encodeURIComponent((store.backend_config || {}).path || '') +
        '&url=' +
        encodeURIComponent((store.backend_config || {}).url || '');
      setKnown(await get(q));
    } catch (e) {
      flash(msg(e));
    }
    setBusy('');
  }

  async function create() {
    if (!label.trim()) {
      flash('Give the knowledge base a name');
      return;
    }
    if (!chosen.length) {
      flash('Choose at least one group');
      return;
    }
    setBusy('Creating…');
    try {
      const made: any = await configCreateKb({
        label: label.trim(),
        owner_groups: chosen,        // platform ids; the service resolves them
        strategy: picked,
        collection: collection.trim(),
        database,
      });
      if (made && made.detail) {
        setBusy('');
        flash('Not created — ' + made.detail);
        return;
      }
      if (!made.created) {
        setBusy('');
        flash('Not created — ' + (made.reason || 'unknown'));
        return;
      }
      const st = made.storage;
      if (st && st.switched === false) {
        // A base whose storage quietly fell back to the built-in store is
        // worse than one that was not created.
        setBusy('');
        flash('Storage not connected — ' + (st.reason || 'unknown reason'));
        return;
      }
      setBusy('');
      flash('Knowledge base ready');
      onCreated(made.name);
    } catch (e) {
      setBusy('');
      flash(msg(e));
    }
  }

  const groupTile = (g: PlatformGroup) => {
    const on = chosen.includes(g.id);
    return (
      <label
        key={g.id}
        className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-xs transition-colors ${
          !selectable(g)
            ? 'bg-slate-950/40 border-slate-800 text-slate-500 cursor-not-allowed opacity-60'
            : on
              ? 'bg-emerald-950/40 border-emerald-500/40 text-slate-200 cursor-pointer'
              : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800/50 cursor-pointer'
        }`}
        title={selectable(g) ? undefined : 'You are not a member of this group'}
      >
        <input
          type="checkbox"
          disabled={!selectable(g)}
          checked={on}
          onChange={() => toggle(g.id)}
          className="mt-0.5 rounded border-slate-700 bg-slate-800 accent-emerald-500"
        />
        <span className="min-w-0">
          <span className="block font-semibold text-slate-200">{groupName(g.id)}</span>
          {g.description && (
            <span className="block text-[10px] text-slate-500 truncate">{g.description}</span>
          )}
          {!g.mine && (
            <span className="block text-[10px] text-slate-500">
              {admin ? 'not your group — allowed because you are an administrator' : 'not your group'}
            </span>
          )}
        </span>
      </label>
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Create a knowledge base"
      footer={
        <>
          <button className={BTN} disabled={!!busy} onClick={onClose}>
            Cancel
          </button>
          <button
            className={`${BTN_PRI} flex items-center gap-2`}
            disabled={!!busy || !label.trim() || taken || !chosen.length}
            onClick={create}
          >
            <Plus className="w-4 h-4" />
            <span>{busy || 'Create knowledge base'}</span>
          </button>
        </>
      }
    >

        <Field label="Name" hint="What people will see it called. The permanent key is derived from this once, at creation.">
          <div className="max-w-md">
            <input
              className={INPUT}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Settlement Guidelines KB"
              maxLength={LIMITS.name}
            />
            {taken && (
              <span className="text-[11px] text-amber-400">
                A knowledge base with this name already exists.
              </span>
            )}
          </div>
        </Field>

        <Field
          label="Strategy"
          hint="Built on the Strategies screen. It decides chunking, Top-K, guardrail, embedding model and vector store - and is COPIED in now rather than followed afterwards."
        >
          <div className="max-w-md">
            <select
              className={INPUT}
              value={picked}
              onChange={(e) => {
                setPicked(e.target.value);
                setKnown(null);
              }}
            >
              <option value="">Defaults (no saved strategy)</option>
              {strategies.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {strategy && (
            <div className="mt-3 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
              <span className="text-[11px] text-emerald-300 font-semibold uppercase tracking-wider">
                This strategy will apply
              </span>
              <ul className="mt-2 pl-4 list-disc text-xs text-slate-300 space-y-1">
                <li>
                  Split by <b className="text-white">{label2(strategy.config.chunking)}</b>
                </li>
                <li>
                  Evidence ceiling <b className="text-white">top-{strategy.config.top_k}</b> ·
                  guardrail <b className="text-white">{strategy.config.guardrail}</b>
                </li>
                <li>
                  Stored in <b className="text-white">{engine}</b>
                  {(store.backend_config || {}).path ? (
                    <span>
                      {' '}
                      at <span className="font-mono">{store.backend_config.path}</span>
                    </span>
                  ) : null}
                </li>
              </ul>
              <span className={`${HELP} block mt-2`}>
                These values are copied in now. Editing the strategy later will not change this
                knowledge base.
              </span>
            </div>
          )}
        </Field>

        {needsCollection ? (
          <Field
            label="Collection"
            hint="The one storage setting a strategy does not carry - two knowledge bases must never share a collection."
          >
            <div className="flex gap-2 mb-3">
              {([['new', 'Create a new one'], ['existing', 'Use an existing one']] as const).map(
                ([k, l]) => (
                  <button
                    key={k}
                    className={collMode === k ? BTN_PRI : BTN}
                    onClick={() => {
                      setCollMode(k);
                      if (k === 'existing') lookExisting();
                    }}
                  >
                    {l}
                  </button>
                ),
              )}
            </div>
            {collMode === 'existing' &&
              known &&
              (known.supported ? (
                known.collections.length ? (
                  <div className="max-w-sm">
                    <select
                      className={INPUT}
                      value={collection}
                      onChange={(e) => setCollection(e.target.value)}
                    >
                      <option value="">Choose one…</option>
                      {known.collections.map((c: string) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className={HELP}>This store has no collections yet — create a new one.</p>
                )
              ) : (
                <p className="text-xs text-amber-400">
                  Cannot list them here: {known.reason} Type the name below instead.
                </p>
              ))}
            {(collMode === 'new' || !known || !known.supported) && (
              <div className="max-w-sm mt-2">
                <input
                  className={INPUT}
                  value={collection}
                  onChange={(e) => setCollection(e.target.value)}
                  placeholder="e.g. risk_atoms"
                />
              </div>
            )}
          </Field>
           ) : (
          <Field
            label="Collection"
            hint={
              pgInOwnSchema
                ? "pgvector keeps this base's vectors in its own schema, beside its documents."
                : 'The built-in store keeps vectors with the knowledge base itself.'
            }
          >
            <p className={HELP}>
              {pgInOwnSchema
                ? 'Nothing to choose - the vectors go in a `vectors` table in this knowledge base\'s own schema, so no two bases can share one.'
                : 'Nothing to choose.'}
            </p>
          </Field>
        )}

        {/* A FIFTH step only when there is genuinely a choice. With no Postgres
            server configured this renders nothing at all — a dropdown with one
            option in it is not a choice, it is a thing to read and dismiss. */}
        {offered.length > 1 && (
          <Field
            label="Database"
            hint="Chosen once, now. Knowledge bases that already exist are not affected and are never moved."
          >
            <div className="flex gap-2 flex-wrap">
              {offered.map((o: any) => (
                <button
                  key={o.id}
                  className={database === o.id ? BTN_PRI : BTN}
                  onClick={() => setDatabase(o.id)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className={`${HELP} mt-2 max-w-xl`}>
              {(offered.find((o: any) => o.id === database) || {}).detail}
            </p>
          </Field>
        )}

               <Field
          label={singleGroup ? "Group" : "Owner groups"}
          hint={
            fromToken
              ? "Groups come from your signed-in account. You can only assign ownership to groups available to this account."
              : "As an administrator, the platform group directory is available here."
          }
        >
          {groups.length === 0 ? (
            <p className={HELP}>
              No active groups are available for this account. Ask an administrator to add you to a group, then sign in again.
            </p>
          ) : singleGroup ? (
            <div className="px-3 py-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-[11px] text-indigo-200">
              {mine.find((g) => g.isActive)?.name || mine.find((g) => g.isActive)?.id}
              <span className="text-slate-500 ml-2">Assigned from your sign-in</span>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-[11px] text-slate-400">
                {admin ? "Select one or more groups for ownership." : "Select one or more of your groups for ownership."}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {mine.filter((g) => g.isActive).map(groupTile)}
              </div>
              {others.length > 0 && (
                <details className="mt-1">
                  <summary className="text-[11px] text-slate-500 cursor-pointer hover:text-slate-300">
                    {others.length} other group{others.length === 1 ? "" : "s"} on the platform
                  </summary>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                    {others.filter((g) => g.isActive).map(groupTile)}
                  </div>
                </details>
              )}
              <div className="text-[11px] text-slate-500">{chosen.length} selected</div>
            </div>
          )}
        </Field>




      {busy && <Bar />}
    </Modal>
  );
};
