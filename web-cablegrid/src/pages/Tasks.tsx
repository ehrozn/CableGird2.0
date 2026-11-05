import {
  CheckSquare,
  Circle,
  CheckCircle2,
  Hand,
  MessageSquare,
  MonitorPlay,
  Pencil,
  Plus,
  Search,
  Trash2,
  Link2,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import {
  EmptyState,
  NativeSelect,
  PageHeader,
  PriorityBadge,
  TaskStatusBadge,
  useProject,
} from "@/components/common";
import { PriorityMark, StageBar, TagChip } from "@/components/board/bits";
import { TaskWork } from "@/components/board/TaskWork";
import { TaskDialog } from "@/components/dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { activeClaims, slotsOf, tagsOf, taskMode } from "@/lib/board";
import { cableIndex } from "@/lib/derive";
import { normCode, textMatches } from "@/lib/ids";
import { useFmt, useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { Project, Task, TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const TaskSheet = ({
  p,
  task,
  onClose,
  onEdit,
}: {
  p: Project;
  task: Task | undefined;
  onClose: () => void;
  onEdit: () => void;
}) => {
  const t = useT();
  const f = useFmt();
  const { updateTask, deleteTask, addTaskComment } = useStore.getState();
  const [text, setText] = useState("");
  const idx = useMemo(() => cableIndex(p.cables), [p.cables]);
  return (
    <Sheet open={!!task} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[520px]">
        {task && (
          <>
            <SheetHeader className="border-b px-5 py-4 text-left">
              <SheetTitle className="pr-6 text-xl leading-snug">
                {task.title}
              </SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2">
                <TaskStatusBadge s={task.status} />{" "}
                <PriorityBadge p={task.priority} />
                {task.due && (
                  <span>{t("Due {d}", { d: f.date(task.due) })}</span>
                )}
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 scrollbar-thin">
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-[#EEF1EC] p-1">
                {(["todo", "progress", "done"] as TaskStatus[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => updateTask(p.id, task.id, { status: s })}
                    className={cn(
                      "h-9 rounded-md text-sm font-semibold transition",
                      task.status === s
                        ? "bg-white shadow-sm"
                        : "text-sub hover:text-ink",
                    )}
                  >
                    {t(
                      s === "todo"
                        ? "To do"
                        : s === "progress"
                          ? "In progress"
                          : "Done",
                    )}
                  </button>
                ))}
              </div>
              {task.completedAt && (
                <div className="rounded-lg border border-ok/30 bg-ok-soft px-3 py-2 text-sm">
                  {t("Completed {d} by {n}", {
                    d: f.dateTime(task.completedAt),
                    n:
                      task.completedBy === "Manager"
                        ? t("Manager")
                        : (task.completedBy ?? ""),
                  })}
                </div>
              )}
              {task.description && (
                <p className="whitespace-pre-wrap text-sm text-ink/90">
                  {task.description}
                </p>
              )}
              <TaskWork p={p} task={task} />
              {task.assigneeIds.length > 0 && (
                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-sub">
                    {t("Assigned to")}
                  </div>
                  {task.assigneeIds.length === 0 ? (
                    <div className="text-sm text-sub">{t("Nobody yet")}</div>
                  ) : (
                    <ul className="space-y-1.5">
                      {task.assigneeIds.map((id) => {
                        const e = p.employees.find((x) => x.id === id);
                        const link = p.links.find(
                          (l) => l.type === "crew" && l.memberIds.includes(id),
                        );
                        return e ? (
                          <li
                            key={id}
                            className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                          >
                            <span className="flex items-center gap-2">
                              <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-xs font-bold text-white">
                                {e.name.slice(0, 1)}
                              </span>
                              {e.name}
                            </span>
                            {link && (
                              <button
                                onClick={() => {
                                  navigator.clipboard?.writeText(
                                    `${location.origin}/l/${link.token}`,
                                  );
                                  toast.success(t("Link copied"));
                                }}
                                className="inline-flex items-center gap-1 text-xs font-medium text-cat hover:underline"
                              >
                                <Link2 className="h-3.5 w-3.5" />{" "}
                                {t("Copy link")}
                              </button>
                            )}
                          </li>
                        ) : null;
                      })}
                    </ul>
                  )}
                </div>
              )}
              {task.cableCodes.length > 0 && (
                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-sub">
                    {t("Cables")}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {task.cableCodes.map((c) => {
                      const cb = idx.get(normCode(c));
                      return cb ? (
                        <Link
                          key={c}
                          to={`/p/${p.id}/registry/cable/${cb.id}`}
                          className="rounded-md bg-cat-soft px-2 py-1 font-mono text-xs font-semibold text-cat hover:underline"
                        >
                          {c}
                        </Link>
                      ) : (
                        <span
                          key={c}
                          className="rounded-md bg-[#EEF1EC] px-2 py-1 font-mono text-xs"
                        >
                          {c}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-sub">
                  {t("Comments")} ({task.comments.length})
                </div>
                <ul className="space-y-2">
                  {task.comments.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-lg bg-[#F5F7F3] p-3 text-sm"
                    >
                      <div className="mb-0.5 text-xs text-sub">
                        <span className="font-semibold text-ink">
                          {c.by === "Manager" ? t("Manager") : c.by}
                        </span>{" "}
                        · {f.dateTime(c.at)}
                      </div>
                      {c.text}
                    </li>
                  ))}
                </ul>
                <form
                  className="mt-2 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!text.trim()) return;
                    addTaskComment(p.id, task.id, "Manager", text.trim());
                    setText("");
                  }}
                >
                  <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={1}
                    placeholder={t("Add a comment…")}
                    className="min-h-10"
                  />
                  <Button type="submit" disabled={!text.trim()}>
                    {t("Send")}
                  </Button>
                </form>
              </div>
            </div>
            <div className="flex gap-2 border-t bg-[#FAFBF9] px-5 py-3">
              <Button variant="outline" onClick={onEdit}>
                <Pencil className="h-4 w-4" /> {t("Edit")}
              </Button>
              <Button
                variant="ghost"
                className="ml-auto text-bad hover:bg-bad-soft hover:text-bad"
                onClick={() => {
                  if (!confirm(t("Delete this task?"))) return;
                  deleteTask(p.id, task.id);
                  onClose();
                }}
              >
                <Trash2 className="h-4 w-4" /> {t("Delete")}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

const ModeChip = ({ p, x }: { p: Project; x: Task }) => {
  const t = useT();
  const m = taskMode(x);
  if (m === "free")
    return (
      <span className="inline-flex h-5 items-center gap-1 rounded-md bg-brand-soft px-1.5 text-[11px] font-bold text-brand-deep">
        <Hand className="h-3 w-3" />
        {t("Free")} · {activeClaims(x).length}/{slotsOf(x)}
      </span>
    );
  if (m === "crew")
    return (
      <span className="inline-flex h-5 items-center gap-1 rounded-md bg-ink/[0.06] px-1.5 text-[11px] font-bold text-ink">
        <Users className="h-3 w-3" />
        {p.links.find((l) => l.id === x.crewLinkId)?.name ?? t("Crew")}
      </span>
    );
  if (m === "none" && x.origin)
    return (
      <span className="inline-flex h-5 items-center rounded-md bg-[#FFF6CC] px-1.5 text-[11px] font-bold text-[#7A5B00]">
        {t("Needs a decision")}
      </span>
    );
  return null;
};

const Tasks = () => {
  const p = useProject()!;
  const t = useT();
  const f = useFmt();
  const [sp, setSp] = useSearchParams();
  const updateTask = useStore((s) => s.updateTask);
  const [tab, setTab] = useState<"open" | "done" | "all">("open");
  const [who, setWho] = useState("");
  const [q, setQ] = useState("");
  const [dlg, setDlg] = useState<{ open: boolean; task?: Task }>({
    open: false,
  });
  const openId = sp.get("open");
  const today = new Date().toISOString().slice(0, 10);

  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return p.tasks
      .filter((x) =>
        tab === "open"
          ? x.status !== "done"
          : tab === "done"
            ? x.status === "done"
            : true,
      )
      .filter((x) => !who || x.assigneeIds.includes(who))
      .filter(
        (x) =>
          !qq ||
          x.title.toLowerCase().includes(qq) ||
          x.cableCodes.some((c) => textMatches(c, qq)),
      )
      .sort((a, b) =>
        tab === "done"
          ? (b.completedAt ?? "").localeCompare(a.completedAt ?? "")
          : (a.due ?? "9999").localeCompare(b.due ?? "9999"),
      );
  }, [p.tasks, tab, who, q]);

  const counts = {
    open: p.tasks.filter((x) => x.status !== "done").length,
    done: p.tasks.filter((x) => x.status === "done").length,
    all: p.tasks.length,
  };

  return (
    <>
      <PageHeader
        title={t("Tasks")}
        subtitle={t(
          "Free tasks go to the work board QR; crew tasks stay with their crew. Incomplete work from reports appears here too.",
        )}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={`/p/${p.id}/board`}>
                <MonitorPlay className="h-4 w-4" /> {t("Work board")}
              </Link>
            </Button>
            <Button onClick={() => setDlg({ open: true })}>
              <Plus className="h-4 w-4" /> {t("New task")}
            </Button>
          </>
        }
      />
      <div className="panel overflow-hidden">
        <div className="flex flex-col gap-2 border-b p-3 md:flex-row md:items-center md:p-4">
          <div className="flex gap-1 rounded-lg bg-[#EEF1EC] p-1">
            {(["open", "done", "all"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={cn(
                  "h-8 rounded-md px-3 text-sm font-semibold transition",
                  tab === k ? "bg-white shadow-sm" : "text-sub hover:text-ink",
                )}
              >
                {t(k === "open" ? "Open" : k === "done" ? "Completed" : "All")}{" "}
                <span className="tnum text-xs font-normal text-sub">
                  {counts[k]}
                </span>
              </button>
            ))}
          </div>
          <div className="relative md:ml-auto md:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sub" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("Search tasks or cable ID…")}
              className="h-10 pl-9"
            />
          </div>
          <NativeSelect value={who} onChange={setWho} className="md:w-48">
            <option value="">{t("Everyone")}</option>
            {p.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        {list.length === 0 ? (
          <EmptyState
            icon={<CheckSquare />}
            title={p.tasks.length ? t("No tasks here") : t("No tasks yet")}
            text={
              p.tasks.length
                ? undefined
                : t(
                    "Create a task, assign it to someone, and they'll see it on their personal link.",
                  )
            }
            action={
              !p.tasks.length && (
                <Button onClick={() => setDlg({ open: true })}>
                  <Plus className="h-4 w-4" /> {t("New task")}
                </Button>
              )
            }
          />
        ) : (
          <ul className="divide-y">
            {list.map((x) => (
              <li
                key={x.id}
                className="flex items-start gap-3 px-3 py-3 hover:bg-[#F7F9F5] md:px-5"
              >
                <button
                  onClick={() =>
                    updateTask(p.id, x.id, {
                      status: x.status === "done" ? "todo" : "done",
                    })
                  }
                  className={cn(
                    "mt-0.5",
                    x.status === "done" ? "text-ok" : "text-sub hover:text-ok",
                  )}
                  aria-label={t("Toggle done")}
                >
                  {x.status === "done" ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </button>
                <button
                  onClick={() => setSp({ open: x.id })}
                  className="min-w-0 flex-1 text-left"
                >
                  <div
                    className={cn(
                      "font-semibold",
                      x.status === "done" && "text-sub line-through",
                    )}
                  >
                    {x.title}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-sub">
                    {x.status !== "done" && <ModeChip p={p} x={x} />}
                    {x.status !== "done" &&
                      tagsOf(x).map((g) => <TagChip key={g.id} tag={g} />)}
                    {x.status !== "done" &&
                      (x.stagesReported?.stages ?? x.stages) && (
                        <StageBar
                          st={(x.stagesReported?.stages ?? x.stages)!}
                        />
                      )}
                    {x.location && <span>{x.location}</span>}
                    {x.assigneeIds.length > 0 && (
                      <span>
                        {x.assigneeIds
                          .map(
                            (id) => p.employees.find((e) => e.id === id)?.name,
                          )
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    )}
                    {x.cableCodes.length > 0 && (
                      <span className="font-mono">
                        {x.cableCodes.slice(0, 4).join(", ")}
                        {x.cableCodes.length > 4 &&
                          ` +${x.cableCodes.length - 4}`}
                      </span>
                    )}
                    {x.comments.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />{" "}
                        {x.comments.length}
                      </span>
                    )}
                    {x.status === "done" && x.completedAt && (
                      <span className="text-ok">
                        {t("Done {d}", { d: f.short(x.completedAt) })}
                        {x.completedBy &&
                          ` · ${x.completedBy === "Manager" ? t("Manager") : x.completedBy}`}
                      </span>
                    )}
                  </div>
                </button>
                <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                  {x.priority !== "normal" && <PriorityMark p={x.priority} />}
                  <TaskStatusBadge s={x.status} />
                  {x.due && (
                    <span
                      className={cn(
                        "tnum w-16 text-right text-xs",
                        x.status !== "done" && x.due < today
                          ? "font-semibold text-bad"
                          : "text-sub",
                      )}
                    >
                      {f.short(x.due)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <TaskSheet
        p={p}
        task={p.tasks.find((x) => x.id === openId)}
        onClose={() => setSp({})}
        onEdit={() =>
          setDlg({ open: true, task: p.tasks.find((x) => x.id === openId) })
        }
      />
      <TaskDialog
        p={p}
        open={dlg.open}
        onOpenChange={(o) =>
          setDlg({ open: o, task: o ? dlg.task : undefined })
        }
        task={dlg.task}
      />
    </>
  );
};

export default Tasks;
