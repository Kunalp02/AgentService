
import React from 'react';
import { AlertTriangle, CheckCircle2, Circle, Loader2, ShieldAlert, XCircle } from 'lucide-react';
import type { EvaluationResult } from '../../api/localToolEvaluationApi';
import { STEP_META, type CaseRun, type PipelineState, type StepStatus } from './useEvaluationPipeline';
import { Chip } from './ToolsUi';

const StatusIcon: React.FC<{ status: StepStatus }> = ({ status }) => {
  switch (status) {
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-sky-400" />;
    case 'pass':
      return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    case 'warn':
      return <AlertTriangle className="h-4 w-4 text-amber-400" />;
    case 'fail':
      return <XCircle className="h-4 w-4 text-rose-400" />;
    case 'skipped':
      return <span className="block h-0.5 w-3 rounded bg-slate-500" />;
    default:
      return <Circle className="h-4 w-4 text-slate-600" />;
  }
};

const RING: Record<StepStatus, string> = {
  idle: 'border-slate-700 bg-slate-900',
  running: 'border-sky-500/60 bg-sky-500/10 shadow-[0_0_0_4px_rgba(14,165,233,0.12)]',
  pass: 'border-emerald-500/50 bg-emerald-500/10',
  warn: 'border-amber-500/50 bg-amber-500/10',
  fail: 'border-rose-500/50 bg-rose-500/10',
  skipped: 'border-slate-700 bg-slate-900',
};

const SEV: Record<string, 'default' | 'info' | 'warn' | 'bad'> = {
  info: 'default', low: 'info', medium: 'warn', high: 'bad', critical: 'bad',
};

const LEVEL_COLOR: Record<string, string> = {
  Low: 'bg-emerald-500', Medium: 'bg-amber-500', High: 'bg-orange-500', Critical: 'bg-rose-500',
};

const Evaluation: React.FC<{ ev: EvaluationResult }> = ({ ev }) => (
  <div className="mt-3 space-y-4 rounded-xl border border-slate-700/60 bg-slate-950/60 p-3.5">
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[11px]">
        <span className="font-semibold text-slate-300">Risk score</span>
        <span className="flex items-center gap-2">
          <Chip tone={ev.decision === 'BLOCK' ? 'bad' : ev.decision === 'REVIEW' ? 'warn' : 'good'}>{ev.decision}</Chip>
          <b className="font-mono text-slate-100">
            {ev.riskScore}/100 · {ev.riskLevel}
          </b>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full transition-all duration-700 ${LEVEL_COLOR[ev.riskLevel] ?? 'bg-slate-500'}`} style={{ width: `${Math.max(3, ev.riskScore)}%` }} />
      </div>
      <p className="mt-1.5 text-[10px] text-slate-500">
        Finding weights + capability grants + risky imports, computed deterministically — the model only assesses.
      </p>
    </div>

    <div className="flex flex-wrap gap-1.5">
      {(['network', 'filesystem', 'subprocess'] as const).map((c) => (
        <Chip key={c} tone={ev.capabilities[c] ? 'warn' : 'good'}>
          {c}: {ev.capabilities[c] ? 'requested' : 'none'}
        </Chip>
      ))}
      {ev.imports.map((i) => (
        <Chip key={i}>import {i}</Chip>
      ))}
    </div>

    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {ev.metrics.map((m) => (
        <div key={m.key} className="rounded-lg border border-slate-700/50 bg-slate-900/60 p-2.5" title={m.detail}>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[11px] font-semibold text-slate-200">{m.label}</span>
            <StatusIcon status={m.status} />
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full ${m.status === 'pass' ? 'bg-emerald-500' : m.status === 'warn' ? 'bg-amber-500' : 'bg-rose-500'}`}
              style={{ width: `${Math.max(4, m.score)}%` }}
            />
          </div>
          <p className="mt-1.5 line-clamp-2 text-[10px] leading-snug text-slate-500">{m.detail || '—'}</p>
        </div>
      ))}
    </div>

    {ev.findings.length > 0 && (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300">
          <ShieldAlert className="h-3.5 w-3.5 text-amber-400" /> Findings ({ev.findings.length})
        </div>
        {ev.findings.map((f, i) => (
          <div key={i} className="rounded-lg border border-slate-700/50 bg-slate-900/60 p-2.5 text-[11px]">
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip tone={SEV[f.severity] ?? 'default'}>{f.severity}</Chip>
              <span className="font-semibold text-slate-200">{f.category}</span>
              {f.line != null && <span className="font-mono text-slate-500">line {f.line}</span>}
              {f.blocking && <Chip tone="bad">blocking</Chip>}
            </div>
            <p className="mt-1 text-slate-300">{f.message}</p>
            {f.remediation && <p className="mt-0.5 text-slate-500">Fix: {f.remediation}</p>}
          </div>
        ))}
      </div>
    )}
    {ev.summary && <p className="text-[11px] leading-relaxed text-slate-400">{ev.summary}</p>}
  </div>
);

const Runs: React.FC<{ runs: CaseRun[] }> = ({ runs }) => (
  <div className="mt-3 space-y-1.5">
    {runs.map((r, i) => (
      <div key={i} className="rounded-lg border border-slate-700/50 bg-slate-950/60 p-2.5 text-[11px]">
        <div className="flex items-center gap-2">
          {r.status === 'pending' ? <Circle className="h-3.5 w-3.5 text-slate-600" /> :
           r.status === 'running' ? <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" /> :
           r.status === 'pass' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> :
           <XCircle className="h-3.5 w-3.5 text-rose-400" />}
          <span className="flex-1 truncate font-semibold text-slate-200">{r.case.name}</span>
          <Chip tone={r.case.expectSuccess ? 'good' : 'warn'}>expects {r.case.expectSuccess ? 'success' : 'error'}</Chip>
          {r.ms != null && <span className="font-mono text-slate-500">{r.ms} ms</span>}
        </div>
        <div className="mt-1 font-mono text-[10px] text-slate-500 break-all">{r.case.argumentsJson}</div>
        {r.case.rationale && <p className="mt-0.5 text-slate-500">{r.case.rationale}</p>}
        {(r.status === 'pass' || r.status === 'fail') && (
          <pre className={`mt-1.5 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded bg-[#070c17] p-2 text-[10px] ${r.success ? 'text-emerald-300' : 'text-rose-300'}`}>
            {r.success ? JSON.stringify(r.output, null, 2) : r.error || 'Failed'}
          </pre>
        )}
        {r.status === 'fail' && (
          <p className="mt-1 text-amber-300">Behaviour did not match what the test expected.</p>
        )}
      </div>
    ))}
  </div>
);

export const PipelineView: React.FC<{ state: PipelineState }> = ({ state }) => {
  const doneCount = state.steps.filter((s) => ['pass', 'warn', 'fail', 'skipped'].includes(s.status)).length;
  const pct = Math.round((doneCount / state.steps.length) * 100);

  return (
    <div>
      <div className="mb-4">
        <div className="mb-1 flex justify-between text-[10px] text-slate-500">
          <span>{state.running ? 'Running…' : state.finished ? 'Finished' : 'Not run yet'}</span>
          <span className="font-mono">
            {doneCount}/{state.steps.length}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-sky-400 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <ol>
        {state.steps.map((s, idx) => {
          const meta = STEP_META[s.key];
          const last = idx === state.steps.length - 1;
          return (
            <li key={s.key} className={`relative pl-11 ${last ? '' : 'pb-5'}`}>
              {!last && <span className="absolute left-[15px] top-8 bottom-0 w-px bg-slate-700" />}
              <span className={`absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full border transition-all ${RING[s.status]}`}>
                <StatusIcon status={s.status} />
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs font-semibold ${s.status === 'idle' || s.status === 'skipped' ? 'text-slate-500' : 'text-slate-100'}`}>
                  {meta.label}
                </span>
                {s.ms != null && <span className="font-mono text-[10px] text-slate-500">{s.ms} ms</span>}
              </div>
              <p className={`mt-0.5 text-[11px] leading-snug ${s.status === 'fail' ? 'text-rose-300' : s.status === 'warn' ? 'text-amber-300' : 'text-slate-500'}`}>
                {s.detail || meta.hint}
              </p>

              {s.key === 'static' && state.staticFindings.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 rounded-lg border border-rose-500/20 bg-rose-500/5 py-2 pl-6 pr-3 text-[11px] text-rose-200">
                  {state.staticFindings.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              )}
              {s.key === 'evaluate' && state.evaluation && <Evaluation ev={state.evaluation} />}
              {s.key === 'sandbox' && state.runs.length > 0 && <Runs runs={state.runs} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
};
