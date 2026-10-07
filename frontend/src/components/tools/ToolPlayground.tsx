
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, Loader2, Lock, Play, ShieldCheck, Sparkles, XCircle,
} from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';
import { localToolsApi } from '../../api/localToolsApi';
import { modelRegistryApi } from '../../api/modelRegistryApi';
import { workspaceApi } from '../../api/workspaceApi';
import type { ModelRegistryDto } from '../../types/gatewayModelRegistry';
import type { GenerateLocalToolCodeResponse, LocalToolDetailDto, LocalToolRunHistoryDto, LocalToolTestResult } from '../../types/tools';
import { ArgumentsEditor, summarizeParams } from './SchemaForm';
import { PipelineView } from './PipelineView';
import { WorkspaceFileLinks } from './FileLinks';
import { useEvaluationPipeline } from './useEvaluationPipeline';
import {
  BTN, BTN_DANGER, BTN_OK, BTN_PRI, BTN_SM, CARD, Chip, ErrorBanner, Field, GroupPicker, INPUT, JsonBlock, Modal, Spinner, StatusBadge, errText,
} from './ToolsUi';

type Mode = 'create' | 'edit' | 'review';
type Step = 1 | 2 | 3;
type StageKey = 'desc' | 'code';
type StageStatus = 'idle' | 'running' | 'done' | 'error';

const STEPS: { n: Step; label: string; hint: string }[] = [
  { n: 1, label: 'Details & code', hint: 'Name, groups, AI generation and Python code' },
  { n: 2, label: 'Evaluation & schema', hint: 'Pipeline and generated input schema' },
  { n: 3, label: 'Manual test', hint: 'Try the tool with real arguments' },
];

const AI_STAGES: { key: StageKey; label: string; hint: string }[] = [
  { key: 'desc', label: 'Writing tool description', hint: 'Turning your rough idea into a clear description' },
  { key: 'code', label: 'Generating Python code', hint: 'Building the function from that description' },
];

const NO_STAGES: Record<StageKey, StageStatus> = { desc: 'idle', code: 'idle' };

const stripFences = (s: string) => s.replace(/^\s*```(?:\w+)?\s*\n?/i, '').replace(/\n?```\s*$/, '');
const looksLikeCode = (s: string) => /^\s*(def |import |from |class )/.test(s);

/** Pulls the first docstring out of a code-looking reply, as a last resort for the description. */
const docstringOf = (s: string): string => {
  const m = s.match(/"""([\s\S]*?)"""/) || s.match(/'''([\s\S]*?)'''/);
  return m ? m[1].trim() : '';
};

/** Whatever the backend sent back as the reason a tool was revoked or rejected. */
export const reasonOf = (d: any): string | null => {
  const v = d?.statusReason ?? d?.revokeReason ?? d?.revocationReason ?? d?.rejectionReason ?? d?.reviewNotes ?? d?.reason ?? null;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
};

const Section: React.FC<{ title: string; icon?: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode }> = ({ title, icon, aside, children }) => (
  <section className={`${CARD} p-5`}>
    <div className="mb-3.5 flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-200">
        {icon}
        {title}
      </h3>
      {aside}
    </div>
    {children}
  </section>
);

/** Progress bar for the three pages. Spans only: it is rendered inside the modal's <p> subtitle. */
const Stepper: React.FC<{ step: Step; onGo: (s: Step) => void; canGo: (s: Step) => boolean }> = ({ step, onGo, canGo }) => (
  <span className="mt-2 flex w-full items-center gap-2">
    {STEPS.map((s, i) => {
      const done = s.n < step;
      const current = s.n === step;
      const clickable = s.n < step && canGo(s.n);
      return (
        <React.Fragment key={s.n}>
          <button
            type="button"
            disabled={!clickable}
            onClick={() => onGo(s.n)}
            title={s.hint}
            className={`flex items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors ${clickable ? 'hover:bg-slate-800' : 'cursor-default'}`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${
                done
                  ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300'
                  : current
                    ? 'border-indigo-400 bg-indigo-600 text-white shadow-[0_0_0_4px_rgba(99,102,241,0.18)]'
                    : 'border-slate-600 bg-slate-800 text-slate-500'
              }`}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : s.n}
            </span>
            <span className={`hidden text-xs font-semibold sm:inline ${current ? 'text-white' : done ? 'text-slate-300' : 'text-slate-500'}`}>
              {s.label}
            </span>
          </button>
          {i < STEPS.length - 1 && <span className={`h-px min-w-[16px] flex-1 ${s.n < step ? 'bg-emerald-500/50' : 'bg-slate-700'}`} />}
        </React.Fragment>
      );
    })}
  </span>
);

const StageIcon: React.FC<{ status: StageStatus }> = ({ status }) =>
  status === 'running' ? (
    <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
  ) : status === 'done' ? (
    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
  ) : status === 'error' ? (
    <XCircle className="h-4 w-4 text-rose-400" />
  ) : (
    <Circle className="h-4 w-4 text-slate-600" />
  );

/** Vertical progress list in the same visual language as the evaluation pipeline. */
const GenerationProgress: React.FC<{ stages: Record<StageKey, StageStatus> }> = ({ stages }) => {
  const done = AI_STAGES.filter((s) => stages[s.key] === 'done').length;
  const pct = Math.round((done / AI_STAGES.length) * 100);
  return (
    <div className="mt-4">
      <div className="mb-1 flex justify-between text-[10px] text-slate-500">
        <span>{Object.values(stages).some((s) => s === 'running') ? 'Generating…' : done === AI_STAGES.length ? 'Finished' : 'Stopped'}</span>
        <span className="font-mono">
          {done}/{AI_STAGES.length}
        </span>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-sky-400 transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <ol>
        {AI_STAGES.map((s, idx) => {
          const last = idx === AI_STAGES.length - 1;
          const st = stages[s.key];
          const ring =
            st === 'running'
              ? 'border-sky-500/60 bg-sky-500/10 shadow-[0_0_0_4px_rgba(14,165,233,0.12)]'
              : st === 'done'
                ? 'border-emerald-500/50 bg-emerald-500/10'
                : st === 'error'
                  ? 'border-rose-500/50 bg-rose-500/10'
                  : 'border-slate-700 bg-slate-900';
          return (
            <li key={s.key} className={`relative pl-11 ${last ? '' : 'pb-5'}`}>
              {!last && <span className="absolute left-[15px] top-8 bottom-0 w-px bg-slate-700" />}
              <span className={`absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full border transition-all ${ring}`}>
                <StageIcon status={st} />
              </span>
              <span className={`text-xs font-semibold ${st === 'idle' ? 'text-slate-500' : 'text-slate-100'}`}>{s.label}</span>
              <p className={`mt-0.5 text-[11px] leading-snug ${st === 'error' ? 'text-rose-300' : 'text-slate-500'}`}>{s.hint}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

const CodeEditor: React.FC<{ value: string; onChange: (v: string) => void; disabled?: boolean }> = ({ value, onChange, disabled }) => {
  const gutter = useRef<HTMLDivElement>(null);
  const lines = Math.max(1, value.split('\n').length);
  return (
    <div className="flex overflow-hidden rounded-xl border border-slate-700 bg-[#070c17] focus-within:border-indigo-400">
      <div ref={gutter} aria-hidden style={{ height: 380 }} className="select-none overflow-hidden border-r border-slate-800 bg-[#0a1020] py-3 pl-3 pr-2 text-right font-mono text-[11px] leading-5 text-slate-600">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        value={value}
        disabled={disabled}
        spellCheck={false}
        wrap="off"
        style={{ height: 380 }}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
        }}
        placeholder={'def my_tool(a: int, b: int = 1):\n    return a + b'}
        className="flex-1 resize-none bg-transparent p-3 font-mono text-[11px] leading-5 text-emerald-300 outline-none disabled:opacity-70"
      />
    </div>
  );
};

export const ToolPlayground: React.FC<{
  open: boolean;
  mode: Mode;
  toolId?: string;
  onClose: () => void;
  onSaved: (saved: LocalToolDetailDto, mode: 'create' | 'edit') => void;
  onApprove?: (id: string) => Promise<void> | void;
  onReject?: (id: string, name: string) => void;
  onRevoke?: (id: string, name: string) => void;
}> = ({ open, mode, toolId, onClose, onSaved, onApprove, onReject, onRevoke }) => {
  const { groups, hasPermission } = usePlatform();
  const activeGroups = useMemo(() => groups.filter((g) => g.isActive), [groups]);
  const canEvaluate = hasPermission('57') || hasPermission('58');
  const readOnly = mode === 'review';

  const pipe = useEvaluationPipeline();

  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [origCode, setOrigCode] = useState('');
  const [loadedSchema, setLoadedSchema] = useState<string | null>(null);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [statusReason, setStatusReason] = useState<string | null>(null);
  const [aiDrafted, setAiDrafted] = useState(false);

  // One model for the whole page: AI generation and the evaluation both use it.
  const [models, setModels] = useState<ModelRegistryDto[]>([]);
  const [modelId, setModelId] = useState('');
  const [modelsError, setModelsError] = useState<string | null>(null);

  // AI generation: rough idea -> description -> code, in one click
  const [idea, setIdea] = useState('');
  const [stages, setStages] = useState<Record<StageKey, StageStatus>>(NO_STAGES);
  const [showProgress, setShowProgress] = useState(false);

  const [testArgs, setTestArgs] = useState<any>({});
  const [testJsonError, setTestJsonError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<LocalToolTestResult | null>(null);
  const [runs, setRuns] = useState<LocalToolRunHistoryDto[]>([]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setStep(1);
    setError(null);
    setTestResult(null);
    setTestArgs({});
    setAiDrafted(false);
    setIdea('');
    setStages(NO_STAGES);
    setShowProgress(false);
    setStatusReason(null);
    pipe.reset();

    if ((mode === 'edit' || mode === 'review') && toolId) {
      setLoading(true);
      localToolsApi
        .get(toolId)
        .then((d) => {
          if (!alive) return;
          setName(d.name ?? '');
          setDescription(d.description ?? '');
          setCode(d.pythonCode ?? '');
          setOrigCode(d.pythonCode ?? '');
          setLoadedSchema(d.parametersSchemaJson ? JSON.stringify(JSON.parse(d.parametersSchemaJson), null, 2) : null);
          setGroupIds(d.groupIds ?? []);
          setStatus(d.status);
          setStatusReason(reasonOf(d));
        })
        .catch((e) => alive && setError(errText(e, 'Could not load this tool.')))
        .finally(() => alive && setLoading(false));
      localToolsApi.runs(toolId).then((r) => alive && setRuns(r)).catch(() => alive && setRuns([]));
    } else {
      setName('');
      setDescription('');
      setCode('');
      setOrigCode('');
      setLoadedSchema(null);
      setGroupIds(activeGroups.length === 1 ? [activeGroups[0].id] : []);
      setStatus(null);
      setRuns([]);
    }

    if (canEvaluate) {
      setModelsError(null);
      modelRegistryApi
        .list({ activeOnly: true })
        .then((list) => {
          if (!alive) return;
          const all = Array.isArray(list) ? list : [];
          const chat = all.filter((m) => (m.classification || '').toLowerCase() === 'chat');
          const usable = chat.length ? chat : all.filter((m) => !(m.classification || '').toLowerCase().includes('embed'));
          setModels(usable);
          setModelId((cur) => cur || usable[0]?.id || '');
        })
        .catch((e) => alive && setModelsError(errText(e, 'Could not load the model registry.')));
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, toolId]);

  const codeChanged = mode !== 'create' && code !== origCode;
  // A Revoked or Rejected tool being edited is on its way back to the approval queue,
  // so it goes through the full evaluation again even when the code is unchanged.
  const resubmit = mode === 'edit' && (status === 'Revoked' || status === 'Rejected');
  const schemaText = pipe.state.schemaJson ?? (codeChanged ? null : loadedSchema);
  const params = useMemo(() => summarizeParams(schemaText), [schemaText]);

  const needsPipeline = mode === 'create' || mode === 'review' || codeChanged || resubmit;
  const canProceed = !needsPipeline || pipe.ready;

  const selectedModel = models.find((m) => m.id === modelId);
  const aiBusy = Object.values(stages).some((s) => s === 'running');

  const onCode = (v: string) => {
    setCode(v);
    setTestResult(null);
    if (pipe.state.started) pipe.reset();
  };

  /* ------------------------------------------------------------ AI generation
     No dedicated endpoints exist, so both stages go through /local-tools/generate.
     The model's raw reply comes back in `draftPythonCode`; `explanation` is a canned
     "Draft generated…" sentence from the backend, so it must never be used as content. */

  const callModel = (instruction: string): Promise<GenerateLocalToolCodeResponse> => {
    if (!selectedModel) throw new Error('Select a model first.');
    if (groupIds.length === 0) throw new Error('Select the tool’s groups first — generation is group-scoped.');
    return localToolsApi.generate({
      gatewayId: selectedModel.gatewayId,
      modelId: selectedModel.id,
      groupIds,
      description: instruction.slice(0, 4000),
    });
  };

  const textFrom = (r: GenerateLocalToolCodeResponse): string => {
    const draft = stripFences((r.draftPythonCode || '').trim());
    if (draft) return draft;
    const expl = stripFences((r.explanation || '').trim());
    return /^draft generated/i.test(expl) ? '' : expl;
  };

  const setStage = (k: StageKey, s: StageStatus) => setStages((p) => ({ ...p, [k]: s }));

  /** One click: rough idea -> description -> code, one call after the other. */
  const generateWithAi = async () => {
    setError(null);
    if (!idea.trim()) return setError('Describe the tool you want in a sentence or two first.');
    if (!modelId) return setError('Select a model to generate with.');
    if (groupIds.length === 0) return setError('Select the tool’s groups first — generation is group-scoped.');

    setShowProgress(true);
    setStages({ desc: 'running', code: 'idle' });

    // 1 ─ description
    let desc = '';
    try {
      const raw = textFrom(
        await callModel(
          'Do NOT write any code. Reply with ONLY a clear, professional description (2 to 3 sentences, plain text, no markdown, no headings) ' +
            'of a Python tool that AI agents can call. Say what it does, its inputs and what it returns. ' +
            `Rough idea: ${idea.trim()}`,
        ),
      );
      desc = looksLikeCode(raw) ? docstringOf(raw) : raw;
      if (!desc) throw new Error('The model did not return a description. Try again or rephrase the idea.');
      desc = desc.slice(0, 1000);
      setDescription(desc);
      setStage('desc', 'done');
    } catch (e) {
      setStage('desc', 'error');
      setError(errText(e, 'Could not write the description.'));
      return;
    }

    // 2 ─ code, built from that same description
    setStage('code', 'running');
    try {
      const r = await callModel(
        'Implement the following tool as ONE self-contained Python function. Include type hints and sensible defaults, handle bad input, ' +
          'use only the standard library, and avoid os, subprocess, socket, eval, exec, network access, file writes and hard-coded secrets. ' +
          'Reply with ONLY the Python code. ' +
          `Tool description: ${desc}`,
      );
      const draft = stripFences((r.draftPythonCode ?? '').trim());
      if (!draft) throw new Error('The model returned no code.');
      onCode(draft);
      setAiDrafted(true);
      setStage('code', 'done');
    } catch (e) {
      setStage('code', 'error');
      setError(errText(e, 'Could not generate the code.'));
    }
  };

  /* ------------------------------------------------------------ evaluation & test */

  const runPipeline = () => {
    if (!modelId) return setError('Select a model to run the evaluation with.');
    if (!code.trim()) return setError('Add some Python code first.');
    setError(null);
    void pipe.run({ code, modelId, savedToolId: mode === 'review' ? toolId : undefined });
  };

  /** Page 1 → page 2. Starts the evaluation unless one is already running/finished for this code. */
  const submitAndEvaluate = () => {
    if (!name.trim()) return setError('Name is required.');
    if (!code.trim()) return setError('Python code is required.');
    if (groupIds.length === 0) return setError('Select at least one group.');
    setError(null);
    if (needsPipeline && canEvaluate && !pipe.state.started) {
      if (!modelId) return setError('Select a model to run the evaluation with.');
      void pipe.run({ code, modelId, savedToolId: mode === 'review' ? toolId : undefined });
    }
    setStep(2);
  };

  const tryIt = async () => {
    if (testJsonError) return setError('Fix the arguments first.');
    setTesting(true);
    setError(null);
    try {
      const argsJson = JSON.stringify(testArgs ?? {});
      setTestResult(
        mode === 'review' && toolId ? await localToolsApi.test(toolId, argsJson) : await localToolsApi.testDraft(code, null, argsJson),
      );
    } catch (e) {
      setError(errText(e, 'Test failed.'));
    } finally {
      setTesting(false);
    }
  };

  // Uploaded files land in the tools service's workspace; the tool receives the
  // returned workspace://<id> reference. Scoped to the tool's first group when chosen.
  const uploadFile = async (file: File) => (await workspaceApi.upload(file, groupIds[0])).reference;

  const gateMessage = pipe.state.running
    ? 'Evaluation running…'
    : pipe.ready
      ? pipe.state.evaluation?.decision === 'REVIEW' || pipe.testsMismatch
        ? 'Passed with warnings — the reviewer will see the results.'
        : 'All checks passed.'
      : pipe.state.finished
        ? 'Blocked — fix the findings, go back and re-run the evaluation.'
        : needsPipeline && step > 1
          ? 'Run the evaluation to continue.'
          : '';

  const validate = (): string | null => {
    if (!name.trim()) return 'Name is required.';
    if (!code.trim()) return 'Python code is required.';
    if (groupIds.length === 0) return 'Select at least one group.';
    if (needsPipeline && !schemaText) return 'The input schema has not been generated yet.';
    return null;
  };

  const save = async () => {
    const problem = validate();
    if (problem) return setError(problem);
    setSaving(true);
    setError(null);
    try {
      const common = {
        name: name.trim(),
        description: description.trim() || null,
        pythonCode: code,
        groupIds,
        parametersSchemaJson: schemaText ? JSON.stringify(JSON.parse(schemaText)) : null,
      };
      const saved =
        mode === 'edit' && toolId
          ? await localToolsApi.update(toolId, common)
          : await localToolsApi.submit({ ...common, llmGenerationFlag: aiDrafted });
      onSaved(saved, mode === 'edit' ? 'edit' : 'create');
    } catch (e) {
      setError(errText(e, 'Save failed.'));
    } finally {
      setSaving(false);
    }
  };

  const approve = async () => {
    if (!toolId || !onApprove) return;
    setSaving(true);
    setError(null);
    try {
      await onApprove(toolId);
      onClose();
    } catch (e) {
      setError(errText(e, 'Approve failed.'));
    } finally {
      setSaving(false);
    }
  };

  const title =
    mode === 'create'
      ? 'Create local tool'
      : mode === 'edit'
        ? `${resubmit ? 'Re-submit' : 'Edit'} — ${name || 'local tool'}`
        : `Review — ${name}`;

  /* ------------------------------------------------------------ footer */

  const finalActions =
    mode === 'review' ? (
      <>
        {onReject && (
          <button className={BTN_DANGER} disabled={saving} onClick={() => { onClose(); onReject(toolId!, name); }}>
            <XCircle className="h-3.5 w-3.5" /> Reject
          </button>
        )}
        {status === 'Approved' && onRevoke && (
          <button className={BTN} disabled={saving} onClick={() => { onClose(); onRevoke(toolId!, name); }}>
            Revoke
          </button>
        )}
        {status === 'PendingApproval' && (
          <button className={BTN_OK} disabled={saving || !canProceed} onClick={approve}>
            <CheckCircle2 className="h-3.5 w-3.5" /> {saving ? 'Approving…' : 'Approve tool'}
          </button>
        )}
      </>
    ) : (
      <button className={BTN_OK} disabled={saving || !canProceed} onClick={save}>
        {saving ? 'Saving…' : mode === 'create' ? 'Submit for approval' : resubmit ? 'Re-submit for approval' : 'Save changes'}
      </button>
    );

  const footer = (
    <>
      <span className={`mr-auto text-xs ${pipe.ready ? 'text-emerald-300' : pipe.state.finished ? 'text-rose-300' : 'text-slate-500'}`}>
        {gateMessage}
      </span>
      <button className={BTN} disabled={saving} onClick={onClose}>
        Cancel
      </button>
      {step > 1 && (
        <button className={BTN} disabled={saving || pipe.state.running} onClick={() => setStep((step - 1) as Step)}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
      )}
      {step === 1 && (
        <button className={BTN_PRI} disabled={loading || aiBusy || pipe.state.running} onClick={submitAndEvaluate}>
          {needsPipeline && canEvaluate && !pipe.state.started ? 'Submit & run evaluation' : 'Next'}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
      {step === 2 && (
        <button className={BTN_PRI} disabled={!canProceed || !schemaText || pipe.state.running} onClick={() => setStep(3)}>
          Next: manual test <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
      {step === 3 && finalActions}
    </>
  );

  const showAiBuilder = step === 1 && !readOnly && canEvaluate;
  // Page 1 has its own model picker inside the AI card; the global bar is for page 2
  // and for review mode, where there is no AI card but the evaluation still needs a model.
  const showGlobalModelBar = canEvaluate && (step === 2 || (step === 1 && !showAiBuilder));

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      size="xl"
      title={
        <span className="flex items-center gap-2.5">
          {title}
          {status && <StatusBadge status={status} />}
        </span>
      }
      subtitle={
        <>
          {STEPS[step - 1].hint}
          <Stepper step={step} onGo={(s) => !pipe.state.running && setStep(s)} canGo={() => !pipe.state.running} />
        </>
      }
      footer={footer}
    >
      {loading ? (
        <Spinner label="Loading tool…" />
      ) : (
        <div className="space-y-4">
          <ErrorBanner message={error} />

          {resubmit && step === 1 && (
            <div className="space-y-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              <div>
                This tool is <b>{status}</b>. Run the evaluation on the current code, then <b>Re-submit for approval</b> to put it back in the review queue.
              </div>
              <div className="text-amber-100">
                <b>Why it was {status === 'Revoked' ? 'revoked' : 'rejected'}:</b>{' '}
                {statusReason ?? <span className="italic text-amber-300/80">no reason was recorded by the API</span>}
              </div>
            </div>
          )}
          {mode === 'edit' && !resubmit && codeChanged && step === 1 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              The code changed. The evaluation will re-run and regenerate the schema — saving resets this tool to <b>Pending approval</b>.
            </div>
          )}

          {/* Global model bar (page 2, and review mode on page 1) */}
          {showGlobalModelBar && (
            <div className={`${CARD} flex flex-col gap-2 p-3.5 sm:flex-row sm:items-center`}>
              <div className="flex shrink-0 items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-200">
                <Sparkles className="h-3.5 w-3.5 text-indigo-300" /> AI model
              </div>
              <select
                className={`${INPUT} sm:flex-1`}
                value={modelId}
                disabled={aiBusy || pipe.state.running || models.length === 0}
                onChange={(e) => setModelId(e.target.value)}
                aria-label="Model used for the evaluation"
              >
                {models.length === 0 && <option value="">{modelsError ?? 'No chat models available to your groups'}</option>}
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.gatewayName ?? 'gateway'}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-slate-500 sm:max-w-[220px]">Used for the evaluation.</span>
            </div>
          )}

          {/* ═════════════════ PAGE 1 — name & groups, AI generation, description, code */}
          {step === 1 && (
            <div className="space-y-5">
              <Section title="Details">
                <div className="grid grid-cols-1 gap-x-5 md:grid-cols-2">
                  <Field label="Name">
                    <input className={INPUT} value={name} disabled={readOnly} maxLength={128} onChange={(e) => setName(e.target.value)} />
                  </Field>
                  <Field label="Groups" hint="You can only assign groups you belong to.">
                    <GroupPicker groups={activeGroups} value={groupIds} disabled={readOnly} onChange={setGroupIds} />
                  </Field>
                </div>
              </Section>

              {showAiBuilder && (
                <Section
                  title="Generate with AI"
                  icon={<Sparkles className="h-3.5 w-3.5 text-indigo-300" />}
                  aside={<span className="text-[10px] text-slate-500">optional · idea → description → code</span>}
                >
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_280px]">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-300">Rough idea of the tool</label>
                      <textarea
                        rows={5}
                        maxLength={1000}
                        disabled={aiBusy}
                        className={INPUT}
                        placeholder="e.g. converts a temperature between celsius and fahrenheit"
                        value={idea}
                        onChange={(e) => setIdea(e.target.value)}
                      />
                    </div>

                    <div className="flex flex-col gap-3">
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-slate-300">AI model</label>
                        <select
                          className={INPUT}
                          value={modelId}
                          disabled={aiBusy || models.length === 0}
                          onChange={(e) => setModelId(e.target.value)}
                          aria-label="Model used for generation and evaluation"
                        >
                          {models.length === 0 && <option value="">{modelsError ?? 'No chat models available to your groups'}</option>}
                          {models.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} · {m.gatewayName ?? 'gateway'}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-[10px] text-slate-500">Also used for the evaluation.</p>
                      </div>
                      <button
                        className={`${BTN_PRI} mt-auto w-full`}
                        disabled={aiBusy || !modelId || !idea.trim()}
                        onClick={() => void generateWithAi()}
                      >
                        {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        {aiBusy ? 'Generating…' : 'Generate with AI'}
                      </button>
                    </div>
                  </div>

                  {showProgress && <GenerationProgress stages={stages} />}
                </Section>
              )}

              <Section title="Description">
                <Field label="" hint="Agents see this to decide when to use the tool. Filled in by Generate with AI, or write your own.">
                  <textarea
                    rows={3}
                    maxLength={1000}
                    className={INPUT}
                    value={description}
                    disabled={readOnly || stages.desc === 'running'}
                    placeholder="What the tool does, what it takes and what it returns"
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </Field>
              </Section>

              <Section
                title="Python code"
                aside={<span className="font-mono text-[10px] text-slate-500">{code.length.toLocaleString()} / 50,000</span>}
              >
                <CodeEditor value={code} onChange={onCode} disabled={readOnly || stages.code === 'running'} />
              </Section>
            </div>
          )}

          {/* ═════════════════ PAGE 2 — evaluation pipeline + input schema */}
          {step === 2 && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <Section
                  title="Evaluation pipeline"
                  icon={<ShieldCheck className="h-3.5 w-3.5 text-indigo-300" />}
                  aside={
                    canEvaluate ? (
                      <button className={`${BTN_PRI} ${BTN_SM}`} disabled={pipe.state.running || !modelId || !code.trim()} onClick={runPipeline}>
                        <Play className="h-3.5 w-3.5" /> {pipe.state.running ? 'Running…' : pipe.state.started ? 'Re-run' : 'Run evaluation'}
                      </button>
                    ) : undefined
                  }
                >
                  {!canEvaluate ? (
                    <p className="text-xs text-amber-300">You need the Create or Manage tools permission to run the evaluation.</p>
                  ) : (
                    <PipelineView state={pipe.state} />
                  )}
                </Section>
              </div>

              <div className="lg:col-span-2">
                <Section title="Input schema" icon={<Lock className="h-3.5 w-3.5 text-slate-400" />} aside={<Chip tone="info">AI-generated · read-only</Chip>}>
                  {schemaText ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-1.5">
                        {params.length === 0 && <span className="text-[11px] italic text-slate-500">This tool takes no arguments.</span>}
                        {params.map((p) => (
                          <Chip key={p.name} tone={p.required ? 'warn' : 'default'}>
                            {p.name}
                            {p.required ? '*' : ''}: {p.type}
                          </Chip>
                        ))}
                      </div>
                      <JsonBlock value={schemaText} maxHeight={420} />
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Generated from your code by the LLM during the evaluation. It can’t be edited, so the agent always sees the real signature.
                    </p>
                  )}
                </Section>
              </div>
            </div>
          )}

          {/* ═════════════════ PAGE 3 — manual test from the generated schema */}
          {step === 3 && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
              <div className="space-y-5 lg:col-span-3">
                <Section title="Try it yourself" icon={<Play className="h-3.5 w-3.5 text-emerald-400" />} aside={<Chip tone="info">form built from the generated schema</Chip>}>
                  {!schemaText || !canEvaluate ? (
                    <p className="text-xs text-slate-500">No generated schema available to build a test form from.</p>
                  ) : (
                    <>
                      <ArgumentsEditor
                        schemaJson={schemaText}
                        value={testArgs}
                        onChange={setTestArgs}
                        errors={{}}
                        onJsonError={setTestJsonError}
                        uploadFile={uploadFile}
                      />
                      <button className={`${BTN_PRI} mt-3`} disabled={testing || !code.trim() || !!testJsonError} onClick={tryIt}>
                        <Play className="h-3.5 w-3.5" /> {testing ? 'Running…' : 'Run in sandbox'}
                      </button>
                    </>
                  )}
                </Section>
              </div>

              <div className="space-y-5 lg:col-span-2">
                <Section title="Result">
                  {!testResult ? (
                    <p className="py-8 text-center text-xs text-slate-500">Run the tool to see its output here.</p>
                  ) : (
                    <div className="space-y-3 rounded-xl border border-slate-700/60 bg-slate-950/60 p-3">
                      <Chip tone={testResult.success ? 'good' : 'bad'}>{testResult.success ? 'success' : 'failed'}</Chip>
                      {testResult.error && <pre className="whitespace-pre-wrap break-words text-[11px] text-rose-300">{testResult.error}</pre>}
                      {testResult.success && <JsonBlock value={testResult.result} maxHeight={260} />}
                      {testResult.success && <WorkspaceFileLinks value={testResult.result} />}
                    </div>
                  )}
                </Section>

                <Section title="Automated cases">
                  {pipe.state.runs.length === 0 ? (
                    <p className="text-xs text-slate-500">No automated test cases were run for this code.</p>
                  ) : (
                    <p className="text-xs text-slate-300">
                      {pipe.state.runs.filter((r) => r.status === 'pass').length} of {pipe.state.runs.length} generated cases behaved as expected
                      {pipe.testsMismatch ? ' — the reviewer will see the mismatches.' : '.'}
                    </p>
                  )}
                </Section>

                {runs.length > 0 && (
                  <Section title={`Previous runs (${runs.length})`}>
                    <div className="space-y-1.5">
                      {runs.slice(0, 8).map((r) => (
                        <div key={r.id} className="flex items-center gap-2 text-[11px] text-slate-400">
                          <Chip tone={r.passed ? 'good' : 'bad'}>{r.passed ? 'pass' : 'fail'}</Chip>
                          <span>{r.kind}</span>
                          <span className="truncate">{r.ranBy}</span>
                          <span className="ml-auto text-slate-600">{new Date(r.ranAt).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
