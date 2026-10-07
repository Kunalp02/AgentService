
import React, { useEffect, useState } from 'react';
import { groupName, userGroupIds } from '../../api/groupDirectory';
import { Database, Trash2, Pencil, Plus, X, AlertTriangle, Users } from 'lucide-react';
import { get, msg } from '../../rag/apiClient';
import {
  configDeleteKb,
  configKnowledgeBases,
  configStrategies,
  configUpdateKb,
} from '../../rag/configBridge';
import { PlatformGroup } from '../../rag/platformApi';
import { usePlatform } from '../../context/PlatformContext';
import { PERMISSIONS } from '../../config/permissions';

import { KbSummary, Strategy } from '../../rag/ragTypes';
import { useRag } from '../../rag/RagContext';
import { BTN, BTN_PRI, Card, CardTitle, HELP, INPUT, LABEL } from '../../rag/RagUI';
import {
  ConfirmDelete,
  DataTable,
  Drawer,
  IconButton,
  Panel,
  RowActions,
} from '../../rag/Overlays';
import { CreateKbTab } from './CreateKbTab';

/* ------------------------------------------------------------------
   The knowledge bases, listed — and editable.

   They were only ever a dropdown in the header before, which is enough to
   CHOOSE one and nothing else: a base created with the wrong groups, the
   wrong name or the wrong strategy could not be corrected from anywhere,
   though the contract has had PUT and DELETE all along.

   WHAT AN EDIT DOES NOT MOVE. `database` is refused on update by the service
   on purpose — pointing a base at a different engine is a migration, and a
   dropdown that silently did it would look exactly like losing every
   document. Changing the strategy DOES re-apply its settings, which is why
   that field says so out loud.
------------------------------------------------------------------- */

export const ManageKbTab: React.FC<{ onCreated?: (name: string) => void }> = ({
  onCreated,
}) => {
  const { flash, refreshKbs, activeKb, pickKb } = useRag();
  const { groups: directoryGroups, currentUser, hasPermission } = usePlatform();
  const [kbs, setKbs] = useState<KbSummary[] | null>(null);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [busy, setBusy] = useState('');

  const [editing, setEditing] = useState<KbSummary | null>(null);
  const [label, setLabel] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [picked, setPicked] = useState('');
  const [collection, setCollection] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      setKbs(await configKnowledgeBases());
    } catch (e) {
      flash(msg(e));
      setKbs([]);
    }
  }

  useEffect(() => {
    load();
    configStrategies().then(setStrategies).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const admin = hasPermission(PERMISSIONS.Group.View);
  const claimedGroupIds = new Set(userGroupIds(currentUser?.groups));
  const groups = directoryGroups.map((g) => ({
    id: g.id,
    name: g.name || g.id,
    description: g.description || undefined,
    isActive: g.isActive,
    mine: claimedGroupIds.has(g.id),
  })) as PlatformGroup[];
  const selectable = (g: PlatformGroup) => g.mine || admin;
  const singleGroup = groups.filter((g) => g.isActive && selectable(g)).length === 1;


  function begin(kb: KbSummary) {
    setEditing(kb);
    setLabel(kb.label || kb.name);
    setPicked(kb.strategyName || '');
    setCollection('');
    /* THE IDS, straight from the row. This used to read the row's NAMES and
       match them back to ids against the directory, and the comment here said
       why: "a group renamed in auth since would otherwise be refused as
       unknown". It was right, and the lookup did not save it - a renamed group
       simply failed to match, the screen announced that some of this base's
       groups were not in the directory, and re-saving would have dropped a
       grant that was perfectly valid.

       The grant stores an id and nothing else now, so there is nothing to
       match: the id is carried through untouched and a rename is invisible to
       this screen, which is what it should always have been. */
    setChosen(kb.owner_group_ids || []);
  }

  function cancel() {
    setEditing(null);
    setLabel('');
    setChosen([]);
    setPicked('');
    setCollection('');
  }

  function toggle(id: string) {
    setChosen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    if (!editing) return;
    if (!label.trim()) {
      flash('Give the knowledge base a name');
      return;
    }
    if (!chosen.length) {
      flash('Choose at least one group');
      return;
    }
    setBusy('Saving…');
    try {
      await configUpdateKb(editing.configId || editing.id || '', {
        label: label.trim(),
        owner_groups: chosen,
        strategy: picked,
        collection: collection.trim(),
      });
      flash('Knowledge base updated');
      cancel();
      await load();
      await refreshKbs();
    } catch (e) {
      flash(msg(e));
    }
    setBusy('');
  }

  async function remove(kb: KbSummary) {
    setBusy('Deleting…');
    try {
      await configDeleteKb(kb.configId || kb.id || '');
      flash('Knowledge base deleted — its own database is left alone and is recoverable');
      setConfirm(null);
      if (editing && editing.name === kb.name) cancel();
      const left = await refreshKbs();
      await load();
      // The header still points at what was just deleted; every engine call
      // would carry ?kb= a name that no longer resolves.
      if (activeKb === kb.name) pickKb(left[0]?.name || '');
    } catch (e) {
      // DeleteKnowledgeBase refuses the last one, and says so. That sentence
      // is the answer, so it is shown rather than replaced.
      flash(msg(e));
      setConfirm(null);
    }
    setBusy('');
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      <Panel
        title="Knowledge bases"
        action={
          <button
            className={`${BTN_PRI} flex items-center gap-2`}
            onClick={() => setCreating(true)}
          >
            <Plus className="w-4 h-4" />
            <span>New knowledge base</span>
          </button>
        }
      >
        <DataTable
          rows={kbs || []}
          keyOf={(k: KbSummary) => k.name}
          onRowClick={(k: KbSummary) => begin(k)}
          empty={kbs ? 'None you can open — create the first one.' : 'Loading…'}
          columns={[
            {
              head: 'Name',
              cell: (k: KbSummary) => (
                <>
                  <div className="text-xs font-semibold text-white">{k.label || k.name}</div>
                  {/* The slug is what every engine call is keyed on, so it is
                      worth being able to read next to the name. */}
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">{k.name}</div>
                </>
              ),
            },
            {
              head: 'Groups',
              hide: 'sm',
              cell: (k: KbSummary) => (
                <div className="flex gap-1.5 flex-wrap">
                  {/* THE NAME, not the id. api/groupDirectory.ts keeps the
                      id -> name map from the login response, which is the only
                      place on the platform that carries both - the token has
                      ids alone.

                      This column printed the raw uuid until it was reported
                      from the screen: every row read
                      `c71a09b2-3c2d-4b4e-8f88-1a2b3c4d5e6f`, so the GROUPS
                      column told a reader nothing they could act on and two
                      different teams looked identical at a glance.

                      groupName() falls back to the id when no name is known -
                      a group the caller is not in has no name in their own
                      login response - which is legible and quotable, where
                      blank or "Unknown" would not be. The id is kept in the
                      title so it can still be copied for a support call. */}
                  {(k.owner_groups || []).map((g) => (
                    <span
                      key={g}
                      title={g}
                      className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-semibold text-emerald-300"
                    >
                      {groupName(g)}
                    </span>
                  ))}
                </div>
              ),
            },
            {
              head: 'Strategy',
              hide: 'md',
              cell: (k: KbSummary) => (
                <span className="text-xs text-slate-400">
                  {k.strategyName || <span className="italic text-slate-500">none</span>}
                </span>
              ),
            },
            {
              head: '',
              className: 'w-24',
              cell: (k: KbSummary) => (
                <RowActions>
                  <IconButton title="Rename or re-group" onClick={() => begin(k)} disabled={!!busy}>
                    <Pencil className="w-3.5 h-3.5" />
                  </IconButton>
                  <IconButton
                    title="Delete"
                    tone="danger"
                    disabled={!!busy}
                    onClick={() => setConfirm(k.name)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </IconButton>
                </RowActions>
              ),
            },
          ]}
        />
      </Panel>

      <CreateKbTab
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(name) => {
          setCreating(false);
          onCreated && onCreated(name);
        }}
      />

      <ConfirmDelete
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && remove(kbs!.find((k) => k.name === confirm)!)}
        what="knowledge base"
        name={kbs?.find((k) => k.name === confirm)?.label || confirm || ''}
        busy={busy}
        requireTyping
        detail="The knowledge base is removed from the platform. Its own database — the documents, the vectors, the history — is left on disk untouched, so a mistake here is recoverable by whoever runs the engine. It will not be visible from any screen."
      />



      {/* A DRAWER, NOT A CARD UNDER THE TABLE.

          Editing used to open a form below the list, so the row being edited
          scrolled away from the form editing it. A detail view belongs BESIDE
          the thing it details: the row stays where it is, in the list, and the
          panel slides in next to it. */}
      <Drawer
        open={!!editing}
        onClose={cancel}
        title={editing ? editing.label || editing.name : ''}
        subtitle={
          editing ? (
            <span className="font-mono text-[11px]">{editing.name}</span>
          ) : undefined
        }
        footer={
          <>
            <button className={BTN} onClick={cancel}>
              Cancel
            </button>
            <button className={BTN_PRI} disabled={!!busy} onClick={save}>
              {busy || 'Save changes'}
            </button>
          </>
        }
      >
        {editing && (
          <>
            <KbFacts kb={editing} />
          <div className="space-y-4">
            <div className="max-w-md">
              <label className={LABEL}>What is it called?</label>
              <input
                className={INPUT}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
              {/* The slug is the engine's key and is set at creation. A rename
                  that appeared to change it would be a lie about where the
                  documents live. */}
              <span className={`${HELP} block mt-1`}>
                The permanent key stays <span className="font-mono">{editing.name}</span> — only
                the label changes.
              </span>
            </div>

            <div className="max-w-md">
              <label className={LABEL}>Strategy</label>
              <select
                className={INPUT}
                value={picked}
                onChange={(e) => setPicked(e.target.value)}
              >
                <option value="">Defaults (no saved strategy)</option>
                {strategies.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
              {picked && picked !== (editing.strategyName || '') && (
                <span className="text-[11px] text-amber-400 block mt-1.5">
                  Changing the strategy copies its chunking, guardrail and storage onto this
                  base. Documents already ingested keep the settings they were ingested with —
                  only what happens next changes.
                </span>
              )}
            </div>

            <div className="max-w-md">
              <label className={LABEL}>Collection (optional)</label>
              <input
                className={INPUT}
                value={collection}
                onChange={(e) => setCollection(e.target.value)}
                placeholder="leave blank to keep the current one"
              />
              <span className={`${HELP} block mt-1`}>
                Only for external vector stores, and only ever this base's own — two knowledge
                bases must never share one.
              </span>
            </div>

            {/* Not offered, and said so. It is refused on update by the
                service, and a field that silently does nothing is worse than
                one that is absent. */}
            <p className={HELP}>
              Where it keeps its data was chosen when it was created and cannot be changed here —
              moving a base between engines is a migration, not a form field.
            </p>

            {/* LAST, like the Create and Strategy forms - the mentor's call.
                Name, strategy, collection first; whose it is comes after,
                because ownership is the sign-off on the thing, not the first
                question. The separator marks the change of subject. */}
                   <div className="pt-4 border-t border-slate-800">
              <label className={LABEL}>Which groups own it?</label>
              {groups.length === 0 ? (
                <p className={HELP}>No active groups are available for this account.</p>
              ) : singleGroup ? (
                <div className="px-3 py-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-[11px] text-indigo-200">
                  {groups.find((g) => g.isActive && selectable(g))?.name}
                  <span className="text-slate-500 ml-2">Assigned from your sign-in</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
                  {groups.map((g) => {
                    const can = selectable(g);
                    const on = chosen.includes(g.id);
                    return (
                      <label
                        key={g.id}
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-xs transition-colors ${
                          !can
                            ? 'bg-slate-950/40 border-slate-800 text-slate-500 cursor-not-allowed opacity-60'
                            : on
                              ? 'bg-emerald-950/40 border-emerald-500/40 text-slate-200 cursor-pointer'
                              : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800/50 cursor-pointer'
                        }`}
                        title={can ? undefined : 'You are not a member of this group'}
                      >
                        <input
                          type="checkbox"
                          disabled={!can}
                          checked={on}
                          onChange={() => toggle(g.id)}
                          className="mt-0.5 rounded border-slate-700 bg-slate-800 accent-emerald-500"
                        />
                        <span className="min-w-0">
                          <span className="block font-semibold text-slate-200">{groupName(g.id)}</span>
                          {!g.mine && (
                            <span className="block text-[10px] text-slate-500">
                              {admin
                                ? 'not your group — allowed because you are an administrator'
                                : 'not your group'}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-2">
                <Users className="w-3.5 h-3.5 text-emerald-400" />
                <span>{chosen.length} selected</span>
              </div>
            </div>

          </div>
          </>
        )}
      </Drawer>
    </div>
  );
};

/* ------------------------------------------------------------------ */

/** What is actually IN this knowledge base, read from the engine.

    The list can only show what the configuration service knows — a name, its
    groups, the strategy it was built from. The numbers that decide whether
    somebody is looking at the right base live in the engine, and until now
    they were three screens away in Documents. */
const KbFacts: React.FC<{ kb: KbSummary }> = ({ kb }) => {
  const [facts, setFacts] = useState<any>(null);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    let alive = true;
    setFacts(null);
    setProblem('');
    (async () => {
      try {
        const [stats, pipeline] = await Promise.all([
          get('/stats?kb=' + encodeURIComponent(kb.name)),
          get('/pipeline?kb=' + encodeURIComponent(kb.name)),
        ]);
        if (alive) setFacts({ ...stats, config: (pipeline && pipeline.config) || {} });
      } catch (e) {
        // Named rather than blank. A base whose engine cannot open it is a
        // different problem from a base that is empty, and the difference
        // decides who gets called.
        if (alive) setProblem(msg(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [kb.name]);

  if (problem) {
    return (
      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-[11px] font-bold text-amber-200">
            The engine could not open this base
          </span>
        </div>
        <p className="text-[11px] text-amber-200/80 mt-1 leading-relaxed">{problem}</p>
      </div>
    );
  }

  const c = (facts && facts.config) || {};
  const rows: [string, React.ReactNode][] = [
    ['Documents', facts ? facts.documents : '…'],
    ['Facts indexed', facts ? facts.atoms : '…'],
    ['Split by', c.chunking || '—'],
    ['Embedded with', c.embedding_model_name || String(c.embedding || '—').replace(/^gateway:/, '')],
    ['Vectors in', c.vector_backend || 'own store'],
    ['Evidence bar', c.guardrail || '—'],
  ];

  return (
    <div className="rounded-xl bg-slate-950/80 border border-slate-800 divide-y divide-slate-800/70">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between px-3.5 py-2">
          <span className="text-[11px] text-slate-400">{k}</span>
          <span className="text-xs font-semibold text-white font-mono">{v}</span>
        </div>
      ))}
    </div>
  );
};
