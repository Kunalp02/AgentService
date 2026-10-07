
import React, { useEffect, useMemo, useState } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { remoteToolsApi } from '../../api/remoteToolsApi';
import { workspaceApi } from '../../api/workspaceApi';
import type { InvokeRemoteMcpToolResult, RemoteMcpToolInvocationDetailsDto } from '../../types/tools';
import {
  ArgumentsEditor,
  defaultsFromSchema,
  parseSchema,
  pruneArguments,
  validateArguments,
  type FieldErrors,
} from './SchemaForm';
import { WorkspaceFileLinks } from './FileLinks';
import { BTN, BTN_PRI, CARD, Chip, ErrorBanner, JsonBlock, Sheet, Spinner, errText, prettyJson } from './ToolsUi';

/** Renders an MCP "result" object: text blocks, images, structured content, else raw JSON. */
const ResultView: React.FC<{ resultJson: string | null }> = ({ resultJson }) => {
  const [raw, setRaw] = useState(false);
  const parsed = useMemo(() => {
    try {
      return resultJson ? JSON.parse(resultJson) : null;
    } catch {
      return null;
    }
  }, [resultJson]);

  const content: any[] = Array.isArray(parsed?.content) ? parsed.content : [];
  const richBlocks = content.length > 0 || parsed?.structuredContent !== undefined;

  return (
    <div className="space-y-3">
      {richBlocks && !raw ? (
        <div className="space-y-2">
          {content.map((c, i) => {
            if (c?.type === 'text') {
              return (
                <pre
                  key={i}
                  className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-slate-950 p-3 text-[11px] text-slate-200"
                >
                  {prettyJson(c.text) || String(c.text ?? '')}
                </pre>
              );
            }
            if (c?.type === 'image' && c.data) {
              return (
                <img
                  key={i}
                  alt="tool output"
                  className="max-h-96 rounded-lg border border-slate-800"
                  src={`data:${c.mimeType || 'image/png'};base64,${c.data}`}
                />
              );
            }
            return <JsonBlock key={i} value={c} maxHeight={240} />;
          })}
          {parsed?.structuredContent !== undefined && (
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Structured content</div>
              <JsonBlock value={parsed.structuredContent} maxHeight={240} />
            </div>
          )}
        </div>
      ) : (
        <JsonBlock value={resultJson} maxHeight={420} />
      )}
      {richBlocks && (
        <button type="button" className="text-[11px] text-indigo-300 hover:underline" onClick={() => setRaw(!raw)}>
          {raw ? 'Show rendered result' : 'Show raw JSON'}
        </button>
      )}
      <WorkspaceFileLinks value={resultJson} />
    </div>
  );
};

export const InvokeToolModal: React.FC<{
  open: boolean;
  serverId: string;
  serverName: string;
  toolName: string;
  onClose: () => void;
}> = ({ open, serverId, serverName, toolName, onClose }) => {
  const [details, setDetails] = useState<RemoteMcpToolInvocationDetailsDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [value, setValue] = useState<any>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<InvokeRemoteMcpToolResult | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setLoadError(null);
    setDetails(null);
    setResult(null);
    setRunError(null);
    setErrors({});
    setElapsed(null);
    remoteToolsApi
      .invocationDetails(serverId, toolName)
      .then((d) => {
        if (!alive) return;
        setDetails(d);
        const { schema } = parseSchema(d.inputSchemaJson);
        setValue(schema ? defaultsFromSchema(schema) ?? {} : {});
      })
      .catch((e) => alive && setLoadError(errText(e, 'Could not load the live tool schema.')))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, serverId, toolName, reloadKey]);

  const schema = useMemo(() => parseSchema(details?.inputSchemaJson).schema, [details]);
  const payload = useMemo(() => pruneArguments(schema, value), [schema, value]);

  const run = async () => {
    const errs = validateArguments(schema, value);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setRunning(true);
    setRunError(null);
    setResult(null);
    const t0 = performance.now();
    try {
      const r = await remoteToolsApi.invoke(serverId, toolName, { argumentsJson: JSON.stringify(payload) });
      setResult(r);
    } catch (e) {
      setRunError(errText(e, 'Invocation failed.'));
    } finally {
      setElapsed(Math.round(performance.now() - t0));
      setRunning(false);
    }
  };

  const resetForm = () => {
    setValue(schema ? defaultsFromSchema(schema) ?? {} : {});
    setErrors({});
    setResult(null);
    setRunError(null);
  };

  const uploadFile = async (file: File) => (await workspaceApi.upload(file)).reference;

  const failed = !!runError || (!!result && !result.success);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Play className="h-4 w-4 text-emerald-400" />
          Invoke <span className="font-mono text-indigo-300">{toolName}</span>
        </span>
      }
      subtitle={`on ${serverName} — calls the live MCP server; nothing is stored.`}
      footer={
        <>
          <span className="text-xs text-slate-500">
            {running ? 'Calling the MCP server…' : result ? (failed ? 'The call failed.' : 'Call finished.') : 'Fill in the arguments, then run.'}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button className={BTN} onClick={onClose}>
              Close
            </button>
            <button className={BTN} disabled={loading || running} onClick={resetForm}>
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
            <button className={BTN_PRI} disabled={loading || running || !!loadError || !!jsonError} onClick={run}>
              <Play className="h-3.5 w-3.5" /> {running ? 'Running…' : 'Run'}
            </button>
          </div>
        </>
      }
    >
      {loading ? (
        <Spinner label="Fetching the live input schema…" />
      ) : loadError ? (
        <div className="mx-auto max-w-xl space-y-3 p-6">
          <ErrorBanner message={loadError} />
          <button className={BTN} onClick={() => setReloadKey((k) => k + 1)}>
            Try again
          </button>
          <p className="text-[11px] text-slate-500">
            Invocation requires the “Invoke Remote MCP Tool” permission (104) and a reachable MCP server.
          </p>
        </div>
      ) : (
        <div className="mx-auto max-w-[1600px] p-6">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
            {/* ───────── arguments */}
            <section className={`${CARD} space-y-4 p-5 xl:col-span-5`}>
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-200">Arguments</h3>
                <button
                  type="button"
                  className="text-[11px] text-indigo-300 hover:underline"
                  onClick={() => setReloadKey((k) => k + 1)}
                >
                  Reload schema
                </button>
              </div>
              {details?.description && <p className="text-xs leading-relaxed text-slate-400">{details.description}</p>}
              <ArgumentsEditor
                schemaJson={details?.inputSchemaJson}
                value={value}
                onChange={(v) => {
                  setValue(v);
                  setErrors({});
                }}
                errors={errors}
                disabled={running}
                onJsonError={setJsonError}
                uploadFile={uploadFile}
              />
              <details>
                <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-300">Request payload</summary>
                <div className="mt-2">
                  <JsonBlock value={{ name: toolName, arguments: payload }} maxHeight={200} />
                </div>
              </details>
            </section>

            {/* ───────── result */}
            <section className={`${CARD} space-y-3 p-5 xl:col-span-7`}>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-200">Result</h3>
                {running && <Chip tone="info">running…</Chip>}
                {!running && (result || runError) && (
                  <>
                    {failed ? (
                      <Chip tone="bad">failed</Chip>
                    ) : result?.isError ? (
                      <Chip tone="warn">tool reported an error</Chip>
                    ) : (
                      <Chip tone="good">success</Chip>
                    )}
                    {elapsed !== null && <Chip>{elapsed} ms</Chip>}
                  </>
                )}
              </div>

              {!result && !runError && !running && (
                <p className="py-16 text-center text-xs text-slate-500">Run the tool to see its output here.</p>
              )}
              {running && <Spinner label="Waiting for the MCP server…" />}
              {runError && <ErrorBanner message={runError} />}
              {result && !result.success && <ErrorBanner message={result.error || 'The MCP server returned an error.'} />}
              {result && result.success && <ResultView resultJson={result.resultJson} />}
            </section>
          </div>
        </div>
      )}
    </Sheet>
  );
};
