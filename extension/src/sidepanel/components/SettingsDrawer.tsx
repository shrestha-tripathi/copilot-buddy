import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BookOpen,
  Bot,
  ExternalLink,
  KeyRound,
  Plug,
  Plus,
  Server,
  Sliders,
  Trash2,
} from "lucide-react";
import { useApi } from "../api/useApi";
import { useSettingsStore } from "../stores/settingsStore";
import { useSessionStore } from "../stores/sessionStore";
import {
  agentsApi,
  mcpApi,
  sessionsApi,
  type CustomAgent,
  type ModelInfo,
} from "@/shared/api/sessions";
import { Button } from "../ui/Button";
import { Dialog, DialogContent } from "../ui/Dialog";
import { Input, Textarea } from "../ui/Input";
import { Label } from "../ui/Label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/Tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/Select";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDrawer({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Settings" className="max-w-[640px]">
        <div className="p-5">
          <Tabs defaultValue="general">
            <TabsList className="w-full flex-wrap">
              <TabsTrigger value="general"><KeyRound className="h-3.5 w-3.5" /> General</TabsTrigger>
              <TabsTrigger value="model"><Sliders className="h-3.5 w-3.5" /> Model</TabsTrigger>
              <TabsTrigger value="system"><BookOpen className="h-3.5 w-3.5" /> System</TabsTrigger>
              <TabsTrigger value="agents"><Bot className="h-3.5 w-3.5" /> Agents</TabsTrigger>
              <TabsTrigger value="mcp"><Server className="h-3.5 w-3.5" /> MCP</TabsTrigger>
            </TabsList>
            <TabsContent value="general"><GeneralTab /></TabsContent>
            <TabsContent value="model"><ModelTab /></TabsContent>
            <TabsContent value="system"><SystemTab /></TabsContent>
            <TabsContent value="agents"><AgentsTab /></TabsContent>
            <TabsContent value="mcp"><MCPTab /></TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ----- General (daemon url + token) -----

function GeneralTab() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const [url, setUrl] = useState(settings.baseUrl);
  const [token, setToken] = useState(settings.token);

  return (
    <div className="space-y-3.5">
      <div>
        <Label>Daemon URL</Label>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://127.0.0.1:8770" />
      </div>
      <div>
        <Label>Bearer token</Label>
        <Input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="64-char hex token"
        />
        <p className="mt-1 text-[11px] text-[var(--color-text-dim)]">
          Stored locally in <code>chrome.storage.local</code>. Printed on daemon first-run.
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          variant="primary"
          onClick={() => {
            save({ baseUrl: url.trim(), token: token.trim() });
            toast.success("Connection saved");
          }}
        >
          Save
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            save({ token: "" });
            toast("Token cleared — re-onboard to reconnect", { icon: "🔓" });
          }}
        >
          Reset token
        </Button>
      </div>
    </div>
  );
}

// ----- Model & reasoning (per-active-session) -----

function ModelTab() {
  const api = useApi();
  const activeId = useSessionStore((s) => s.activeId);
  const sessions = useSessionStore((s) => s.sessions);
  const upsert = useSessionStore((s) => s.upsert);
  const active = sessions.find((s) => s.id === activeId);

  const [models, setModels] = useState<ModelInfo[]>([]);
  useEffect(() => {
    sessionsApi.models(api).then(setModels).catch(() => setModels([]));
  }, [api]);

  if (!active) {
    return (
      <p className="text-[12.5px] text-[var(--color-text-muted)]">
        Select or create a session to configure model and reasoning.
      </p>
    );
  }

  const model = models.find((m) => m.id === active.model);
  const efforts = model?.capabilities?.supportedReasoningEfforts ?? [];
  const supportsReasoning = model?.capabilities?.supports?.reasoningEffort;

  const saveModel = async (nextModel: string) => {
    try {
      const updated = await sessionsApi.update(api, active.id, { model: nextModel });
      upsert(updated);
      toast.success("Model updated — next message will use " + nextModel);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const saveReasoning = async (effort: string) => {
    try {
      const updated = await sessionsApi.update(api, active.id, {
        reasoning_effort: effort,
      });
      upsert(updated);
      toast.success("Reasoning effort set to " + (effort || "default"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Model</Label>
        <Select value={active.model} onValueChange={saveModel}>
          <SelectTrigger className="w-full h-9">
            <SelectValue placeholder="Choose a model" />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name || m.id} {m.vendor ? <span className="opacity-60">· {m.vendor}</span> : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {supportsReasoning && (
        <div>
          <Label>Reasoning effort</Label>
          <div className="flex flex-wrap gap-1.5">
            {efforts.map((e) => (
              <Button
                key={e}
                size="sm"
                variant={active.reasoning_effort === e ? "primary" : "outline"}
                onClick={() => saveReasoning(e)}
              >
                {e}
              </Button>
            ))}
            <Button
              size="sm"
              variant={!active.reasoning_effort ? "primary" : "outline"}
              onClick={() => saveReasoning("")}
            >
              default
            </Button>
          </div>
        </div>
      )}

      <div>
        <Label>Agent</Label>
        <AgentSelect
          value={active.agent ?? ""}
          onChange={async (v) => {
            try {
              const updated = await sessionsApi.update(api, active.id, { agent: v });
              upsert(updated);
              toast.success(v ? `Activated agent: ${v}` : "Agent cleared");
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        />
      </div>
    </div>
  );
}

function AgentSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const api = useApi();
  const [agents, setAgents] = useState<CustomAgent[]>([]);
  useEffect(() => {
    agentsApi.list(api).then((r) => setAgents(r.agents ?? [])).catch(() => setAgents([]));
  }, [api]);

  return (
    <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
      <SelectTrigger className="w-full h-9">
        <SelectValue placeholder="(default)" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">(none — default assistant)</SelectItem>
        {agents.map((a) => (
          <SelectItem key={a.name} value={a.name}>
            {a.name}
            {a.description ? <span className="opacity-60"> · {a.description}</span> : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ----- System message -----

function SystemTab() {
  const api = useApi();
  const activeId = useSessionStore((s) => s.activeId);
  const sessions = useSessionStore((s) => s.sessions);
  const upsert = useSessionStore((s) => s.upsert);
  const active = sessions.find((s) => s.id === activeId);
  const [text, setText] = useState(active?.system_message ?? "");
  useEffect(() => setText(active?.system_message ?? ""), [active?.id]); // eslint-disable-line

  if (!active) {
    return <p className="text-[12.5px] text-[var(--color-text-muted)]">No active session.</p>;
  }
  return (
    <div className="space-y-3">
      <Label>System message (appended to default)</Label>
      <Textarea
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="You are an expert TypeScript reviewer…"
      />
      <Button
        variant="primary"
        onClick={async () => {
          try {
            const updated = await sessionsApi.update(api, active.id, { system_message: text });
            upsert(updated);
            toast.success("System message saved");
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      >
        Save
      </Button>
    </div>
  );
}

// ----- Agents catalogue -----

function AgentsTab() {
  const api = useApi();
  const [agents, setAgents] = useState<CustomAgent[]>([]);
  const [editing, setEditing] = useState<CustomAgent | null>(null);

  const reload = () =>
    agentsApi
      .list(api)
      .then((r) => setAgents(r.agents ?? []))
      .catch((e) => toast.error((e as Error).message));

  useEffect(() => { reload(); }, [api]); // eslint-disable-line

  if (editing) {
    return (
      <AgentEditor
        initial={editing}
        onCancel={() => setEditing(null)}
        onSave={async (a) => {
          try {
            await agentsApi.save(api, a);
            toast.success(`Saved ${a.name}`);
            setEditing(null);
            reload();
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-[var(--color-text-muted)]">
          Custom agent personas, available to every session. Select one from the Model tab.
        </p>
        <Button
          size="sm"
          variant="primary"
          onClick={() =>
            setEditing({ name: "", description: "", prompt: "", tools: [] })
          }
        >
          <Plus className="h-3.5 w-3.5" /> New agent
        </Button>
      </div>
      {agents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-[12px] text-[var(--color-text-dim)]">
          No agents yet. Create one to scope prompts and tools.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-border-subtle)] overflow-hidden rounded-lg border border-[var(--color-border-subtle)]">
          {agents.map((a) => (
            <li key={a.name} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium">{a.name}</div>
                <div className="truncate text-[11px] text-[var(--color-text-dim)]">
                  {a.description || a.prompt.slice(0, 80)}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>Edit</Button>
              <Button
                size="icon"
                variant="ghost"
                title="Delete"
                onClick={async () => {
                  if (!confirm(`Delete agent ${a.name}?`)) return;
                  await agentsApi.delete(api, a.name);
                  reload();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AgentEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: CustomAgent;
  onSave: (a: CustomAgent) => void;
  onCancel: () => void;
}) {
  const [a, setA] = useState<CustomAgent>(initial);
  return (
    <div className="space-y-3">
      <div>
        <Label>Name</Label>
        <Input value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} />
      </div>
      <div>
        <Label>Description</Label>
        <Input value={a.description ?? ""} onChange={(e) => setA({ ...a, description: e.target.value })} />
      </div>
      <div>
        <Label>Prompt</Label>
        <Textarea
          rows={8}
          value={a.prompt}
          onChange={(e) => setA({ ...a, prompt: e.target.value })}
          placeholder="You are a senior security reviewer. Be terse. Flag CVEs."
        />
      </div>
      <div>
        <Label>Tools (comma-separated; empty = all)</Label>
        <Input
          value={(a.tools ?? []).join(", ")}
          onChange={(e) =>
            setA({
              ...a,
              tools: e.target.value.split(",").map((x) => x.trim()).filter(Boolean),
            })
          }
        />
      </div>
      <div className="flex gap-2">
        <Button variant="primary" disabled={!a.name || !a.prompt} onClick={() => onSave(a)}>
          Save
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ----- MCP servers catalogue -----

function MCPTab() {
  const api = useApi();
  const [servers, setServers] = useState<Record<string, Record<string, unknown>>>({});
  const [editing, setEditing] = useState<{ name: string; json: string } | null>(null);

  const reload = () =>
    mcpApi
      .list(api)
      .then((r) => setServers(r.servers ?? {}))
      .catch((e) => toast.error((e as Error).message));

  useEffect(() => { reload(); }, [api]); // eslint-disable-line

  if (editing) {
    return (
      <div className="space-y-3">
        <div>
          <Label>Server name</Label>
          <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
        </div>
        <div>
          <Label>Config JSON</Label>
          <Textarea
            rows={10}
            className="font-[var(--font-mono)] text-[12px]"
            value={editing.json}
            onChange={(e) => setEditing({ ...editing, json: e.target.value })}
            placeholder={`{
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
}`}
          />
          <p className="mt-1 text-[11px] text-[var(--color-text-dim)]">
            Either a <code>stdio</code> local server or <code>http</code> remote. See the MCP spec.
            <a
              href="https://modelcontextprotocol.io/"
              target="_blank"
              rel="noreferrer"
              className="ml-1 inline-flex items-center gap-0.5 text-[var(--color-primary)]"
            >
              docs <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="primary"
            onClick={async () => {
              try {
                const cfg = JSON.parse(editing.json);
                await mcpApi.save(api, { name: editing.name, config: cfg });
                toast.success(`Saved ${editing.name}`);
                setEditing(null);
                reload();
              } catch (e) {
                toast.error("Invalid JSON or save failed: " + (e as Error).message);
              }
            }}
            disabled={!editing.name || !editing.json.trim()}
          >
            Save
          </Button>
          <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
        </div>
      </div>
    );
  }

  const entries = Object.entries(servers);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-[var(--color-text-muted)]">
          MCP servers merged into every session. Local (stdio) or remote (http).
        </p>
        <Button
          size="sm"
          variant="primary"
          onClick={() => setEditing({ name: "", json: "" })}
        >
          <Plus className="h-3.5 w-3.5" /> Add server
        </Button>
      </div>
      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-[12px] text-[var(--color-text-dim)]">
          No MCP servers configured.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-border-subtle)] overflow-hidden rounded-lg border border-[var(--color-border-subtle)]">
          {entries.map(([name, cfg]) => (
            <li key={name} className="flex items-center gap-2 px-3 py-2">
              <Plug className="h-3.5 w-3.5 text-[var(--color-primary)]" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium">{name}</div>
                <div className="truncate font-[var(--font-mono)] text-[11px] text-[var(--color-text-dim)]">
                  {JSON.stringify(cfg).slice(0, 80)}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setEditing({ name, json: JSON.stringify(cfg, null, 2) })
                }
              >
                Edit
              </Button>
              <Button
                size="icon"
                variant="ghost"
                title="Delete"
                onClick={async () => {
                  if (!confirm(`Delete MCP server ${name}?`)) return;
                  await mcpApi.delete(api, name);
                  reload();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
