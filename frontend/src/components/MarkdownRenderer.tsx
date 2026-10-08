import React, { useMemo, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { Check, Copy } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
  className?: string;
  showCopyButton?: boolean;
  size?: "compact" | "large";
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className = "",
  showCopyButton = false,
  size = "large",
}) => {
  const [copied, setCopied] = useState(false);

  const htmlContent = useMemo(() => {
    if (!content || !content.trim()) return "";
    try {
      const rawHtml = marked.parse(content, {
        gfm: true,
        breaks: true,
      }) as string;
      return DOMPurify.sanitize(rawHtml, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ["target", "rel"],
      });
    } catch (err) {
      console.error("Markdown parse failed:", err);
      return `<p>${DOMPurify.sanitize(content)}</p>`;
    }
  }, [content]);

  const handleCopy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!content || !content.trim()) {
    return (
      <div className="text-slate-500 italic text-xs p-4 text-center">
        No markdown content available.
      </div>
    );
  }

  return (
    <div className={`relative group ${className}`}>
      {/* Quick floating action to copy raw text (if enabled) */}
      {showCopyButton && (
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 z-10 px-2 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-[11px] font-medium border border-slate-700/80 flex items-center space-x-1.5 opacity-60 hover:opacity-100 transition shadow-sm"
          title="Copy raw Markdown"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3 text-slate-400" />
              <span>Copy MD</span>
            </>
          )}
        </button>
      )}

      {/* Rendered HTML */}
      <div
        className={`markdown-content markdown-${size} prose-invert max-w-none break-words`}
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
    </div>
  );
};
