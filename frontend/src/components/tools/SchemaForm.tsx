
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { BTN, INPUT, MONO_AREA } from './ToolsUi';
import { Download } from 'lucide-react';
import { isWorkspaceRef, workspaceApi } from '../../api/workspaceApi';
/* ------------------------------------------------------------------
   JSON Schema -> form.

   Handles: string / number / integer / boolean / enum / const, nested objects,
   arrays (of anything), $ref (#/$defs, #/definitions), allOf merge, nullable
   types ["string","null"], anyOf/oneOf (single non-null variant collapses;
   several become a variant picker), format hints, min/max, and a raw-JSON
   fallback for anything free-form.

   Values are plain JS. `undefined` means "not set" and is pruned before send.
------------------------------------------------------------------- */

export type JsonSchema = Record<string, any>;
export type FieldErrors = Record<string, string>;

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const clone = (v: any) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export function parseSchema(json?: string | null): { schema: JsonSchema | null; error: string | null } {
  if (!json || !json.trim()) return { schema: null, error: null };
  try {
    const s = JSON.parse(json);
    if (isObj(s)) return { schema: s, error: null };
    return { schema: null, error: 'Schema must be a JSON object.' };
  } catch (e) {
    return { schema: null, error: 'Schema is not valid JSON: ' + (e instanceof Error ? e.message : String(e)) };
  }
}

function mergeSchemas(a: JsonSchema, b: JsonSchema): JsonSchema {
  const out: JsonSchema = { ...a, ...b };
  if (a.properties || b.properties) out.properties = { ...(a.properties || {}), ...(b.properties || {}) };
  if (a.required || b.required) out.required = Array.from(new Set([...(a.required || []), ...(b.required || [])]));
  return out;
}

export function resolveSchema(schema: any, root: any, depth = 0): JsonSchema {
  if (!isObj(schema)) return {};
  let s: JsonSchema = schema;
  if (typeof s.$ref === 'string' && depth < 12) {
    const parts = s.$ref.replace(/^#\/?/, '').split('/').filter(Boolean);
    let target: any = root;
    for (const p of parts) target = target?.[p.replace(/~1/g, '/').replace(/~0/g, '~')];
    const { $ref, ...rest } = s;
    s = { ...resolveSchema(target, root, depth + 1), ...rest };
  }
  if (Array.isArray(s.allOf)) {
    const { allOf, ...rest } = s;
    s = allOf.reduce(
      (acc: JsonSchema, part: any) => mergeSchemas(acc, resolveSchema(part, root, depth + 1)),
      rest as JsonSchema,
    );
  }
  return s;
}

function unionVariants(s: JsonSchema): JsonSchema[] | null {
  const list = s.anyOf ?? s.oneOf;
  if (!Array.isArray(list)) return null;
  return list.filter((v: any) => !(isObj(v) && v.type === 'null'));
}

/** Resolved schema, with a single-variant anyOf/oneOf (typical "nullable") collapsed. */
function prepare(schema: any, root: any): JsonSchema {
  let s = resolveSchema(schema, root);
  const vs = unionVariants(s);
  if (vs && vs.length === 1) {
    const { anyOf, oneOf, ...rest } = s;
    s = { ...resolveSchema(vs[0], root), ...rest };
  }
  return s;
}

export function schemaType(s: JsonSchema): string {
  if (Array.isArray(s.type)) {
    const t = s.type.filter((x: string) => x !== 'null');
    return t[0] ?? 'null';
  }
  if (typeof s.type === 'string') return s.type;
  if (s.properties) return 'object';
  if (s.items) return 'array';
  return 'unknown';
}

/** True when the schema is an object with a declared `properties` map (even an empty one). */
export function isFormSchema(schema: JsonSchema | null): boolean {
  if (!schema) return false;
  const s = prepare(schema, schema);
  return schemaType(s) === 'object' && isObj(s.properties);
}

export function summarizeParams(json?: string | null): { name: string; type: string; required: boolean }[] {
  const { schema } = parseSchema(json);
  if (!schema) return [];
  const s = prepare(schema, schema);
  if (!isObj(s.properties)) return [];
  const req = new Set<string>(s.required || []);
  return Object.entries<any>(s.properties).map(([name, v]) => {
    const ps = prepare(v, schema);
    return {
      name,
      type: Array.isArray(ps.enum) ? 'enum' : schemaType(ps) === 'unknown' ? 'any' : schemaType(ps),
      required: req.has(name),
    };
  });
}

// --------------------------------------------------------------- defaults

export function defaultsFromSchema(schema: any, root: any = schema, depth = 0): any {
  const s = prepare(schema, root);
  if (s.default !== undefined) return clone(s.default);
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];
  if (s.const !== undefined) return s.const;
  const t = schemaType(s);
  if (t === 'object') {
    if (!isObj(s.properties)) return undefined;
    if (depth > 6) return {};
    const out: Record<string, any> = {};
    const req: string[] = s.required || [];
    for (const [k, p] of Object.entries<any>(s.properties)) {
      const ps = prepare(p, root);
      if (ps.default !== undefined) out[k] = clone(ps.default);
      else if (req.includes(k)) {
        const d = defaultsFromSchema(ps, root, depth + 1);
        if (d !== undefined) out[k] = d;
      }
    }
    return out;
  }
  if (t === 'boolean') return false;
  if (t === 'array') return [];
  return undefined;
}

function blankFor(schema: any, root: any): any {
  const d = defaultsFromSchema(schema, root);
  if (d !== undefined) return d;
  switch (schemaType(prepare(schema, root))) {
    case 'string':
      return '';
    case 'number':
    case 'integer':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'object':
      return {};
    default:
      return null;
  }
}

// ---------------------------------------------------------------- pruning

function prune(schema: any, root: any, value: any, required: boolean): any {
  const s = prepare(schema, root);
  if (value === undefined || value === null) return undefined;
  const vs = unionVariants(s);
  if (vs && vs.length > 1) return value;

  if (typeof value === 'string') return value === '' && !required ? undefined : value;

  if (Array.isArray(value)) {
    const itemSchema = Array.isArray(s.items) ? s.items[0] : s.items;
    const out = value.map((v) => (itemSchema ? prune(itemSchema, root, v, true) ?? v : v));
    return out.length === 0 && !required ? undefined : out;
  }

  if (isObj(value)) {
    const out: Record<string, any> = {};
    const req: string[] = s.required || [];
    for (const [k, v] of Object.entries(value)) {
      const propSchema = isObj(s.properties) ? s.properties[k] : undefined;
      const child = propSchema ? prune(propSchema, root, v, req.includes(k)) : v;
      if (child !== undefined) out[k] = child;
    }
    return Object.keys(out).length === 0 && !required ? undefined : out;
  }
  return value;
}

export function pruneArguments(schema: JsonSchema | null, value: any): Record<string, any> {
  if (!schema) return isObj(value) ? value : {};
  const out = prune(schema, schema, value ?? {}, true);
  return isObj(out) ? out : {};
}

// ------------------------------------------------------------- validation

function walk(schema: any, root: any, value: any, path: string, required: boolean, errors: FieldErrors) {
  const s = prepare(schema, root);
  const key = path || '(root)';
  const t = schemaType(s);

  if (value === undefined || value === null || value === '') {
    if (required && t !== 'boolean') errors[key] = 'Required';
    return;
  }
  const vs = unionVariants(s);
  if (vs && vs.length > 1) return;

  if (Array.isArray(s.enum)) {
    if (!s.enum.some((e: any) => JSON.stringify(e) === JSON.stringify(value)))
      errors[key] = 'Must be one of the allowed values';
    return;
  }

  switch (t) {
    case 'string': {
      if (typeof value !== 'string') return void (errors[key] = 'Must be text');
      if (typeof s.minLength === 'number' && value.length < s.minLength) errors[key] = `At least ${s.minLength} characters`;
      else if (typeof s.maxLength === 'number' && value.length > s.maxLength) errors[key] = `At most ${s.maxLength} characters`;
      else if (typeof s.pattern === 'string') {
        try {
          if (!new RegExp(s.pattern).test(value)) errors[key] = `Must match ${s.pattern}`;
        } catch {
          /* bad pattern in schema — ignore */
        }
      }
      return;
    }
    case 'number':
    case 'integer': {
      if (typeof value !== 'number' || Number.isNaN(value)) return void (errors[key] = 'Must be a number');
      if (t === 'integer' && !Number.isInteger(value)) errors[key] = 'Must be a whole number';
      else if (typeof s.minimum === 'number' && value < s.minimum) errors[key] = `Minimum is ${s.minimum}`;
      else if (typeof s.maximum === 'number' && value > s.maximum) errors[key] = `Maximum is ${s.maximum}`;
      return;
    }
    case 'boolean':
      if (typeof value !== 'boolean') errors[key] = 'Must be true or false';
      return;
    case 'array': {
      if (!Array.isArray(value)) return void (errors[key] = 'Must be a list');
      if (typeof s.minItems === 'number' && value.length < s.minItems) errors[key] = `At least ${s.minItems} item(s)`;
      else if (typeof s.maxItems === 'number' && value.length > s.maxItems) errors[key] = `At most ${s.maxItems} item(s)`;
      const itemSchema = Array.isArray(s.items) ? s.items[0] : s.items;
      if (itemSchema) value.forEach((v, i) => walk(itemSchema, root, v, `${path}[${i}]`, true, errors));
      return;
    }
    case 'object': {
      if (!isObj(value)) return void (errors[key] = 'Must be an object');
      if (isObj(s.properties)) {
        const req: string[] = s.required || [];
        for (const [k, p] of Object.entries<any>(s.properties))
          walk(p, root, value[k], path ? `${path}.${k}` : k, req.includes(k), errors);
      }
      return;
    }
    default:
      return;
  }
}

export function validateArguments(schema: JsonSchema | null, value: any): FieldErrors {
  const errors: FieldErrors = {};
  if (schema) walk(schema, schema, value ?? {}, '', true, errors);
  return errors;
}

// ------------------------------------------------------------- components

interface Ctx {
  root: JsonSchema;
  errors: FieldErrors;
  disabled?: boolean;
  uploadFile?: (file: File) => Promise<string>;
}
interface CtlProps {
  schema: any;
  value: any;
  onChange: (v: any) => void;
  name: string;
  path: string;
  required: boolean;
  ctx: Ctx;
}

const childPath = (path: string, key: string) => (path ? `${path}.${key}` : key);

const JsonControl: React.FC<{ value: any; onChange: (v: any) => void; disabled?: boolean; placeholder?: string }> = ({
  value,
  onChange,
  disabled,
  placeholder,
}) => {
  const [text, setText] = useState(value === undefined ? '' : JSON.stringify(value, null, 2));
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <textarea
        rows={4}
        className={MONO_AREA}
        disabled={disabled}
        placeholder={placeholder || '{ }'}
        value={text}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          if (!t.trim()) {
            setErr(null);
            onChange(undefined);
            return;
          }
          try {
            onChange(JSON.parse(t));
            setErr(null);
          } catch {
            setErr('Invalid JSON');
            onChange(undefined);
          }
        }}
      />
      {err && <p className="text-[10px] text-rose-400 mt-1">{err}</p>}
    </>
  );
};

const EnumControl: React.FC<CtlProps & { s: JsonSchema }> = ({ s, value, onChange, required, ctx }) => {
  const opts: any[] = s.enum;
  const idx = opts.findIndex((o) => JSON.stringify(o) === JSON.stringify(value));
  return (
    <select
      className={INPUT}
      disabled={ctx.disabled}
      value={idx >= 0 ? String(idx) : ''}
      onChange={(e) => onChange(e.target.value === '' ? undefined : opts[Number(e.target.value)])}
    >
      {(!required || idx < 0) && <option value="">{required ? 'Select…' : '— not set —'}</option>}
      {opts.map((o, i) => (
        <option key={i} value={String(i)}>
          {typeof o === 'string' ? o : JSON.stringify(o)}
        </option>
      ))}
    </select>
  );
};

const BoolControl: React.FC<CtlProps> = ({ value, onChange, required, ctx }) =>
  required ? (
    <label className="flex items-center gap-2 text-xs text-slate-300">
      <input
        type="checkbox"
        className="accent-indigo-500"
        disabled={ctx.disabled}
        checked={value === true}
        onChange={(e) => onChange(e.target.checked)}
      />
      {value === true ? 'true' : 'false'}
    </label>
  ) : (
    <select
      className={INPUT}
      disabled={ctx.disabled}
      value={value === undefined ? '' : String(value)}
      onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value === 'true')}
    >
      <option value="">— not set —</option>
      <option value="true">true</option>
      <option value="false">false</option>
    </select>
  );

const TextControl: React.FC<CtlProps & { s: JsonSchema }> = ({ s, name, value, onChange, ctx }) => {
  const multiline =
    s['x-multiline'] === true ||
    s.format === 'textarea' ||
    (typeof s.maxLength === 'number' && s.maxLength > 200) ||
    /^(code|query|sql|prompt|content|text|body|message|description)$/i.test(name);
  const type =
    s.format === 'password'
      ? 'password'
      : s.format === 'email'
        ? 'email'
        : s.format === 'uri' || s.format === 'url'
          ? 'url'
          : s.format === 'date'
            ? 'date'
            : 'text';
  const placeholder = s.format === 'date-time' ? 'ISO 8601, e.g. 2026-09-21T10:00:00Z' : s.examples?.[0] ?? '';
  const common = {
    disabled: ctx.disabled,
    value: typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value),
    placeholder: String(placeholder ?? ''),
  };
  return multiline ? (
    <textarea
      rows={3}
      className={INPUT}
      {...common}
      onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
    />
  ) : (
    <input
      type={type}
      autoComplete="off"
      className={INPUT}
      {...common}
      onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
    />
  );
};

const NumberControl: React.FC<CtlProps & { s: JsonSchema; integer: boolean }> = ({
  s,
  integer,
  value,
  onChange,
  ctx,
}) => (
  <input
    type="number"
    className={INPUT}
    disabled={ctx.disabled}
    min={s.minimum}
    max={s.maximum}
    step={integer ? 1 : s.multipleOf ?? 'any'}
    value={typeof value === 'number' && !Number.isNaN(value) ? value : ''}
    onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
  />
);

const ObjectControl: React.FC<CtlProps & { s: JsonSchema }> = ({ s, value, onChange, path, ctx }) => {
  if (!isObj(s.properties)) {
    return <JsonControl value={value} onChange={onChange} disabled={ctx.disabled} placeholder='{ "key": "value" }' />;
  }
  const entries = Object.entries<any>(s.properties);
  if (entries.length === 0) return <p className="text-[11px] text-slate-500 italic">No fields.</p>;
  const req: string[] = s.required || [];
  const obj = isObj(value) ? value : {};
  return (
    <div className="space-y-3 border-l border-slate-700/70 pl-3">
      {entries.map(([k, p]) => (
        <FieldView
          key={k}
          schema={p}
          name={k}
          path={childPath(path, k)}
          required={req.includes(k)}
          ctx={ctx}
          value={obj[k]}
          onChange={(nv) => {
            const next = { ...obj };
            if (nv === undefined) delete next[k];
            else next[k] = nv;
            onChange(next);
          }}
        />
      ))}
    </div>
  );
};

const ArrayControl: React.FC<CtlProps & { s: JsonSchema }> = ({ s, value, onChange, name, path, ctx }) => {
  const arr: any[] = Array.isArray(value) ? value : [];
  const itemSchema = Array.isArray(s.items) ? s.items[0] : s.items;
  if (!itemSchema) return <JsonControl value={value} onChange={onChange} disabled={ctx.disabled} placeholder="[ ]" />;
  const canAdd = typeof s.maxItems !== 'number' || arr.length < s.maxItems;
  return (
    <div className="space-y-2 border-l border-slate-700/70 pl-3">
      {arr.length === 0 && <p className="text-[11px] text-slate-500 italic">No items.</p>}
      {arr.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <FieldView
              schema={itemSchema}
              name={`${name}[${i}]`}
              path={`${path}[${i}]`}
              required
              ctx={ctx}
              value={item}
              hideLabel
              onChange={(nv) => {
                const next = [...arr];
                next[i] = nv;
                onChange(next);
              }}
            />
          </div>
          <button
            type="button"
            disabled={ctx.disabled}
            className="mt-1 p-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-rose-300"
            onClick={() => onChange(arr.filter((_, j) => j !== i))}
            aria-label="Remove item"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className={BTN}
        disabled={ctx.disabled || !canAdd}
        onClick={() => onChange([...arr, blankFor(itemSchema, ctx.root)])}
      >
        <Plus className="w-3.5 h-3.5" /> Add item
      </button>
    </div>
  );
};

function guessVariant(value: any, variants: JsonSchema[], root: any): number {
  const want =
    typeof value === 'string'
      ? ['string']
      : typeof value === 'number'
        ? ['number', 'integer']
        : typeof value === 'boolean'
          ? ['boolean']
          : Array.isArray(value)
            ? ['array']
            : isObj(value)
              ? ['object']
              : [];
  const i = variants.findIndex((v) => want.includes(schemaType(prepare(v, root))));
  return i >= 0 ? i : 0;
}

const UnionControl: React.FC<CtlProps & { variants: JsonSchema[] }> = (p) => {
  const { variants, value, onChange, ctx } = p;
  const [idx, setIdx] = useState(() => guessVariant(value, variants, ctx.root));
  const label = (v: JsonSchema, i: number) => {
    const s = prepare(v, ctx.root);
    return s.title || (Array.isArray(s.enum) ? 'enum' : schemaType(s)) || `Option ${i + 1}`;
  };
  return (
    <div className="space-y-2">
      <select
        className={INPUT}
        disabled={ctx.disabled}
        value={idx}
        onChange={(e) => {
          const n = Number(e.target.value);
          setIdx(n);
          onChange(blankFor(variants[n], ctx.root));
        }}
      >
        {variants.map((v, i) => (
          <option key={i} value={i}>
            {label(v, i)}
          </option>
        ))}
      </select>
      <Control {...p} schema={variants[idx]} />
    </div>
  );
};

// ---------------------------

/** Which properties should render as an upload box. The LLM-generated schema rarely says
    "format: file", so a string param named like a file whose description talks about
    uploads or files is treated as one too. */
const FILE_NAME_RE = /(^|[_-])(file|upload|attachment|document)s?([_-]?(path|ref|id|url))?$/i;
function isFileSchema(s: JsonSchema, name: string): boolean {
  if (s['x-ccil-file'] === true) return true;
  if (['file', 'binary', 'data-url'].includes(s.format)) return true;
  if (typeof s.contentMediaType === 'string') return true;
  return (
    schemaType(s) === 'string' &&
    FILE_NAME_RE.test(name) &&
    /upload|workspace|file/i.test(String(s.description ?? ''))
  );
}

const FileControl: React.FC<CtlProps & { s: JsonSchema }> = ({ value, onChange, ctx }) => {
  const [busy, setBusy] = useState(false);
  const [dl, setDl] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = async (file: File | undefined) => {
    if (!file || !ctx.uploadFile) return;
    setBusy(true);
    setErr(null);
    try {
      const ref = await ctx.uploadFile(file);
      setFileName(file.name);
      onChange(ref);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const download = async () => {
    if (!isWorkspaceRef(value)) return;
    setDl(true);
    setErr(null);
    try {
      await workspaceApi.download(value, fileName ?? undefined);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Download failed.');
    } finally {
      setDl(false);
    }
  };

  const has = typeof value === 'string' && value !== '';

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        disabled={ctx.disabled || busy || !ctx.uploadFile}
        onChange={(e) => pick(e.target.files?.[0])}
        className="block w-full text-[11px] text-slate-300 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-800 file:text-slate-200 file:text-[11px] hover:file:bg-slate-700"
      />
      {busy && <p className="text-[10px] text-slate-500 mt-1">Uploading…</p>}
      {err && <p className="text-[10px] text-rose-400 mt-1">{err}</p>}
      {has && (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="min-w-0 flex-1 break-all font-mono text-[10px] text-emerald-400">
            {fileName ? `${fileName} · ` : ''}
            {value}
          </span>
          {isWorkspaceRef(value) && (
            <button
              type="button"
              disabled={dl}
              onClick={() => void download()}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-600 px-2 py-1 text-[10px] text-slate-300 hover:text-white"
            >
              <Download className="h-3 w-3" /> {dl ? '…' : 'Download'}
            </button>
          )}
          <button
            type="button"
            disabled={ctx.disabled}
            onClick={() => {
              setFileName(null);
              onChange(undefined);
            }}
            className="shrink-0 rounded-md border border-slate-600 px-2 py-1 text-[10px] text-slate-400 hover:text-rose-300"
          >
            Clear
          </button>
        </div>
      )}
      {!ctx.uploadFile && <p className="text-[10px] text-amber-400 mt-1">File upload isn't wired up here.</p>}
    </div>
  );
};
//  --------------------------


const Control: React.FC<CtlProps> = (p) => {
  let s = prepare(p.schema, p.ctx.root);
  if (isFileSchema(s, p.name)) return <FileControl {...p} s={s} />;
  if (s.const !== undefined && !s.enum) s = { ...s, enum: [s.const] };
  const variants = unionVariants(s);
  if (variants && variants.length > 1) return <UnionControl {...p} variants={variants} />;
  if (Array.isArray(s.enum)) return <EnumControl {...p} s={s} />;
  switch (schemaType(s)) {
    case 'boolean':
      return <BoolControl {...p} />;
    case 'string':
      return <TextControl {...p} s={s} />;
    case 'number':
      return <NumberControl {...p} s={s} integer={false} />;
    case 'integer':
      return <NumberControl {...p} s={s} integer />;
    case 'object':
      return <ObjectControl {...p} s={s} />;
    case 'array':
      return <ArrayControl {...p} s={s} />;
    default:
      return <JsonControl value={p.value} onChange={p.onChange} disabled={p.ctx.disabled} placeholder="any JSON value" />;
  }
};

const FieldView: React.FC<CtlProps & { hideLabel?: boolean }> = (p) => {
  const { schema, name, path, required, ctx, hideLabel } = p;
  const s = prepare(schema, ctx.root);
  const variants = unionVariants(s);
  const typeLabel =
    variants && variants.length > 1 ? 'one of' : Array.isArray(s.enum) ? 'enum' : schemaType(s) === 'unknown' ? 'any' : schemaType(s);
  const err = ctx.errors[path];
  return (
    <div>
      {!hideLabel && (
        <>
          <label className="flex items-baseline gap-1.5 text-[11px] font-semibold text-slate-300 mb-1">
            <span>{s.title || name}</span>
            {required && <span className="text-rose-400">*</span>}
            <span className="text-[10px] font-mono font-normal text-slate-500">{typeLabel}</span>
          </label>
          {s.description && <p className="text-[10px] text-slate-500 mb-1.5 leading-snug">{s.description}</p>}
        </>
      )}
      <Control {...p} />
      {err && <p className="text-[10px] text-rose-400 mt-1">{err}</p>}
    </div>
  );
};

/** The form itself. `schema` is the tool's inputSchema (already parsed). */
export const SchemaForm: React.FC<{
  schema: JsonSchema;
  value: any;
  onChange: (v: any) => void;
  errors?: FieldErrors;
  disabled?: boolean;
  uploadFile?: (file: File) => Promise<string>;
}> = ({ schema, value, onChange, errors, disabled, uploadFile }) => {
  const ctx: Ctx = { root: schema, errors: errors || {}, disabled, uploadFile };
  const s = prepare(schema, schema);
  if (schemaType(s) === 'object' && isObj(s.properties) && Object.keys(s.properties).length === 0) {
    return <p className="text-xs text-slate-400 italic">This tool takes no arguments.</p>;
  }
  return (
    <div className="space-y-3.5">
      <Control schema={schema} value={value} onChange={onChange} name="arguments" path="" required ctx={ctx} />
      {errors?.['(root)'] && <p className="text-[10px] text-rose-400">{errors['(root)']}</p>}
    </div>
  );
};

/** Form / raw-JSON editor for tool arguments. Reports invalid raw JSON via onJsonError. */
export const ArgumentsEditor: React.FC<{
  schemaJson?: string | null;
  value: any;
  onChange: (v: any) => void;
  errors: FieldErrors;
  disabled?: boolean;
  onJsonError?: (err: string | null) => void;
  uploadFile?: (file: File) => Promise<string>;
}> = ({ schemaJson, value, onChange, errors, disabled, onJsonError, uploadFile }) => {
  const parsed = useMemo(() => parseSchema(schemaJson), [schemaJson]);
  const formable = isFormSchema(parsed.schema);
  const [mode, setMode] = useState<'form' | 'json'>(formable ? 'form' : 'json');
  const [text, setText] = useState('');
  const [jsonErr, setJsonErr] = useState<string | null>(null);

  useEffect(() => {
    setMode(formable ? 'form' : 'json');
    setJsonErr(null);
    onJsonError?.(null);
    setText(JSON.stringify(value ?? {}, null, 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemaJson]);

  const switchTo = (m: 'form' | 'json') => {
    if (m === mode) return;
    if (m === 'json') {
      setText(JSON.stringify(value ?? {}, null, 2));
      setJsonErr(null);
      onJsonError?.(null);
      setMode('json');
      return;
    }
    try {
      const p = JSON.parse(text || '{}');
      if (!isObj(p)) throw new Error('Arguments must be a JSON object.');
      onChange(p);
      setJsonErr(null);
      onJsonError?.(null);
      setMode('form');
    } catch (e) {
      const m2 = e instanceof Error ? e.message : 'Invalid JSON';
      setJsonErr(m2);
      onJsonError?.(m2);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
          {(['form', 'json'] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={m === 'form' && !formable}
              onClick={() => switchTo(m)}
              className={`px-3 py-1 text-[11px] font-semibold ${
                mode === m ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              } disabled:opacity-40`}
            >
              {m === 'form' ? 'Form' : 'Raw JSON'}
            </button>
          ))}
        </div>
        {!formable && (
          <span className="text-[10px] text-slate-500">
            {parsed.schema ? 'Free-form schema — use raw JSON.' : 'No usable input schema — use raw JSON.'}
          </span>
        )}
      </div>

      {parsed.error && (
        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200">
          {parsed.error}
        </div>
      )}

      {mode === 'form' && parsed.schema ? (
        <SchemaForm schema={parsed.schema} value={value} onChange={onChange} errors={errors} disabled={disabled} uploadFile={uploadFile} />
      ) : (
        <div>
          <textarea
            rows={10}
            className={MONO_AREA}
            disabled={disabled}
            value={text}
            onChange={(e) => {
              const t = e.target.value;
              setText(t);
              try {
                const p = t.trim() ? JSON.parse(t) : {};
                if (!isObj(p)) throw new Error('Arguments must be a JSON object.');
                onChange(p);
                setJsonErr(null);
                onJsonError?.(null);
              } catch (err) {
                const m2 = err instanceof Error ? err.message : 'Invalid JSON';
                setJsonErr(m2);
                onJsonError?.(m2);
              }
            }}
          />
          {jsonErr && <p className="text-[10px] text-rose-400 mt-1">{jsonErr}</p>}
        </div>
      )}
    </div>
  );
};

/** Live preview of the form a schema will produce (used while authoring local tools). */
export const SchemaPreview: React.FC<{ schemaJson?: string | null }> = ({ schemaJson }) => {
  const parsed = useMemo(() => parseSchema(schemaJson), [schemaJson]);
  const [value, setValue] = useState<any>({});
  useEffect(() => {
    if (parsed.schema) setValue(defaultsFromSchema(parsed.schema) ?? {});
  }, [parsed.schema]);

  if (parsed.error) return <p className="text-[11px] text-rose-400">{parsed.error}</p>;
  if (!parsed.schema) return <p className="text-[11px] text-slate-500 italic">No parameters schema.</p>;
  return <SchemaForm schema={parsed.schema} value={value} onChange={setValue} />;
};
