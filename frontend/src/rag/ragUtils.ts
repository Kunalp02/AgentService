

/* Small helpers shared by the RAG screens. Each one exists because the
   obvious version of it broke something real. */

/* Large files: btoa on one big string is what blew the tab up before.
   The bytes are walked in 32 KB slices so no intermediate string is
   ever the size of the file itself. */
export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const step = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += step) {
    parts.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + step)) as any));
  }
  return btoa(parts.join(''));
}

export const readFile = (file: File): Promise<string> =>
  new Promise((ok, no) => {
    const fr = new FileReader();
    fr.onload = () => ok(toBase64(fr.result as ArrayBuffer));
    fr.onerror = () => no(new Error('could not read ' + file.name));
    fr.readAsArrayBuffer(file);
  });

/* Pages in a PDF, by counting its page objects - for the time estimate only.
   0 when it cannot tell (a compressed object stream hides them). */
export const pdfPages = (file: File): Promise<number> =>
  !/\.pdf$/i.test(file.name)
    ? Promise.resolve(0)
    : file
        .arrayBuffer()
        .then((b) => {
          const text = new TextDecoder('latin1').decode(b);
          // The LAST root of the page tree (no /Parent): an incrementally
          // saved PDF keeps old pages, and counting page objects read a
          // 59-page paper as 140. Same rule as kb/ingest_estimate.pdf_pages.
          const roots: number[] = [];
          const re = /\d+\s+\d+\s+obj\b([\s\S]{0,600}?)endobj/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(text))) {
            const body = m[1];
            if (/\/Type\s*\/Pages\b/.test(body) && !body.includes('/Parent')) {
              const c = /\/Count\s+(\d+)/.exec(body);
              if (c) roots.push(Number(c[1]));
            }
          }
          if (roots.length) return roots[roots.length - 1];
          return (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
        })
        .catch(() => 0);

/* 75 -> "1 min 15 s", 8 -> "8 s". */
export const duration = (s: number) => {
  const t = Math.max(0, Math.round(s));
  if (t < 1) return 'under 1 s';
  if (t < 60) return `${t} s`;
  const m = Math.floor(t / 60);
  return t % 60 ? `${m} min ${t % 60} s` : `${m} min`;
};

export const fileSize = (n: number) =>
  (n / 1024 / 1024).toFixed(n > 1048576 ? 1 : 2) + ' MB';

/* /sql/schema answers {tables:{name:[columns]}} — an object, not a list.
   Read as a list it has no .length, so "12 tables are available to ask
   about" silently never appeared and a connected database looked
   unconnected. */
export function tableNames(info: any): string[] {
  const t = info && (info.tables || info.schema);
  if (!t) return [];
  if (Array.isArray(t)) return t.map((x: any) => (x && x.name ? x.name : String(x)));
  return Object.keys(t);
}

/** Resolve a chunker key to its human label, falling through if unknown. */
export const labelOf = (list: { name: string; label: string }[], key: string) => {
  const m = list.find((x) => x.name === key);
  return m ? m.label : key;
};
