
import { useCallback, useRef, useState } from 'react';
import { localToolsApi } from '../../api/localToolsApi';
import {
  localToolEvaluationApi,
  type EvalTestCase,
  type EvaluationResult,
} from '../../api/localToolEvaluationApi';
import { errText } from './ToolsUi';

export type StepKey = 'static' | 'schema' | 'evaluate' | 'cases' | 'sandbox';
export type StepStatus = 'idle' | 'running' | 'pass' | 'warn' | 'fail' | 'skipped';

export interface StepState {
  key: StepKey;
  status: StepStatus;
  detail?: string;
  ms?: number;
}

export interface CaseRun {
  case: EvalTestCase;
  status: 'pending' | 'running' | 'pass' | 'fail';
  success?: boolean;
  output?: unknown;
  error?: string | null;
  ms?: number;
}

export const STEP_META: Record<StepKey, { label: string; hint: string }> = {
  static: { label: 'Static safety scan', hint: 'AST scan in the sandbox service for banned imports and calls' },
  schema: { label: 'Generate input schema', hint: 'The LLM reads the code and derives the JSON Schema of its arguments' },
  evaluate: { label: 'LLM evaluation', hint: 'Rubric review: security, contract, imports, secrets, capabilities, resources, quality' },
  cases: { label: 'Generate test cases', hint: 'The LLM designs happy-path, edge and failure cases' },
  sandbox: { label: 'Run in sandbox', hint: 'Every case is executed in the isolated Docker sandbox' },
};

const KEYS: StepKey[] = ['static', 'schema', 'evaluate', 'cases', 'sandbox'];

export interface PipelineState {
  started: boolean;
  running: boolean;
  finished: boolean;
  steps: StepState[];
  staticPassed: boolean | null;
  staticFindings: string[];
  schemaJson: string | null;
  evaluation: EvaluationResult | null;
  runs: CaseRun[];
}

const initial = (): PipelineState => ({
  started: false,
  running: false,
  finished: false,
  steps: KEYS.map((key) => ({ key, status: 'idle' })),
  staticPassed: null,
  staticFindings: [],
  schemaJson: null,
  evaluation: null,
  runs: [],
});

export function useEvaluationPipeline() {
  const [state, setState] = useState<PipelineState>(initial);
  const token = useRef(0);

  const patchStep = (key: StepKey, patch: Partial<StepState>) =>
    setState((s) => ({ ...s, steps: s.steps.map((x) => (x.key === key ? { ...x, ...patch } : x)) }));

  const skipFrom = (from: StepKey, why: string) =>
    setState((s) => {
      let hit = false;
      return {
        ...s,
        steps: s.steps.map((x) => {
          if (x.key === from) hit = true;
          return hit && x.status === 'idle' ? { ...x, status: 'skipped', detail: why } : x;
        }),
      };
    });

  const patchRun = (i: number, patch: Partial<CaseRun>) =>
    setState((s) => ({ ...s, runs: s.runs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }));

  const reset = useCallback(() => {
    token.current++;
    setState(initial());
  }, []);

  const run = useCallback(async (o: { code: string; modelId: string; savedToolId?: string }) => {
    const my = ++token.current;
    const alive = () => my === token.current;
    const finish = () => alive() && setState((s) => ({ ...s, running: false, finished: true }));
    const since = (t: number) => Math.round(performance.now() - t);

    setState({ ...initial(), started: true, running: true });

    // 1 ─ static scan
    let t = performance.now();
    patchStep('static', { status: 'running' });
    try {
      const r = o.savedToolId ? await localToolsApi.check(o.savedToolId) : await localToolsApi.checkDraft(o.code);
      if (!alive()) return;
      setState((s) => ({ ...s, staticPassed: r.passed, staticFindings: r.findings ?? [] }));
      patchStep('static', {
        status: r.passed ? 'pass' : 'fail',
        ms: since(t),
        detail: r.passed ? 'No banned imports or calls found' : `${r.findings?.length ?? 0} issue(s) found`,
      });
      if (!r.passed) {
        skipFrom('schema', 'Fix the static findings first');
        return finish();
      }
    } catch (e) {
      if (!alive()) return;
      setState((s) => ({ ...s, staticPassed: false }));
      patchStep('static', { status: 'fail', ms: since(t), detail: errText(e, 'Static check failed.') });
      skipFrom('schema', 'Static scan did not complete');
      return finish();
    }

    // 2 ─ schema (LLM)
    t = performance.now();
    patchStep('schema', { status: 'running' });
    let schemaJson = '';
    try {
      const r = await localToolEvaluationApi.generateSchema({ modelId: o.modelId, pythonCode: o.code });
      if (!alive()) return;
      schemaJson = JSON.stringify(JSON.parse(r.parametersSchemaJson), null, 2);
      setState((s) => ({ ...s, schemaJson }));
      patchStep('schema', {
        status: 'pass',
        ms: since(t),
        detail: `${r.parameterCount} parameter(s)${r.functionName ? ` for ${r.functionName}()` : ''}`,
      });
    } catch (e) {
      if (!alive()) return;
      patchStep('schema', { status: 'fail', ms: since(t), detail: errText(e, 'Schema generation failed.') });
      skipFrom('evaluate', 'No input schema');
      return finish();
    }

    // 3 ─ evaluation (LLM rubric + deterministic score)
    t = performance.now();
    patchStep('evaluate', { status: 'running' });
    let blocked = false;
    try {
      const ev = await localToolEvaluationApi.evaluate({ modelId: o.modelId, pythonCode: o.code, parametersSchemaJson: schemaJson });
      if (!alive()) return;
      blocked = ev.decision === 'BLOCK';
      setState((s) => ({ ...s, evaluation: ev }));
      patchStep('evaluate', {
        status: ev.decision === 'BLOCK' ? 'fail' : ev.decision === 'REVIEW' ? 'warn' : 'pass',
        ms: since(t),
        detail: `${ev.decision} · risk ${ev.riskScore}/100 (${ev.riskLevel})`,
      });
    } catch (e) {
      if (!alive()) return;
      patchStep('evaluate', { status: 'fail', ms: since(t), detail: errText(e, 'Evaluation failed.') });
      skipFrom('cases', 'Evaluation did not complete');
      return finish();
    }
    if (blocked) {
      skipFrom('cases', 'Blocked by the evaluation — not executed');
      return finish();
    }

    // 4 ─ test cases (LLM)
    t = performance.now();
    patchStep('cases', { status: 'running' });
    let cases: EvalTestCase[] = [];
    try {
      const r = await localToolEvaluationApi.generateTestCases({ modelId: o.modelId, pythonCode: o.code, parametersSchemaJson: schemaJson });
      if (!alive()) return;
      cases = r.cases;
      setState((s) => ({ ...s, runs: cases.map((c) => ({ case: c, status: 'pending' as const })) }));
      patchStep('cases', { status: 'pass', ms: since(t), detail: `${cases.length} case(s) designed` });
    } catch (e) {
      if (!alive()) return;
      patchStep('cases', { status: 'fail', ms: since(t), detail: errText(e, 'Could not generate test cases.') });
      skipFrom('sandbox', 'No test cases');
      return finish();
    }

    // 5 ─ sandbox execution, one case at a time
    t = performance.now();
    patchStep('sandbox', { status: 'running' });
    let ok = 0;
    for (let i = 0; i < cases.length; i++) {
      if (!alive()) return;
      patchRun(i, { status: 'running' });
      const t0 = performance.now();
      try {
        const r = o.savedToolId
          ? await localToolsApi.test(o.savedToolId, cases[i].argumentsJson)
          : await localToolsApi.testDraft(o.code, null, cases[i].argumentsJson);
        if (!alive()) return;
        const asExpected = r.success === cases[i].expectSuccess;
        if (asExpected) ok++;
        patchRun(i, { status: asExpected ? 'pass' : 'fail', success: r.success, output: r.result, error: r.error ?? null, ms: since(t0) });
      } catch (e) {
        if (!alive()) return;
        patchRun(i, { status: 'fail', success: false, error: errText(e, 'Run failed.'), ms: since(t0) });
      }
    }
    patchStep('sandbox', {
      status: ok === cases.length ? 'pass' : 'warn',
      ms: since(t),
      detail: `${ok}/${cases.length} behaved as expected`,
    });
    finish();
  }, []);

  const ev = state.evaluation;
  const ready = state.finished && state.staticPassed === true && !!state.schemaJson && !!ev && ev.decision !== 'BLOCK';
  const testsMismatch = state.runs.some((r) => r.status === 'fail');

  return { state, run, reset, ready, testsMismatch };
}
