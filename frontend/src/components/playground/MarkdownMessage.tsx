import React, { isValidElement, memo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";

/* ------------------------------------------------------------------
   Renders an agent reply that arrives as Markdown.

   - react-markdown builds real React elements, so there is no
     dangerouslySetInnerHTML. Raw HTML inside the reply is NOT rendered
     (we deliberately do not add rehype-raw), and javascript: / data:
     links are stripped by react-markdown's default urlTransform.
   - remark-gfm adds tables, task lists, strikethrough and bare-URL links.
   - Remote images are NOT loaded. A reply influenced by a document or a
     tool result could embed an image URL that leaks data when fetched,
     so images render as a plain link instead.
------------------------------------------------------------------- */

const REMARK_PLUGINS = [remarkGfm];

/** Flatten React children back to the text they contain (for Copy). */
function toText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(toText).join("");
  if (isValidElement(node)) {
    return toText((node.props as { children?: React.ReactNode }).children);
  }
  return "";
}

/** Some models wrap the WHOLE reply in ```markdown ... ```, which would
    otherwise show up as one code block instead of rendering. */
function normalize(raw: string): string {
  const text = String(raw ?? "").replace(/\r\n/g, "\n").trim();
  const wrapped = /^```(?:markdown|md)[ \t]*\n([\s\S]*?)\n```$/i.exec(text);
  return wrapped ? wrapped[1] : text;
}

const CodeBlock: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const [copied, setCopied] = useState(false);

  // react-markdown renders a fenced block as <pre><code class="language-x">.
  const codeEl = React.Children.toArray(children)[0];
  const codeProps = isValidElement(codeEl)
    ? (codeEl.props as { className?: string; children?: React.ReactNode })
    : {};
  const language = /language-([\w+#-]+)/.exec(codeProps.className || "")?.[1];
  const code = toText(codeProps.children ?? children).replace(/\n$/, "");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked - the text is still selectable */
    }
  };

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-1.5 text-[10px] text-slate-400">
        <span className="font-mono">{language ?? "text"}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          aria-label="Copy code"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-400" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-emerald-300">
        <code>{code}</code>
      </pre>
    </div>
  );
};

const components: Components = {
  h1: ({ children }) => (
    <h3 className="mb-2 mt-4 text-base font-bold text-white first:mt-0">{children}</h3>
  ),
  h2: ({ children }) => (
    <h4 className="mb-2 mt-4 text-sm font-bold text-white first:mt-0">{children}</h4>
  ),
  h3: ({ children }) => (
    <h5 className="mb-1.5 mt-3 text-[13px] font-bold text-white first:mt-0">{children}</h5>
  ),
  h4: ({ children }) => (
    <h6 className="mb-1 mt-3 text-xs font-semibold text-white first:mt-0">{children}</h6>
  ),
  h5: ({ children }) => (
    <h6 className="mb-1 mt-3 text-xs font-semibold text-slate-200 first:mt-0">{children}</h6>
  ),
  h6: ({ children }) => (
    <h6 className="mb-1 mt-3 text-xs font-semibold text-slate-300 first:mt-0">{children}</h6>
  ),

  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,

  ul: ({ className, children }) => {
    // GFM task lists get "contains-task-list"; they draw their own checkbox.
    const isTasks = (className || "").includes("contains-task-list");
    return (
      <ul
        className={
          isTasks
            ? "my-2 space-y-1"
            : "my-2 ml-5 list-disc space-y-1 marker:text-slate-500 [&_ol]:my-1 [&_ul]:my-1"
        }
      >
        {children}
      </ul>
    );
  },
  ol: ({ children }) => (
    <ol className="my-2 ml-5 list-decimal space-y-1 marker:text-slate-500 [&_ol]:my-1 [&_ul]:my-1">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  input: ({ type, checked }) =>
    type === "checkbox" ? (
      <input
        type="checkbox"
        checked={!!checked}
        disabled
        readOnly
        className="mr-2 align-middle accent-cyan-500"
      />
    ) : null,

  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="break-words text-cyan-300 underline decoration-cyan-300/40 underline-offset-2 hover:decoration-cyan-300"
    >
      {children}
    </a>
  ),
  img: ({ src, alt }) => {
    const url = typeof src === "string" ? src : undefined;
    return url ? (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="break-words text-cyan-300 underline decoration-cyan-300/40 underline-offset-2"
      >
        {alt || "image"} (external image, open link)
      </a>
    ) : null;
  },

  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="text-slate-400">{children}</del>,

  blockquote: ({ children }) => (
    <blockquote className="my-3 rounded-r-md border-l-2 border-cyan-500/50 bg-slate-950/60 py-1 pl-3 pr-2 text-slate-300">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-slate-800" />,

  // Fenced blocks are handled by <pre> -> CodeBlock; this is inline `code`.
  code: ({ children }) => (
    <code className="rounded border border-slate-800 bg-slate-950 px-1 py-px font-mono text-[11px] text-emerald-300">
      {children}
    </code>
  ),
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,

  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-slate-800">
      <table className="w-full border-collapse text-[11px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-950/70">{children}</thead>,
  tbody: ({ children }) => (
    <tbody className="[&>tr:last-child>td]:border-b-0">{children}</tbody>
  ),
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children, style }) => (
    <th
      style={style}
      className="whitespace-nowrap border-b border-slate-800 px-3 py-2 text-left font-semibold text-slate-300"
    >
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td
      style={style}
      className="border-b border-slate-800/70 px-3 py-2 align-top text-slate-200"
    >
      {children}
    </td>
  ),
};

interface MarkdownMessageProps {
  text: string;
  className?: string;
}

/** memo: the playground re-renders on every keystroke in the message box;
    without it every earlier reply would be re-parsed each time. */
export const MarkdownMessage = memo(function MarkdownMessage({
  text,
  className = "",
}: MarkdownMessageProps) {
  return (
    <div className={`min-w-0 break-words text-xs leading-relaxed text-cyan-100 ${className}`}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
        {normalize(text)}
      </ReactMarkdown>
    </div>
  );
});
