// Rich markdown renderer for agent messages — headings, lists, tables, code, links, images,
// and LaTeX math (the model emits $inline$ and $$display$$). Styled with the app theme tokens.
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="kc-md text-[13px] leading-relaxed text-muted">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          h1: ({ children }) => <h1 className="mt-3 mb-1.5 text-[15px] font-semibold text-fg first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mt-3 mb-1.5 text-[14px] font-semibold text-fg first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-2.5 mb-1 text-[13px] font-semibold text-fg first:mt-0">{children}</h3>,
          h4: ({ children }) => <h4 className="mt-2 mb-1 text-[12px] font-semibold uppercase tracking-wide text-muted first:mt-0">{children}</h4>,
          p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="my-1.5 ml-4 list-disc space-y-0.5 marker:text-faint">{children}</ul>,
          ol: ({ children }) => <ol className="my-1.5 ml-4 list-decimal space-y-0.5 marker:text-faint">{children}</ol>,
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-accent/40 pl-3 text-muted/90 italic">{children}</blockquote>
          ),
          hr: () => <hr className="my-3 border-line" />,
          code: ({ className, children }) => {
            const inline = !className;
            return inline ? (
              <code className="rounded bg-line/60 px-1 py-0.5 font-mono text-[12px] text-fg">{children}</code>
            ) : (
              <code className={`${className ?? ""} font-mono text-[12px]`}>{children}</code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-lg bg-panel ring-1 ring-line p-3 text-[12px] leading-relaxed">{children}</pre>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="border-b border-line">{children}</thead>,
          th: ({ children }) => <th className="px-2.5 py-1.5 text-left font-semibold text-fg">{children}</th>,
          td: ({ children }) => <td className="border-b border-line/50 px-2.5 py-1.5 align-top">{children}</td>,
          img: ({ src, alt }) => (
            <img src={src as string} alt={alt ?? ""} className="my-2 max-w-full rounded-lg ring-1 ring-line" />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
