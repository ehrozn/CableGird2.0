import {
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileText,
  ListFilter,
  MessageSquareWarning,
  MessagesSquare,
  Minus,
  Package,
  Plus,
  RotateCcw,
  Search,
  Send,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  Badge,
  EmptyState,
  NativeSelect,
  PriorityBadge,
  ReportStatusBadge,
  TaskStatusBadge,
} from "@/components/common";
import { CablePickerDialog } from "@/components/CablePicker";
import { searchCables } from "@/lib/cable-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FieldInput, RfiDialog, RfiList, useShowValue } from "@/components/rfi";
import {
  allColumns,
  cableIndex,
  isFilled,
  lastAction,
  uniqueColumns,
} from "@/lib/derive";
import {
  cleanCode,
  closestCodes,
  normCode,
  textMatches,
  todayStr,
  uid,
  natCmp,
} from "@/lib/ids";
import { useFmt, useT } from "@/lib/i18n";
import { buildGate } from "@/lib/auto";
import { setActor } from "@/lib/me";
import { useStore } from "@/lib/store";
import type {
  Access,
  Cable,
  CableStages,
  Column,
  Employee,
  PortalLink,
  Project,
  ReportIssue,
  Severity,
  WorkAction,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  CableUnfinished,
  codesInText,
  type EntryStop,
  outcomeProblems,
  TaskOutcome,
  type TaskDraft,
} from "@/components/board/ReportBits";
import { activeClaims, stageMap, trackedStages } from "@/lib/board";

import { LinkGate, PortalTop } from "./PortalShell";
import { PortalThreads, portalUnread } from "./PortalThreads";

interface Entry {
  id: string;
  code: string;
  isNew: boolean;
  actionIds: string[];
  reason: string;
  note: string;
  values: Record<string, string>;
  /** "not finished?" opened for this line */
  unfinished?: boolean;
  stages?: CableStages;
  stop?: EntryStop;
}
interface Draft {
  date: string;
  crewSize: number;
  workerIds: string[];
  tasks: Record<string, TaskDraft>;
  entries: Entry[];
  issues: ReportIssue[];
  materials: Record<string, string>;
  extra: { name: string; qty: string; unit: string }[];
  notes: string;
}
const emptyDraft = (meId: string): Draft => ({
  date: todayStr(),
  crewSize: 1,
  workerIds: meId ? [meId] : [],
  tasks: {},
  entries: [],
  issues: [],
  materials: {},
  extra: [],
  notes: "",
});

const Card = ({
  title,
  action,
  children,
  n,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  n?: number;
}) => (
  <section className="panel rise">
    <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 md:px-5">
      <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
        {title}
        {n ? (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">
            {n}
          </span>
        ) : null}
      </h2>
      {action}
    </header>
    <div className="p-4 md:p-5">{children}</div>
  </section>
);

const ALL_ACCESS: Access[] = ["tasks", "reports", "issues"];

/* ------------------------------ Report form ------------------------------ */

/** Progress-column chips: one per stage, toggled per cable. ✓ marks stages already done in the registry. */
const StageChips = ({
  acts,
  value,
  done,
  onToggle,
  blocked,
}: {
  acts: WorkAction[];
  value: string[];
  done?: Record<string, string>;
  onToggle: (id: string) => void;
  /** stage order: name of the stage that must be done first, or null */
  blocked?: (id: string) => string | null;
}) => {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-1.5">
      {acts.map((a) => {
        const on = value.includes(a.id);
        const was = !!done?.[a.id];
        const needs = !on ? (blocked?.(a.id) ?? null) : null;
        return (
          <button
            key={a.id}
            type="button"
            aria-pressed={on}
            disabled={!!needs}
            onClick={() => onToggle(a.id)}
            title={
              needs
                ? t("Needs “{b}” first", { b: t(needs) })
                : was
                  ? t("Already done — marking it again counts as a repeat")
                  : undefined
            }
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition active:scale-95",
              on
                ? "border-transparent text-white shadow-sm"
                : "bg-white text-ink/80 hover:border-ink/30",
              needs && "cursor-not-allowed opacity-40 active:scale-100",
            )}
            style={on ? { background: a.color } : undefined}
          >
            {on ? (
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            ) : (
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: a.color }}
              />
            )}
            {t(a.name)}
            {was && (
              <span
                className={cn(
                  "text-[11px] font-medium",
                  on ? "text-white/80" : "text-sub",
                )}
              >
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

const ReportForm = ({
  p,
  link,
  me,
  access,
  onDone,
}: {
  p: Project;
  link: PortalLink;
  me: Employee | null;
  meName: string;
  access: Access[];
  onDone: (n: number) => void;
}) => {
  const t = useT();
  const submitReport = useStore((s) => s.submitReport);
  const meId = me?.id ?? "";
  // one draft per link on this device: picking a name (or the crew list changing) must never lose it
  const draftKey = `cg-draft-${link.id}`;
  const [d, setD] = useState<Draft>(() => {
    try {
      const raw =
        localStorage.getItem(draftKey) ??
        localStorage.getItem(`${draftKey}-${meId || "anon"}`) ??
        localStorage.getItem(`${draftKey}-anon`);
      if (raw) {
        const x = { ...emptyDraft(meId), ...JSON.parse(raw) } as Draft;
        x.entries = x.entries.map((e) => {
          const old = e as Entry & { actionId?: string };
          return {
            ...e,
            actionIds: old.actionIds ?? (old.actionId ? [old.actionId] : []),
          };
        });
        if (meId && !x.workerIds.includes(meId))
          x.workerIds = [meId, ...x.workerIds];
        return x;
      }
    } catch {
      /* ignore */
    }
    return emptyDraft(meId);
  });
  useEffect(() => {
    const id = setTimeout(
      () => localStorage.setItem(draftKey, JSON.stringify(d)),
      300,
    );
    return () => clearTimeout(id);
  }, [d, draftKey]);
  // save right away when the form goes away (name picker, tab switch), not 300 ms later
  const latest = useRef(d);
  latest.current = d;
  useEffect(
    () => () => {
      localStorage.setItem(draftKey, JSON.stringify(latest.current));
    },
    [draftKey],
  );

  const index = useMemo(() => cableIndex(p.cables), [p.cables]);
  const cols = useMemo(() => allColumns(p), [p]);
  const [adder, setAdder] = useState<"find" | "new" | null>(null);
  const [mode, setMode] = useState<string>("id");
  const [browse, setBrowse] = useState(false);
  const [q, setQ] = useState("");
  const [groupVal, setGroupVal] = useState("");
  const [allActs, setAllActs] = useState<string[]>([]);
  const [tried, setTried] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const showValue = useShowValue();
  const ucols = useMemo(() => uniqueColumns(p), [p]);
  const colById = useMemo(() => new Map(ucols.map((c) => [c.id, c])), [ucols]);
  const dataCols = useMemo(() => ucols.filter((c) => !c.progress), [ucols]);
  /** progress columns marked with one tap (checkbox / date) vs. typed ones (text, list, number) */
  const markIds = useMemo(
    () =>
      new Set(
        ucols
          .filter(
            (c) => c.progress && (c.type === "checkbox" || c.type === "date"),
          )
          .map((c) => c.id),
      ),
    [ucols],
  );
  const markActs = useMemo(
    () => p.actions.filter((a) => markIds.has(a.id)),
    [p.actions, markIds],
  );
  const typedProg = useMemo(
    () => ucols.filter((c) => c.progress && !markIds.has(c.id)),
    [ucols, markIds],
  );
  const hasProgress = markActs.length + typedProg.length > 0;
  const datalists = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const c of ucols) {
      if (c.type !== "text") continue;
      const set = new Set<string>();
      for (const cab of p.cables) {
        const v = (cab.values[c.id] ?? "").trim();
        if (v) set.add(v);
        if (set.size > 200) break;
      }
      if (set.size) out[c.id] = [...set].sort((a, b) => natCmp(a, b));
    }
    return out;
  }, [ucols, p.cables]);
  const [rfiFor, setRfiFor] = useState<Cable | null>(null);
  const [nc, setNc] = useState<{
    code: string;
    values: Record<string, string>;
    actionIds: string[];
  }>({ code: "", values: {}, actionIds: [] });

  // find modes: by ID + every column the manager created (with values in the registry)
  const pickCols = useMemo(
    () =>
      cols.filter((c) =>
        p.cables.some((cab) => (cab.values[c.id] ?? "").trim()),
      ),
    [cols, p.cables],
  );
  const groupColId = mode === "id" ? "" : mode;
  const groupValues = useMemo(() => {
    if (!groupColId) return [];
    const m = new Map<string, number>();
    for (const c of p.cables) {
      const v = (c.values[groupColId] ?? "").trim();
      if (v) m.set(v, (m.get(v) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => natCmp(a[0], b[0]));
  }, [p.cables, groupColId]);

  const selected = new Set(d.entries.map((e) => normCode(e.code)));
  const allCodes = useMemo(() => p.cables.map((c) => c.code), [p.cables]);
  const { candidates, missing } = useMemo(() => {
    type Cand = { code: string; cable: Cable };
    if (mode === "id") {
      const raw = q.trim();
      const s = normCode(raw);
      if (!raw) return { candidates: [] as Cand[], missing: [] as string[] };
      // shared search: one ID, any value, a pasted list or a range like C-001..C-040
      const res = searchCables(p.cables, raw, new Set(index.keys()));
      const hits = res.query.kind === "text" ? res.hits.slice(0, 100) : res.hits;
      const out: Cand[] = hits.map((c) => ({ code: c.code, cable: c }));
      if (res.query.kind === "text") {
        const exact = index.get(s);
        return { candidates: out, missing: out.length || exact ? [] : [cleanCode(raw)] };
      }
      return { candidates: out, missing: res.missing.map(cleanCode) };
    }
    if (!groupColId || !groupVal)
      return { candidates: [] as Cand[], missing: [] as string[] };
    return {
      candidates: p.cables
        .filter((c) => (c.values[groupColId] ?? "").trim() === groupVal)
        .sort((a, b) => natCmp(a.code, b.code))
        .map((c) => ({ code: c.code, cable: c })),
      missing: [] as string[],
    };
  }, [mode, q, groupColId, groupVal, p.cables, index]);

  const addEntry = (code: string, extra?: Partial<Entry>) => {
    const k = normCode(code);
    if (!k || selected.has(k)) return;
    selected.add(k);
    const exists = index.has(k);
    setD((x) => ({
      ...x,
      entries: [
        ...x.entries,
        {
          id: uid(),
          code: exists ? index.get(k)!.code : cleanCode(code),
          isNew: !exists,
          actionIds: [...allActs],
          reason: "",
          note: "",
          values: {},
          ...extra,
        },
      ],
    }));
  };
  const removeEntry = (code: string) =>
    setD((x) => ({
      ...x,
      entries: x.entries.filter((e) => normCode(e.code) !== normCode(code)),
    }));
  const patchEntry = (id: string, v: Partial<Entry>) =>
    setD((x) => ({
      ...x,
      entries: x.entries.map((e) => (e.id === id ? { ...e, ...v } : e)),
    }));
  const gate = useMemo(() => buildGate(p), [p]);
  const toggleEntryAct = (e: Entry, aid: string) =>
    patchEntry(e.id, {
      actionIds: e.actionIds.includes(aid)
        ? e.actionIds.filter((x) => x !== aid)
        : p.actions
            .filter((a) => a.id === aid || e.actionIds.includes(a.id))
            .map((a) => a.id),
    });
  const toggleAllAct = (aid: string) => {
    const on = !allActs.includes(aid);
    setAllActs(on ? [...allActs, aid] : allActs.filter((x) => x !== aid));
    setD((x) => ({
      ...x,
      entries: x.entries.map((e) => ({
        ...e,
        actionIds: on
          ? p.actions
              .filter((a) => a.id === aid || e.actionIds.includes(a.id))
              .map((a) => a.id)
          : e.actionIds.filter((y) => y !== aid),
      })),
    }));
  };
  /** progress columns filled on this report line */
  const entryProg = (e: {
    actionIds: string[];
    values: Record<string, string>;
  }) => [
    ...e.actionIds.filter((a) => markIds.has(a)),
    ...typedProg
      .filter((c) => isFilled(c.type, e.values[c.id]))
      .map((c) => c.id),
  ];
  const repeatedActs = (e: Entry) => {
    const c = index.get(normCode(e.code));
    return c ? entryProg(e).filter((a) => !!c.done[a]) : [];
  };
  const lineValues = (e: Entry, isNew: boolean) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(e.values)) {
      const col = colById.get(k);
      if (!col || !v.trim()) continue;
      if (isNew || (col.progress && !markIds.has(k))) out[k] = v.trim();
    }
    for (const a of e.actionIds) {
      const col = colById.get(a);
      if (!col || !markIds.has(a)) continue;
      out[a] =
        col.type === "date" ? (isNew && e.values[a]?.trim()) || d.date : "yes";
    }
    return out;
  };
  const isRepeat = (e: Entry) => repeatedActs(e).length > 0;

  const ncKey = normCode(nc.code);
  const ncExisting = ncKey ? index.get(ncKey) : undefined;
  const ncInReport = !!ncKey && selected.has(ncKey);
  const createNew = () => {
    if (!ncKey || ncInReport) return;
    const progVals = Object.fromEntries(
      typedProg
        .filter((c) => (nc.values[c.id] ?? "").trim())
        .map((c) => [c.id, nc.values[c.id].trim()]),
    );
    if (ncExisting)
      addEntry(ncExisting.code, { actionIds: nc.actionIds, values: progVals });
    else {
      const values = Object.fromEntries(
        Object.entries(nc.values)
          .filter(([k, v]) => v.trim() && !markIds.has(k))
          .map(([k, v]) => [k, v.trim()]),
      );
      addEntry(nc.code, { actionIds: nc.actionIds, values });
    }
    toast.success(
      t("{id} added to the report", {
        id: ncExisting?.code ?? cleanCode(nc.code),
      }),
    );
    setNc({ code: "", values: {}, actionIds: [...allActs] });
  };

  // people's tasks, the crew's board tasks and free tasks somebody of this crew took
  const myTasks = p.tasks.filter(
    (tk) =>
      tk.status !== "done" &&
      (tk.assigneeIds.includes(meId) ||
        tk.assigneeIds.some((a) => link.memberIds.includes(a)) ||
        tk.crewLinkId === link.id ||
        activeClaims(tk).some((c) => c.linkId === link.id)),
  );
  const tracked = useMemo(() => trackedStages(stageMap(p)), [p]);
  const [codesSeen, setCodesSeen] = useState("");
  const mentioned = codesInText(d.notes, index, selected, normCode);
  const askCodes = mentioned.length > 0 && codesSeen !== mentioned.join(",");
  const crewPeople = (
    link.memberIds.length
      ? p.employees.filter((e) => link.memberIds.includes(e.id))
      : p.employees
  ).filter((e) => e.active);
  const extraPeople = p.employees.filter(
    (e) => e.active && !crewPeople.includes(e),
  );
  const [showAllPeople, setShowAllPeople] = useState(false);

  const missingReasons = d.entries.filter(
    (e) => isRepeat(e) && !e.reason.trim(),
  );
  const doneTasks = Object.entries(d.tasks).filter(
    ([, v]) => v.outcome || v.done || Number(v.hours) > 0,
  );
  const badOutcomes = doneTasks.filter(
    ([, v]) => outcomeProblems(v).length > 0,
  );
  const materials = [
    ...Object.entries(d.materials)
      .filter(([, q]) => Number(q) > 0)
      .map(([name, q]) => ({ name, qty: Number(q), unit: t("pcs") })),
    ...d.extra
      .filter((m) => m.name.trim() && Number(m.qty) > 0)
      .map((m) => ({
        name: m.name.trim(),
        qty: Number(m.qty),
        unit: m.unit || t("pcs"),
      })),
  ];
  const isEmpty =
    !d.entries.length &&
    !doneTasks.length &&
    !d.issues.length &&
    !materials.length &&
    !d.notes.trim();

  const submit = () => {
    setTried(true);
    if (missingReasons.length) {
      toast.error(t("Add a reason for every repeated work"));
      document
        .getElementById("cables-card")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (badOutcomes.length) {
      toast.error(t("Fill in the required fields for unfinished tasks"));
      document
        .getElementById("tasks-card")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (isEmpty) {
      toast.error(t("The report is empty"));
      return;
    }
    if (askCodes) {
      toast.info(
        t(
          "Your notes mention cables that are not in the report. Add them or ignore.",
        ),
      );
      document
        .getElementById("notes-card")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const n = submitReport(p.id, {
      linkId: link.id,
      linkName: link.name,
      date: d.date,
      submittedBy: meId,
      submittedByName: me?.name ?? link.name,
      crewSize: d.crewSize,
      workerIds: d.workerIds,
      tasks: doneTasks.map(([taskId, v]) => {
        const open = v.outcome === "partial" || v.outcome === "not_done";
        return {
          taskId,
          done: v.outcome ? v.outcome === "done" : v.done,
          hours: Number(v.hours) || 0,
          note: v.note,
          outcome: v.outcome,
          didText:
            v.outcome === "partial"
              ? v.didText?.trim() || undefined
              : undefined,
          leftText:
            v.outcome === "partial"
              ? v.leftText?.trim() || undefined
              : undefined,
          reason: open ? v.reason || undefined : undefined,
          reasonNote: open ? v.reasonNote?.trim() || undefined : undefined,
          needs: open ? v.needs?.trim() || undefined : undefined,
          blocked: open ? !!v.blocked : undefined,
        };
      }),
      cables: d.entries.map((e) => {
        const isNew = !index.has(normCode(e.code));
        const values = lineValues(e, isNew);
        return {
          id: e.id,
          code: e.code,
          isNew,
          cableId: index.get(normCode(e.code))?.id,
          actionIds: entryProg(e),
          repeat: isRepeat(e),
          reason: e.reason.trim() || undefined,
          note: e.note.trim() || undefined,
          values: Object.keys(values).length ? values : undefined,
          stages:
            e.unfinished && e.stages && Object.keys(e.stages).length
              ? e.stages
              : undefined,
          stop:
            e.unfinished && e.stop
              ? {
                  ...e.stop,
                  note: e.stop.note?.trim() || undefined,
                  needs: e.stop.needs?.trim() || undefined,
                }
              : undefined,
        };
      }),
      materials,
      issues: d.issues.filter((i) => i.title.trim()),
      notes: d.notes.trim(),
    });
    localStorage.removeItem(draftKey);
    localStorage.removeItem(`${draftKey}-${meId || "anon"}`);
    localStorage.removeItem(`${draftKey}-anon`);
    latest.current = emptyDraft(meId);
    setD(latest.current);
    setTried(false);
    onDone(n);
  };

  const ncFilled = dataCols.filter((c) =>
    (nc.values[c.id] ?? "").trim(),
  ).length;

  return (
    <div className="space-y-4 pb-28">
      <Card title={t("Crew and date")}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="mb-1.5 text-[13px] font-semibold">{t("Crew")}</div>
            <div className="flex h-10 items-center rounded-lg border bg-[#F6F8F5] px-3 text-sm font-semibold">
              {link.name}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[13px] font-semibold">
              {t("Responsible")}
            </div>
            <div className="flex h-10 items-center gap-2 rounded-lg border bg-[#F6F8F5] px-3 text-sm">
              <UserRound className="h-4 w-4 text-sub" />
              {me?.name ?? link.name}
            </div>
          </div>
          <label>
            <div className="mb-1.5 text-[13px] font-semibold">
              {t("Work date")}
            </div>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sub" />
              <Input
                type="date"
                value={d.date}
                max={todayStr()}
                onChange={(e) =>
                  setD({ ...d, date: e.target.value || todayStr() })
                }
                className="pl-9"
              />
            </div>
          </label>
          <div>
            <div className="mb-1.5 text-[13px] font-semibold">
              {t("People on site: {n}", { n: d.crewSize })}
            </div>
            <div className="flex h-10 items-stretch overflow-hidden rounded-lg border bg-white">
              <button
                className="grid w-11 place-items-center border-r hover:bg-muted"
                onClick={() =>
                  setD({ ...d, crewSize: Math.max(1, d.crewSize - 1) })
                }
                aria-label="-"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                inputMode="numeric"
                value={d.crewSize}
                onChange={(e) =>
                  setD({
                    ...d,
                    crewSize: Math.max(
                      1,
                      Math.min(
                        200,
                        Number(e.target.value.replace(/\D/g, "")) || 1,
                      ),
                    ),
                  })
                }
                className="tnum w-full min-w-0 text-center text-sm font-semibold outline-none"
                aria-label={t("People on site")}
              />
              <button
                className="grid w-11 place-items-center border-l hover:bg-muted"
                onClick={() => setD({ ...d, crewSize: d.crewSize + 1 })}
                aria-label="+"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
        {crewPeople.length + extraPeople.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 text-[13px] font-semibold">
              {t("Who worked")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[...crewPeople, ...(showAllPeople ? extraPeople : [])].map(
                (e) => {
                  const on = d.workerIds.includes(e.id);
                  return (
                    <button
                      key={e.id}
                      onClick={() => {
                        const w = on
                          ? d.workerIds.filter((x) => x !== e.id)
                          : [...d.workerIds, e.id];
                        setD({
                          ...d,
                          workerIds: w,
                          crewSize: Math.max(d.crewSize, w.length),
                        });
                      }}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition",
                        on
                          ? "border-ink bg-ink text-white"
                          : "bg-white hover:border-ink/40",
                      )}
                    >
                      {on && <Check className="h-3.5 w-3.5" />}
                      {e.name}
                    </button>
                  );
                },
              )}
              {extraPeople.length > 0 && !showAllPeople && (
                <button
                  onClick={() => setShowAllPeople(true)}
                  className="rounded-full border border-dashed px-3 py-1 text-sm text-sub hover:text-ink"
                >
                  + {t("Other people")}
                </button>
              )}
            </div>
          </div>
        )}
      </Card>

      {myTasks.length > 0 && (
        <div id="tasks-card" className="scroll-mt-20">
          <Card title={t("Today's tasks")} n={myTasks.length}>
            <div className="divide-y">
              {myTasks.map((tk) => {
                const v: TaskDraft = d.tasks[tk.id] ?? {
                  done: false,
                  hours: "",
                  note: "",
                };
                const set = (x: Partial<TaskDraft>) =>
                  setD((cur) => ({
                    ...cur,
                    tasks: {
                      ...cur.tasks,
                      [tk.id]: {
                        ...(cur.tasks[tk.id] ?? {
                          done: false,
                          hours: "",
                          note: "",
                        }),
                        ...x,
                      },
                    },
                  }));
                return (
                  <div
                    key={tk.id}
                    className="space-y-2 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold">{tk.title}</div>
                        <div className="flex flex-wrap gap-x-3 text-xs text-sub">
                          {tk.location && <span>{tk.location}</span>}
                          {tk.cableCodes.length > 0 && (
                            <span className="truncate font-mono">
                              {tk.cableCodes.join(", ")}
                            </span>
                          )}
                          {tk.free ? (
                            <span>{t("Free task")}</span>
                          ) : tk.crewLinkId === link.id ? (
                            <span>{t("Crew task")}</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Input
                          inputMode="decimal"
                          value={v.hours}
                          onChange={(e) =>
                            set({
                              hours: e.target.value
                                .replace(/[^\d.,]/g, "")
                                .replace(",", "."),
                            })
                          }
                          placeholder="0"
                          className="tnum h-9 w-20"
                          aria-label={t("Hours")}
                        />
                        <span className="text-sm text-sub">{t("h")}</span>
                      </div>
                    </div>
                    <TaskOutcome
                      task={tk}
                      link={link}
                      value={v}
                      onChange={set}
                      tried={tried}
                    />
                    <Input
                      value={v.note}
                      onChange={(e) => set({ note: e.target.value })}
                      placeholder={t("Place / note")}
                      className="h-9"
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      <div id="cables-card" className="scroll-mt-20">
        <Card
          title={t("Cables")}
          n={d.entries.length}
          action={
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant={adder === "find" ? "default" : "outline"}
                onClick={() => setAdder(adder === "find" ? null : "find")}
                disabled={!p.cables.length}
              >
                <Search className="h-4 w-4" /> {t("Find in registry")}
              </Button>
              <Button
                size="sm"
                variant={adder === "new" ? "default" : "outline"}
                onClick={() => {
                  if (adder !== "new")
                    setNc((x) => ({
                      ...x,
                      actionIds: x.code ? x.actionIds : [...allActs],
                    }));
                  setAdder(adder === "new" ? null : "new");
                }}
              >
                <Plus className="h-4 w-4" /> {t("Create new cable")}
              </Button>
            </div>
          }
        >
          {adder === "find" && (
            <div className="rise mb-4 rounded-xl border border-cat/25 bg-cat-soft/30 p-3">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <div className="flex flex-wrap gap-1 rounded-lg border bg-white p-1">
                  {[
                    { id: "id", name: t("By ID") },
                    ...pickCols.map((c) => ({ id: c.id, name: c.name })),
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setMode(m.id);
                        setGroupVal("");
                      }}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm font-medium transition",
                        mode === m.id
                          ? "bg-cat text-white shadow-sm"
                          : "text-sub hover:text-ink",
                      )}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
                {mode === "id" ? (
                  <div className="relative min-w-[220px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sub" />
                    <Input
                      autoFocus
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && candidates.length) {
                          candidates.forEach((c) => addEntry(c.code));
                          setQ("");
                        }
                      }}
                      placeholder={t(
                        "ID, any value, a list of IDs or a range C-001..C-040",
                      )}
                      className="bg-white pl-9 pr-9 font-mono"
                    />
                    {q && (
                      <button
                        onClick={() => setQ("")}
                        className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded hover:bg-muted"
                        aria-label={t("Clear")}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ) : (
                  <NativeSelect
                    value={groupVal}
                    onChange={setGroupVal}
                    className="min-w-[180px] flex-1 bg-white"
                    aria-label={t("Value")}
                  >
                    <option value="">{t("Choose…")}</option>
                    {groupValues.map(([v, n]) => (
                      <option key={v} value={v}>
                        {v} ({n})
                      </option>
                    ))}
                  </NativeSelect>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-10 shrink-0 bg-white"
                  onClick={() => setBrowse(true)}
                >
                  <ListFilter className="h-4 w-4" /> {t("Browse with filters")}
                </Button>
              </div>
              <CablePickerDialog
                open={browse}
                onOpenChange={setBrowse}
                p={p}
                value={d.entries.filter((e) => !e.isNew).map((e) => e.code)}
                title={t("Add cables to the report")}
                onApply={(codes) => {
                  const keep = new Set(codes.map(normCode));
                  for (const e of d.entries)
                    if (!e.isNew && !keep.has(normCode(e.code))) removeEntry(e.code);
                  codes.forEach((c) => addEntry(c));
                }}
              />

              {candidates.length > 0 && (
                <div className="mt-2 overflow-hidden rounded-lg border bg-white">
                  <div className="flex items-center justify-between border-b bg-[#F6F8F5] px-3 py-2 text-[13px]">
                    <span className="text-sub">
                      {t("{n} found", { n: candidates.length })}
                    </span>
                    <button
                      className="font-semibold text-cat hover:underline"
                      onClick={() => {
                        candidates.forEach((c) => addEntry(c.code));
                        setQ("");
                      }}
                    >
                      {t("Add all")}
                    </button>
                  </div>
                  <div className="scrollbar-thin max-h-64 overflow-y-auto">
                    {candidates.map(({ code, cable }) => {
                      const on = selected.has(normCode(code));
                      const la = lastAction(cable, p.actions);
                      return (
                        <button
                          key={code}
                          onClick={() =>
                            on ? removeEntry(code) : addEntry(code)
                          }
                          className={cn(
                            "flex w-full items-center gap-3 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted",
                            on && "bg-brand-soft/60",
                          )}
                        >
                          <span
                            className={cn(
                              "grid h-5 w-5 place-items-center rounded border",
                              on
                                ? "border-brand bg-brand text-white"
                                : "bg-white",
                            )}
                          >
                            {on && <Check className="h-3.5 w-3.5" />}
                          </span>
                          <span className="w-28 font-mono font-semibold">
                            {code}
                          </span>
                          <span className="hidden flex-1 truncate text-sub sm:block">
                            {cols
                              .slice(0, 3)
                              .map((c) => cable.values[c.id])
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          {la ? (
                            <Badge t="blue">{t(la.name)}</Badge>
                          ) : (
                            <Badge t="gray">{t("Not started")}</Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {missing.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-brand/40 bg-white px-3 py-2 text-[13px]">
                  <span className="text-sub">
                    {t("Not in registry: {ids}", {
                      ids:
                        missing.slice(0, 6).join(", ") +
                        (missing.length > 6 ? "…" : ""),
                    })}
                  </span>
                  <button
                    className="ml-auto font-semibold text-brand-deep hover:underline"
                    onClick={() => {
                      if (missing.length === 1) {
                        setNc({
                          code: missing[0],
                          values: {},
                          actionIds: [...allActs],
                        });
                        setAdder("new");
                      } else {
                        missing.forEach((m) => addEntry(m));
                        setQ("");
                      }
                    }}
                  >
                    {missing.length === 1
                      ? t("Create as new cable")
                      : t("Add all as new cables")}
                  </button>
                </div>
              )}
              {missing.length === 1 &&
                !candidates.length &&
                (() => {
                  const near = closestCodes(allCodes, missing[0]);
                  return near.length ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px]">
                      <span className="text-sub">{t("Did you mean")}</span>
                      {near.map((c) => (
                        <button
                          key={c}
                          onClick={() => setQ(c)}
                          className="rounded-full border bg-white px-2.5 py-0.5 font-mono text-xs font-semibold hover:border-brand hover:text-brand-deep"
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  ) : null;
                })()}
              {!candidates.length && !missing.length && (
                <p className="mt-2 text-[13px] text-sub">
                  {mode === "id"
                    ? t("Start typing — matching cables appear here.")
                    : t("Pick a value to see its cables.")}
                </p>
              )}
            </div>
          )}

          {adder === "new" && (
            <form
              className="rise mb-4 rounded-xl border border-brand/30 bg-brand-soft/30 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                createNew();
              }}
            >
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-[13px]">
                  <span className="mb-1 block font-semibold">
                    {t("Cable ID")} *
                  </span>
                  <Input
                    autoFocus
                    value={nc.code}
                    onChange={(e) =>
                      setNc({ ...nc, code: e.target.value.toUpperCase() })
                    }
                    placeholder="A-0001"
                    className="bg-white font-mono"
                  />
                </label>
                {!ncExisting &&
                  dataCols.map((c) => (
                    <label key={c.id} className="text-[13px]">
                      <span
                        className={cn(
                          "mb-1 block truncate",
                          (nc.values[c.id] ?? "").trim()
                            ? "font-semibold text-ink"
                            : "text-sub",
                        )}
                      >
                        {c.name}
                      </span>
                      <FieldInput
                        col={c}
                        value={nc.values[c.id] ?? ""}
                        list={datalists[c.id] ? `dl-${c.id}` : undefined}
                        onChange={(v) =>
                          setNc({ ...nc, values: { ...nc.values, [c.id]: v } })
                        }
                      />
                    </label>
                  ))}
              </div>
              {!ncExisting && dataCols.length > 0 && (
                <p
                  className={cn(
                    "mt-2 text-xs",
                    ncFilled < dataCols.length ? "text-brand-deep" : "text-ok",
                  )}
                >
                  {t(
                    "Fill in every registry column: {n} of {m} filled. The manager approves the new cable before it enters the registry.",
                    { n: ncFilled, m: dataCols.length },
                  )}
                </p>
              )}
              {ncExisting && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-cat/30 bg-white px-3 py-2 text-[13px]">
                  <Search className="h-4 w-4 text-cat" />
                  <span>
                    {ncInReport
                      ? t("{id} is already in this report.", {
                          id: ncExisting.code,
                        })
                      : t(
                          "{id} already exists in the registry — it will be added as the existing cable.",
                          { id: ncExisting.code },
                        )}
                  </span>
                </div>
              )}
              {hasProgress && (
                <div className="mt-3">
                  <div className="mb-1.5 text-[13px] font-semibold">
                    {t("Work done")}
                  </div>
                  {typedProg.length > 0 && (
                    <div className="mb-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {typedProg.map((c) => (
                        <label key={c.id} className="text-[13px]">
                          <span className="mb-1 block truncate font-semibold text-cat">
                            {c.name}
                          </span>
                          <FieldInput
                            col={c}
                            value={nc.values[c.id] ?? ""}
                            list={datalists[c.id] ? `dl-${c.id}` : undefined}
                            onChange={(v) =>
                              setNc({
                                ...nc,
                                values: { ...nc.values, [c.id]: v },
                              })
                            }
                          />
                        </label>
                      ))}
                    </div>
                  )}
                  <StageChips
                    acts={markActs}
                    value={nc.actionIds}
                    done={ncExisting?.done}
                    onToggle={(aid) =>
                      setNc({
                        ...nc,
                        actionIds: nc.actionIds.includes(aid)
                          ? nc.actionIds.filter((x) => x !== aid)
                          : p.actions
                              .filter(
                                (a) =>
                                  a.id === aid || nc.actionIds.includes(a.id),
                              )
                              .map((a) => a.id),
                      })
                    }
                  />
                </div>
              )}
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setAdder(null)}
                >
                  {t("Close")}
                </Button>
                <Button type="submit" disabled={!ncKey || ncInReport}>
                  <Plus className="h-4 w-4" />{" "}
                  {ncExisting ? t("Add existing cable") : t("Add to report")}
                </Button>
              </div>
            </form>
          )}

          {d.entries.length > 0 && markActs.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold text-sub">
                {t("Mark for all:")}
              </span>
              <StageChips
                acts={markActs}
                value={allActs}
                onToggle={toggleAllAct}
              />
            </div>
          )}

          {d.entries.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-sub">
              <ClipboardList className="mx-auto mb-2 h-6 w-6 text-sub/60" />
              {t(
                "No cables in this report yet. Find them in the registry or create a new one.",
              )}
            </div>
          ) : (
            <div className="divide-y rounded-lg border">
              {d.entries.map((e) => {
                const cable = index.get(normCode(e.code));
                const rep = repeatedActs(e);
                const needReason = rep.length > 0 && !e.reason.trim();
                return (
                  <div
                    key={e.id}
                    className={cn(
                      "px-3 py-2.5",
                      rep.length > 0 && "bg-fiber-soft/40",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-28 font-mono text-sm font-bold text-cat">
                        {e.code}
                      </span>
                      {!cable && <Badge t="orange">{t("New")}</Badge>}
                      {rep.length > 0 && (
                        <Badge t="yellow">
                          <RotateCcw className="h-3 w-3" /> {t("Repeat")}
                        </Badge>
                      )}
                      <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
                        {markActs.length > 0 ? (
                          <StageChips
                            acts={markActs}
                            value={e.actionIds}
                            done={cable?.done}
                            onToggle={(aid) => toggleEntryAct(e, aid)}
                            blocked={
                              gate.active
                                ? (aid) => {
                                    const vals = { ...(cable?.values ?? {}) };
                                    for (const x of e.actionIds)
                                      vals[x] ||= "1";
                                    const b = gate.block(vals, aid, true);
                                    return b ? (gate.names.get(b) ?? b) : null;
                                  }
                                : undefined
                            }
                          />
                        ) : !hasProgress ? (
                          <span className="text-xs text-sub">
                            {t("No progress columns yet")}
                          </span>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-sub"
                          onClick={() =>
                            setExpanded(expanded === e.id ? null : e.id)
                          }
                          aria-expanded={expanded === e.id}
                        >
                          {cable ? t("Cable data") : t("Fill in data")}
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 transition",
                              expanded === e.id && "rotate-180",
                            )}
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeEntry(e.code)}
                          aria-label={t("Remove")}
                        >
                          <Trash2 className="h-4 w-4 text-bad" />
                        </Button>
                      </div>
                    </div>
                    {typedProg.length > 0 && (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {typedProg.map((c) => (
                          <label key={c.id} className="text-[13px]">
                            <span className="mb-1 flex items-baseline gap-1.5">
                              <span className="truncate font-semibold text-cat">
                                {c.name}
                              </span>
                              {cable && cable.values[c.id] && (
                                <span className="truncate text-[11px] text-sub">
                                  {t("now: {v}", {
                                    v: showValue(c, cable.values[c.id]),
                                  })}
                                </span>
                              )}
                            </span>
                            <FieldInput
                              col={c}
                              value={e.values[c.id] ?? ""}
                              list={datalists[c.id] ? `dl-${c.id}` : undefined}
                              onChange={(v) =>
                                patchEntry(e.id, {
                                  values: { ...e.values, [c.id]: v },
                                })
                              }
                            />
                          </label>
                        ))}
                      </div>
                    )}
                    {rep.length > 0 && (
                      <div className="mt-2">
                        <Input
                          value={e.reason}
                          onChange={(ev) =>
                            patchEntry(e.id, { reason: ev.target.value })
                          }
                          placeholder={t(
                            "Why is this work repeated? (required)",
                          )}
                          className={cn(
                            "h-9",
                            tried &&
                              needReason &&
                              "border-bad ring-2 ring-bad/20",
                          )}
                        />
                        {tried && needReason && (
                          <p className="mt-1 text-xs text-bad">
                            {t("Reason is required for repeated work")}
                          </p>
                        )}
                      </div>
                    )}
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() =>
                          patchEntry(e.id, {
                            unfinished: !e.unfinished,
                            stop: e.stop ?? { blocked: false },
                          })
                        }
                        aria-expanded={!!e.unfinished}
                        className={cn(
                          "text-[13px] font-semibold underline-offset-2 hover:underline",
                          e.unfinished ? "text-fiber-deep" : "text-sub",
                        )}
                      >
                        {e.unfinished
                          ? t("Not finished — hide")
                          : t("Not finished?")}
                      </button>
                      {e.unfinished && (
                        <div className="mt-2">
                          <CableUnfinished
                            tracked={tracked}
                            stages={e.stages ?? {}}
                            stop={e.stop ?? { blocked: false }}
                            onChange={(x) => patchEntry(e.id, x)}
                          />
                        </div>
                      )}
                    </div>
                    {expanded === e.id && (
                      <div className="rise mt-2 space-y-2">
                        <Input
                          value={e.note}
                          onChange={(ev) =>
                            patchEntry(e.id, { note: ev.target.value })
                          }
                          placeholder={t("Note")}
                          className="h-9"
                        />
                        {cable ? (
                          <div className="rounded-lg border bg-[#F6F8F5] p-3">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[13px] font-semibold text-sub">
                                {t("Registry data (read-only)")}
                              </span>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 bg-white"
                                onClick={() => setRfiFor(cable)}
                              >
                                <MessageSquareWarning className="h-4 w-4 text-brand" />{" "}
                                {t("Request change (RFI)")}
                              </Button>
                            </div>
                            <dl className="grid gap-x-4 gap-y-1 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
                              {ucols.map((c) => (
                                <div
                                  key={c.id}
                                  className="flex min-w-0 items-baseline gap-2"
                                >
                                  <dt
                                    className={cn(
                                      "shrink-0 truncate",
                                      c.progress ? "text-cat" : "text-sub",
                                    )}
                                  >
                                    {c.name}:
                                  </dt>
                                  <dd className="truncate font-medium">
                                    {showValue(c, cable.values[c.id])}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                        ) : (
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {dataCols.map((c) => (
                              <label key={c.id} className="text-[13px]">
                                <span className="mb-1 block truncate text-sub">
                                  {c.name}
                                </span>
                                <FieldInput
                                  col={c}
                                  value={e.values[c.id] ?? ""}
                                  list={
                                    datalists[c.id] ? `dl-${c.id}` : undefined
                                  }
                                  onChange={(v) =>
                                    patchEntry(e.id, {
                                      values: { ...e.values, [c.id]: v },
                                    })
                                  }
                                />
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        {Object.entries(datalists).map(([id, vs]) => (
          <datalist key={id} id={`dl-${id}`}>
            {vs.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        ))}
        <RfiDialog
          p={p}
          link={link}
          cable={rfiFor}
          by={{ id: meId, name: me?.name ?? link.name }}
          open={!!rfiFor}
          onOpenChange={(v) => !v && setRfiFor(null)}
        />
      </div>

      {access.includes("issues") && (
        <Card
          title={t("Problems on site")}
          n={d.issues.length}
          action={
            <Button
              size="sm"
              variant="ghost"
              className="text-cat"
              onClick={() =>
                setD({
                  ...d,
                  issues: [
                    ...d.issues,
                    {
                      id: uid(),
                      title: "",
                      description: "",
                      severity: "medium",
                      code: "",
                    },
                  ],
                })
              }
            >
              <Plus className="h-4 w-4" /> {t("Add problem")}
            </Button>
          }
        >
          {d.issues.length === 0 ? (
            <p className="text-sm text-sub">
              {t(
                "No conduit, damaged cable, blocked access? Report it here — the manager reviews it with the report.",
              )}
            </p>
          ) : (
            <div className="space-y-3">
              {d.issues.map((i) => {
                const set = (v: Partial<ReportIssue>) =>
                  setD({
                    ...d,
                    issues: d.issues.map((x) =>
                      x.id === i.id ? { ...x, ...v } : x,
                    ),
                  });
                return (
                  <div
                    key={i.id}
                    className="grid gap-2 rounded-lg border border-bad/30 bg-bad-soft/40 p-3 sm:grid-cols-[140px_1fr_140px_auto]"
                  >
                    <Input
                      value={i.code ?? ""}
                      onChange={(e) =>
                        set({ code: e.target.value.toUpperCase() })
                      }
                      placeholder={t("Cable ID")}
                      className="h-9 bg-white font-mono"
                      list="crew-codes"
                    />
                    <Input
                      value={i.title}
                      onChange={(e) => set({ title: e.target.value })}
                      placeholder={t("What is wrong?")}
                      className="h-9 bg-white"
                    />
                    <NativeSelect
                      value={i.severity}
                      onChange={(v) => set({ severity: v as Severity })}
                      className="h-9"
                      aria-label={t("Severity")}
                    >
                      <option value="low">{t("Low")}</option>
                      <option value="medium">{t("Medium")}</option>
                      <option value="high">{t("Critical")}</option>
                    </NativeSelect>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setD({
                          ...d,
                          issues: d.issues.filter((x) => x.id !== i.id),
                        })
                      }
                      aria-label={t("Remove")}
                    >
                      <Trash2 className="h-4 w-4 text-bad" />
                    </Button>
                    <Textarea
                      value={i.description}
                      onChange={(e) => set({ description: e.target.value })}
                      placeholder={t("Details")}
                      rows={2}
                      className="bg-white sm:col-span-4"
                    />
                  </div>
                );
              })}
              <datalist id="crew-codes">
                {d.entries.map((e) => (
                  <option key={e.id} value={e.code} />
                ))}
              </datalist>
            </div>
          )}
        </Card>
      )}

      <Card
        title={t("Materials used")}
        action={
          <Button
            size="sm"
            variant="ghost"
            className="text-cat"
            onClick={() =>
              setD({
                ...d,
                extra: [...d.extra, { name: "", qty: "", unit: t("pcs") }],
              })
            }
          >
            <Plus className="h-4 w-4" /> {t("Other material")}
          </Button>
        }
      >
        {p.materials.length === 0 && d.extra.length === 0 && (
          <p className="text-sm text-sub">
            {t("Add anything you used: connectors, ties, tape, conduit…")}
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {p.materials.map((m) => (
            <label
              key={m}
              className="flex items-center gap-2 rounded-lg border bg-white p-2.5"
            >
              <Package className="h-5 w-5 shrink-0 text-sub" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {m}
              </span>
              <Input
                inputMode="decimal"
                value={d.materials[m] ?? ""}
                onChange={(e) =>
                  setD({
                    ...d,
                    materials: {
                      ...d.materials,
                      [m]: e.target.value
                        .replace(/[^\d.,]/g, "")
                        .replace(",", "."),
                    },
                  })
                }
                className="tnum h-9 w-20"
                placeholder="0"
              />
            </label>
          ))}
        </div>
        {d.extra.length > 0 && (
          <div className="mt-2 space-y-2">
            {d.extra.map((m, i) => {
              const set = (v: Partial<typeof m>) =>
                setD({
                  ...d,
                  extra: d.extra.map((x, j) => (j === i ? { ...x, ...v } : x)),
                });
              return (
                <div key={i} className="flex gap-2">
                  <Input
                    value={m.name}
                    onChange={(e) => set({ name: e.target.value })}
                    placeholder={t("Material name")}
                    className="h-9 flex-1"
                  />
                  <Input
                    inputMode="decimal"
                    value={m.qty}
                    onChange={(e) =>
                      set({
                        qty: e.target.value
                          .replace(/[^\d.,]/g, "")
                          .replace(",", "."),
                      })
                    }
                    placeholder="0"
                    className="tnum h-9 w-20"
                  />
                  <Input
                    value={m.unit}
                    onChange={(e) => set({ unit: e.target.value })}
                    className="h-9 w-20"
                    aria-label={t("Unit")}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setD({ ...d, extra: d.extra.filter((_, j) => j !== i) })
                    }
                    aria-label={t("Remove")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div id="notes-card" className="scroll-mt-20">
        <Card title={t("Notes for the manager")}>
          <Textarea
            value={d.notes}
            onChange={(e) => setD({ ...d, notes: e.target.value })}
            rows={3}
            placeholder={t("Anything else worth knowing about today")}
          />
          {askCodes && (
            <div className="rise mt-3 rounded-lg border border-cat/30 bg-cat/5 p-3">
              <div className="text-[13px] font-semibold">
                {t("Cables found in your notes. Add them to the report?")}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {mentioned.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => addEntry(c)}
                    className="rounded-full border bg-white px-2.5 py-1 font-mono text-xs font-bold text-cat hover:border-cat"
                  >
                    + {c}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => mentioned.forEach((c) => addEntry(c))}
                >
                  {t("Add all")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setCodesSeen(mentioned.join(","))}
                >
                  {t("Ignore")}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-3 py-3 md:px-6">
          <div className="hidden text-sm text-sub sm:block">
            {t("{n} cables", { n: d.entries.length })} ·{" "}
            {t("{n} tasks", { n: doneTasks.length })}
            {missingReasons.length > 0 && (
              <span className="ml-2 text-bad">
                · {t("{n} reasons missing", { n: missingReasons.length })}
              </span>
            )}
          </div>
          {!isEmpty && (
            <Button
              variant="ghost"
              onClick={() =>
                confirm(t("Clear this draft?")) && setD(emptyDraft(meId))
              }
            >
              {t("Clear")}
            </Button>
          )}
          <Button
            size="lg"
            className="flex-1 sm:ml-auto sm:max-w-sm"
            onClick={submit}
          >
            <Send className="h-4 w-4" /> {t("Send for review")}
          </Button>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------ Tasks ------------------------------ */

const MyTasks = ({
  p,
  link,
  me,
}: {
  p: Project;
  link: PortalLink;
  me: Employee | null;
}) => {
  const t = useT();
  const fmt = useFmt();
  const { updateTask, addTaskComment } = useStore.getState();
  const [showDone, setShowDone] = useState(false);
  const [comment, setComment] = useState<Record<string, string>>({});
  const ids = me ? [me.id] : link.memberIds;
  const tasks = p.tasks.filter(
    (tk) =>
      (tk.assigneeIds.some((a) => ids.includes(a)) ||
        tk.crewLinkId === link.id ||
        activeClaims(tk).some(
          (c) => c.linkId === link.id && (!me || c.empId === me.id || !c.empId),
        )) &&
      (showDone || tk.status !== "done"),
  );
  const name = me?.name ?? link.name;
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <label className="flex items-center gap-2 text-sm text-sub">
          <input
            type="checkbox"
            checked={showDone}
            onChange={(e) => setShowDone(e.target.checked)}
            className="accent-[#FF5A1F]"
          />
          {t("Show completed")}
        </label>
      </div>
      {tasks.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<ClipboardList />}
            title={t("No tasks right now")}
            text={t("When the manager assigns you work, it shows up here.")}
          />
        </div>
      ) : (
        tasks.map((tk) => (
          <div
            key={tk.id}
            className={cn(
              "panel rise p-4",
              tk.status === "done" && "opacity-70",
            )}
          >
            <div className="flex items-start gap-3">
              {tk.free || tk.crewLinkId ? (
                <span
                  className={cn(
                    "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border-2",
                    tk.status === "done"
                      ? "border-ok bg-ok text-white"
                      : "border-dashed border-[#B9C1B6]",
                  )}
                  title={t("Closed by the foreman's report")}
                >
                  {tk.status === "done" && <Check className="h-4 w-4" />}
                </span>
              ) : (
                <button
                  onClick={() =>
                    updateTask(
                      p.id,
                      tk.id,
                      { status: tk.status === "done" ? "todo" : "done" },
                      name,
                    )
                  }
                  className={cn(
                    "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 transition",
                    tk.status === "done"
                      ? "border-ok bg-ok text-white"
                      : "border-[#B9C1B6] hover:border-ok",
                  )}
                  aria-label={t("Mark done")}
                >
                  {tk.status === "done" && <Check className="h-4 w-4" />}
                </button>
              )}
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "font-semibold",
                    tk.status === "done" && "line-through",
                  )}
                >
                  {tk.title}
                </div>
                {(tk.free || tk.crewLinkId) && tk.status !== "done" && (
                  <div className="text-xs text-sub">
                    {t("Report the result in the daily report.")}
                  </div>
                )}
                {tk.location && (
                  <div className="text-xs text-sub">{tk.location}</div>
                )}
                {tk.description && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-sub">
                    {tk.description}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-sub">
                  <TaskStatusBadge s={tk.status} />
                  <PriorityBadge p={tk.priority} />
                  {tk.due && (
                    <span>{t("Due {d}", { d: fmt.short(tk.due) })}</span>
                  )}
                </div>
                {tk.cableCodes.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {tk.cableCodes.map((c) => (
                      <span
                        key={c}
                        className="rounded border bg-[#F6F8F5] px-1.5 py-0.5 font-mono text-xs"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}
                {tk.comments.length > 0 && (
                  <div className="mt-3 space-y-1.5 border-l-2 pl-3">
                    {tk.comments.map((c) => (
                      <div key={c.id} className="text-sm">
                        <span className="font-semibold">
                          {c.by === "Manager" ? t("Manager") : c.by}
                        </span>{" "}
                        <span className="text-xs text-sub">
                          {fmt.dateTime(c.at)}
                        </span>
                        <div className="text-sub">{c.text}</div>
                      </div>
                    ))}
                  </div>
                )}
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = comment[tk.id]?.trim();
                    if (!v) return;
                    addTaskComment(p.id, tk.id, name, v);
                    setComment({ ...comment, [tk.id]: "" });
                  }}
                >
                  <Input
                    value={comment[tk.id] ?? ""}
                    onChange={(e) =>
                      setComment({ ...comment, [tk.id]: e.target.value })
                    }
                    placeholder={t("Comment for the manager")}
                    className="h-9"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    disabled={!comment[tk.id]?.trim()}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

/* ------------------------------ History ------------------------------ */

const MyReports = ({
  p,
  link,
  me,
}: {
  p: Project;
  link: PortalLink;
  me: Employee | null;
}) => {
  const t = useT();
  const fmt = useFmt();
  // the whole crew shares the link: every report sent through it stays visible, whoever sent it
  const reports = p.reports.filter((r) => r.linkId === link.id);
  if (!reports.length)
    return (
      <div className="panel">
        <EmptyState
          icon={<FileText />}
          title={t("No reports yet")}
          text={t("Reports you send appear here with the manager's decision.")}
        />
      </div>
    );
  return (
    <div className="space-y-3">
      {reports.map((r) => (
        <div key={r.id} className="panel rise p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold">#{r.number}</span>
            <span className="font-semibold">{fmt.date(r.date)}</span>
            <span className="text-sm text-sub">· {r.submittedByName}</span>
            {me && r.submittedBy === me.id && (
              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand-deep">
                {t("You")}
              </span>
            )}
            <span className="ml-auto">
              <ReportStatusBadge s={r.status} />
            </span>
          </div>
          <div className="mt-2 text-sm text-sub">
            {t("{n} cables", { n: r.cables.length })} ·{" "}
            {t("{n} people", { n: r.crewSize })} ·{" "}
            {t("{n} h", { n: r.tasks.reduce((a, x) => a + x.hours, 0) })}
            {r.issues.length > 0 &&
              ` · ${t("{n} problems", { n: r.issues.length })}`}
          </div>
          {r.cables.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {r.cables.slice(0, 30).map((c) => (
                <span
                  key={c.id}
                  className={cn(
                    "rounded border px-1.5 py-0.5 font-mono text-xs",
                    c.approved === true && "border-ok/40 bg-ok-soft text-ok",
                    c.approved === false &&
                      r.status !== "pending" &&
                      "border-bad/30 bg-bad-soft text-bad line-through",
                  )}
                >
                  {c.code}
                </span>
              ))}
              {r.cables.length > 30 && (
                <span className="text-xs text-sub">
                  +{r.cables.length - 30}
                </span>
              )}
            </div>
          )}
          {r.managerComment && (
            <div className="mt-3 rounded-lg bg-[#F6F8F5] p-3 text-sm">
              <span className="font-semibold">{t("Manager")}:</span>{" "}
              {r.managerComment}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

/* ------------------------------ RFI ------------------------------ */

const MyRfis = ({
  p,
  link,
  me,
}: {
  p: Project;
  link: PortalLink;
  me: Employee | null;
}) => {
  const t = useT();
  const [q, setQ] = useState("");
  const [cable, setCable] = useState<Cable | null>(null);
  const rfis = (p.rfis ?? []).filter((r) => r.linkId === link.id);
  const s = normCode(q);
  const found = q.trim()
    ? p.cables.filter((c) => normCode(c.code).includes(s)).slice(0, 8)
    : [];
  return (
    <div className="space-y-4">
      <section className="panel rise p-4 md:p-5">
        <h2 className="flex items-center gap-2 text-[15px] font-bold">
          <MessageSquareWarning className="h-5 w-5 text-brand" /> {t("New RFI")}
        </h2>
        <p className="mt-1 text-sm text-sub">
          {t(
            "Found a mistake in the registry — wrong ID, IDF, route? Find the cable and request a change. Progress is reported in the daily report.",
          )}
        </p>
        <div className="relative mt-3 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sub" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("Cable ID")}
            className="pl-9 font-mono"
          />
        </div>
        {found.length > 0 && (
          <div className="mt-2 flex max-w-md flex-col overflow-hidden rounded-lg border bg-white">
            {found.map((c) => (
              <button
                key={c.id}
                onClick={() => setCable(c)}
                className="flex items-center justify-between border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted"
              >
                <span className="font-mono font-semibold">{c.code}</span>
                <span className="text-xs font-semibold text-brand-deep">
                  {t("Request change (RFI)")}
                </span>
              </button>
            ))}
          </div>
        )}
        {s && !found.length && (
          <p className="mt-2 text-sm text-sub">{t("Nothing found")}</p>
        )}
      </section>
      {rfis.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<MessageSquareWarning />}
            title={t("No RFIs yet")}
            text={t(
              "Your change requests and the manager's decisions appear here.",
            )}
          />
        </div>
      ) : (
        <RfiList rfis={rfis} />
      )}
      <RfiDialog
        p={p}
        link={link}
        cable={cable}
        by={{ id: me?.id ?? "", name: me?.name ?? link.name }}
        open={!!cable}
        onOpenChange={(v) => !v && setCable(null)}
      />
    </div>
  );
};

/* ------------------------------ Shell ------------------------------ */

/** "I'm not on the list": reports go out under the crew link's name */
const NOBODY = "-";

const CrewInner = ({ p, link }: { p: Project; link: PortalLink }) => {
  const t = useT();
  const meKey = `cg-me-${link.id}`;
  const members = (
    link.memberIds.length
      ? p.employees.filter((e) => link.memberIds.includes(e.id))
      : p.employees
  ).filter((e) => e.active);
  const [meId, setMeId] = useState<string>(
    () => localStorage.getItem(meKey) ?? "",
  );
  // the crew list is live: a picked person who was removed falls back to the picker, a single member is picked for you
  const picked = members.find((e) => e.id === meId) ?? null;
  const me =
    picked ?? (meId !== NOBODY && members.length === 1 ? members[0] : null);
  const [tab, setTab] = useState<
    "report" | "tasks" | "history" | "rfi" | "messages"
  >("report");
  const [sent, setSent] = useState<number | null>(null);
  const [attach, setAttach] = useState<string[]>([]);

  const actorName = me?.name ?? null;
  useEffect(() => {
    setActor(actorName, "person");
  }, [actorName]);

  const needPick = members.length > 1 && !me && meId !== NOBODY;
  const access = me ? me.access : ALL_ACCESS;
  const openTasks = p.tasks.filter(
    (tk) =>
      tk.status !== "done" &&
      tk.assigneeIds.some((a) =>
        me ? a === me.id : link.memberIds.includes(a),
      ),
  ).length;

  if (needPick)
    return (
      <div className="blueprint min-h-dvh">
        <PortalTop p={p} title={link.name} />
        <div className="mx-auto max-w-md p-4 pt-10">
          <h1 className="text-2xl font-extrabold">{t("Who are you?")}</h1>
          <p className="mt-1 text-sm text-sub">
            {t("Pick your name to see your tasks and send reports.")}
          </p>
          <div className="mt-5 space-y-2">
            {members.map((e) => (
              <button
                key={e.id}
                onClick={() => {
                  setMeId(e.id);
                  localStorage.setItem(meKey, e.id);
                }}
                className="panel flex w-full items-center gap-3 p-4 text-left transition hover:border-brand"
              >
                <span className="grid h-10 w-10 place-items-center rounded-full bg-ink text-sm font-bold text-white">
                  {e.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="font-semibold">{e.name}</span>
              </button>
            ))}
            <button
              onClick={() => {
                setMeId(NOBODY);
                localStorage.setItem(meKey, NOBODY);
              }}
              className="w-full rounded-xl border border-dashed bg-white/60 p-3.5 text-sm font-semibold text-sub transition hover:border-brand hover:text-ink"
            >
              {t("I'm not on the list — continue as {crew}", {
                crew: link.name,
              })}
            </button>
          </div>
        </div>
      </div>
    );

  const tabs = [
    access.includes("reports") && {
      id: "report" as const,
      label: t("New report"),
      icon: Send,
    },
    access.includes("tasks") && {
      id: "tasks" as const,
      label: t("My tasks"),
      icon: ClipboardList,
      n: openTasks,
    },
    { id: "history" as const, label: t("My reports"), icon: FileText },
    {
      id: "messages" as const,
      label: t("Messages"),
      icon: MessagesSquare,
      n: portalUnread(p, link),
    },
    {
      id: "rfi" as const,
      label: "RFI",
      icon: MessageSquareWarning,
      n: (p.rfis ?? []).filter(
        (r) => r.linkId === link.id && r.status === "pending",
      ).length,
    },
  ].filter(Boolean) as {
    id: "report" | "tasks" | "history" | "rfi" | "messages";
    label: string;
    icon: typeof Send;
    n?: number;
  }[];
  const cur = tabs.some((x) => x.id === tab) ? tab : tabs[0].id;

  return (
    <div className="blueprint min-h-dvh">
      <PortalTop
        p={p}
        title={link.name}
        right={
          members.length > 1 && (me || meId === NOBODY) ? (
            <button
              onClick={() => {
                localStorage.removeItem(meKey);
                setMeId("");
              }}
              className="hidden items-center gap-2 rounded-lg border bg-white px-2.5 py-1.5 text-sm sm:flex"
            >
              <UserRound className="h-4 w-4 text-sub" /> {me?.name ?? link.name}
            </button>
          ) : me ? (
            <span className="hidden text-sm font-semibold sm:block">
              {me.name}
            </span>
          ) : null
        }
      />
      <main className="mx-auto max-w-[1200px] px-3 py-5 md:px-6">
        {sent !== null ? (
          <div className="panel rise mx-auto max-w-md p-8 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-ok-soft text-ok">
              <CheckCircle2 className="h-9 w-9" />
            </div>
            <h1 className="mt-4 text-2xl font-extrabold">
              {t("Report #{n} sent", { n: sent })}
            </h1>
            <p className="mt-2 text-sm text-sub">
              {t(
                "The manager will review it. The registry updates only after approval.",
              )}
            </p>
            <div className="mt-6 flex justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSent(null);
                  setTab("history");
                }}
              >
                {t("My reports")}
              </Button>
              <Button onClick={() => setSent(null)}>{t("New report")}</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight md:text-[28px]">
                  {cur === "report"
                    ? t("Crew report")
                    : cur === "tasks"
                      ? t("My tasks")
                      : cur === "rfi"
                        ? t("Change requests (RFI)")
                        : cur === "messages"
                          ? t("Messages")
                          : t("My reports")}
                </h1>
                {cur === "report" && (
                  <p className="mt-1 text-sm text-sub">
                    {t(
                      "Fill in the work done and send the report for review. Your draft is saved on this device.",
                    )}
                  </p>
                )}
              </div>
              <nav
                className="scrollbar-thin flex gap-1 overflow-x-auto rounded-lg border bg-white p-1"
                aria-label={t("Sections")}
              >
                {tabs.map((x) => (
                  <button
                    key={x.id}
                    onClick={() => setTab(x.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition",
                      cur === x.id
                        ? "bg-ink text-white"
                        : "text-sub hover:text-ink",
                    )}
                  >
                    <x.icon className="h-4 w-4" />
                    {x.label}
                    {!!x.n && (
                      <span className="rounded-full bg-brand px-1.5 text-[11px] text-white">
                        {x.n}
                      </span>
                    )}
                  </button>
                ))}
              </nav>
            </div>
            {cur === "report" && (
              <ReportForm
                p={p}
                link={link}
                me={me}
                meName={me?.name ?? link.name}
                access={access}
                onDone={setSent}
              />
            )}
            {cur === "tasks" && <MyTasks p={p} link={link} me={me} />}
            {cur === "history" && <MyReports p={p} link={link} me={me} />}
            {cur === "rfi" && <MyRfis p={p} link={link} me={me} />}
            {cur === "messages" && (
              <PortalThreads
                p={p}
                link={link}
                me={me?.name ?? link.name}
                attach={attach}
                setAttach={setAttach}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
};

const CrewPortal = () => (
  <LinkGate>{(p, link) => <CrewInner p={p} link={link} />}</LinkGate>
);
export default CrewPortal;
