import { normCode } from "./ids";
import type { Cable, Column, Issue, Project, ReportCableEntry, Sheet, Thread, ThreadPriority, ThreadSide, WorkAction } from "./types";

/** Progress columns (stages) of a sheet, in column order. */
export const sheetStages = (p: Project, sheet: Sheet | undefined): WorkAction[] =>
  (sheet?.columns ?? []).filter((c) => c.progress).map((c) => p.actions.find((a) => a.id === c.id)).filter((a): a is WorkAction => !!a);

/** Regular (non-progress) data columns of a sheet. */
export const dataColumns = (sheet: Sheet | undefined): Column[] => (sheet?.columns ?? []).filter((c) => !c.progress);

const NO_VALUES = ["no", "нет", "0", "false", "-", "—"];

/** Is a value "filled" (counts as done for a progress column)? */
export const isFilled = (type: Column["type"], v: string | undefined): boolean => {
  const x = (v ?? "").trim().toLowerCase();
  if (!x) return false;
  if (type === "checkbox") return !NO_VALUES.includes(x);
  return true;
};

/** Every column of the project once (shared columns appear once), in sheet order. */
export const uniqueColumns = (p: Project): Column[] => {
  const m = new Map<string, Column>();
  for (const s of p.sheets) for (const c of s.columns) if (!m.has(c.id)) m.set(c.id, c);
  return [...m.values()];
};

/** Stages marked on a report line (supports older single-stage lines). */
export const entryActions = (e: Pick<ReportCableEntry, "actionId" | "actionIds">): string[] => e.actionIds ?? (e.actionId ? [e.actionId] : []);

export type CableState = "none" | "progress" | "complete" | "issue";

export const openIssueMap = (issues: Issue[]): Map<string, Issue[]> => {
  const m = new Map<string, Issue[]>();
  for (const i of issues) {
    if (i.status === "resolved" || !i.code) continue;
    const k = normCode(i.code);
    const arr = m.get(k);
    if (arr) arr.push(i);
    else m.set(k, [i]);
  }
  return m;
};

/**
 * No progress columns → the status comes from the cable's history: the latest
 * task event (taken / done…) or a status the manager set by hand.
 */
export const plainState = (c: Cable): "none" | "progress" | "complete" => {
  for (const h of c.history) {
    if (h.kind === "status" && h.state) return h.state;
    if (h.kind === "task" && h.outcome) return h.outcome === "done" ? "complete" : "progress";
  }
  return "none";
};

export const cablePct = (c: Cable, actions: WorkAction[]): number => {
  if (!actions.length) return plainState(c) === "complete" ? 100 : 0;
  const total = actions.reduce((a, x) => a + x.weight, 0) || 1;
  const done = actions.reduce((a, x) => a + (c.done[x.id] ? x.weight : 0), 0);
  return Math.round((done / total) * 100);
};

export const cableState = (c: Cable, actions: WorkAction[], issues: Map<string, Issue[]>): CableState => {
  if (issues.has(normCode(c.code))) return "issue";
  if (!actions.length) return plainState(c);
  const n = actions.filter((a) => c.done[a.id]).length;
  if (n === 0) return "none";
  if (n === actions.length) return "complete";
  return "progress";
};

/** Last completed action in workflow order */
export const lastAction = (c: Cable, actions: WorkAction[]): WorkAction | undefined => {
  let last: WorkAction | undefined;
  for (const a of actions) if (c.done[a.id]) last = a;
  return last;
};

export interface ProjectStats {
  total: number;
  pct: number;
  perAction: { action: WorkAction; done: number }[];
  complete: number;
  notStarted: number;
  openIssues: number;
  criticalIssues: number;
  pendingReports: number;
  unreadMessages: number;
  openTasks: number;
  overdueTasks: number;
}

export const projectStats = (p: Project): ProjectStats => {
  const total = p.cables.length;
  const totalW = p.actions.reduce((a, x) => a + x.weight, 0) || 1;
  const perAction = p.actions.map((action) => ({ action, done: 0 }));
  let sumW = 0;
  let complete = 0;
  let notStarted = 0;
  for (const c of p.cables) {
    let n = 0;
    p.actions.forEach((a, i) => {
      if (c.done[a.id]) {
        perAction[i].done++;
        sumW += a.weight;
        n++;
      }
    });
    if (n === 0) notStarted++;
    else if (n === p.actions.length) complete++;
  }
  const today = new Date().toISOString().slice(0, 10);
  const open = p.issues.filter((i) => i.status !== "resolved");
  return {
    total,
    pct: total ? Math.round((sumW / (totalW * total)) * 100) : 0,
    perAction,
    complete,
    notStarted,
    openIssues: open.length,
    criticalIssues: open.filter((i) => i.severity === "high").length,
    pendingReports: p.reports.filter((r) => r.status === "pending").length,
    unreadMessages: (p.threads ?? []).filter((x) => threadUnread(x, "manager")).length,
    openTasks: p.tasks.filter((t) => t.status !== "done").length,
    overdueTasks: p.tasks.filter((t) => t.status !== "done" && t.due && t.due < today).length,
  };
};

export const allColumns = (p: Project) => {
  const out: { id: string; name: string; sheet: string }[] = [];
  const seen = new Set<string>();
  for (const s of p.sheets)
    for (const c of s.columns) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push({ id: c.id, name: c.name, sheet: s.name });
    }
  return out;
};

export const cableIndex = (cables: Cable[]): Map<string, Cable> => {
  const m = new Map<string, Cable>();
  for (const c of cables) m.set(normCode(c.code), c);
  return m;
};

/** The other side wrote something after this side last opened the conversation. */
export const threadUnread = (th: Thread, side: ThreadSide) => {
  const seen = (side === "manager" ? th.seenManager : th.seenExternal) ?? "";
  for (let i = th.posts.length - 1; i >= 0; i--) {
    const x = th.posts[i];
    if (x.at <= seen) return false;
    if (x.side !== side && !x.system) return true;
  }
  return false;
};

/** Open conversation whose last real message came from the other side — it is this side's turn to answer. */
export const threadAwaits = (th: Thread, side: ThreadSide) => {
  if (th.status !== "open") return false;
  for (let i = th.posts.length - 1; i >= 0; i--) if (!th.posts[i].system) return th.posts[i].side !== side;
  return false;
};

export const PRIORITY_RANK: Record<ThreadPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
