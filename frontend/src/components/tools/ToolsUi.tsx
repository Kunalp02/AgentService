
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Inbox,
  Loader2,
  X,
} from 'lucide-react';
import { groupName } from '../../api/groupDirectory';
import type { GroupDto } from '../../types/admin';

/* ============================================================== tokens */

export const INPUT =
  'w-full bg-slate-900/80 border border-slate-600/70 rounded-lg px-3 py-2 text-xs text-slate-100 ' +
  'placeholder-slate-500 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 ' +
  'transition-colors disabled:opacity-60 disabled:cursor-not-allowed';
export const MONO_AREA =
  'w-full bg-[#070c17] border border-slate-700 rounded-lg p-3 font-mono text-[11px] text-emerald-300 ' +
  'leading-relaxed focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60';

const BTN_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold whitespace-nowrap ' +
  'transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 ' +
  'active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100';

export const BTN = `${BTN_BASE} bg-slate-800/90 hover:bg-slate-700 border border-slate-600/70 text-slate-100 shadow-sm`;
export const BTN_GHOST = `${BTN_BASE} text-slate-300 hover:text-white hover:bg-slate-800/70`;
export const BTN_PRI =
  `${BTN_BASE} bg-gradient-to-b from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 ` +
  'text-white border border-indigo-400/30 shadow-md shadow-indigo-950/50';
export const BTN_OK =
  `${BTN_BASE} bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 ` +
  'text-white border border-emerald-400/30 shadow-md shadow-emerald-950/50';
export const BTN_DANGER =
  `${BTN_BASE} bg-gradient-to-b from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 ` +
  'text-white border border-rose-400/30 shadow-md shadow-rose-950/50';
export const BTN_SM = 'px-2.5 py-1.5 text-[11px]';
export const ICON_BTN =
  'p-1.5 rounded-lg border border-slate-600/60 text-slate-300 hover:text-white hover:bg-slate-700/70 ' +
  'disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60';

/** Glass card used on the page (not for overlays - those must be opaque). */
export const CARD = 'rounded-2xl border border-slate-600/40 bg-slate-950/40 backdrop-blur-sm shadow-xl shadow-black/20';

/* ============================================================== helpers */

export const errText = (e: unknown, fallback = 'Something went wrong.') =>
  e instanceof Error && e.message ? e.message : fallback;

export const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleString() : '—');

export function prettyJson(v: unknown): string {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v === 'string') {
    try {
      return JSON.stringify(JSON.parse(v), null, 2);
    } catch {
      return v;
    }
  }
  return JSON.stringify(v, null, 2);
}

/* ============================================================== overlays
   Everything below renders through a PORTAL into document.body. That is the
   fix for "popouts open inside the page div": an ancestor with backdrop-filter
   (the .panel wrapper) turns position:fixed into position:relative-to-ancestor,
   so a fixed overlay can never escape it unless it is mounted outside it.
   Backgrounds are opaque hex on purpose - index.css rewrites .bg-slate-900. */

const overlayStack: Array<() => void> = [];
let scrollLocks = 0;

function useOverlay(open: boolean, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const me = () => close.current();
    overlayStack.push(me);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && overlayStack[overlayStack.length - 1] === me) me();
    };
    document.addEventListener('keydown', onKey);
    if (scrollLocks++ === 0) document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = overlayStack.indexOf(me);
      if (i >= 0) overlayStack.splice(i, 1);
      if (--scrollLocks === 0) document.body.style.overflow = '';
    };
  }, [open]);
}

const Portal: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  typeof document === 'undefined' ? null : createPortal(children, document.body);

const CloseBtn: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button onClick={onClick} aria-label="Close" className={ICON_BTN}>
    <X className="w-4 h-4" />
  </button>
);

const MODAL_WIDTH = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' };

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  size?: keyof typeof MODAL_WIDTH;
  footer?: React.ReactNode;
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, size = 'md', footer, children }) => {
  useOverlay(open, onClose);
  if (!open) return null;
  return (
    <Portal>
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150"
        onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      >
        <div
          role="dialog"
          aria-modal="true"
          className={`flex max-h-[calc(100vh-2rem)] w-full ${MODAL_WIDTH[size]} flex-col rounded-2xl border border-slate-600/60 bg-[#0f172a] shadow-2xl shadow-black/70 animate-in zoom-in-95 duration-150`}
        >
          <div className="flex shrink-0 items-start gap-3 border-b border-slate-700/70 px-5 py-4">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-white">{title}</h3>
              {subtitle && <p className="mt-1 text-xs leading-relaxed text-slate-400">{subtitle}</p>}
            </div>
            <CloseBtn onClick={onClose} />
          </div>
          <div className="grow overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-700/70 bg-[#0b1220] px-5 py-3.5 rounded-b-2xl">
              {footer}
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
};

export const Drawer: React.FC<{
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, footer, children }) => {
  useOverlay(open, onClose);
  if (!open) return null;
  return (
    <Portal>
      <div
        className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
        onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      >
        <aside
          role="dialog"
          aria-modal="true"
          className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-slate-600/60 bg-[#0f172a] shadow-2xl shadow-black/70 animate-in slide-in-from-right duration-200"
        >
          <div className="flex shrink-0 items-start gap-3 border-b border-slate-700/70 px-5 py-4">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-bold text-white">{title}</h3>
              {subtitle && <div className="mt-1.5">{subtitle}</div>}
            </div>
            <CloseBtn onClick={onClose} />
          </div>
          <div className="grow space-y-5 overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-700/70 bg-[#0b1220] px-5 py-3.5">
              {footer}
            </div>
          )}
        </aside>
      </div>
    </Portal>
  );
};

/** Full-screen workspace (used by the tool playground). */
export const Sheet: React.FC<{
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, badge, footer, children }) => {
  useOverlay(open, onClose);
  if (!open) return null;
  return (
    <Portal>
      <div role="dialog" aria-modal="true" className="fixed inset-0 z-[75] flex flex-col bg-[#0b1120] animate-in fade-in duration-150">
        <header className="flex shrink-0 items-center gap-4 border-b border-slate-700/70 bg-[#0f172a] px-6 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <h2 className="truncate text-base font-bold text-white">{title}</h2>
              {badge}
            </div>
            {subtitle && <p className="mt-0.5 truncate text-xs text-slate-400">{subtitle}</p>}
          </div>
          <button onClick={onClose} className={BTN}>
            <X className="w-3.5 h-3.5" /> Close
          </button>
        </header>
        <div className="grow overflow-y-auto">{children}</div>
        {footer && (
          <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-slate-700/70 bg-[#0f172a] px-6 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </Portal>
  );
};

export const ConfirmDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  busy?: string;
}> = ({ open, onClose, onConfirm, title, message, confirmLabel = 'Delete', busy }) => (
  <Modal
    open={open}
    onClose={onClose}
    size="sm"
    title={title}
    footer={
      <>
        <button className={BTN} onClick={onClose}>
          Keep it
        </button>
        <button className={BTN_DANGER} disabled={!!busy} onClick={onConfirm}>
          {busy || confirmLabel}
        </button>
      </>
    }
  >
    <div className="text-xs leading-relaxed text-slate-300">{message}</div>
  </Modal>
);

/* ============================================================== layout bits */

export const Field: React.FC<{
  label: string;
  hint?: string;
  note?: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, hint, note, children }) => (
  <div className="mb-4">
    {label && (
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-300" title={hint}>
        {label}
        {hint && (
          <span className="h-3.5 w-3.5 cursor-help rounded-full border border-slate-600 text-center text-[9px] leading-[13px] text-slate-500">
            i
          </span>
        )}
      </label>
    )}
    {children}
    {note && <div className="mt-1.5">{note}</div>}
  </div>
);

export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { id: T; label: string; hint?: string; badge?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-slate-600/50 bg-slate-950/50 p-1 self-start">
      {items.map((i) => (
        <button
          key={i.id}
          title={i.hint}
          onClick={() => onChange(i.id)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
            value === i.id ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/50' : 'text-slate-400 hover:text-white'
          }`}
        >
          {i.label}
          {!!i.badge && (
            <span className="rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-slate-950">{i.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export const EmptyState: React.FC<{ title: string; hint?: string; action?: React.ReactNode }> = ({ title, hint, action }) => (
  <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
    <div className="rounded-2xl border border-slate-600/50 bg-slate-800/50 p-3 text-slate-400">
      <Inbox className="w-6 h-6" />
    </div>
    <div className="text-sm font-semibold text-slate-200">{title}</div>
    {hint && <div className="max-w-sm text-xs text-slate-500">{hint}</div>}
    {action}
  </div>
);

/* ============================================================== table */

export interface Column<T> {
  head: React.ReactNode;
  cell: (row: T) => React.ReactNode;
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
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
}) {
  if (!rows.length) return <>{empty ?? <EmptyState title="Nothing here yet." />}</>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-slate-700/60 text-[10px] uppercase tracking-wider text-slate-500">
            {columns.map((c, i) => (
              <th key={i} className={`px-4 py-3 font-semibold ${c.hide ? HIDE[c.hide] : ''} ${c.className || ''}`}>
                {c.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/40">
          {rows.map((row) => (
            <tr
              key={keyOf(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              tabIndex={onRowClick ? 0 : undefined}
              className={`transition-colors ${
                onRowClick
                  ? 'cursor-pointer hover:bg-indigo-500/5 focus:outline-none focus-visible:bg-indigo-500/10'
                  : ''
              }`}
            >
              {columns.map((c, i) => (
                <td key={i} className={`px-4 py-3.5 align-middle ${c.hide ? HIDE[c.hide] : ''} ${c.className || ''}`}>
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

export const RowActions: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
    {children}
  </div>
);

export const IconButton: React.FC<{
  title: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
  children: React.ReactNode;
}> = ({ title, onClick, disabled, tone = 'default', children }) => (
  <button
    title={title}
    aria-label={title}
    disabled={disabled}
    onClick={onClick}
    className={`${ICON_BTN} ${tone === 'danger' ? 'hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-rose-300' : ''}`}
  >
    {children}
  </button>
);

/* ============================================================== pagination */

function pageWindow(page: number, pages: number): (number | '…')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pages - 1, page + 1);
  if (from > 2) out.push('…');
  for (let i = from; i <= to; i++) out.push(i);
  if (to < pages - 1) out.push('…');
  out.push(pages);
  return out;
}

export const Pagination: React.FC<{
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize?: (n: number) => void;
  sizes?: number[];
}> = ({ page, pageSize, total, onPage, onPageSize, sizes = [10, 20, 50] }) => {
  if (total <= 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-700/50 px-4 py-3 text-[11px] text-slate-400 sm:flex-row">
      <div className="flex items-center gap-3">
        <span>
          Showing <b className="text-slate-200">{from}–{to}</b> of <b className="text-slate-200">{total}</b>
        </span>
        {onPageSize && (
          <label className="flex items-center gap-1.5">
            Rows
            <select
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
              className="rounded-md border border-slate-600/70 bg-slate-900/80 px-1.5 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-indigo-400"
            >
              {sizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button className={ICON_BTN} disabled={page <= 1} onClick={() => onPage(1)} aria-label="First page">
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>
        <button className={ICON_BTN} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        {pageWindow(page, pages).map((p, i) =>
          p === '…' ? (
            <span key={`e${i}`} className="px-1.5 text-slate-600">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={`min-w-[28px] rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
                p === page ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-700/60 hover:text-white'
              }`}
            >
              {p}
            </button>
          ),
        )}
        <button className={ICON_BTN} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button className={ICON_BTN} disabled={page >= pages} onClick={() => onPage(pages)} aria-label="Last page">
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

/* ============================================================== atoms */

export const StatusBadge: React.FC<{ status?: string | null }> = ({ status }) => {
  const s = (status || '').toLowerCase();
  const [tone, dot] =
    s === 'active' || s === 'approved'
      ? ['bg-emerald-500/10 text-emerald-300 border-emerald-500/30', 'bg-emerald-400']
      : s === 'pendingapproval'
        ? ['bg-amber-500/10 text-amber-300 border-amber-500/30', 'bg-amber-400']
        : s === 'disabled' || s === 'rejected' || s === 'revoked'
          ? ['bg-rose-500/10 text-rose-300 border-rose-500/30', 'bg-rose-400']
          : ['bg-slate-700/40 text-slate-300 border-slate-600', 'bg-slate-400'];
  const label = status === 'PendingApproval' ? 'Pending approval' : status || 'Unknown';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
};

export const Chip: React.FC<{ children: React.ReactNode; tone?: 'default' | 'good' | 'bad' | 'warn' | 'info' }> = ({
  children,
  tone = 'default',
}) => {
  const c =
    tone === 'good'
      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
      : tone === 'bad'
        ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
        : tone === 'warn'
          ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
          : tone === 'info'
            ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
            : 'bg-slate-800/80 text-slate-300 border-slate-600/60';
  return <span className={`inline-block rounded-md border px-2 py-0.5 font-mono text-[10px] ${c}`}>{children}</span>;
};

export const GroupChips: React.FC<{ ids?: string[] | null }> = ({ ids }) => {
  if (!ids || ids.length === 0) return <span className="text-[11px] italic text-slate-500">global</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {ids.map((id) => (
        <Chip key={id}>{groupName(id)}</Chip>
      ))}
    </div>
  );
};

export const ErrorBanner: React.FC<{ message?: string | null; onRetry?: () => void }> = ({ message, onRetry }) =>
  message ? (
    <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
      <span className="flex-1 break-words">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="shrink-0 underline decoration-dotted hover:text-white">
          Retry
        </button>
      )}
    </div>
  ) : null;

export const Spinner: React.FC<{ label?: string }> = ({ label }) => (
  <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-400">
    <Loader2 className="w-4 h-4 animate-spin" />
    {label && <span>{label}</span>}
  </div>
);

export const JsonBlock: React.FC<{ value: unknown; maxHeight?: number }> = ({ value, maxHeight = 260 }) => (
  <pre
    className="overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-700 bg-[#070c17] p-3 font-mono text-[11px] text-emerald-300"
    style={{ maxHeight }}
  >
    {prettyJson(value) || '—'}
  </pre>
);

/** Group multi-select. Ids already on the record but not in the caller's groups stay visible. */
export const GroupPicker: React.FC<{
  groups: GroupDto[];
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}> = ({ groups, value, onChange, disabled }) => {
  const known = new Set(groups.map((g) => g.id));
  const options = [
    ...groups.map((g) => ({ id: g.id, name: g.name || g.id })),
    ...value.filter((id) => !known.has(id)).map((id) => ({ id, name: groupName(id) })),
  ];

  if (options.length === 0)
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
        No active groups are available for this account. Ask an administrator to add you to a group.
      </div>
    );
  if (options.length === 1)
    return (
      <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1.5 text-[11px] text-indigo-200">
        {options[0].name}
        <span className="ml-2 text-slate-500">Assigned from your sign-in</span>
      </div>
    );
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            disabled={disabled}
            onClick={() => toggle(o.id)}
            className={`rounded-lg border px-2.5 py-1 text-[11px] transition-colors disabled:opacity-60 ${
              on ? 'border-indigo-400 bg-indigo-600 text-white' : 'border-slate-600 bg-slate-800/80 text-slate-400 hover:text-white'
            }`}
          >
            {o.name}
            {on ? ' ✓' : ''}
          </button>
        );
      })}
    </div>
  );
};
