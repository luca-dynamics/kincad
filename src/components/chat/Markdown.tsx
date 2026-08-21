// Rich markdown renderer for agent messages — headings, lists, tables, code, links, images,
// and LaTeX math (the model emits $inline$ and $$display$$). Styled with the app theme tokens.
//
// PROSE IS PRIMARY INK. The wrapper used to be `text-muted`, which left `strong` and the headings
// as the only `--fg` text in a reply — so the default state of every sentence was de-emphasised.
// Contrast was never the problem (muted-on-panel-2 is ≈6:1 in both themes, comfortably AA); the
// hierarchy was inverted. Body copy is content, not chrome, so it gets `--fg` and bold now reads as
// weight rather than as "the legible part".
//
// FOUR HEADING LEVELS, THREE SIZES. The type scale in index.css steps 12 → 13 → 14 → 16, so h1/h2/h3
// take 16/14/13 and h3 earns its separation from body copy through `mt-4` and weight instead of a
// size that doesn't exist. h4 drops to the app's established eyebrow — the same
// `text-micro uppercase tracking-[0.07em]` treatment `Section` and `CardHead` use — so a heading in
// chat and a section label in the dock read as the same kind of thing.
//
// FENCES ARE BUILT IN `pre`, NOT `code`. react-markdown 10 dropped the `inline` prop, and the guess
// that replaced it (`const inline = !className`) was wrong for any fence written without a
// language: those arrive with no className, so a whole block rendered as an inline grey pill inside
// the `<pre>`. `pre` now reads the language and text off its `<code>` child and emits its own
// markup, which means the mapped `code` component is never mounted for a fence — the ambiguity is
// removed rather than patched, and `code` can style inline code and nothing else.
//
// Anything the component map cannot reach — KaTeX internals, GFM task-list markers, nested-list
// spacing — is handled by the `.kc-md` block in index.css.

import { isValidElement, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { useCopy } from "../../hooks/useCopy";
import { Button } from "../ui";

/** The single element child of a `<pre>`: react-markdown's `<code>` node, however it is wrapped. */
function codeChild(children: ReactNode): ReactNode {
  if (isValidElement(children)) return children;
  if (Array.isArray(children)) return children.find((c) => isValidElement(c)) ?? null;
  return null;
}

/**
 * Every string in a React subtree, concatenated. Needed because the copy button has to hand the
 * clipboard real text, and a fence's children may be a string, an array, or nested elements
 * depending on what the highlighter chain did to it.
 */
function textOf(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

/** `language-json` → `json`. Null for a fence opened without one. */
function langOf(node: ReactNode): string | null {
  if (!isValidElement(node)) return null;
  const raw = (node.props as { className?: string | string[] }).className;
  const cn = Array.isArray(raw) ? raw.join(" ") : raw ?? "";
  return /language-([\w+#-]+)/.exec(cn)?.[1] ?? null;
}

/**
 * A fenced block with a header strip: the language on the left, Copy on the right. No syntax
 * highlighting — that would mean a grammar bundle, and the fences this app sees are occasional CAD
 * JSON rather than the main content.
 */
function CodeBlock({ children }: { children: ReactNode }) {
  const el = codeChild(children);
  const lang = langOf(el);
  const text = textOf(el ?? children);
  const { copied, copy } = useCopy();

  return (
    <div className="my-2.5 overflow-hidden rounded-lg ring-1 ring-line">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-panel-2 py-1 pl-3 pr-1.5">
        {/* Empty when the fence carried no language — the strip still earns its place with Copy. */}
        <span className="truncate text-micro font-semibold uppercase tracking-[0.07em] text-faint">
          {lang ?? ""}
        </span>
        <Button title="Copy to clipboard" onClick={() => copy(text)}>
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto bg-panel p-3 text-meta leading-relaxed">
        <code className="font-mono text-fg">{text}</code>
      </pre>
    </div>
  );
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="kc-md text-body text-fg">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          h1: ({ children }) => <h1 className="mt-5 mb-2 text-title font-semibold tracking-tight text-fg first:mt-0">{children}</h1>,
          h2: ({ children }) => (
            <h2 className="mt-4 mb-1.5 border-b border-line pb-1 text-head font-semibold tracking-tight text-fg first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => <h3 className="mt-4 mb-1 text-body font-semibold text-fg first:mt-0">{children}</h3>,
          // The app's eyebrow, not a fourth heading size: 10px uppercase, same as Section/CardHead.
          h4: ({ children }) => (
            <h4 className="mt-3.5 mb-1 text-micro font-semibold uppercase tracking-[0.07em] text-faint first:mt-0">
              {children}
            </h4>
          ),
          // 10px ≈ 0.77em at 13px body — the 6px this used to be read as a wall of text.
          p: ({ children }) => <p className="my-2.5 first:mt-0 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          del: ({ children }) => <del className="text-faint line-through">{children}</del>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="my-2.5 ml-4 list-disc space-y-1 marker:text-faint">{children}</ul>,
          ol: ({ children }) => <ol className="my-2.5 ml-4 list-decimal space-y-1 marker:text-faint">{children}</ol>,
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          // `border-line`, not the accent: Card's doc reserves a coloured edge for something
          // awaiting a decision, and a quotation isn't one.
          blockquote: ({ children }) => (
            <blockquote className="my-2.5 border-l-2 border-line pl-3 text-muted italic">{children}</blockquote>
          ),
          hr: () => <hr className="my-4 border-line" />,
          // Inline code only — a fence never reaches here, because `pre` renders its own markup.
          code: ({ children }) => (
            <code className="rounded-md bg-line/60 px-1 py-0.5 font-mono text-meta text-fg">{children}</code>
          ),
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          table: ({ children }) => (
            <div className="my-2.5 overflow-x-auto">
              <table className="w-full border-collapse text-meta">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="border-b border-line bg-panel">{children}</thead>,
          th: ({ children }) => (
            <th className="px-2.5 py-1.5 text-left text-micro font-semibold uppercase tracking-wide text-muted">{children}</th>
          ),
          td: ({ children }) => <td className="border-b border-line/50 px-2.5 py-1.5 align-top">{children}</td>,
          img: ({ src, alt }) => (
            <img src={src as string} alt={alt ?? ""} className="my-2.5 max-w-full rounded-lg ring-1 ring-line" />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
