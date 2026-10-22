"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Markdown renderer with syntax-highlighted, copyable code blocks.
// ---------------------------------------------------------------------------

function CodeBlock({
  language,
  code,
  className,
}: {
  language: string;
  code: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div
      className={cn(
        "group/code my-4 overflow-hidden rounded-xl border border-border bg-muted/40",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border bg-muted/60 px-3 py-1.5">
        <span className="font-mono text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          {language || "text"}
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-2xs font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="scrollbar-thin overflow-x-auto p-3.5">
        <code className={cn("hljs font-mono text-[0.8125rem] leading-6", language && `language-${language}`)}>
          {code}
        </code>
      </pre>
    </div>
  );
}

/** Recursively pull the raw text out of a React node tree. */
function nodeToText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join("");
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return nodeToText(props.children);
  }
  return "";
}

export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("chat-prose", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre({ children }) {
            // Unwrap <pre><code> into our own CodeBlock chrome.
            const child = React.Children.toArray(children)[0];
            if (React.isValidElement(child)) {
              const props = child.props as { className?: string; children?: React.ReactNode };
              const match = /language-([\w-]+)/.exec(props.className ?? "");
              const code = nodeToText(props.children).replace(/\n$/, "");
              return <CodeBlock language={match?.[1] ?? ""} code={code} />;
            }
            return <pre>{children}</pre>;
          },
          code({ className, children, ...props }) {
            // Inline code (no language class, single line) - block code is
            // handled by the `pre` override above.
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          a({ href, children, ...props }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                {children}
              </a>
            );
          },
          img({ src, alt, ...props }) {
            return (
              // Images in model output are remote and arbitrary, so next/image
              // (which needs allow-listed hosts) is not applicable here.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={typeof src === "string" ? src : ""}
                alt={alt ?? ""}
                loading="lazy"
                className="my-3 max-h-[420px] w-auto rounded-xl border border-border"
                {...props}
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
