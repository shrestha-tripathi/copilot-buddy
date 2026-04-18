import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { FileText, Globe, Image as ImageIcon, Paperclip, Send, ShieldCheck, X } from "lucide-react";
import {
  captureActiveTabContext,
  requestAllUrlsPermission,
  type CaptureFailure,
  type PageContext,
} from "../api/pageContext";
import { Button } from "../ui/Button";
import { Textarea } from "../ui/Input";
import { cn } from "../lib/cn";

export interface Attachment {
  id: string;
  kind: "text" | "image";
  name: string;
  size: number;
  content: string;
}

interface Props {
  disabled?: boolean;
  includeContext: boolean;
  onToggleContext: (next: boolean) => void;
  onSubmit: (text: string, extras: { attachments: Attachment[]; pageContext: PageContext | null }) => void;
}

const TEXT_EXT = /\.(txt|md|markdown|json|ya?ml|toml|ini|csv|tsv|log|py|js|jsx|ts|tsx|go|rs|java|kt|c|h|cc|cpp|hpp|cs|rb|php|sh|bash|zsh|sql|html|css|scss|vue|svelte|swift|dart|lua|pl|r|tex)$/i;

export function ChatInput({ disabled, includeContext, onToggleContext, onSubmit }: Props) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pageCtx, setPageCtx] = useState<PageContext | null>(null);
  const [ctxFailure, setCtxFailure] = useState<CaptureFailure | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  const refreshPageCtx = async () => {
    const r = await captureActiveTabContext();
    if (r.ok) {
      setPageCtx(r.context);
      setCtxFailure(null);
    } else {
      setPageCtx(null);
      setCtxFailure(r.reason);
    }
  };

  // Refresh page context whenever toggled on; fire-and-forget.
  useEffect(() => {
    let cancelled = false;
    if (!includeContext) {
      setPageCtx(null);
      setCtxFailure(null);
      return;
    }
    (async () => {
      const r = await captureActiveTabContext();
      if (cancelled) return;
      if (r.ok) {
        setPageCtx(r.context);
        setCtxFailure(null);
      } else {
        setPageCtx(null);
        setCtxFailure(r.reason);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [includeContext]);

  const grantAccess = async () => {
    const ok = await requestAllUrlsPermission();
    if (ok) {
      toast.success("Access granted — capturing page…");
      await refreshPageCtx();
    } else {
      toast.error("Permission denied");
    }
  };

  // Auto-resize textarea.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [value]);

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    for (const file of list) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error(`${file.name}: too large (max 2 MB)`);
        continue;
      }
      try {
        if (file.type.startsWith("image/")) {
          const dataUrl = await readAsDataURL(file);
          setAttachments((a) => [
            ...a,
            { id: crypto.randomUUID(), kind: "image", name: file.name, size: file.size, content: dataUrl },
          ]);
        } else if (file.type.startsWith("text/") || TEXT_EXT.test(file.name)) {
          const text = await file.text();
          setAttachments((a) => [
            ...a,
            { id: crypto.randomUUID(), kind: "text", name: file.name, size: file.size, content: text },
          ]);
        } else {
          toast.error(`${file.name}: unsupported type (${file.type || "unknown"})`);
        }
      } catch (e) {
        toast.error(`Failed to read ${file.name}: ${(e as Error).message}`);
      }
    }
  };

  const submit = () => {
    const text = value.trim();
    if ((!text && attachments.length === 0) || disabled) return;
    onSubmit(text, { attachments, pageContext: pageCtx });
    setValue("");
    setAttachments([]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      const modSend = isMac ? e.metaKey : e.ctrlKey;
      if (modSend || (!e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault();
        submit();
      }
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files ?? []);
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) addFiles(files);
  };

  return (
    <form
      className="shrink-0 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-elev)] px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {/* Attachment + page-context chips */}
      {(attachments.length > 0 || pageCtx || ctxFailure) && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {pageCtx && (
            <Chip
              icon={<Globe className="h-3 w-3" />}
              label={truncate(pageCtx.title || pageCtx.url, 36)}
              tone="info"
              detail={
                pageCtx.selection
                  ? `Selection (${pageCtx.selection.length} chars)`
                  : pageCtx.textExcerpt
                  ? `Page excerpt (${pageCtx.textExcerpt.length} chars)`
                  : "URL + title"
              }
              onRemove={() => onToggleContext(false)}
            />
          )}
          {ctxFailure && (
            <CaptureFailureChip
              failure={ctxFailure}
              onGrant={grantAccess}
              onDismiss={() => onToggleContext(false)}
            />
          )}
          {attachments.map((a) => (
            <Chip
              key={a.id}
              icon={a.kind === "image" ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
              label={a.name}
              detail={formatBytes(a.size)}
              onRemove={() => setAttachments((arr) => arr.filter((x) => x.id !== a.id))}
            />
          ))}
        </div>
      )}

      <Textarea
        ref={taRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        rows={2}
        placeholder={
          disabled
            ? "Daemon offline — fix connection in Settings."
            : `Ask Copilot… (${isMac ? "⌘" : "Ctrl"}+Enter to send, Shift+Enter for newline)`
        }
        disabled={disabled}
        className="resize-none overflow-y-auto border-0 bg-transparent px-0 py-1 shadow-none focus-visible:ring-0"
      />

      <div className="mt-1 flex items-center gap-1">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          title="Attach file or image"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="text/*,image/*,.md,.markdown,.json,.yaml,.yml,.toml,.ini,.csv,.tsv,.log,.py,.js,.jsx,.ts,.tsx,.go,.rs,.java,.kt,.c,.h,.cc,.cpp,.hpp,.cs,.rb,.php,.sh,.bash,.zsh,.sql,.html,.css,.scss,.vue,.svelte,.swift,.dart,.lua,.pl,.r,.tex"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => onToggleContext(!includeContext)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] transition",
            includeContext
              ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/40"
              : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elev-2)]",
          )}
          title="Attach current page URL/title/selection"
        >
          <Globe className="h-3.5 w-3.5" />
          {includeContext ? "Page context on" : "Page context"}
        </button>

        <div className="flex-1" />
        <Button
          type="submit"
          size="sm"
          variant="primary"
          disabled={disabled || (!value.trim() && attachments.length === 0)}
        >
          <Send className="h-3.5 w-3.5" /> Send
        </Button>
      </div>
    </form>
  );
}

function Chip({
  icon,
  label,
  detail,
  tone,
  onRemove,
}: {
  icon: React.ReactNode;
  label: string;
  detail?: string;
  tone?: "info" | "danger" | "warn";
  onRemove?: () => void;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] ring-1",
        tone === "danger"
          ? "bg-[var(--color-danger)]/15 text-[var(--color-danger)] ring-[var(--color-danger)]/40"
          : tone === "warn"
          ? "bg-[var(--color-warn)]/15 text-[var(--color-warn)] ring-[var(--color-warn)]/40"
          : tone === "info"
          ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)] ring-[var(--color-primary)]/30"
          : "bg-[var(--color-bg-elev-2)] text-[var(--color-text)] ring-[var(--color-border-subtle)]",
      )}
      title={detail ? `${label} — ${detail}` : label}
    >
      {icon}
      <span className="truncate">{label}</span>
      {detail && <span className="opacity-60">· {detail}</span>}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="-mr-0.5 rounded-full p-0.5 hover:bg-black/10"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 102.4) / 10} KB`;
  return `${Math.round(n / (1024 * 102.4)) / 10} MB`;
}

function truncate(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function CaptureFailureChip({
  failure,
  onGrant,
  onDismiss,
}: {
  failure: CaptureFailure;
  onGrant: () => void;
  onDismiss: () => void;
}) {
  if (failure.kind === "permission-required" || failure.kind === "permission-denied") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-warn)]/15 px-2 py-0.5 text-[11px] text-[var(--color-warn)] ring-1 ring-[var(--color-warn)]/40">
        <ShieldCheck className="h-3 w-3" />
        <span>Access needed for this page</span>
        <button
          type="button"
          onClick={onGrant}
          className="ml-1 rounded-full bg-[var(--color-warn)]/25 px-1.5 py-0.5 text-[10.5px] font-medium hover:bg-[var(--color-warn)]/35"
        >
          Grant
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="-mr-0.5 rounded-full p-0.5 hover:bg-black/10"
          aria-label="Dismiss"
        >
          <X className="h-3 w-3" />
        </button>
      </span>
    );
  }
  const label =
    failure.kind === "restricted"
      ? "Can't capture this page (restricted URL)"
      : failure.kind === "no-tab"
      ? "No active tab"
      : failure.message || "Page capture failed";
  return (
    <Chip
      icon={<Globe className="h-3 w-3" />}
      label={label}
      tone="danger"
      onRemove={onDismiss}
    />
  );
}
