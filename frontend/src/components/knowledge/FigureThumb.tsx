
import React, { useEffect, useState } from 'react';
import { fileHeaders, get, withKb } from '../../rag/apiClient';

/* ------------------------------------------------------------------
   THE PICTURE BESIDE ITS EXPLANATION.

   An evidence passage that begins "[Image 4, page 7 - diagram] …" is the
   engine's explanation of a figure - written by a model, checked against
   the words on the image, marked (unverified) where the check failed. The
   one thing that settles any doubt about it is the figure itself, and the
   engine keeps it: GET /images/{sha}. So the passage shows it.

   The block names the image by ORDINAL, not by hash - a reader's number,
   "Image 4". GET /images?doc_key= maps ordinals to hashes, once per
   document, cached below for the life of the page.

   Fetched with the session's headers and shown from a blob URL: an <img
   src> cannot carry Authorization, and the picture is as private as the
   document it came from.
------------------------------------------------------------------- */

const HEAD = /^\[Image (\d+), page (\d+)/;

const shaByDoc: Record<string, Promise<Record<number, string>>> = {};

function ordinals(docKey: string): Promise<Record<number, string>> {
  if (!shaByDoc[docKey]) {
    shaByDoc[docKey] = get('/images?doc_key=' + encodeURIComponent(docKey))
      .then((r) => {
        const out: Record<number, string> = {};
        for (const im of r.images || [])
          for (const o of im.ordinals || []) out[o] = im.sha;
        return out;
      })
      .catch(() => ({}));
  }
  return shaByDoc[docKey];
}

export function isFigure(claim: string): boolean {
  return HEAD.test(claim || '');
}

export const FigureThumb: React.FC<{ claim: string; source: string }> = ({ claim, source }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const m = HEAD.exec(claim || '');

  useEffect(() => {
    let alive = true;
    let blobUrl: string | null = null;
    if (!m) return;
    const ordinal = Number(m[1]);
    // `source` is the document the passage came from - "margin_policy.pdf",
    // sometimes with a locator after it. The document is the part before
    // any separator the engine appends.
    const docKey = (source || '').split(' · ')[0].split('#')[0].trim();
    (async () => {
      const map = await ordinals(docKey);
      const sha = map[ordinal];
      if (!sha || !alive) return;
      try {
        const r = await fetch(withKb('/images/' + sha), { headers: fileHeaders() });
        if (!r.ok) return;
        blobUrl = URL.createObjectURL(await r.blob());
        if (alive) setUrl(blobUrl);
      } catch {
        /* no thumbnail - the explanation still stands on its own */
      }
    })();
    return () => {
      alive = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claim, source]);

  if (!m || !url) return null;
  return (
    <div className="mt-1.5">
      <img
        src={url}
        alt={`Image ${m[1]}, page ${m[2]}`}
        title="The figure this passage explains. Click to enlarge."
        onClick={() => setOpen(true)}
        className="max-h-40 max-w-full rounded-lg border border-slate-700 bg-white cursor-zoom-in"
      />
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6 cursor-zoom-out"
          onClick={() => setOpen(false)}
        >
          <img src={url} alt="" className="max-h-full max-w-full rounded-xl bg-white" />
        </div>
      )}
    </div>
  );
};
