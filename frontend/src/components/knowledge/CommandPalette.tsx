
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { groupName } from '../../api/groupDirectory';
import { CornerDownLeft, Database, FileText, Search, Sliders } from 'lucide-react';
import { get } from '../../rag/apiClient';
import { configStrategies } from '../../rag/configBridge';
import { RagTabKey } from '../../rag/ragTypes';
import { useRag } from '../../rag/RagContext';

/* ------------------------------------------------------------------
   Ctrl-K. 

   Six tabs, a store picker and three lists is a lot of aiming for
   somebody who already knows where they are going. This is the
   keyboard route to all of it: the screens, every knowledge base,
   every strategy, and every document in the base that is open.

   WHAT IT DELIBERATELY DOES NOT DO. It never acts. Selecting a
   strategy opens the strategy screen; selecting a document opens
   Documents. Nothing here deletes, ingests or saves — a palette that
   can destroy something is a palette nobody types into quickly, and
   speed is the entire reason it exists.
------------------------------------------------------------------- */

export interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
}

/** Subsequence match, which is what makes "gwed" find "Gateway Embedding".
    Scored so a match at a word boundary beats one in the middle of a word —
    typing `doc` should reach "Documents" before "Retail loan doc policy". */
function score(text: string, query: string): number {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (!q) return 1;
  if (t.startsWith(q)) return 1000;
  if (t.includes(q)) return 500 - t.indexOf(q);

  let at = 0;
  let points = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, at);
    if (found < 0) return 0;
    // A letter that starts a word is worth more than one inside one.
    points += found === 0 || ' -_./'.includes(t[found - 1]) ? 6 : 1;
    at = found + 1;
  }
  return points;
}

export const CommandPalette: React.FC<{
  tabs: { key: RagTabKey; label: string; icon: React.ComponentType<{ className?: string }> }[];
  onTab: (key: RagTabKey) => void;
  engineReady: boolean;
}> = ({ tabs, onTab, engineReady }) => {
  const { kbs, activeKb, pickKb } = useRag();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [strategies, setStrategies] = useState<{ name: string; note?: string }[]>([]);
  const [docs, setDocs] = useState<string[]>([]);
  const box = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  // Ctrl-K / Cmd-K anywhere on the module.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((was) => !was);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  /* Loaded when it OPENS, not on every render of the page. The palette is
     the only thing that needs these lists, and paying for them on a page
     nobody has pressed Ctrl-K on is paying for nothing. */
  useEffect(() => {
    if (!open) return;
    // See ActiveStoreBar. `activeKb` is a dependency, so opening the palette,
    // switching store and opening it again can leave two /documents replies in
    // flight - and the palette would then offer the OTHER base's documents by
    // name, which is a list of file names from a group this reader may not be
    // in.
    let current = true;
    setQuery('');
    setCursor(0);
    box.current?.focus();
    configStrategies()
      .then((rows) => {
        if (current) setStrategies(rows.map((r: any) => ({ name: r.name, note: r.note })));
      })
      .catch(() => {
        if (current) setStrategies([]);
      });
    if (engineReady) {
      get('/documents')
        .then((rows: any) => {
          if (!current) return;
          setDocs(
            (Array.isArray(rows) ? rows : [])
              .map((d: any) => (d.doc_key || d.name) as string)
              .filter(Boolean),
          );
        })
        .catch(() => {
          if (current) setDocs([]);
        });
    }
    return () => {
      current = false;
    };
  }, [open, engineReady, activeKb]);

  const commands: Command[] = useMemo(() => {
    const out: Command[] = [];
    for (const t of tabs) {
      out.push({
        id: 'tab:' + t.key,
        label: t.label,
        group: 'Go to',
        icon: t.icon,
        run: () => onTab(t.key),
      });
    }
    for (const k of kbs) {
      out.push({
        id: 'kb:' + k.name,
        label: k.label || k.name,
        // NAMES, because this string is what the palette SEARCHES on as
        // well as what it shows. Typing "engineering" found nothing while
        // this joined uuids, so the one place built for finding a base by
        // its team was the one place that could not.
        hint:
          (k.owner_groups || []).map(groupName).join(', ')
          + (k.name === activeKb ? ' · open now' : ''),
        group: 'Open knowledge base',
        icon: Database,
        run: () => pickKb(k.name),
      });
    }
    for (const s of strategies) {
      out.push({
        id: 'strategy:' + s.name,
        label: s.name,
        hint: s.note,
        group: 'Strategy',
        icon: Sliders,
        run: () => onTab('strategies'),
      });
    }
    for (const d of docs) {
      out.push({
        id: 'doc:' + d,
        label: d,
        group: 'Document',
        icon: FileText,
        run: () => onTab('documents'),
      });
    }
    return out;
  }, [tabs, kbs, strategies, docs, activeKb, onTab, pickKb]);

  const hits = useMemo(() => {
    const scored = commands
      .map((c) => ({ c, s: score(c.label + ' ' + (c.hint || ''), query) }))
      .filter((r) => r.s > 0);
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, 40).map((r) => r.c);
  }, [commands, query]);

  useEffect(() => setCursor(0), [query]);

  // The highlighted row is kept in view, so holding the arrow key does not
  // walk the selection off the bottom of a scrolling list.
  useEffect(() => {
    const node = list.current?.querySelector<HTMLElement>('[data-on="1"]');
    node?.scrollIntoView({ block: 'nearest' });
  }, [cursor, hits.length]);

  if (!open) return null;

  const choose = (c?: Command) => {
    if (!c) return;
    c.run();
    setOpen(false);
  };

  let lastGroup = '';

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-950/80 backdrop-blur-sm flex items-start justify-center p-4 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl shadow-black/60 overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
          <Search className="w-4 h-4 text-slate-500 shrink-0" />
          <input
            ref={box}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, hits.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                choose(hits[cursor]);
              }
            }}
            placeholder="Go to a screen, a knowledge base, a strategy, a document…"
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-400">
            esc
          </kbd>
        </div>

        <div ref={list} className="max-h-[52vh] overflow-y-auto py-1.5">
          {hits.map((c, i) => {
            const Icon = c.icon;
            const head = c.group !== lastGroup ? ((lastGroup = c.group), c.group) : '';
            return (
              <React.Fragment key={c.id}>
                {head && (
                  <div className="px-4 pt-2.5 pb-1 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                    {head}
                  </div>
                )}
                <button
                  data-on={i === cursor ? '1' : '0'}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => choose(c)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                    i === cursor ? 'bg-emerald-600/20' : 'hover:bg-slate-800/60'
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 ${
                      i === cursor ? 'text-emerald-300' : 'text-slate-500'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-white truncate">
                      {c.label}
                    </span>
                    {c.hint && (
                      <span className="block text-[11px] text-slate-500 truncate">{c.hint}</span>
                    )}
                  </span>
                  {i === cursor && (
                    <CornerDownLeft className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  )}
                </button>
              </React.Fragment>
            );
          })}

          {!hits.length && (
            <div className="px-4 py-8 text-center text-xs text-slate-500">
              Nothing matches “{query}”.
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 px-4 py-2 border-t border-slate-800 text-[10px] text-slate-500">
          <span>
            <kbd className="font-mono text-slate-400">↑↓</kbd> move
          </span>
          <span>
            <kbd className="font-mono text-slate-400">↵</kbd> open
          </span>
          <span className="ml-auto">
            Nothing here deletes or changes anything — it only moves you.
          </span>
        </div>
      </div>
    </div>
  );
};
