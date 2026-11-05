import {
  AlertTriangle,
  Check,
  Clock,
  Package,
  RotateCcw,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Badge, ReportStatusBadge, SeverityBadge } from "@/components/common";
import { useShowValue } from "@/components/rfi";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  reasonLabel,
  STAGE_KEYS,
  STAGE_LABEL,
  STAGE_STATE_LABEL,
} from "@/lib/board";
import { cableIndex, entryActions } from "@/lib/derive";
import { normCode } from "@/lib/ids";
import { useFmt, useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { Column, Project, Report } from "@/lib/types";
import { cn } from "@/lib/utils";

export const ReviewDrawer = ({
  p,
  report,
  onClose,
}: {
  p: Project;
  report: Report | undefined;
  onClose: () => void;
}) => {
  const t = useT();
  const f = useFmt();
  const { approveReport, rejectReport, undoApproval } = useStore.getState();
  const [cables, setCables] = useState<Set<string>>(new Set());
  const [issues, setIssues] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState("");
  const idx = useMemo(() => cableIndex(p.cables), [p.cables]);
  const showValue = useShowValue();
  const colById = useMemo(() => {
    const m = new Map<string, Column>();
    for (const s of p.sheets) for (const c of s.columns) m.set(c.id, c);
    return m;
  }, [p.sheets]);

  useEffect(() => {
    if (!report) return;
    setCables(new Set(report.cables.map((c) => c.id)));
    setIssues(new Set(report.issues.map((i) => i.id)));
    setComment(report.managerComment ?? "");
  }, [report?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pending = report?.status === "pending";
  const toggle = (
    s: Set<string>,
    set: (x: Set<string>) => void,
    id: string,
  ) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    set(n);
  };
  const totalHours = report?.tasks.reduce((a, x) => a + (x.hours || 0), 0) ?? 0;

  return (
    <Sheet open={!!report} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[640px]">
        {report && (
          <>
            <SheetHeader className="border-b px-5 py-4 text-left">
              <div className="flex items-center gap-2">
                <SheetTitle className="text-xl">
                  {t("Report")} #{report.number}
                </SheetTitle>
                <ReportStatusBadge s={report.status} />
              </div>
              <SheetDescription>
                {report.linkName} · {report.submittedByName} ·{" "}
                {f.date(report.date)}
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 scrollbar-thin">
              <div className="grid grid-cols-3 gap-2">
                {[
                  [Users, t("People"), report.crewSize],
                  [Clock, t("Hours"), totalHours],
                  [Check, t("Cables"), report.cables.length],
                ].map(([Icon, l, v], i) => {
                  const I = Icon as typeof Users;
                  return (
                    <div key={i} className="rounded-lg border bg-[#F7F9F5] p-3">
                      <div className="flex items-center gap-1.5 text-xs text-sub">
                        <I className="h-3.5 w-3.5" /> {l as string}
                      </div>
                      <div className="tnum mt-0.5 text-xl font-bold">
                        {v as number}
                      </div>
                    </div>
                  );
                })}
              </div>
              {report.workerIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {report.workerIds.map((id) => {
                    const e = p.employees.find((x) => x.id === id);
                    return e ? (
                      <Badge key={id} t="gray">
                        {e.name}
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}

              {report.tasks.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-bold">{t("Tasks")}</h3>
                  <ul className="divide-y rounded-lg border">
                    {report.tasks.map((x) => {
                      const task = p.tasks.find((k) => k.id === x.taskId);
                      return (
                        <li
                          key={x.taskId}
                          className="flex items-start gap-3 px-3 py-2 text-sm"
                        >
                          <span
                            className={cn(
                              "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded",
                              x.done
                                ? "bg-ok text-white"
                                : x.outcome === "partial"
                                  ? "bg-fiber text-ink"
                                  : x.outcome === "not_done"
                                    ? "bg-bad text-white"
                                    : "border",
                            )}
                          >
                            {x.done ? (
                              <Check className="h-3 w-3" strokeWidth={3} />
                            ) : x.outcome === "partial" ? (
                              "½"
                            ) : x.outcome === "not_done" ? (
                              <X className="h-3 w-3" strokeWidth={3} />
                            ) : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="font-medium">
                              {task?.title ?? t("Deleted task")}
                            </span>
                            {x.outcome && (
                              <span className="ml-2 text-xs font-semibold text-sub">
                                {t(
                                  x.outcome === "done"
                                    ? "Done"
                                    : x.outcome === "partial"
                                      ? "Partly done"
                                      : "Not done",
                                )}
                              </span>
                            )}
                            {x.didText && (
                              <span className="block text-xs">
                                <b>{t("What was done")}:</b> {x.didText}
                              </span>
                            )}
                            {x.leftText && (
                              <span className="block text-xs">
                                <b>{t("What is left")}:</b> {x.leftText}
                              </span>
                            )}
                            {x.outcome && x.outcome !== "done" && (
                              <span
                                className={cn(
                                  "block text-xs",
                                  x.blocked && "font-semibold text-bad",
                                )}
                              >
                                <b>{t("Reason")}:</b> {t(reasonLabel(x.reason))}
                                {x.reasonNote && ` — ${x.reasonNote}`}
                                {x.blocked && ` · ${t("Blocked")}`}
                              </span>
                            )}
                            {x.needs && (
                              <span className="block text-xs">
                                <b>{t("Needs")}:</b> {x.needs}
                              </span>
                            )}
                            {x.note && (
                              <span className="block text-xs text-sub">
                                {x.note}
                              </span>
                            )}
                          </span>
                          <span className="tnum shrink-0 text-sub">
                            {x.hours} {t("h")}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold">
                    {t("Cable work")}{" "}
                    <span className="font-normal text-sub">
                      ({report.cables.length})
                    </span>
                  </h3>
                  {pending && report.cables.length > 1 && (
                    <button
                      className="text-xs font-medium text-cat hover:underline"
                      onClick={() =>
                        setCables(
                          cables.size === report.cables.length
                            ? new Set()
                            : new Set(report.cables.map((c) => c.id)),
                        )
                      }
                    >
                      {cables.size === report.cables.length
                        ? t("Unselect all")
                        : t("Select all")}
                    </button>
                  )}
                </div>
                {report.cables.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-center text-sm text-sub">
                    {t("No cable work in this report")}
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {report.cables.map((e) => {
                      const acts = entryActions(e)
                        .map((id) => p.actions.find((x) => x.id === id))
                        .filter((x): x is NonNullable<typeof x> => !!x);
                      const c = idx.get(normCode(e.code));
                      const on = pending ? cables.has(e.id) : e.approved;
                      return (
                        <li key={e.id}>
                          <label
                            className={cn(
                              "flex gap-3 rounded-lg border p-2.5 text-sm transition",
                              pending && "cursor-pointer hover:border-ink/30",
                              on ? "bg-white" : "bg-[#F5F7F3] opacity-70",
                              e.repeat && "border-cat/30",
                            )}
                          >
                            {pending ? (
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => toggle(cables, setCables, e.id)}
                                className="mt-0.5 h-4 w-4 accent-[#1F9D63]"
                              />
                            ) : (
                              <span
                                className={cn(
                                  "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-sm",
                                  on ? "bg-ok text-white" : "bg-bad text-white",
                                )}
                              >
                                {on ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <X className="h-3 w-3" />
                                )}
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                {c ? (
                                  <Link
                                    to={`/p/${p.id}/registry/cable/${c.id}`}
                                    className="font-mono font-semibold text-cat hover:underline"
                                    onClick={(ev) => ev.stopPropagation()}
                                  >
                                    {e.code}
                                  </Link>
                                ) : (
                                  <span className="font-mono font-semibold">
                                    {e.code}
                                  </span>
                                )}
                                {acts.map((a) => (
                                  <span
                                    key={a.id}
                                    className="inline-flex items-center gap-1 text-[13px] font-medium"
                                  >
                                    <span
                                      className="h-2 w-2 rounded-full"
                                      style={{ background: a.color }}
                                    />
                                    {t(a.name)}
                                  </span>
                                ))}
                                {(e.isNew || !c) && (
                                  <Badge t="orange">{t("New cable")}</Badge>
                                )}
                                {e.repeat && (
                                  <Badge t="blue">{t("Repeat")}</Badge>
                                )}
                              </span>
                              {e.reason && (
                                <span className="mt-1 block text-xs">
                                  <span className="font-semibold">
                                    {t("Reason")}:
                                  </span>{" "}
                                  {e.reason}
                                </span>
                              )}
                              {e.stages && (
                                <span className="mt-1 block text-xs">
                                  {STAGE_KEYS.filter((k) => e.stages?.[k])
                                    .map(
                                      (k) =>
                                        `${t(STAGE_LABEL[k])}: ${t(STAGE_STATE_LABEL[e.stages![k]!.state])}${e.stages![k]!.pct ? ` ${e.stages![k]!.pct}%` : ""}`,
                                    )
                                    .join(" · ")}
                                </span>
                              )}
                              {e.stop && (
                                <span
                                  className={cn(
                                    "mt-0.5 block text-xs",
                                    e.stop.blocked && "font-semibold text-bad",
                                  )}
                                >
                                  {t("Not finished")}:{" "}
                                  {t(reasonLabel(e.stop.reason))}
                                  {e.stop.note && ` — ${e.stop.note}`}
                                  {e.stop.needs &&
                                    ` · ${t("Needs")}: ${e.stop.needs}`}
                                  {e.stop.blocked && ` · ${t("Blocked")}`}
                                </span>
                              )}
                              {e.note && (
                                <span className="mt-0.5 block text-xs text-sub">
                                  {e.note}
                                </span>
                              )}
                              {e.values &&
                                Object.values(e.values).some(Boolean) && (
                                  <span className="mt-1 block text-xs text-sub">
                                    {Object.entries(e.values)
                                      .filter(
                                        ([k, v]) =>
                                          v &&
                                          colById.get(k)?.type !== "checkbox",
                                      )
                                      .map(
                                        ([k, v]) =>
                                          `${colById.get(k)?.name ?? k}: ${showValue(colById.get(k), v)}`,
                                      )
                                      .join(" · ")}
                                  </span>
                                )}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {report.issues.length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-bad">
                    <AlertTriangle className="h-4 w-4" /> {t("Reported issues")}
                  </h3>
                  <ul className="space-y-1.5">
                    {report.issues.map((i) => {
                      const on = pending ? issues.has(i.id) : i.approved;
                      return (
                        <li key={i.id}>
                          <label
                            className={cn(
                              "flex gap-3 rounded-lg border border-bad/30 bg-bad-soft/50 p-2.5 text-sm",
                              pending && "cursor-pointer",
                              !on && "opacity-60",
                            )}
                          >
                            {pending ? (
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => toggle(issues, setIssues, i.id)}
                                className="mt-0.5 h-4 w-4 accent-[#E5384B]"
                              />
                            ) : (
                              <span
                                className={cn(
                                  "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-sm text-white",
                                  on ? "bg-ok" : "bg-bad",
                                )}
                              >
                                {on ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <X className="h-3 w-3" />
                                )}
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2 font-semibold">
                                {i.title} <SeverityBadge s={i.severity} />
                                {i.code && (
                                  <span className="font-mono text-xs text-cat">
                                    {i.code}
                                  </span>
                                )}
                              </span>
                              {i.description && (
                                <span className="block text-xs text-sub">
                                  {i.description}
                                </span>
                              )}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {report.materials.length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold">
                    <Package className="h-4 w-4 text-sub" />{" "}
                    {t("Materials used")}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {report.materials.map((m, i) => (
                      <span
                        key={i}
                        className="rounded-lg border bg-white px-3 py-1.5 text-sm"
                      >
                        {m.name}{" "}
                        <span className="tnum font-semibold">{m.qty}</span>{" "}
                        <span className="text-sub">{m.unit}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {report.notes && (
                <div>
                  <h3 className="mb-1 text-sm font-bold">{t("Notes")}</h3>
                  <p className="whitespace-pre-wrap rounded-lg bg-[#F7F9F5] p-3 text-sm">
                    {report.notes}
                  </p>
                </div>
              )}

              {pending ? (
                <div>
                  <h3 className="mb-1 text-sm font-bold">
                    {t("Comment for the crew")}
                  </h3>
                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={2}
                    placeholder={t("Optional")}
                  />
                </div>
              ) : (
                report.managerComment && (
                  <div className="rounded-lg border bg-[#F7F9F5] p-3 text-sm">
                    <span className="font-semibold">
                      {t("Manager comment")}:
                    </span>{" "}
                    {report.managerComment}
                  </div>
                )
              )}
              <div className="text-xs text-sub">
                {t("Submitted")} {f.dateTime(report.submittedAt)}
                {report.reviewedAt &&
                  ` · ${t("Reviewed")} ${f.dateTime(report.reviewedAt)}`}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border-t bg-[#FAFBF9] px-5 py-3">
              {pending ? (
                <>
                  <Button
                    className="flex-1 bg-ok hover:bg-ok/90"
                    onClick={() => {
                      approveReport(p.id, report.id, {
                        cableEntryIds: [...cables],
                        issueIds: [...issues],
                        comment: comment.trim(),
                      });
                      toast.success(
                        t("Report #{n} approved — registry updated", {
                          n: report.number,
                        }),
                      );
                      onClose();
                    }}
                  >
                    <Check className="h-4 w-4" />
                    {cables.size + issues.size ===
                    report.cables.length + report.issues.length
                      ? t("Approve all")
                      : t("Approve selected ({n})", {
                          n: cables.size + issues.size,
                        })}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-bad/40 text-bad hover:bg-bad-soft hover:text-bad"
                    onClick={() => {
                      rejectReport(p.id, report.id, comment.trim());
                      toast(t("Report #{n} rejected", { n: report.number }));
                      onClose();
                    }}
                  >
                    <X className="h-4 w-4" /> {t("Reject")}
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (
                      !confirm(
                        t(
                          "Undo this review? Changes it made to the registry will be rolled back and the report returns to the queue.",
                        ),
                      )
                    )
                      return;
                    undoApproval(p.id, report.id);
                    toast(t("Review undone"));
                  }}
                >
                  <RotateCcw className="h-4 w-4" /> {t("Undo review")}
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
