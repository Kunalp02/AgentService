
import React from 'react';



export const CARD = 'rounded-2xl bg-slate-900 border border-slate-800 shadow-xl p-5';
export const SUBCARD = 'rounded-xl bg-slate-950/80 border border-slate-800 p-3.5';
export const INPUT =
  'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 ' +
  'placeholder-slate-500 focus:outline-none focus:border-emerald-500';
export const TEXTAREA = INPUT + ' leading-relaxed';
export const MONO_AREA =
  'w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs ' +
  'text-emerald-300 leading-relaxed focus:outline-none focus:border-emerald-500';
export const BTN =
  'px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 ' +
  'text-xs font-semibold text-slate-200 transition-colors disabled:opacity-40 ' +
  'disabled:cursor-not-allowed';
export const BTN_PRI =
  'px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold ' +
  'shadow-lg shadow-emerald-600/25 transition-all disabled:opacity-40 ' +
  'disabled:cursor-not-allowed';
export const LABEL = 'block text-xs font-semibold text-slate-300 mb-1';
export const HELP = 'text-xs text-slate-400 leading-relaxed';

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => <div className={`${CARD} ${className}`}>{children}</div>;

export const CardTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-sm font-bold text-white">{children}</h3>
);

/* A numbered step, because these screens ARE a sequence: the order on
   screen is the order the work happens in. Nowhere else in this module
   are numbers used as decoration. */
export const Step: React.FC<{
  n: React.ReactNode;
  title: string;
  help?: React.ReactNode;
  tone?: 'emerald' | 'indigo' | 'amber';
  children: React.ReactNode;
}> = ({ n, title, help, tone = 'emerald', children }) => {
  const badge =
    tone === 'amber'
      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
      : tone === 'indigo'
        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2.5">
        <span
          className={`w-6 h-6 shrink-0 rounded-lg border flex items-center justify-center text-[11px] font-bold font-mono ${badge}`}
        >
          {n}
        </span>
        <span className="text-sm font-bold text-white">{title}</span>
      </div>
      {help && (
        <p className={`${HELP} mt-1`} style={{ marginLeft: 34 }}>
          {help}
        </p>
      )}
      <div style={{ marginLeft: 34 }} className="mt-2.5">
        {children}
      </div>
    </div>
  );
};

type Tone = 'good' | 'warn' | 'crit' | 'info' | 'muted';
const TONES: Record<Tone, string> = {
  good: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  warn: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  crit: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  info: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  muted: 'bg-slate-800 text-slate-300 border-slate-700',
};

export const Pill: React.FC<{ tone?: Tone; children: React.ReactNode }> = ({
  tone = 'muted',
  children,
}) => (
  <span
    className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${TONES[tone]}`}
  >
    {children}
  </span>
);

/** A score bar. Width is the score; nothing here is rounded for looks. */
export const Meter: React.FC<{ value: number }> = ({ value }) => (
  <span className="inline-block align-middle w-24 h-1.5 rounded-full bg-slate-800 overflow-hidden mr-2">
    <span
      className="block h-full bg-emerald-500"
      style={{ width: `${Math.max(2, Math.round(100 * (value || 0)))}%` }}
    />
  </span>
);

export const Bar: React.FC<{ width?: string }> = ({ width = '60%' }) => (
  <div className="h-1 rounded-full bg-slate-800 overflow-hidden mt-2.5">
    <div className="h-full bg-emerald-500 transition-all" style={{ width }} />
  </div>
);

/* A wait with a number on it. `estimate` is seconds from `startedAt` (ms);
   the bar and "left" are worked out every half second, and a wait that runs
   past its estimate says so instead of sitting at 100%. */
export const EtaBar: React.FC<{
  label: string;
  startedAt: number;
  estimate: number;
  basis?: string;
}> = ({ label, startedAt, estimate, basis }) => {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const elapsed = (now - startedAt) / 1000;
  const over = elapsed > estimate;
  const pct = estimate > 0 ? Math.min(97, (elapsed / estimate) * 100) : 5;
  const fmt = (s: number) => {
    const t = Math.max(0, Math.round(s));
    return t < 60 ? `${t} s` : `${Math.floor(t / 60)} min ${t % 60 ? (t % 60) + ' s' : ''}`.trim();
  };
  return (
    <div data-testid="eta">
      <p className="text-[11px] text-slate-400 mt-3">{label}</p>
      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden mt-2">
        <div
          className={`h-full transition-all ${over ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}
          style={{ width: `${over ? 97 : pct}%` }}
        />
      </div>
      <p className="text-[11px] text-slate-500 mt-1.5 font-mono">
        {fmt(elapsed)} elapsed ·{' '}
        {over
          ? `${fmt(elapsed - estimate)} past the estimate of ${fmt(estimate)} - still working`
          : `about ${fmt(estimate - elapsed)} left of ~${fmt(estimate)}`}
        {basis ? ` · estimate: ${basis}` : ''}
      </p>
    </div>
  );
};

export const KV: React.FC<{ k: React.ReactNode; children: React.ReactNode }> = ({
  k,
  children,
}) => (
  <div className="flex gap-4 py-2 border-b border-slate-800 last:border-b-0 items-start text-xs">
    <span className="text-slate-400 shrink-0" style={{ minWidth: 150 }}>
      {k}
    </span>
    {/* min-w-0 lets a flex item shrink below its content, and
        overflow-wrap:anywhere breaks a run with no spaces - a table of
        contents' dot leaders ran off the card's right edge without both. */}
    <span className="flex-1 min-w-0 text-right text-slate-200 break-words [overflow-wrap:anywhere]">
      {children}
    </span>
  </div>
);

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="p-8 text-center rounded-xl bg-slate-950 border border-slate-800 text-slate-400 text-xs">
    {children}
  </div>
);

export const Toast: React.FC<{ text: string }> = ({ text }) =>
  text ? (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-2.5 rounded-xl bg-slate-100 text-slate-900 text-xs font-semibold shadow-2xl">
      {text}
    </div>
  ) : null;

/* ------------------------------------------------------------------
   Markdown as the answer is written — tables, headings, quoted figures.
   Ported from lite because the answer arrives as markdown and rendering
   it as plain text turns a table into a wall of pipes.
------------------------------------------------------------------- */
export const Markdown: React.FC<{ text?: string }> = ({ text }) => {
  if (!text) return null;

  const esc = (s: any) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<b class="text-white">$1</b>')
      .replace(
        /`([^`]+)`/g,
        '<code style="background:#0f172a;padding:1px 5px;border-radius:5px;' +
          'font-family:ui-monospace,Menlo,Consolas,monospace">$1</code>',
      );

  const out: string[] = [];
  const lines = String(text).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      out.push(
        '<pre style="white-space:pre-wrap;background:#020617;border:1px solid #1e293b;' +
          'padding:12px 14px;border-radius:10px;margin:10px 0;overflow-x:auto;' +
          'font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:#6ee7b7">' +
          esc(body.join('\n')) +
          '</pre>',
      );
      continue;
    }
    if (/^\|/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      const cells = (r: string) =>
        r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(line);
      const align = cells(lines[i + 1]).map((a) => (a.endsWith(':') ? 'right' : 'left'));
      i++;
      const body: string[][] = [];
      while (i + 1 < lines.length && /^\|/.test(lines[i + 1])) body.push(cells(lines[++i]));
      out.push(
        '<div style="overflow-x:auto;margin:10px 0"><table style="width:100%;border-collapse:collapse;font-size:12px">' +
          '<thead><tr>' +
          head
            .map(
              (h, j) =>
                '<th style="text-align:' +
                align[j] +
                ';padding:8px 10px;border-bottom:1px solid #1e293b;color:#94a3b8;' +
                'text-transform:uppercase;font-size:10px;letter-spacing:.4px">' +
                inline(h) +
                '</th>',
            )
            .join('') +
          '</tr></thead><tbody>' +
          body
            .map(
              (r) =>
                '<tr>' +
                r
                  .map(
                    (c, j) =>
                      '<td style="text-align:' +
                      (align[j] || 'left') +
                      ';padding:8px 10px;border-bottom:1px solid #1e293b;color:#cbd5e1">' +
                      inline(c) +
                      '</td>',
                  )
                  .join('') +
                '</tr>',
            )
            .join('') +
          '</tbody></table></div>',
      );
      continue;
    }
    if (/^### /.test(line))
      out.push(
        "<h4 style='margin:16px 0 6px;font-weight:700;color:#fff;font-size:13px'>" +
          inline(line.slice(4)) +
          '</h4>',
      );
    else if (/^## /.test(line))
      out.push(
        "<h3 style='margin:6px 0 8px;font-weight:700;color:#fff;font-size:14px'>" +
          inline(line.slice(3)) +
          '</h3>',
      );
    else if (/^# /.test(line))
      out.push(
        "<h3 style='margin:8px 0 10px;font-weight:700;color:#fff;font-size:16px'>" +
          inline(line.slice(2)) +
          '</h3>',
      );
    else if (/^> /.test(line))
      out.push(
        '<blockquote style="margin:10px 0;padding:8px 12px;border-left:3px solid #f59e0b;' +
          'background:rgba(245,158,11,.10);border-radius:0 8px 8px 0;color:#fcd34d">' +
          inline(line.slice(2)) +
          '</blockquote>',
      );
    else if (/^_.*_$/.test(line.trim()))
      out.push(
        '<p style="margin:6px 0;color:#94a3b8;font-size:11px">' +
          inline(line.trim().replace(/^_|_$/g, '')) +
          '</p>',
      );
    else if (line.trim())
      out.push("<p style='margin:8px 0;color:#cbd5e1'>" + inline(line) + '</p>');
  }
  return (
    <div className="text-xs leading-relaxed" dangerouslySetInnerHTML={{ __html: out.join('') }} />
  );
};
