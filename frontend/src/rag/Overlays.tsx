
import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';


export const OVERLAY =
  'fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-start justify-center ' +
  'p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-150';

const WIDTHS = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
};

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  size?: keyof typeof WIDTHS;
  /** Buttons. Pinned to the bottom, so "Save" is never scrolled away from. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, size = 'md', footer, children }) => {
  const panel = useRef<HTMLDivElement>(null);


  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', onKey);
    // The page behind must not scroll while this is up. Without it a
    // trackpad flick moves the list underneath and the modal appears to
    // jump - it did not, the thing behind it did.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  // OPENING is the only thing that moves focus, so `open` is the only
  // dependency. A field, never a button: the close button is the first
  // focusable element in the panel, and focusing it on open put the reader one
  // stray Enter away from throwing the form out.
  useEffect(() => {
    if (!open) return;
    panel.current
      ?.querySelector<HTMLElement>('input,select,textarea')
      ?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={OVERLAY}
      // Only a click that STARTED on the backdrop closes it. Without the
      // check, selecting text inside and releasing outside shut the form
      // and threw the typing away.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        className={`w-full ${WIDTHS[size]} my-auto rounded-2xl bg-slate-900 border border-slate-700
                    shadow-2xl shadow-black/60 animate-in zoom-in-95 duration-150 flex flex-col
                    max-h-[calc(100vh-3rem)]`}
      >
        <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-800 shrink-0">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-white">{title}</h3>
            {subtitle && (
              <p className="text-xs text-slate-400 leading-relaxed mt-1">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* THE BODY SCROLLS, not the page. */}
        <div className="px-5 py-4 overflow-y-auto grow">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-800 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */

export const Drawer: React.FC<{
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, footer, children }) => {
  // See Modal: onClose is a new function on every render, so it is held in a
  // ref rather than subscribing and unsubscribing this listener on each one.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="absolute right-0 top-0 h-full w-full max-w-xl bg-slate-900 border-l border-slate-700
                   shadow-2xl shadow-black/60 flex flex-col animate-in slide-in-from-right duration-200"
      >
        <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-800 shrink-0">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-white truncate">{title}</h3>
            {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto grow space-y-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-800 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */

export interface Column<T> {
  /** Column heading. Empty for the actions column. */
  head: React.ReactNode;
  /** What to draw for one row. */
  cell: (row: T) => React.ReactNode;
  /** Hidden below this breakpoint, so a narrow window loses the least
      important column rather than scrolling sideways. */
  hide?: 'sm' | 'md' | 'lg';
  className?: string;
}

const HIDE = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' };

export function DataTable<T>({
  rows,
  columns,
  keyOf,
  onRowClick,
  empty,
}: {
  rows: T[];
  columns: Column<T>[];
  keyOf: (row: T) => string;
  /** Makes the whole row a target. The row still carries its own buttons;
      they stop the event so a delete never opens a detail view first. */
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
}) {
  if (!rows.length) {
    return (
      <div className="py-10 text-center text-xs text-slate-500">
        {empty || 'Nothing here yet.'}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-left">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-slate-500">
            {columns.map((c, i) => (
              <th key={i} className={`px-3 pb-2 font-semibold ${c.hide ? HIDE[c.hide] : ''}`}>
                {c.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            /* A CLICKABLE ROW HAS TO BE REACHABLE BY KEYBOARD.

               `onClick` on a <tr> and nothing else meant the only way to open a
               document's drawer, or a knowledge base's, was a mouse. A row is
               not focusable by default and has no implicit role, so somebody
               working from the keyboard - or with a screen reader, which
               announces what it can focus - could not open any of them at all.

               role + tabIndex + Enter/Space is what makes it behave like the
               button it already is. The buttons INSIDE a row still stop their
               own events, so Delete never opens a detail view on the way past
               (see RowActions). */
            <tr
              key={keyOf(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      // Space scrolls the page otherwise, which moves the table
                      // out from under the row being opened.
                      e.preventDefault();
                      onRowClick(row);
                    }
                  : undefined
              }
              role={onRowClick ? 'button' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              className={`border-t border-slate-800/80 ${
                onRowClick
                  ? 'cursor-pointer hover:bg-slate-800/40 transition-colors ' +
                    'focus:outline-none focus:bg-slate-800/60 focus-visible:ring-1 ' +
                    'focus-visible:ring-emerald-500/60'
                  : ''
              }`}
            >
              {columns.map((c, i) => (
                <td
                  key={i}
                  className={`px-3 py-3 align-middle ${c.className || ''} ${
                    c.hide ? HIDE[c.hide] : ''
                  }`}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Row actions. Stops the click reaching the row underneath. */
export const RowActions: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="flex items-center justify-end gap-1.5"
    onClick={(e) => e.stopPropagation()}
  >
    {children}
  </div>
);

export const IconButton: React.FC<{
  title: string;
  tone?: 'default' | 'danger';
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ title, tone = 'default', onClick, disabled, children }) => (
  <button
    title={title}
    aria-label={title}
    disabled={disabled}
    onClick={onClick}
    className={`p-2 rounded-lg border transition-colors disabled:opacity-30 ${
      tone === 'danger'
        ? 'border-slate-700 text-slate-400 hover:text-rose-300 hover:border-rose-500/50 hover:bg-rose-500/10'
        : 'border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 hover:bg-slate-800'
    }`}
  >
    {children}
  </button>
);

/* ------------------------------------------------------------------ */

/** One number and what it is. The strip these sit in is the first thing
    on the page, so it opens with the state of the knowledge base rather
    than with a paragraph describing the module. */
export const Stat: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: 'default' | 'emerald' | 'amber' | 'red';
}> = ({ label, value, hint, tone = 'default' }) => (
  <div className="px-4 py-3 min-w-0" title={hint}>
    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold truncate">
      {label}
    </div>
    <div
      className={`text-lg font-bold leading-tight truncate ${
        tone === 'emerald'
          ? 'text-emerald-300'
          : tone === 'amber'
            ? 'text-amber-300'
            : tone === 'red'
              ? 'text-red-300'
              : 'text-white'
      }`}
    >
      {value}
    </div>
  </div>
);

export const StatStrip: React.FC<{ children: React.ReactNode; cols?: 5 | 6 | 7 }> = ({ children, cols = 5 }) => (
  <div
    className={`rounded-2xl bg-slate-900 border border-slate-800 shadow-xl divide-x divide-slate-800 grid grid-cols-2 sm:grid-cols-3 ${
      cols === 7 ? 'lg:grid-cols-7' : cols === 6 ? 'lg:grid-cols-6' : 'lg:grid-cols-5'
    }`}
  >
    {children}
  </div>
);

/** A titled block with an action in its corner — the shape every list on
    these screens now uses, so they are recognisable as the same thing. */
export const Panel: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, action, children }) => (
  <div className="rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
    <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-800">
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
    <div className="px-2 py-2">{children}</div>
  </div>
);

/** A labelled control.

    The label is the field's STANDARD NAME - "Chunking method", "Top-K",
    "Embedding model" - not a question asked in prose. A form that asks "How
    should documents be split?" reads as a wizard for somebody who has never
    seen one, and as noise to the engineer configuring their fortieth
    strategy; and the words it uses are not the words the API, the pipeline
    JSON, the docs or the logs use, so nothing a reader learns here helps them
    anywhere else.

    `hint` is a TOOLTIP, not a paragraph. The explanation is still one hover
    away for whoever wants it, and costs no vertical space for everybody who
    does not.
*/
export const Field: React.FC<{
  label: string;
  hint?: string;
  /** Shown under the control, and only for a consequence a reader must not
      miss - a rename that will be refused, a password that cannot be read
      back. Never for describing what the field is. */
  note?: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, hint, note, children }) => (
  <div className="mb-4">
    <label
      className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-1.5"
      title={hint}
    >
      {label}
      {hint && (
        <span className="w-3.5 h-3.5 rounded-full border border-slate-600 text-slate-500 text-[9px] leading-[13px] text-center cursor-help">
          i
        </span>
      )}
    </label>
    {children}
    {note && <div className="mt-1.5">{note}</div>}
  </div>
);

/** A destructive confirmation. Typed rather than clicked when the thing
    being destroyed cannot be recovered — a second button is not a
    second thought, and these delete a department's documents. */
export const ConfirmDelete: React.FC<{
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  what: string;
  name: string;
  detail?: React.ReactNode;
  busy?: string;
  requireTyping?: boolean;
}> = ({ open, onClose, onConfirm, what, name, detail, busy, requireTyping }) => {
  const [typed, setTyped] = React.useState('');
  React.useEffect(() => {
    if (open) setTyped('');
  }, [open]);
  const ready = !requireTyping || typed.trim() === name;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={`Delete this ${what}?`}
      subtitle={detail}
      footer={
        <>
          <button
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200"
            onClick={onClose}
          >
            Keep it
          </button>
          <button
            disabled={!ready || !!busy}
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold
                       shadow-lg shadow-rose-600/25 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy || `Delete ${what}`}
          </button>
        </>
      }
    >
      <p className="text-xs text-slate-300 leading-relaxed">
        <b className="text-white">{name}</b> will be removed.
      </p>
      {requireTyping && (
        <div className="mt-4">
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Type <span className="font-mono text-rose-300">{name}</span> to confirm
          </label>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200
                       focus:outline-none focus:border-rose-500"
          />
        </div>
      )}
    </Modal>
  );
};
