
import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, Wand2 } from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';
import { localToolsApi } from '../../api/localToolsApi';
import { modelRegistryApi } from '../../api/modelRegistryApi';
import { Field, Modal } from '../../rag/Overlays';
import type { ModelRegistryDto } from '../../types/gatewayModelRegistry';
import type { LocalToolDetailDto } from '../../types/tools';
import { parseSchema, SchemaPreview } from './SchemaForm';
import { BTN, BTN_OK, BTN_PRI, ErrorBanner, GroupPicker, INPUT, MONO_AREA, Spinner, errText } from './ToolsUi';

/** Mirrors BasicPythonCodeValidator so authors see problems before the server audit does. */
const BANNED: [RegExp, string][] = [
  [/\bimport\s+os\b/, "Direct 'os' import"],
  [/\bimport\s+subprocess\b/, "'subprocess' import"],
  [/\bimport\s+socket\b/, "'socket' import"],
  [/\b__import__\s*\(/, "Dynamic '__import__' call"],
  [/\beval\s*\(/, "'eval' call"],
  [/\bexec\s*\(/, "'exec' call"],
  [/\bopen\s*\([^)]*['"]w/, 'File open in write mode'],
  [/\bshutil\.(rmtree|move)\b/, 'Destructive shutil operation'],
];

function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = '';
  for (const ch of s) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if ('([{'.includes(ch)) {
      depth++;
      cur += ch;
    } else if (')]}'.includes(ch)) {
      depth--;
      cur += ch;
    } else if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function pyType(ann?: string): Record<string, any> {
  const a = (ann || '').trim();
  const opt = a.match(/^Optional\[(.+)\]$/);
  if (opt) return pyType(opt[1]);
  const l = a.toLowerCase();
  if (l === 'str') return { type: 'string' };
  if (l === 'int') return { type: 'integer' };
  if (l === 'float') return { type: 'number' };
  if (l === 'bool') return { type: 'boolean' };
  if (l.startsWith('list') || l.startsWith('tuple') || l.startsWith('set')) return { type: 'array' };
  if (l.startsWith('dict')) return { type: 'object' };
  return {};
}

function pyDefault(d: string): any {
  if (d === 'True') return true;
  if (d === 'False') return false;
  if (d === 'None') return undefined;
  if (/^-?\d+(\.\d+)?$/.test(d)) return Number(d);
  const q = d.match(/^(['"])(.*)\1$/);
  return q ? q[2] : undefined;
}

/** Best-effort JSON Schema from the first `def` signature. */
function inferSchemaFromPython(code: string): string | null {
  const m = code.match(/def\s+([A-Za-z_]\w*)\s*\(([\s\S]*?)\)\s*(?:->[^:]+)?:/);
  if (!m) return null;
  const properties: Record<string, any> = {};
  const required: string[] = [];
  for (let raw of splitTopLevel(m[2])) {
    raw = raw.trim();
    if (!raw || raw === '*' || raw === '/' || raw.startsWith('*')) continue;
    const pm = raw.match(/^([A-Za-z_]\w*)\s*(?::\s*([^=]+?))?\s*(?:=\s*([\s\S]+))?$/);
    if (!pm) continue;
    const [, name, ann, def] = pm;
    if (name === 'self' || name === 'cls') continue;
    const prop = pyType(ann);
    if (def !== undefined) {
      const d = pyDefault(def.trim());
      if (d !== undefined) prop.default = d;
    } else required.push(name);
    properties[name] = prop;
  }
  const schema: Record<string, any> = { type: 'object', properties };
  if (required.length) schema.required = required;
  return JSON.stringify(schema, null, 2);
}

const stripFences = (s: string) => s.replace(/^\s*```(?:python)?\s*\n?/i, '').replace(/\n?```\s*$/, '');

export const LocalToolFormModal: React.FC<{
  open: boolean;
  mode: 'create' | 'edit';
  toolId?: string;
  onClose: () => void;
  onSaved: (saved: LocalToolDetailDto, mode: 'create' | 'edit') => void;
}> = ({ open, mode, toolId, onClose, onSaved }) => {
  const { groups, hasPermission } = usePlatform();
  const activeGroups = useMemo(() => groups.filter((g) => g.isActive), [groups]);
  const canGenerate = hasPermission('57'); // LocalTools.Create

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [origCode, setOrigCode] = useState('');
  const [origStatus, setOrigStatus] = useState<string | null>(null);
  const [schemaText, setSchemaText] = useState('');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [generated, setGenerated] = useState(false);

  const [models, setModels] = useState<ModelRegistryDto[]>([]);
  const [modelId, setModelId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [explanation, setExplanation] = useState('');
  const [modelsError, setModelsError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setError(null);
    setExplanation('');
    setPrompt('');
    setGenerated(false);
    setShowPreview(false);

    if (mode === 'edit' && toolId) {
      setLoading(true);
      localToolsApi
        .get(toolId)
        .then((d) => {
          if (!alive) return;
          setName(d.name ?? '');
          setDescription(d.description ?? '');
          setCode(d.pythonCode ?? '');
          setOrigCode(d.pythonCode ?? '');
          setOrigStatus(d.status);
          setSchemaText(d.parametersSchemaJson ? JSON.stringify(JSON.parse(d.parametersSchemaJson), null, 2) : '');
          setGroupIds(d.groupIds ?? []);
        })
        .catch((e) => alive && setError(errText(e, 'Could not load this tool.')))
        .finally(() => alive && setLoading(false));
    } else {
      setName('');
      setDescription('');
      setCode('');
      setOrigCode('');
      setOrigStatus(null);
      setSchemaText('');
      setGroupIds(activeGroups.length === 1 ? [activeGroups[0].id] : []);
    }

    if (canGenerate) {
      setModelsError(null);
      modelRegistryApi
        .list({ activeOnly: true })
        .then((list) => {
          if (!alive) return;
          const all = Array.isArray(list) ? list : [];
          // Prefer Chat-classified models (code generation needs a chat model).
          // If nothing is classified as Chat, fall back to the original rule:
          // just exclude anything that looks like an embedding model.
          // Original filter was:
          //   all.filter((m) => !(m.classification || '').toLowerCase().includes('embed'))
          const chat = all.filter((m) => (m.classification || '').toLowerCase() === 'chat');
          const usable = chat.length
            ? chat
            : all.filter((m) => !(m.classification || '').toLowerCase().includes('embed'));
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

  const warnings = useMemo(() => BANNED.filter(([re]) => re.test(code)).map(([, msg]) => msg), [code]);
  const schemaCheck = useMemo(() => parseSchema(schemaText), [schemaText]);
  const codeChanged = mode === 'edit' && code !== origCode;

  const generate = async () => {
    const model = models.find((m) => m.id === modelId);
    if (!model) return setError('Select a model to generate with.');
    if (!prompt.trim()) return setError('Describe the tool you want generated.');
    if (groupIds.length === 0) return setError('Select the tool’s groups first — generation is group-scoped.');
    setGenerating(true);
    setError(null);
    try {
      const r = await localToolsApi.generate({
        gatewayId: model.gatewayId,
        modelId: model.id,
        groupIds,
        description: prompt.trim(),
      });
      const draft = stripFences(r.draftPythonCode ?? '');
      setCode(draft);
      setGenerated(true);
      setExplanation(r.explanation ?? '');
      if (!schemaText.trim()) {
        const inferred = inferSchemaFromPython(draft);
        if (inferred) setSchemaText(inferred);
      }
    } catch (e) {
      setError(errText(e, 'Generation failed.'));
    } finally {
      setGenerating(false);
    }
  };

  const validate = (): string | null => {
    if (!name.trim()) return 'Name is required.';
    if (name.trim().length > 128) return 'Name must be 128 characters or fewer.';
    if (!code.trim()) return 'Python code is required.';
    if (code.length > 50_000) return 'Code exceeds the 50,000 character limit.';
    if (groupIds.length === 0) return 'Select at least one group.';
    if (schemaCheck.error) return schemaCheck.error;
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
        parametersSchemaJson: schemaText.trim() ? JSON.stringify(JSON.parse(schemaText)) : null,
      };
      const saved =
        mode === 'edit' && toolId
          ? await localToolsApi.update(toolId, common)
          : await localToolsApi.submit({ ...common, llmGenerationFlag: generated });
      onSaved(saved, mode);
    } catch (e) {
      setError(errText(e, 'Save failed.'));
    } finally {
      setSaving(false);
    }
  };

  const busy = loading || saving || generating;

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      size="xl"
      title={mode === 'edit' ? `Edit local tool${name ? ` — ${name}` : ''}` : 'Create local Python tool'}
      subtitle="Every submission is statically validated and LLM-audited, then waits for reviewer approval."
      footer={
        <>
          <button className={BTN} disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button className={BTN_OK} disabled={busy} onClick={save}>
            {saving ? 'Saving…' : mode === 'edit' ? 'Save & re-submit' : 'Submit for approval'}
          </button>
        </>
      }
    >
      {loading ? (
        <Spinner label="Loading tool…" />
      ) : (
        <div className="space-y-3">
          <ErrorBanner message={error} />

          {codeChanged && (
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200">
              Changing the code re-runs the audit and resets this tool to <b>Pending approval</b>
              {origStatus === 'Approved' ? ' — it stops being usable by agents until re-approved.' : '.'}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8">
            <div>
              {canGenerate && (
                <div className="mb-4 p-3.5 rounded-xl bg-indigo-500/5 border border-indigo-500/25 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-200">
                    <Sparkles className="w-3.5 h-3.5" /> Generate with AI
                  </div>
                  {modelsError ? (
                    <p className="text-[11px] text-amber-300">{modelsError}</p>
                  ) : (
                    <select className={INPUT} value={modelId} disabled={busy} onChange={(e) => setModelId(e.target.value)}>
                      {models.length === 0 && <option value="">No chat models available to your groups</option>}
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} · {m.gatewayName ?? 'gateway'}
                          {m.classification ? ` (${m.classification})` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                  <textarea
                    rows={3}
                    className={INPUT}
                    disabled={busy}
                    maxLength={4000}
                    placeholder="e.g. A function that converts a temperature between Celsius and Fahrenheit"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                  />
                  <button className={BTN_PRI} disabled={busy || !modelId || !prompt.trim()} onClick={generate}>
                    <Sparkles className="w-3.5 h-3.5" /> {generating ? 'Generating…' : 'Generate draft'}
                  </button>
                  {explanation && <p className="text-[11px] text-slate-400">{explanation}</p>}
                </div>
              )}

              <Field label="Name">
                <input className={INPUT} value={name} maxLength={128} disabled={busy} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Description">
                <textarea rows={2} className={INPUT} value={description} disabled={busy} onChange={(e) => setDescription(e.target.value)} />
              </Field>
              <Field label="Groups" hint="Who can see and use this tool. You can only assign groups you belong to.">
                <GroupPicker groups={activeGroups} value={groupIds} disabled={busy} onChange={setGroupIds} />
              </Field>
            </div>

            <div>
              <Field label="Python code" hint="A single self-contained function. Sandboxed at runtime.">
                <textarea
                  rows={14}
                  spellCheck={false}
                  className={MONO_AREA}
                  value={code}
                  disabled={busy}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={'def my_tool(a: int, b: int = 1):\n    return a + b'}
                />
                <div className="text-[10px] text-slate-500 mt-1 text-right">{code.length.toLocaleString()} / 50,000</div>
                {warnings.length > 0 && (
                  <div className="mt-1 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200">
                    The static check will flag: {warnings.join(' · ')}
                  </div>
                )}
              </Field>

              <Field
                label="Parameters schema (JSON Schema)"
                hint="Used to build the LLM tool definition and the argument form. Strongly recommended."
              >
                <textarea
                  rows={8}
                  spellCheck={false}
                  className={MONO_AREA}
                  value={schemaText}
                  disabled={busy}
                  onChange={(e) => setSchemaText(e.target.value)}
                  placeholder='{ "type": "object", "properties": { "a": { "type": "integer" } }, "required": ["a"] }'
                />
                {schemaCheck.error && <p className="text-[11px] text-rose-400 mt-1">{schemaCheck.error}</p>}
                <div className="flex flex-wrap gap-2 mt-2">
                  <button
                    type="button"
                    className={BTN}
                    disabled={busy || !code.trim()}
                    onClick={() => {
                      const inferred = inferSchemaFromPython(code);
                      if (inferred) setSchemaText(inferred);
                      else setError('Could not find a `def` signature to infer a schema from.');
                    }}
                  >
                    <Wand2 className="w-3.5 h-3.5" /> Infer from function signature
                  </button>
                  <button type="button" className={BTN} disabled={!schemaText.trim()} onClick={() => setShowPreview((v) => !v)}>
                    {showPreview ? 'Hide' : 'Preview'} generated form
                  </button>
                </div>
                {showPreview && (
                  <div className="mt-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <SchemaPreview schemaJson={schemaText} />
                  </div>
                )}
              </Field>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
