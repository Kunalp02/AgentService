
import React, { useState } from 'react';
import {
  Database,
  Sliders,
  Upload,
  Activity,
  Scale,
  Terminal,
  FileText,
  Lock,
  AlertTriangle,
  Settings,
  Search,
} from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';
import { PERMISSIONS } from '../../config/permissions';
import { RolePermissionKey } from '../../types';
import { RagProvider, useRag } from '../../rag/RagContext';
import { RagTabKey } from '../../rag/ragTypes';
import { Card, HELP, Toast } from '../../rag/RagUI';
import { ErrorBoundary } from '../layout/ErrorBoundary';
import { StrategiesTab } from './StrategiesTab';
import { ManageKbTab } from './ManageKbTab';
import { AddKnowledgeTab } from './AddKnowledgeTab';
import { TraceTab } from './TraceTab';
import { CompareTab } from './CompareTab';
import { AskDatabaseTab } from './AskDatabaseTab';
import { DocumentsTab } from './DocumentsTab';
import { ActiveStoreBar, StorePicker } from './ActiveStoreBar';
import { CommandPalette } from './CommandPalette';

/* ------------------------------------------------------------------
   Knowledge & RAG.

   TWO SERVICES, AND THEY FAIL SEPARATELY.

   The .NET configuration service owns strategies and knowledge bases —
   it creates them, resolves their groups against auth, stores the rows.
   The Python engine owns everything that touches a document: chunking,
   ingestion, retrieval, SQL.

   So they are reported separately. A dead engine greys out the four
   screens that need it and leaves the three that do not alone; a dead
   configuration service is a gate, because there is nothing underneath
   it to degrade to. Hiding the whole module behind one banner meant a
   reader whose engine was down could not look at the strategies the
   OTHER service was still serving perfectly.
------------------------------------------------------------------- */

/** The screens that act on ONE knowledge base, and therefore need to say
    which. Everything else on this module is either about all of them or about
    something that is not a knowledge base. */
const STORE_TABS = new Set<RagTabKey>(['add', 'trace', 'compare', 'documents']);
const LAST_TAB = 'rag.lastTab';

interface TabDef {
  key: RagTabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: RolePermissionKey;
  /** True when this screen can do nothing at all without the Python engine. */
  engine?: boolean;
}

/* The codes are the platform's own, from config/permissions.ts — the same
   numbers the token carries in `roles`. They were written here as
   'KNOWLEDGE_STRATEGY' and 'KNOWLEDGE_INGEST', which hasPermission looks for
   in a set of numeric strings and never finds: every one of these tabs was
   invisible to everybody except a Super Admin, who passes by a shortcut and
   so could never see the bug. */
const TABS: TabDef[] = [
  { key: 'strategies', label: 'Strategies', icon: Sliders, permission: PERMISSIONS.Strategy.View },
  { key: 'manage', label: 'Manage KBs', icon: Settings, permission: PERMISSIONS.KnowledgeBase.Edit },
  // Ingest is code 150 and does NOT exist in auth yet, so this tab is hidden
  // from everyone but an admin until it is seeded. KnowledgeBase.Edit is the
  // stand-in if that is too strict before then.
  { key: 'add', label: 'Add knowledge', icon: Upload, permission: PERMISSIONS.KnowledgeBase.Ingest, engine: true },
  { key: 'trace', label: 'Retrieval trace', icon: Activity, engine: true },
  // Measures every retrieval x reranker and guardrail on this base with the
  // reader's own questions; changes nothing (kb/eval/compare.py).
  { key: 'compare', label: 'Compare settings', icon: Scale, engine: true },
  { key: 'sql', label: 'Ask the database', icon: Terminal, engine: true },
  { key: 'documents', label: 'Documents', icon: FileText, engine: true },
];

/**
 * THE ONLY WAY TO TEST THE BOUNDARY, and it cannot reach a real build.
 *
 * An error boundary is the one piece of UI whose correctness is invisible
 * until something breaks, and tsc cannot break it - so probes/tab-isolation
 * asks a tab to throw and then checks that the sidebar, the tab row and the
 * other tabs are still there. Something has to do the throwing.
 *
 * `import.meta.env.DEV` is a literal Vite substitutes at build time, so in a
 * production bundle this reads `if (false && ...)` and the minifier deletes
 * the function outright. It cannot fire in the office, and it cannot fire for
 * a user who happens to have a stray key in localStorage.
 *
 * It sits INSIDE the boundary on purpose: a throw out here in RagWorkbench
 * would be caught by App.tsx's boundary instead and the probe would be
 * measuring the wrong one.
 */
const CrashProbe: React.FC<{ tab: RagTabKey }> = ({ tab }) => {
  if (import.meta.env.DEV && localStorage.getItem('__crashTab') === tab) {
    throw new Error(`probe crash in ${tab}`);
  }
  return null;
};

const RagWorkbench: React.FC<{ initialTab?: RagTabKey }> = ({ initialTab }) => {
  const { hasPermission } = usePlatform();
  const {
    kbs,
    activeKb,
    active,
    pickKb,
    refreshKbs,
    toast,
    engineError,
    engineReady,
    configError,
    loading,
  } = useRag();

  const allowed = (t: TabDef) => !t.permission || hasPermission(t.permission);
  const visible = TABS.filter(allowed);
  // THE TAB YOU LEFT IS THE TAB YOU COME BACK TO. Opening another module and
  // returning used to land on the first tab (Strategies), where the store bar
  // - the running figure explanation and its Stop button - is not shown, so a
  // run in progress looked gone. Kept per browser tab, for this visit only.
  const remembered = (() => {
    try {
      return sessionStorage.getItem(LAST_TAB) as RagTabKey | null;
    } catch {
      return null;
    }
  })();
  const [tab, setTabState] = useState<RagTabKey>(
    initialTab && visible.some((t) => t.key === initialTab)
      ? initialTab
      : remembered && visible.some((t) => t.key === remembered)
        ? remembered
        : (visible[0] || TABS[0]).key,
  );
  const setTab = (key: RagTabKey) => {
    setTabState(key);
    try {
      sessionStorage.setItem(LAST_TAB, key);
    } catch {
      /* private mode - the tab is just not remembered */
    }
  };

  const current = TABS.find((t) => t.key === tab);
  const blocked = !!current?.engine && !engineReady;

  async function afterCreate(name: string) {
    // The list comes from the configuration service, which just answered the
    // POST — so this refresh cannot fail because of the engine, and a base
    // created while the engine is down still appears in the picker.
    await refreshKbs();
    pickKb(name);
    // Add knowledge is the engine's, so land there only if it can be used.
    setTab(engineReady ? 'add' : 'manage');
  }

  return (
    <div id="knowledge-management-view" className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* THE HEADER IS ONE LINE NOW.
          It used to be a badge, a two-line title and a paragraph describing
          the module - 130 pixels, on every screen, saying the same thing to
          somebody who had already clicked in here and knew where they were.
          The paragraph moved onto the panels it describes, where it is read
          in the place it applies. */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-lg font-bold text-white whitespace-nowrap">Knowledge &amp; RAG</h1>
          {/* SAID OUT LOUD. A shortcut nobody is told about is a shortcut
              nobody uses, and the whole value of a palette is that somebody
              reaches for it instead of aiming at a tab. It is a button too,
              so it is discoverable by the people who never read a hint. */}
          <button
            onClick={() =>
              document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }),
              )
            }
            title="Search screens, knowledge bases, strategies and documents"
            className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800
                       text-[11px] text-slate-500 hover:text-slate-300 hover:border-slate-700 transition-colors"
          >
            <Search className="w-3 h-3" />
            <span>Search</span>
            <kbd className="px-1 rounded bg-slate-800 border border-slate-700 font-mono text-[10px]">
              Ctrl K
            </kbd>
          </button>
        </div>

        {/* Tab switcher. A tab whose service is down is still reachable — the
            screen behind it explains itself, which a disabled button cannot. */}
        <div className="flex items-center flex-wrap p-1 rounded-xl bg-slate-900 border border-slate-800 shrink-0">
          {TABS.map((t) => {
            const Icon = t.icon;
            const can = allowed(t);
            const needsEngine = !!t.engine && !engineReady;
            const on = tab === t.key;
            return (
              <button
                key={t.key}
                disabled={!can}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  on
                    ? 'bg-emerald-600 text-white shadow-sm font-bold'
                    : !can
                      ? 'text-slate-600 cursor-not-allowed opacity-50'
                      : needsEngine
                        ? 'text-slate-500 hover:text-slate-300'
                        : 'text-slate-400 hover:text-slate-200'
                }`}
                title={
                  !can
                    ? 'Your role profile does not grant this'
                    : needsEngine
                      ? 'Needs the knowledge base engine, which is not answering'
                      : undefined
                }
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
                {!can && <Lock className="w-3 h-3" />}
                {can && needsEngine && <AlertTriangle className="w-3 h-3 text-amber-400" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* The configuration service IS this module. Nothing to degrade to. */}
      {configError && (
        <Card className="border-rose-500/50">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <h3 className="text-sm font-bold text-rose-300">
              Configuration service not reachable
            </h3>
          </div>
          <p className={`${HELP} mt-1.5 font-mono`}>{configError}</p>
        </Card>
      )}

      {/* The engine is a WARNING, not a gate. It names the process that is
          down and the screens it costs, and everything else carries on. */}
      {!configError && engineError && (
        <Card className="border-amber-500/50">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-amber-200">
              The knowledge base engine is not answering
            </h3>
          </div>
          <p className={`${HELP} mt-1.5 font-mono`}>{engineError}</p>
          <p className={`${HELP} mt-2`}>
            Add knowledge, Retrieval trace, Ask the database and Documents need it and are
            unavailable. <b className="text-slate-200">Strategies</b>,{' '}
            <b className="text-slate-200">Create KB</b> and{' '}
            <b className="text-slate-200">Manage KBs</b> are answered by the configuration
            service and still work.
          </p>
        </Card>
      )}

      {!configError && (
        <>
          {/* THE ACTIVE STORE, AND ONLY WHERE THERE IS ONE.

              Three of these six screens act on a knowledge base: you ingest
              INTO one, you query one, you list one's documents. The other
              three do not. A strategy is not owned by a knowledge base - it is
              a template a base COPIES when it is created - so a picker and a
              row of that base's numbers on the Strategies screen were
              answering a question nobody had asked, and implying a
              relationship that does not exist. Manage KBs lists every base, so
              singling one out there is the same mistake. Ask the database is
              pointed at a customer's SQL server and never touches a knowledge
              base at all.

              The picker follows the work rather than decorating the module. */}
          {STORE_TABS.has(tab) && (
            <>
              <div className="rounded-2xl bg-slate-900 border border-slate-800 shadow-xl px-4 py-3">
                <StorePicker onManage={() => setTab('manage')} />
              </div>
              <ActiveStoreBar engineReady={engineReady} />
            </>
          )}

          {blocked ? (
            <Card className="border-amber-500/40">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-amber-200">
                  {current?.label} needs the engine
                </h3>
              </div>
              <p className={`${HELP} mt-1.5`}>
                Everything on this screen — documents, chunking, retrieval, SQL — is the engine's
                own work, so there is nothing here to show while it is down. Start it and reload.
              </p>
            </Card>
          ) : (
            /* ONE TAB PER BOUNDARY, keyed by the tab. Everything above
               this line - the sidebar, the header, the tab row, the store
               picker - is OUTSIDE it, which is the whole point: a tab that
               throws leaves you a way to walk to another one. Measured with a
               forced throw inside Strategies: the screen went from 1737
               characters to 1, taking the entire platform with it, because
               there was no boundary anywhere in this app.

               resetKey={tab} so leaving the broken tab clears the error. The
               boundary never unmounts - only its children do - so without it
               the caught error would follow you onto a healthy tab. */
            <ErrorBoundary what={current?.label ?? 'This tab'} resetKey={tab}>
              <CrashProbe tab={tab} />
              {tab === 'strategies' && <StrategiesTab />}
              {tab === 'manage' && <ManageKbTab onCreated={afterCreate} />}
              {tab === 'add' && <AddKnowledgeTab />}
                        {tab === 'trace' && <TraceTab />}
              {tab === 'compare' && <CompareTab />}
              {tab === 'sql' && <AskDatabaseTab />}
              {tab === 'documents' && <DocumentsTab />}
            </ErrorBoundary>
          )}
        </>
      )}

      {/* Ctrl-K. Mounted at the module level so it works from any of the six
          screens, and only inside Knowledge & RAG - the other modules are not
          mine to put a shortcut on. */}
      <CommandPalette
        tabs={TABS.filter(allowed)}
        onTab={setTab}
        engineReady={engineReady}
      />

      <Toast text={toast} />
    </div>
  );
};

/** Same named export the platform's App.tsx already imports. */
export const KnowledgeManagementView: React.FC<{ initialTab?: RagTabKey }> = ({ initialTab }) => (
  <RagProvider>
    <RagWorkbench initialTab={initialTab} />
  </RagProvider>
);

export default KnowledgeManagementView;
