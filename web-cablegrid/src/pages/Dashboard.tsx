import {
  Activity as ActivityIcon,
  AlertTriangle,
  ArrowRight,
  Cable,
  Check,
  CheckCircle2,
  Circle,
  Link2,
  Plus,
  Table2,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Badge, NativeSelect, ReportStatusBadge, Ring, Section, useProject } from "@/components/common";
import { TaskDialog } from "@/components/dialogs";
import { ReviewDrawer } from "@/components/ReviewDrawer";
import { RfiReviewList } from "@/components/RfiReview";
import { Button } from "@/components/ui/button";
import { allColumns, lastAction, PRIORITY_RANK, projectStats, threadAwaits, threadUnread } from "@/lib/derive";
import { normCode, natCmp } from "@/lib/ids";
import { useFmt, useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { Avatar, lastPost, ThreadPriorityBadge } from "@/components/threads";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<string, string> = {
  datacenter: "Data center",
  structured: "Structured cabling",
  fiber: "Fiber optic",
  telecom: "Telecom",
  mixed: "Mixed / other",
};

const GettingStarted = ({ p }: { p: Project }) => {
  const t = useT();
  const steps = [
    { done: p.sheets.length > 0, label: t("Set up the registry sheets"), to: "registry", icon: Table2 },
    { done: p.cables.length > 0, label: t("Add or import cables"), to: "registry", icon: Cable },
    { done: p.employees.length > 0, label: t("Add your team"), to: "team", icon: Users },
    { done: p.links.some((l) => l.type === "crew"), label: t("Share a crew link for daily reports"), to: "links", icon: Link2 },
  ];
  const n = steps.filter((s) => s.done).length;
  if (n === steps.length) return null;
  return (
    <section className="panel mb-5 overflow-hidden">
      <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:p-5">
        <div className="md:w-60">
          <div className="text-[15px] font-bold">{t("Getting started")}</div>
          <div className="mt-0.5 text-sm text-sub">{t("{n} of {m} done", { n, m: steps.length })}</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#EEF1EC]">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(n / steps.length) * 100}%` }} />
          </div>
        </div>
        <div className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {steps.map((s, i) => (
            <Link
              key={i}
              to={`/p/${p.id}/${s.to}`}
              className={cn("flex items-center gap-2.5 rounded-lg border p-3 text-sm transition", s.done ? "bg-ok-soft/60 text-sub" : "bg-white hover:border-brand hover:shadow-sm")}
            >
              {s.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-ok" /> : <s.icon className="h-5 w-5 shrink-0 text-brand" />}
              <span className={cn("font-medium", s.done && "line-through")}>{s.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

const StageChart = ({ p }: { p: Project }) => {
  const t = useT();
  const f = useFmt();
  const cols = useMemo(() => allColumns(p), [p]);
  const [groupBy, setGroupBy] = useState<string>("");
  const groupCol = cols.find((c) => c.id === groupBy);

  const rows = useMemo(() => {
    const groups = new Map<string, number[]>();
    const n = p.actions.length;
    for (const c of p.cables) {
      const key = groupCol ? c.values[groupCol.id] || "—" : t("All cables");
      let arr = groups.get(key);
      if (!arr) groups.set(key, (arr = new Array(n + 1).fill(0)));
      const la = lastAction(c, p.actions);
      const i = la ? p.actions.indexOf(la) : -1;
      arr[i === -1 ? n : i]++;
    }
    return [...groups.entries()]
      .map(([k, v]) => ({ k, v, total: v.reduce((a, b) => a + b, 0) }))
      .sort((a, b) => (groupCol ? natCmp(a.k, b.k) : 0))
      .slice(0, 14);
  }, [p.cables, p.actions, groupCol, t]);
  const max = Math.max(1, ...rows.map((r) => r.total));

  return (
    <Section
      title={t("Stages by cable")}
      action={
        cols.length > 0 && (
          <NativeSelect value={groupBy} onChange={setGroupBy} className="h-8 w-auto max-w-[170px] text-[13px]" aria-label={t("Group by")}>
            <option value="">{t("All cables")}</option>
            {cols.map((c) => (
              <option key={c.id} value={c.id}>
                {t("By {c}", { c: c.name })}
              </option>
            ))}
          </NativeSelect>
        )
      }
    >
      <div className="p-4 md:p-5">
        <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">
          {p.actions.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.color }} />
              {t(a.name)}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#D5DAD2]" />
            {t("Not started")}
          </span>
        </div>
        {p.cables.length === 0 ? (
          <div className="py-8 text-center text-sm text-sub">{t("Stages appear once cables are in the registry.")}</div>
        ) : (
          <div className="space-y-2.5">
            {rows.map((r) => (
              <div key={r.k} className="grid grid-cols-[minmax(60px,110px)_minmax(0,1fr)_44px] items-center gap-3">
                <div className="truncate text-right text-[13px] font-medium text-ink" title={r.k}>
                  {r.k}
                </div>
                <div className="flex h-4 overflow-hidden rounded-full bg-[#EEF1EC]" style={{ width: `${Math.max(8, (r.total / max) * 100)}%` }}>
                  {[...p.actions.map((a) => a.color), "#D5DAD2"].map((color, i) => {
                    // segment i = cables whose furthest stage is action i (stacked left→right in workflow order)
                    const v = r.v[i];
                    return v ? <div key={i} className="h-full transition-all duration-700" style={{ width: `${(v / r.total) * 100}%`, background: color }} title={`${v}`} /> : null;
                  })}
                </div>
                <div className="tnum text-right text-[13px] text-sub">{f.num(r.total)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
};

const Dashboard = () => {
  const p = useProject()!;
  const t = useT();
  const f = useFmt();
  const navigate = useNavigate();
  const { approveReport, rejectReport, updateTask } = useStore.getState();
  const stats = useMemo(() => projectStats(p), [p]);
  const [review, setReview] = useState<string | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);

  const pending = p.reports.filter((r) => r.status === "pending");
  const pendingRfis = (p.rfis ?? []).filter((r) => r.status === "pending");
  const openIssues = p.issues.filter((i) => i.status !== "resolved");
  const threads = (p.threads ?? [])
    .filter((x) => x.status === "open")
    .sort(
      (a, b) =>
        Number(threadUnread(b, "manager")) - Number(threadUnread(a, "manager")) ||
        Number(threadAwaits(b, "manager")) - Number(threadAwaits(a, "manager")) ||
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
  const tasks = p.tasks
    .filter((x) => x.status !== "done")
    .sort((a, b) => (a.priority === "high" ? -1 : 0) - (b.priority === "high" ? -1 : 0) || (a.due ?? "9").localeCompare(b.due ?? "9"));
  const first = stats.perAction[0];
  const daysLeft = p.endDate ? Math.ceil((new Date(`${p.endDate}T23:59:59`).getTime() - Date.now()) / 86400000) : null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight md:text-[28px]">{p.name}</h1>
          <div className="mt-1 text-sm text-sub">
            {[t(KIND_LABEL[p.kind] ?? p.kind), p.client, p.location, p.startDate && t("Started {d}", { d: f.date(p.startDate) })].filter(Boolean).join("  ·  ")}
          </div>
        </div>
        <div className="text-sm md:text-right">
          <div className="text-sub">{t("Updated {d}", { d: f.dateTime(p.updatedAt) })}</div>
          <div className="mt-0.5 inline-flex items-center gap-1.5 font-semibold text-ok">
            <span className="h-2 w-2 animate-pulse rounded-full bg-ok" />
            {stats.total && stats.pct === 100 ? t("Project complete") : t("Project in progress")}
          </div>
        </div>
      </div>

      <GettingStarted p={p} />

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="panel col-span-2 flex items-center gap-4 p-4 sm:col-span-1 md:p-5">
          <div className="relative shrink-0">
            <Ring pct={stats.pct} size={92} stroke={10} />
            <span className="tnum absolute inset-0 grid place-items-center text-xl font-extrabold">{stats.pct}%</span>
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-bold">{t("Readiness")}</div>
            <div className="mt-1 text-[13px] text-sub">{t("{n} complete", { n: f.num(stats.complete) })}</div>
            {daysLeft !== null && <div className="text-[13px] text-sub">{daysLeft >= 0 ? t("{n} days to deadline", { n: daysLeft }) : t("Deadline passed")}</div>}
          </div>
        </div>
        <Link to={`/p/${p.id}/registry`} className="panel group flex items-start gap-3 p-4 transition hover:border-cat/50 md:p-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cat-soft text-cat">
            <Cable className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-sub">{t("Cables")}</div>
            <div className="tnum text-[28px] font-extrabold leading-tight">{f.num(stats.total)}</div>
            <div className="text-[13px] text-sub">{t("{n} not started", { n: f.num(stats.notStarted) })}</div>
          </div>
        </Link>
        <div className="panel flex items-start gap-3 p-4 md:p-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ok-soft text-ok">
            <Check className="h-5 w-5" strokeWidth={3} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-sub">{first ? t(first.action.name) : t("Stages")}</div>
            <div className="tnum text-[28px] font-extrabold leading-tight">{f.num(first?.done ?? 0)}</div>
            <div className="text-[13px] text-sub">
              {stats.total ? t("{n}% of plan", { n: Math.round(((first?.done ?? 0) / stats.total) * 100) }) : "—"}
            </div>
          </div>
        </div>
        <Link to={`/p/${p.id}/issues`} className={cn("panel flex items-start gap-3 p-4 transition md:p-5", stats.openIssues ? "border-bad/40 hover:border-bad" : "hover:border-ink/30")}>
          <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", stats.openIssues ? "bg-bad-soft text-bad" : "bg-[#EEF1EC] text-sub")}>
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-sub">{t("Issues")}</div>
            <div className={cn("tnum text-[28px] font-extrabold leading-tight", stats.openIssues && "text-bad")}>{stats.openIssues}</div>
            <div className="text-[13px] text-sub">{stats.criticalIssues ? t("{n} critical", { n: stats.criticalIssues }) : t("Need attention")}</div>
          </div>
        </Link>
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Section
          title={t("Crew report queue")}
          count={pending.length}
          action={
            <Link to={`/p/${p.id}/reports`} className="inline-flex items-center gap-1 text-[13px] font-medium text-cat hover:underline">
              {t("All reports")} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {pending.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <CheckCircle2 className="mb-2 h-8 w-8 text-ok" />
              <div className="text-sm font-semibold">{t("No reports waiting")}</div>
              <p className="mt-1 max-w-xs text-[13px] text-sub">{t("Crews send reports from their link. Nothing changes in the registry until you approve.")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-[#F5F7F3] text-left text-[12.5px] text-sub">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold md:px-5">{t("Crew")}</th>
                    <th className="px-3 py-2.5 font-semibold">{t("Date")}</th>
                    <th className="px-3 py-2.5 font-semibold">{t("Cables")}</th>
                    <th className="px-3 py-2.5 font-semibold">{t("Status")}</th>
                    <th className="px-4 py-2.5 text-right font-semibold md:px-5">{t("Actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pending.slice(0, 6).map((r) => (
                    <tr key={r.id} className="cursor-pointer hover:bg-[#F7F9F5]" onClick={() => setReview(r.id)}>
                      <td className="px-4 py-2.5 md:px-5">
                        <div className="font-semibold">{r.linkName}</div>
                        <div className="text-xs text-sub">
                          #{r.number} · {r.submittedByName}
                          {r.issues.length > 0 && <span className="ml-1 font-semibold text-bad">· {t("{n} issues", { n: r.issues.length })}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">{f.short(r.date)}</td>
                      <td className="tnum px-3 py-2.5">{r.cables.length}</td>
                      <td className="px-3 py-2.5">
                        <ReportStatusBadge s={r.status} />
                      </td>
                      <td className="px-4 py-2.5 md:px-5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            className="bg-ok hover:bg-ok/90"
                            onClick={() => {
                              approveReport(p.id, r.id, { cableEntryIds: r.cables.map((c) => c.id), issueIds: r.issues.map((i) => i.id), comment: "" });
                              toast.success(t("Report #{n} approved — registry updated", { n: r.number }));
                            }}
                          >
                            {t("Approve")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-bad/40 text-bad hover:bg-bad-soft hover:text-bad"
                            onClick={() => {
                              rejectReport(p.id, r.id, "");
                              toast(t("Report #{n} rejected", { n: r.number }));
                            }}
                          >
                            {t("Reject")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t px-5 py-2 text-xs text-sub">{t("Click a row to review line by line.")}</div>
            </div>
          )}
        </Section>
        <StageChart p={p} />
      </div>

      {pendingRfis.length > 0 && (
        <div className="mb-5">
          <Section
            title={t("Change requests (RFI)")}
            count={pendingRfis.length}
            action={
              <Link to={`/p/${p.id}/rfi`} className="inline-flex items-center gap-1 text-[13px] font-medium text-cat hover:underline">
                {t("All RFIs")} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          >
            <RfiReviewList p={p} list={pendingRfis.slice(0, 4)} />
          </Section>
        </div>
      )}

      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <Section
          title={t("Issues")}
          count={openIssues.length}
          action={
            <Link to={`/p/${p.id}/issues`} className="inline-flex items-center gap-1 text-[13px] font-medium text-cat hover:underline">
              {t("All issues")} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {openIssues.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-sub">{t("No open issues")}</div>
          ) : (
            <ul className="divide-y">
              {openIssues.slice(0, 5).map((i) => {
                const c = i.code ? p.cables.find((x) => normCode(x.code) === normCode(i.code!)) : undefined;
                return (
                  <li key={i.id}>
                    <Link to={c ? `/p/${p.id}/registry/cable/${c.id}` : `/p/${p.id}/issues`} className="flex gap-3 px-4 py-3 hover:bg-[#F7F9F5] md:px-5">
                      <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-black text-white", i.severity === "high" ? "bg-bad" : i.severity === "medium" ? "bg-fiber" : "bg-sub")}>!</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {i.title}
                          {i.code && <span className="ml-1 font-mono text-[13px] text-cat">{i.code}</span>}
                        </span>
                        <span className="block text-xs text-sub">{f.dateTime(i.createdAt)} · {i.reportedBy}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section
          title={t("Messages")}
          count={stats.unreadMessages}
          action={
            <Link to={`/p/${p.id}/messages`} className="inline-flex items-center gap-1 text-[13px] font-medium text-cat hover:underline">
              {t("All conversations")} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {threads.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-sub">{t("Open conversations with clients and crews appear here.")}</div>
          ) : (
            <ul className="divide-y">
              {threads.slice(0, 5).map((x) => {
                const unread = threadUnread(x, "manager");
                const lp = lastPost(x);
                return (
                  <li key={x.id}>
                    <button onClick={() => navigate(`/p/${p.id}/messages?t=${x.id}`)} className="flex w-full gap-3 px-4 py-3 text-left hover:bg-[#F7F9F5] md:px-5">
                      <Avatar name={x.startedSide === "external" ? x.startedBy : x.linkName} who={x.linkType} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={cn("min-w-0 truncate text-sm", unread ? "font-bold" : "font-semibold")}>{x.subject}</span>
                          {x.priority !== "normal" && <ThreadPriorityBadge p={x.priority} />}
                        </span>
                        <span className="block truncate text-xs text-sub">
                          {lp.side === "manager" ? t("Manager") : lp.by}: {lp.text}
                        </span>
                        <span className="block text-[11px] text-sub">
                          {x.linkName} · {f.dateTime(x.updatedAt)}
                          {threadAwaits(x, "manager") && <span className="ml-1 font-semibold text-brand-deep">· {t("Needs reply")}</span>}
                        </span>
                      </span>
                      {unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section
          title={t("Open tasks")}
          count={tasks.length}
          action={
            <div className="flex items-center gap-3">
              <button onClick={() => setTaskOpen(true)} className="grid h-7 w-7 place-items-center rounded-md text-brand hover:bg-brand-soft" aria-label={t("New task")}>
                <Plus className="h-4 w-4" />
              </button>
              <Link to={`/p/${p.id}/tasks`} className="inline-flex items-center gap-1 text-[13px] font-medium text-cat hover:underline">
                {t("All tasks")} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          }
        >
          {tasks.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-sub">{t("No open tasks")}</div>
          ) : (
            <ul className="divide-y">
              {tasks.slice(0, 5).map((x) => (
                <li key={x.id} className="flex gap-3 px-4 py-3 md:px-5">
                  <button
                    onClick={() => {
                      updateTask(p.id, x.id, { status: "done" });
                      toast.success(t("Task completed"));
                    }}
                    className="mt-0.5 text-sub hover:text-ok"
                    aria-label={t("Mark done")}
                  >
                    <Circle className="h-5 w-5" />
                  </button>
                  <button onClick={() => navigate(`/p/${p.id}/tasks?open=${x.id}`)} className="min-w-0 text-left">
                    <span className="block truncate text-sm font-medium">{x.title}</span>
                    <span className="block text-xs text-sub">
                      {x.due ? <span className={cn(x.due < today && "font-semibold text-bad")}>{f.short(x.due)}</span> : t("No due date")}
                      {x.priority === "high" && <span className="ml-1 font-semibold text-bad">· {t("High priority")}</span>}
                      {x.assigneeIds.length > 0 && ` · ${x.assigneeIds.map((id) => p.employees.find((e) => e.id === id)?.name).filter(Boolean).join(", ")}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title={<><ActivityIcon className="h-4 w-4 text-sub" /> {t("Recent activity")}</>}>
        <ul className="grid gap-x-6 px-4 py-2 md:grid-cols-2 md:px-5">
          {[...p.activity].sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0)).slice(0, 12).map((a) => (
            <li key={a.id} className="flex items-baseline gap-3 border-b border-dashed py-2 text-sm last:border-0">
              <span className="tnum w-24 shrink-0 text-xs text-sub">{f.dateTime(a.at)}</span>
              <span className="min-w-0 truncate">
                {a.by && <span className="mr-1.5 font-semibold text-ink">{a.by}</span>}
                {a.text}
              </span>
              {a.kind === "approve" && <Badge t="green" className="ml-auto">{t("Review")}</Badge>}
            </li>
          ))}
        </ul>
      </Section>

      <ReviewDrawer p={p} report={p.reports.find((r) => r.id === review)} onClose={() => setReview(null)} />
      <TaskDialog p={p} open={taskOpen} onOpenChange={setTaskOpen} />
    </>
  );
};

export default Dashboard;
