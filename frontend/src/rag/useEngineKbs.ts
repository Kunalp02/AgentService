
import { useEffect, useState } from 'react';
import { ENGINE_API } from './apiClient';
import { KbSummary } from './ragTypes';

/* OPTIONAL — for step 6 of the install notes.

   Agent Studio binds knowledge bases from the platform's demo data. When
   the rest of the team is ready to bind the real ones, this hook returns
   the engine's list in the shape those screens already read, so the
   change is one import and one line rather than a rewrite.

   Kept out of PlatformContext on purpose: the platform's context is
   everybody's, and a fetch that fails when the RAG backend is down should
   not take the whole dashboard with it. */
export function useEngineKbs() {
  const [kbs, setKbs] = useState<{ id: string; name: string; documentCount: number; totalChunks: number }[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    fetch(`${ENGINE_API}/kbs`)
      .then((r) => r.json())
      .then((list: (KbSummary & { documents?: number; chunks?: number })[]) => {
        if (!alive) return;
        setKbs(
          (list || []).map((k) => ({
            id: k.id || k.name,
            name: k.label || k.name,
            documentCount: k.documents || 0,
            totalChunks: k.chunks || 0,
          })),
        );
      })
      .catch((e) => alive && setError(String(e.message || e)));
    return () => {
      alive = false;
    };
  }, []);

  return { kbs, error };
}
