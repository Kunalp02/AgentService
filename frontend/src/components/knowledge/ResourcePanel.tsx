
import React, { useEffect, useState } from 'react';
import { Cpu } from 'lucide-react';
import { get } from '../../rag/apiClient';

/* WHAT THE MACHINE IS DOING WHILE A FILE IS READ.

   The engine answers /system/resources from /proc: the machine's CPU and
   memory, the engine's own share, Docling's (its container's processes are
   ordinary processes on the host), Ollama's and PostgreSQL's - and which
   reads and ingests are running, with their stage and how long they have
   taken. Polled every two seconds while `active`; the first poll has no
   earlier sample, so CPU shows "…" once and is real from then on. */

const GB = (n: number) => (n / 1024 / 1024 / 1024).toFixed(n > 10 * 1024 ** 3 ? 0 : 1) + ' GB';
const MB = (n: number) => (n > 1024 ** 3 ? GB(n) : (n / 1024 / 1024).toFixed(0) + ' MB');
const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? '…' : v.toFixed(0) + '%';

const Meter: React.FC<{ value: number | null | undefined; max: number; tone?: string }> = ({
  value,
  max,
  tone = 'bg-emerald-500',
}) => (
  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
    <div
      className={`h-full transition-all ${tone}`}
      style={{ width: `${Math.min(100, Math.max(0, ((value || 0) / (max || 1)) * 100))}%` }}
    />
  </div>
);

export const ResourcePanel: React.FC<{ active: boolean }> = ({ active }) => {
  const [snap, setSnap] = useState<any>(null);

    useEffect(() => {
    if (!active) return;
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async () => {
      try {
        const s = await get('/system/resources', ctrl.signal);
        if (!ctrl.signal.aborted) setSnap(s);
      } catch {
        /* aborted, or the engine is busy: try again next round */
      }
      if (!ctrl.signal.aborted) timer = setTimeout(loop, 2000); // only after the last one finished
    };
    void loop();
    return () => {
      ctrl.abort();
      if (timer) clearTimeout(timer);
    };
  }, [active]);

  if (!active || !snap) return null;
  if (!snap.available)
    return <p className="text-[11px] text-slate-500 mt-3">Machine load: {snap.reason}</p>;

  const host = snap.host || {};
  const cores = host.cores || 1;
  const rows: [string, any][] = [
    ['Engine (this service)', snap.engine || {}],
    ...Object.entries(snap.services || {}),
  ];

  return (
    <div
      className="mt-4 p-3.5 rounded-xl bg-slate-950/80 border border-slate-800"
      data-testid="resources"
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
        <Cpu className="w-3.5 h-3.5" /> Machine load, live
      </div>

      <div className="grid grid-cols-2 gap-4 mt-3">
        <div>
          <div className="flex justify-between text-[11px] text-slate-400">
            <span>CPU ({cores} cores)</span>
            <span className="font-mono text-slate-200">{pct(host.cpu_percent)}</span>
          </div>
          <Meter value={host.cpu_percent} max={100} tone="bg-cyan-500" />
        </div>
        <div>
          <div className="flex justify-between text-[11px] text-slate-400">
            <span>Memory</span>
            <span className="font-mono text-slate-200">
              {GB(host.memory_used || 0)} / {GB(host.memory_total || 0)}
            </span>
          </div>
          <Meter value={host.memory_used} max={host.memory_total} tone="bg-violet-500" />
        </div>
      </div>

      <table className="w-full mt-3 text-[11px]">
        <thead>
          <tr className="text-slate-500 text-left">
            <th className="font-normal py-1">Process</th>
            <th className="font-normal py-1 text-right">CPU</th>
            <th className="font-normal py-1 text-right">Memory</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, r]) => (
            <tr key={name} className="border-t border-slate-800/80">
              <td className="py-1 text-slate-300">
                {name}
                {r.processes > 1 ? <span className="text-slate-500"> ×{r.processes}</span> : null}
              </td>
              <td className="py-1 text-right font-mono text-slate-200">
                {/* per cent of ONE core, as top shows it: 380% = nearly four cores busy */}
                {pct(r.cpu_percent)}
              </td>
              <td className="py-1 text-right font-mono text-slate-200">{MB(r.memory || 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {(snap.running || []).length > 0 && (
        <div className="mt-3 space-y-1">
          {snap.running.map((t: any, i: number) => (
            <p key={i} className="text-[11px] text-slate-400 font-mono">
              <span className="text-emerald-400">{t.what}</span> {t.file} — {t.stage} ·{' '}
              {Math.round(t.seconds)} s
            </p>
          ))}
        </div>
      )}
      <p className="text-[10px] text-slate-600 mt-2">
        CPU per process is per cent of one core (400% = four cores). Read from {snap.method}.
      </p>
    </div>
  );
};
