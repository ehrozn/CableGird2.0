import {
  MessageSquareWarning,
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileText,
  History,
  MoreHorizontal,
  Pencil,
  PlusCircle,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Badge, CableStateBadge, EmptyState, NativeSelect, SeverityBadge, useProject } from "@/components/common";
import { IssueDialog, TaskDialog } from "@/components/dialogs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { notifyGate, readOnlyCol } from "@/components/registry/RegistryTable";
import { buildGate, inList, sheetList } from "@/lib/auto";
import { cablePct, cableState, dataColumns, openIssueMap, plainState } from "@/lib/derive";
import { normCode } from "@/lib/ids";
import { canDelete } from "@/lib/cloud";
import { useFmt, useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { Column, HistoryEvent, HistoryKind, ManualState, TaskOutcome } from "@/lib/types";
import { cn } from "@/lib/utils";

const FieldEditor = ({ col, value, onCommit }: { col: Column; value: string; onCommit: (v: string) => void }) => {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const cls = "h-9 w-full rounded-md border border-transparent bg-[#F5F7F3] px-2.5 text-sm text-ink outline-none transition hover:border-border focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/20";
  if (col.type === "select" || col.type === "checkbox") {
    const opts = col.type === "checkbox" ? ["yes", "no"] : (col.options ?? []).filter(Boolean);
    return (
      <select className={cls} value={value} onChange={(e) => onCommit(e.target.value)} aria-label={col.name}>
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        {value && !opts.includes(value) && <option value={value}>{value}</option>}
      </select>
    );
  }
  return (
    <input
      className={cn(cls, col.type === "number" && "tnum")}
      type={col.type === "number" ? "number" : col.type === "date" ? "date" : "text"}
      value={v}
      aria-label={col.name}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v.trim())}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
};

const KIND_META: Record<HistoryKind, { icon: typeof Check; cls: string; label: string }> = {
  created: { icon: Sparkles, cls: "bg-[#EEF1EC] text-sub", label: "Added to registry" },
  imported: { icon: Upload, cls: "bg-cat-soft text-cat", label: "Imported" },
  edited: { icon: Pencil, cls: "bg-[#EEF1EC] text-ink", label: "Edited" },
  action: { icon: Check, cls: "bg-ok text-white", label: "" },
  issue: { icon: AlertTriangle, cls: "bg-bad text-white", label: "Issue reported" },
  resolved: { icon: CheckCircle2, cls: "bg-ok-soft text-ok", label: "Issue resolved" },
  undone: { icon: RotateCcw, cls: "bg-fiber-soft text-fiber-deep", label: "Mark removed" },
  task: { icon: ClipboardCheck, cls: "bg-cat-soft text-cat", label: "Task" },
  status: { icon: CircleDot, cls: "bg-[#EEF1EC] text-ink", label: "Status changed" },
};

const OUTCOME: Record<TaskOutcome, { label: string; cls: string }> = {
  taken: { label: "Task taken", cls: "bg-cat-soft text-cat" },
  started: { label: "Task started", cls: "bg-cat-soft text-cat" },
  done: { label: "Task done", cls: "bg-ok text-white" },
  partial: { label: "Task partly done", cls: "bg-fiber-soft text-fiber-deep" },
  not_done: { label: "Task not done", cls: "bg-bad-soft text-bad" },
  reopened: { label: "Task reopened", cls: "bg-[#EEF1EC] text-sub" },
};

const MANUAL: { id: ManualState; label: string; Icon: typeof Check; on: string }[] = [
  { id: "none", label: "Not started", Icon: CircleDashed, on: "border-ink/25 bg-[#F5F7F3] text-ink" },
  { id: "progress", label: "In progress", Icon: CircleDot, on: "border-cat bg-cat-soft text-cat" },
  { id: "complete", label: "Complete", Icon: CheckCircle2, on: "border-ok bg-ok-soft text-ok" },
];

const CableDetail = () => {
  const p = useProject()!;
  const { cid } = useParams();
  const t = useT();
  const f = useFmt();
  const navigate = useNavigate();
  const { setCableValue, toggleAction, renameCable, deleteCables, updateIssue, setCableStatus } = useStore.getState();
  const cable = p.cables.find((c) => c.id === cid);
  const pendingRfis = (p.rfis ?? []).filter((r) => r.status === "pending" && cable && (r.cableId === cable.id || normCode(r.code) === normCode(cable.code)));
  const [sheetId, setSheetId] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [limit, setLimit] = useState(12);
  const [taskOpen, setTaskOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [rename, setRename] = useState<string | null>(null);
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");

  const issues = useMemo(() => (cable ? (openIssueMap(p.issues).get(normCode(cable.code)) ?? []) : []), [p.issues, cable]);
  const tasks = useMemo(() => (cable ? p.tasks.filter((x) => x.cableCodes.some((c) => normCode(c) === normCode(cable.code))) : []), [p.tasks, cable]);

  if (!cable)
    return (
      <EmptyState
        icon={<AlertTriangle />}
        title={t("Cable not found")}
        text={t("It may have been deleted or renamed.")}
        action={
          <Button asChild variant="outline">
            <Link to={`/p/${p.id}/registry`}>{t("Back to registry")}</Link>
          </Button>
        }
      />
    );

  const state = cableState(cable, p.actions, openIssueMap(p.issues));
  const pct = cablePct(cable, p.actions);
  const sheet = p.sheets.find((s) => s.id === sheetId) ?? p.sheets.find((s) => inList(cable, sheetList(s))) ?? p.sheets[0];
  const gate = buildGate(p);
  const crumbs = sheet ? dataColumns(sheet).slice(0, 3).map((c) => cable.values[c.id]).filter(Boolean) : [];

  const events = cable.history.filter((h) => filter === "all" || (filter === "work" ? h.kind === "action" || h.kind === "undone" || h.kind === "task" || h.kind === "status" : filter === "issues" ? h.kind === "issue" || h.kind === "resolved" : h.kind === "edited" || h.kind === "imported" || h.kind === "created"));

  const evTitle = (h: HistoryEvent) => {
    if (h.kind === "action") return h.repeat ? t("Repeated: {a}", { a: t(h.actionName ?? "") }) : t(h.actionName ?? "");
    if (h.kind === "undone") return `${t("Mark removed")}: ${t(h.actionName ?? "")}`;
    if (h.kind === "task") return t(OUTCOME[h.outcome ?? "done"].label);
    if (h.kind === "status") return `${t("Status")}: ${t(MANUAL.find((m) => m.id === h.state)?.label ?? "")}`;
    return t(KIND_META[h.kind].label);
  };

  return (
    <>
      <Link to={`/p/${p.id}/registry`} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-cat hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" /> {t("Back to cable registry")}
      </Link>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-extrabold tracking-tight text-ink md:text-[28px]">
            {t("Cable")} <span className="font-mono">{cable.code}</span>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(cable.code);
                toast.success(t("Copied"));
              }}
              className="grid h-8 w-8 place-items-center rounded-md border bg-white text-sub hover:text-ink"
              aria-label={t("Copy ID")}
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </h1>
          <div className="mt-1 text-sm text-sub">{[p.name, ...crumbs].join("  ·  ")}</div>
        </div>
        <div className="flex items-center gap-2">
          <CableStateBadge state={state} />
          <span className="tnum rounded-full border bg-white px-2.5 py-0.5 text-xs font-semibold text-ink">{pct}%</span>
          <DropdownMenu>
            <DropdownMenuTrigger className="grid h-9 w-9 place-items-center rounded-lg border bg-white hover:border-brand/50" aria-label={t("More")}>
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setRename(cable.code)}>
                <Pencil className="mr-2 h-4 w-4" /> {t("Rename ID")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIssueOpen(true)}>
                <AlertTriangle className="mr-2 h-4 w-4" /> {t("Report an issue")}
              </DropdownMenuItem>
              <DropdownMenuSeparator className={canDelete(p) ? "" : "hidden"} />
              <DropdownMenuItem
                className={canDelete(p) ? "text-bad focus:text-bad" : "hidden"}
                onClick={() => {
                  if (!confirm(t("Delete cable {c}?", { c: cable.code }))) return;
                  deleteCables(p.id, [cable.id]);
                  navigate(`/p/${p.id}/registry`);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" /> {t("Delete cable")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {pendingRfis.length > 0 && (
        <Link
          to={`/p/${p.id}/rfi`}
          className="mb-5 flex items-center gap-3 rounded-[10px] border border-brand/30 bg-brand-soft/50 px-4 py-3 text-sm transition hover:border-brand"
        >
          <MessageSquareWarning className="h-5 w-5 shrink-0 text-brand" />
          <span className="min-w-0 flex-1">
            <span className="font-semibold">{t("{n} change requests (RFI) waiting for this cable", { n: pendingRfis.length })}</span>
            <span className="block truncate text-sub">{pendingRfis.map((r) => `#${r.number}: ${r.reason}`).join(" · ")}</span>
          </span>
        </Link>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-5">
          <section className="panel">
            <header className="flex items-center justify-between gap-2 border-b px-5 py-3">
              <h2 className="text-[15px] font-bold">{t("Main information")}</h2>
              {p.sheets.filter((s) => inList(cable, sheetList(s))).length > 1 && (
                <NativeSelect value={sheet?.id ?? ""} onChange={setSheetId} className="h-8 w-auto max-w-[180px] text-[13px]" aria-label={t("Sheet")}>
                  {p.sheets.filter((s) => inList(cable, sheetList(s))).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </header>
            <dl className="divide-y px-5">
              <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-center gap-3 py-2">
                <dt className="text-sm text-sub">{t("Cable ID")}</dt>
                <dd className="font-mono text-sm font-semibold">{cable.code}</dd>
              </div>
              {(sheet?.columns ?? []).map((c) => (
                <div key={c.id} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-center gap-3 py-1.5">
                  <dt className="truncate text-sm text-sub" title={c.name}>
                    {c.name}
                  </dt>
                  <dd>
                    {readOnlyCol(c) ? (
                      <span className={cn("block truncate px-1 text-sm", cable.values[c.id] === "#ERR" ? "text-bad" : "text-ink")} title={c.formula ? `= ${c.formula}` : t("Read-only here")}>
                        {cable.values[c.id] || "—"}
                      </span>
                    ) : (
                      <FieldEditor
                        col={c}
                        value={cable.values[c.id] ?? ""}
                        onCommit={(v) => {
                          setCableValue(p.id, cable.id, c.id, c.name, v);
                          notifyGate(t);
                        }}
                      />
                    )}
                  </dd>
                </div>
              ))}
              {!sheet && <div className="py-6 text-sm text-sub">{t("No columns yet. Add them in the registry.")}</div>}
            </dl>
          </section>

          <section className="panel">
            <header className="flex items-center justify-between border-b px-5 py-3">
              <h2 className="text-[15px] font-bold">{p.actions.length ? t("Work stages") : t("Status")}</h2>
              <span className="text-xs text-sub">{p.actions.length ? t("Tap to mark or clear") : t("Tap to change")}</span>
            </header>
            {!p.actions.length && (
              <div className="p-4">
                <div className="grid grid-cols-3 gap-2">
                  {MANUAL.map((m) => {
                    const on = plainState(cable) === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => {
                          if (on) return;
                          setCableStatus(p.id, [cable.id], m.id);
                          toast.success(t("Status: {s}", { s: t(m.label) }));
                        }}
                        aria-pressed={on}
                        className={cn(
                          "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-center text-[13px] font-semibold transition active:scale-[0.97]",
                          on ? m.on : "border-dashed text-sub hover:border-solid hover:border-ink/30 hover:text-ink",
                        )}
                      >
                        <m.Icon className="h-5 w-5" />
                        {t(m.label)}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs leading-relaxed text-sub">
                  {t("Tasks update the status by themselves: taken → In progress, done → Complete. For detailed stages turn on “Progress” for a column in the registry.")}
                </p>
              </div>
            )}
            <div className={cn("grid gap-2 p-4 sm:grid-cols-2", !p.actions.length && "hidden")}>
              {p.actions.map((a) => {
                const d = cable.done[a.id];
                return (
                  <button
                    key={a.id}
                    onClick={() => {
                      toggleAction(p.id, cable.id, a.id, !d);
                      notifyGate(t);
                    }}
                    disabled={!!gate.block(cable.values, a.id, !d)}
                    title={gate.block(cable.values, a.id, !d) ? t("Needs “{b}” first", { b: t(gate.names.get(gate.block(cable.values, a.id, !d)!) ?? "") }) : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-45",
                      d ? "border-transparent bg-[#F5F7F3]" : "border-dashed hover:border-solid hover:border-ink/30",
                    )}
                  >
                    <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full border-2")} style={{ borderColor: a.color, background: d ? a.color : "transparent" }}>
                      {d && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{t(a.name)}</span>
                      <span className="block truncate text-xs text-sub">
                        {d ? f.date(d) : t("Not done")}
                        {d && cable.values[a.id] && !["yes", "✓"].includes(cable.values[a.id]!) && cable.values[a.id] !== d ? ` · ${cable.values[a.id]}` : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {tasks.length > 0 && (
            <section className="panel">
              <header className="border-b px-5 py-3 text-[15px] font-bold">{t("Related tasks")}</header>
              <ul className="divide-y">
                {tasks.map((x) => (
                  <li key={x.id}>
                    <Link to={`/p/${p.id}/tasks?open=${x.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-[#F7F9F5]">
                      <span className="truncate font-medium">{x.title}</span>
                      <Badge t={x.status === "done" ? "green" : x.status === "progress" ? "blue" : "gray"}>{t(x.status === "done" ? "Done" : x.status === "progress" ? "In progress" : "To do")}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <section className="panel self-start">
          <header className="flex items-center justify-between gap-2 border-b px-5 py-3">
            <h2 className="flex items-center gap-2 text-[15px] font-bold">
              <History className="h-4 w-4 text-sub" /> {t("Change history")}
            </h2>
            <NativeSelect value={filter} onChange={setFilter} className="h-8 w-auto text-[13px]" aria-label={t("Filter")}>
              <option value="all">{t("All events")}</option>
              <option value="work">{t("Work")}</option>
              <option value="issues">{t("Issues")}</option>
              <option value="edits">{t("Edits & imports")}</option>
            </NativeSelect>
          </header>
          {events.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-sub">{t("No events")}</div>
          ) : (
            <ol className="relative px-3 py-3 md:px-5">
              {events.slice(0, limit).map((h, i) => {
                const m = KIND_META[h.kind];
                const Icon = h.kind === "action" && h.repeat ? RotateCcw : m.icon;
                const linked = h.kind === "task" && h.taskId ? p.tasks.find((x) => x.id === h.taskId) : undefined;
                const action = h.actionId ? p.actions.find((a) => a.id === h.actionId) : undefined;
                const report = h.reportId ? p.reports.find((r) => r.id === h.reportId) : undefined;
                return (
                  <li key={h.id} className="grid grid-cols-[76px_28px_minmax(0,1fr)] gap-x-2 md:grid-cols-[96px_28px_minmax(0,1fr)]">
                    <div className="pt-2 text-right">
                      <div className="text-[13px] font-medium text-ink">{f.short(h.at)}</div>
                      <div className="text-xs text-sub">{f.time(h.at)}</div>
                    </div>
                    <div className="relative flex justify-center">
                      {i < Math.min(events.length, limit) - 1 && <span className="absolute top-9 h-[calc(100%-24px)] w-0.5 bg-border" />}
                      <span
                        className={cn("relative mt-1.5 grid h-7 w-7 place-items-center rounded-full", h.kind === "task" ? OUTCOME[h.outcome ?? "done"].cls : m.cls)}
                        style={h.kind === "action" && action ? { background: h.repeat ? "#2563EB" : action.color } : undefined}
                      >
                        <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
                      </span>
                    </div>
                    <div className={cn("mb-2 rounded-lg p-2.5", i === 0 && "bg-[#F5F7F3]")}>
                      <div className="flex items-start justify-between gap-2">
                        <div className={cn("text-sm font-semibold", h.kind === "issue" && "text-bad")}>{evTitle(h)}</div>
                        {report && (
                          <Link to={`/p/${p.id}/reports?open=${report.id}`} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-cat hover:underline">
                            <FileText className="h-3.5 w-3.5" />#{report.number}
                          </Link>
                        )}
                      </div>
                      <div className="text-xs text-sub">
                        {h.by === "Manager" ? t("Manager") : h.by}
                        {h.employee && ` · ${h.employee}`}
                      </div>
                      {h.reason && (
                        <div className="mt-1.5 rounded-md border border-cat/20 bg-cat-soft px-2 py-1 text-xs text-ink">
                          <span className="font-semibold">{t("Reason")}:</span> {h.reason}
                        </div>
                      )}
                      {h.kind === "task" && linked ? (
                        <Link to={`/p/${p.id}/tasks?open=${linked.id}`} className="mt-1 inline-flex max-w-full items-center gap-1 text-[13px] font-medium text-cat hover:underline">
                          <ClipboardCheck className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{linked.title}</span>
                        </Link>
                      ) : (
                        h.note && <div className="mt-1 text-[13px] text-ink/80">{h.note}</div>
                      )}
                      {h.changes && h.changes.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5 text-xs">
                          {h.changes.slice(0, 6).map((c, j) => (
                            <li key={j} className="text-sub">
                              <span className="font-medium text-ink">{c.column}</span>: <span className="line-through">{c.from || "—"}</span> → <span className="text-ink">{c.to || "—"}</span>
                            </li>
                          ))}
                          {h.changes.length > 6 && <li className="text-sub">+{h.changes.length - 6}</li>}
                        </ul>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {events.length > limit && (
            <div className="border-t p-3 text-center">
              <button onClick={() => setLimit(limit + 20)} className="rounded-md bg-cat-soft px-3 py-1.5 text-[13px] font-medium text-cat hover:bg-cat/15">
                {t("Show earlier events")}
              </button>
            </div>
          )}
        </section>
      </div>

      {issues.map((i) => (
        <div key={i.id} className="rise mt-5 flex flex-col gap-3 rounded-xl border border-bad/40 bg-bad-soft p-4 md:flex-row md:items-start md:p-5">
          <AlertTriangle className="h-8 w-8 shrink-0 text-bad" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-base font-bold text-bad">
                {t("Issue")}: {i.title}
              </div>
              <SeverityBadge s={i.severity} />
            </div>
            {i.description && <p className="mt-1 text-sm text-ink/80">{i.description}</p>}
            <div className="mt-1 text-xs text-sub">
              {f.dateTime(i.createdAt)} · {i.reportedBy}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {i.status === "open" && (
              <Button size="sm" variant="outline" onClick={() => updateIssue(p.id, i.id, { status: "progress" })}>
                {t("Start fixing")}
              </Button>
            )}
            <Button size="sm" className="bg-ok hover:bg-ok/90" onClick={() => setResolveId(i.id)}>
              <CheckCircle2 className="h-4 w-4" /> {t("Resolve")}
            </Button>
          </div>
        </div>
      ))}

      <div className="mt-5 flex flex-wrap gap-3">
        <Button size="lg" onClick={() => setTaskOpen(true)} className="h-12 px-6 text-base">
          <PlusCircle className="h-5 w-5" /> {t("Create task")}
        </Button>
        <Button size="lg" variant="outline" className="h-12 px-6 text-base" onClick={() => navigate(`/p/${p.id}/registry?q=${encodeURIComponent(cable.code)}`)}>
          <ExternalLink className="h-5 w-5" /> {t("Open in registry")}
        </Button>
        {!issues.length && (
          <Button size="lg" variant="ghost" className="h-12 text-bad hover:bg-bad-soft hover:text-bad" onClick={() => setIssueOpen(true)}>
            <AlertTriangle className="h-5 w-5" /> {t("Report an issue")}
          </Button>
        )}
      </div>

      <TaskDialog p={p} open={taskOpen} onOpenChange={setTaskOpen} presetCodes={[cable.code]} />
      <IssueDialog p={p} open={issueOpen} onOpenChange={setIssueOpen} presetCode={cable.code} />
      <Dialog open={rename !== null} onOpenChange={(o) => !o && setRename(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("Rename ID")}</DialogTitle>
          </DialogHeader>
          <Input value={rename ?? ""} onChange={(e) => setRename(e.target.value)} className="font-mono" autoFocus />
          <DialogFooter>
            <Button
              onClick={() => {
                if (rename && renameCable(p.id, cable.id, rename)) {
                  toast.success(t("Saved"));
                  setRename(null);
                } else toast.error(t("This ID is already used"));
              }}
            >
              {t("Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={resolveId !== null} onOpenChange={(o) => !o && setResolveId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Resolve issue")}</DialogTitle>
          </DialogHeader>
          <Input value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder={t("How was it fixed? (optional)")} autoFocus />
          <DialogFooter>
            <Button
              className="bg-ok hover:bg-ok/90"
              onClick={() => {
                if (resolveId) updateIssue(p.id, resolveId, { status: "resolved", resolution: resolution.trim() || undefined });
                setResolveId(null);
                setResolution("");
                toast.success(t("Issue resolved"));
              }}
            >
              {t("Resolve")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CableDetail;
