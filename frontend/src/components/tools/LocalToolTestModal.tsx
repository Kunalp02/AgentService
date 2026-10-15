 import React, { useEffect, useMemo, useState } from 'react';
  import { Play, RotateCcw } from 'lucide-react';
  import { localToolsApi } from '../../api/localToolsApi';
  import { workspaceApi } from '../../api/workspaceApi';
  import type { LocalToolDetailDto, LocalToolTestResult } from '../../types/tools';
  import {
    ArgumentsEditor,
    defaultsFromSchema,
    parseSchema,
    pruneArguments,
    validateArguments,
    type FieldErrors,
  } from './SchemaForm';
  import {
    BTN,
    BTN_PRI,
    CARD,
    Chip,
    ErrorBanner,
    JsonBlock,
    Modal,
    Spinner,
    errText,
  } from './ToolsUi';

  /**
   * Modal for invoking a saved local tool against the sandbox and
   * displaying the result. Mirrors the “Manual test” step of
   * `ToolPlayground` but can be opened directly from the tool drawer.
   */
  export const LocalToolTestModal: React.FC<{
    /** Whether the modal is shown */
    open: boolean;
    /** The ID of the saved local tool to test */
    toolId: string;
    /** Called when the user closes the modal */
    onClose: () => void;
  }> = ({ open, toolId, onClose }) => {
    const [detail, setDetail] = useState<LocalToolDetailDto | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [value, setValue] = useState<any>({});
    const [errors, setErrors] = useState<FieldErrors>({});
    const [jsonError, setJsonError] = useState<string | null>(null);

    const [running, setRunning] = useState(false);
    const [runError, setRunError] = useState<string | null>(null);
    const [result, setResult] = useState<LocalToolTestResult | null>(null);

    // -----------------------------------------------------------------
    // Load the tool (including its generated schema) when the modal opens
    // -----------------------------------------------------------------
    useEffect(() => {
      if (!open) return;
      let alive = true;
      setLoading(true);
      setLoadError(null);
      setDetail(null);
      setResult(null);
      setRunError(null);
      setErrors({});
      setJsonError(null);
      localToolsApi
        .get(toolId)
        .then((d) => {
          if (!alive) return;
          setDetail(d);
          const { schema } = parseSchema(d.parametersSchemaJson);
          setValue(schema ? defaultsFromSchema(schema) ?? {} : {});
        })
        .catch((e) => alive && setLoadError(errText(e, 'Could not load the tool details.')))
        .finally(() => alive && setLoading(false));
      return () => {
        alive = false;
      };
    }, [open, toolId]);

    // -----------------------------------------------------------------
    // Build the payload that will be sent to the sandbox
    // -----------------------------------------------------------------
    const schema = useMemo(() => parseSchema(detail?.parametersSchemaJson).schema, [detail]);
    const payload = useMemo(() => pruneArguments(schema, value), [schema, value]);

    // -----------------------------------------------------------------
    // Run the sandbox test
    // -----------------------------------------------------------------
    const run = async () => {
      const errs = validateArguments(schema, value);
      setErrors(errs);
      if (Object.keys(errs).length > 0) return;
      setRunning(true);
      setRunError(null);
      setResult(null);
      try {
        const r = await localToolsApi.test(toolId, JSON.stringify(payload));
        setResult(r);
      } catch (e) {
        setRunError(errText(e, 'Invocation failed.'));
      } finally {
        setRunning(false);
      }
    };

    // -----------------------------------------------------------------
    // Reset the form to defaults
    // -----------------------------------------------------------------
    const resetForm = () => {
      setValue(schema ? defaultsFromSchema(schema) ?? {} : {});
      setErrors({});
      setResult(null);
      setRunError(null);
      setJsonError(null);
    };

    // -----------------------------------------------------------------
    // File upload support (same as in the Playground)
    // -----------------------------------------------------------------
    const uploadFile = async (file: File) => (await workspaceApi.upload(file)).reference;

    const failed = !!runError || (result && !result.success);

    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Test local tool"
        size="md"
        footer={
          <>
            <button className={BTN} disabled={running} onClick={onClose}>
              Close
            </button>
            <button className={BTN} disabled={running} onClick={resetForm}>
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
            <button className={BTN_PRI} disabled={loading || running || !!jsonError} onClick={run}>
              <Play className="h-3.5 w-3.5" /> {running ? 'Running…' : 'Run'}
            </button>
          </>
        }
      >
        {loading ? (
          <Spinner label="Loading tool…" />
        ) : loadError ? (
          <ErrorBanner message={loadError} />
        ) : detail ? (
          <div className="space-y-4">
            {/* Header with tool name & status */}
            <div className="flex items-center gap-2">
              <span className="font-mono text-indigo-300">{detail.name ?? detail.id}</span>
              <Chip tone="info">{detail.status}</Chip>
            </div>

            {/* Optional description */}
            {detail.description && <p className="text-sm text-slate-300">{detail.description}</p>}

            {/* Arguments editor – only shown when a schema exists */}
            <section className={`${CARD} p-4`}>
              <h3 className="mb-2 text-xs font-bold uppercase text-slate-200">Arguments</h3>
              {schema ? (
                <ArgumentsEditor
                  schemaJson={detail.parametersSchemaJson}
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
              ) : (
                <p className="text-xs text-slate-400">No input schema defined for this tool.</p>
              )}
              {jsonError && <ErrorBanner message={jsonError} />}
            </section>

            {/* Result area */}
            {runError && <ErrorBanner message={runError} />}
            {result && (
              <section className={`${CARD} p-4`}>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xs font-bold uppercase text-slate-200">Result</h3>
                  <Chip tone={result.success ? 'good' : 'bad'}>
                    {result.success ? 'success' : 'failed'}
                  </Chip>
                </div>
                {result.error && (
                  <pre className="whitespace-pre-wrap break-words text-xs text-rose-300">{result.error}</pre>
                )}
                {result.success && (
                  <div className="space-y-2">
                    <JsonBlock value={result.result} maxHeight={260} />
                  </div>
                )}
              </section>
            )}
          </div>
        ) : null}
      </Modal>
    );
  };

