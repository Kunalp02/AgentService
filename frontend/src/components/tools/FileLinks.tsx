
import React, { useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { workspaceApi } from '../../api/workspaceApi';
import { BTN, BTN_SM, ErrorBanner, errText } from './ToolsUi';

/** Every workspace://<id> reference anywhere inside a value (string, object, array). */
export function collectWorkspaceRefs(value: unknown): string[] {
  let text = '';
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  } catch {
    return [];
  }
  return Array.from(new Set(text.match(/workspace:\/\/[A-Za-z0-9-]+/g) ?? []));
}

/** Download buttons for any files a tool returned. Renders nothing when there are none. */
export const WorkspaceFileLinks: React.FC<{ value: unknown }> = ({ value }) => {
  const refs = useMemo(() => collectWorkspaceRefs(value), [value]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (refs.length === 0) return null;

  const get = async (ref: string) => {
    setBusy(ref);
    setError(null);
    try {
      await workspaceApi.download(ref);
    } catch (e) {
      setError(errText(e, 'Download failed.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Files returned ({refs.length})
      </div>
      <div className="flex flex-wrap gap-2">
        {refs.map((ref) => (
          <button key={ref} className={`${BTN} ${BTN_SM}`} disabled={busy === ref} onClick={() => void get(ref)}>
            {busy === ref ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            <span className="font-mono">{ref.replace('workspace://', '').slice(0, 8)}…</span>
          </button>
        ))}
      </div>
      <ErrorBanner message={error} />
    </div>
  );
};
