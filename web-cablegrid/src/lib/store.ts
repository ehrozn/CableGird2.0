import { del, get, set } from "idb-keyval";

import { delBlob, getBlob, putBlob } from "./cloud-api";
import { who } from "./me";
import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import { MAIN_LIST, buildAuto, buildGate, cableLists, defaultList, runAuto, sheetList, type AutoCtx } from "./auto";
import { FAIL_RE, STAGE_KEYS, activeClaims, localDay, stageMap, stagesComplete, stagesFromCable, trackedStages, workKeyFor } from "./board";
import { isFilled } from "./derive";
import { normCode, nowIso, token, uid } from "./ids";
import type {
  Activity,
  Book,
  Cable,
  Column,
  ColumnDraft,
  Employee,
  HistoryEvent,
  Issue,
  Lang,
  Notice,
  PortalLink,
  SiteContact,
  ShiftSchedule,
  Project,
  Rfi,
  ProjectKind,
  Report,
  Rule,
  SavedView,
  CondFormat,
  StageFlow,
  StageKey,
  Task,
  TaskEvent,
  TaskOutcome,
  ManualState,
  ClaimOutcome,
  ReportCableEntry,
  ReportTaskEntry,
  WorkStop,
  Thread,
  ThreadPriority,
  ThreadSide,
  ThreadStatus,
  ThreadTopic,
  Units,
  WorkAction,
} from "./types";

/** Stage colours, cycled as the manager creates stages. */
export const STAGE_COLORS = ["#2563EB", "#F5C400", "#1F9D63", "#8B5CF6", "#FF5A1F", "#0EA5E9", "#E5384B", "#0B1F33"];

const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export interface NewProjectInput {
  name: string;
  client: string;
  location: string;
  kind: ProjectKind;
  description: string;
  startDate?: string;
  endDate?: string;
  units: Units;
}

export interface ImportOptions {
  /** all: create new + update existing; update: only existing cables; new: only new cables */
  mode?: "all" | "update" | "new";
  /** An empty cell in the file clears the value in the registry. */
  clearEmpty?: boolean;
}
export interface ImportStats {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
}

export interface ImportRow {
  code: string;
  values: Record<string, string>;
  /** cable lists (sheets) the row belongs to */
  lists?: string[];
}

export interface NewSheetOptions {
  bookId?: string;
  /** cable list: an existing list id (link by Cable ID) or "new" for a separate list */
  listId?: string;
}

/** Stage edits refused by the stage order in the last write (the UI shows a toast). */
export const gateReport = { blocked: 0, stage: "", needs: "" };

export interface ApproveInput {
  cableEntryIds: string[];
  issueIds: string[];
  comment: string;
}

interface State {
  projects: Project[];
  lang: Lang;
  hydrated: boolean;
  setLang: (l: Lang) => void;

  createProject: (input: NewProjectInput) => string;
  updateProject: (pid: string, patch: Partial<Project>) => void;
  deleteProject: (pid: string) => void;
  /** replace = put the backup in place of the project with the same id (keeps its cloud link). */
  restoreProject: (p: Project, asCopy: boolean, replace?: boolean) => string;

  addSheet: (pid: string, name: string, columns?: ColumnDraft[], opts?: NewSheetOptions) => string;
  addBook: (pid: string, name: string) => string;
  renameBook: (pid: string, bookId: string, name: string) => void;
  deleteBook: (pid: string, bookId: string) => void;
  moveBook: (pid: string, bookId: string, dir: -1 | 1) => void;
  moveSheetToBook: (pid: string, sheetId: string, bookId: string) => void;
  /** Put a sheet on another cable list (link by Cable ID) or its own new list. */
  setSheetList: (pid: string, sheetId: string, listId: string, copyMembers?: boolean) => void;
  addToList: (pid: string, ids: string[], listId: string) => void;
  removeFromList: (pid: string, ids: string[], listId: string) => void;
  /** Add a column of another sheet to this sheet (same values). locked = read-only lookup here. Returns an error key or null. */
  linkColumn: (pid: string, sheetId: string, srcColId: string, locked: boolean) => string | null;
  /** Break a shared column on this sheet into its own column (values are copied). */
  unlinkColumn: (pid: string, sheetId: string, colId: string, newName: string) => string | null;
  setRules: (pid: string, rules: Rule[]) => void;
  /** Run rules + formulas on every cable. Returns the number of cables changed. */
  applyAutomation: (pid: string) => number;
  setStageFlow: (pid: string, flow: StageFlow) => void;
  saveView: (pid: string, v: Omit<SavedView, "id">) => string;
  deleteView: (pid: string, id: string) => void;
  setFormats: (pid: string, formats: CondFormat[]) => void;
  saveRevision: (pid: string, name: string) => Promise<string>;
  deleteRevision: (pid: string, id: string) => void;
  renameSheet: (pid: string, sheetId: string, name: string) => void;
  deleteSheet: (pid: string, sheetId: string) => void;
  moveSheet: (pid: string, sheetId: string, dir: -1 | 1) => void;
  addColumn: (pid: string, sheetId: string, col: Omit<Column, "id">) => string;
  updateColumn: (pid: string, sheetId: string, colId: string, patch: Partial<Column>) => void;
  deleteColumn: (pid: string, sheetId: string, colId: string) => void;
  moveColumn: (pid: string, sheetId: string, colId: string, dir: -1 | 1) => void;

  addCable: (pid: string, code: string, values?: Record<string, string>, by?: string, listId?: string) => string | null;
  setCableValue: (pid: string, cableId: string, colId: string, colName: string, value: string) => void;
  renameCable: (pid: string, cableId: string, code: string) => boolean;
  toggleAction: (pid: string, cableId: string, actionId: string, on: boolean) => void;
  /** Status by hand — for registries without progress columns. */
  setCableStatus: (pid: string, cableIds: string[], state: ManualState) => void;
  deleteCables: (pid: string, ids: string[]) => void;
  bulkSetValue: (pid: string, ids: string[], colId: string, colName: string, value: string) => void;
  /** Write many cells at once (paste, fill, undo). Returns the cells that really changed, with their old values. */
  setCells: (pid: string, edits: CellEdit[], note?: string, opts?: { force?: boolean }) => CellChange[];
  bulkAction: (pid: string, ids: string[], actionId: string, on: boolean) => void;
  importRows: (pid: string, rows: ImportRow[], source: string, opts?: ImportOptions) => ImportStats;

  setActions: (pid: string, actions: WorkAction[]) => void;
  setMaterials: (pid: string, materials: string[]) => void;

  addEmployee: (pid: string, e: Omit<Employee, "id" | "createdAt">) => string;
  updateEmployee: (pid: string, id: string, patch: Partial<Employee>) => void;
  deleteEmployee: (pid: string, id: string) => void;

  addTask: (pid: string, t: Omit<Task, "id" | "createdAt" | "comments">) => { taskId: string; newLinks: string[] };
  updateTask: (pid: string, id: string, patch: Partial<Task>, by?: string) => string[];
  deleteTask: (pid: string, id: string) => void;
  addTaskComment: (pid: string, taskId: string, by: string, text: string) => void;
  /* work board */
  boardLinks: (pid: string, action: "create" | "regen" | "on" | "off") => void;
  setCableStages: (pid: string, map: Partial<Record<StageKey, string>> | undefined) => void;
  addNotice: (pid: string, n: Omit<Notice, "id" | "createdAt" | "by">) => void;
  updateNotice: (pid: string, id: string, patch: Partial<Notice>) => void;
  removeNotice: (pid: string, id: string) => void;
  addContact: (pid: string, c: Omit<SiteContact, "id">) => void;
  updateContact: (pid: string, id: string, patch: Partial<SiteContact>) => void;
  removeContact: (pid: string, id: string) => void;
  moveContact: (pid: string, id: string, dir: -1 | 1) => void;
  setSchedules: (pid: string, list: ShiftSchedule[]) => void;
  blockTask: (pid: string, id: string, stop: Omit<WorkStop, "at" | "by" | "blocked">) => void;
  unblockTask: (pid: string, id: string) => void;
  assignTask: (pid: string, id: string, a: { free: true; slots: number } | { crewLinkId: string }) => void;
  linkWork: (pid: string, workId: string, targetId: string) => void;
  releaseClaim: (pid: string, taskId: string, claimId: string) => void;
  clearConflicts: (pid: string, id: string) => void;

  addLink: (pid: string, l: Omit<PortalLink, "id" | "token" | "createdAt">) => string;
  updateLink: (pid: string, id: string, patch: Partial<PortalLink>) => void;
  deleteLink: (pid: string, id: string) => void;
  regenerateLink: (pid: string, id: string) => void;

  submitReport: (pid: string, r: Omit<Report, "id" | "number" | "status" | "submittedAt">) => number;
  approveReport: (pid: string, reportId: string, input: ApproveInput) => void;
  rejectReport: (pid: string, reportId: string, comment: string) => void;
  undoApproval: (pid: string, reportId: string) => void;

  addIssue: (pid: string, i: Omit<Issue, "id" | "createdAt" | "status">) => string;
  updateIssue: (pid: string, id: string, patch: Partial<Issue>) => void;

  submitRfi: (pid: string, r: Omit<Rfi, "id" | "number" | "status" | "createdAt">) => number;
  /** Returns an error key when the change cannot be applied (e.g. the new ID is taken). */
  approveRfi: (pid: string, id: string, comment: string) => string | null;
  rejectRfi: (pid: string, id: string, comment: string) => void;

  startThread: (pid: string, input: NewThreadInput) => string;
  postToThread: (pid: string, tid: string, post: { side: ThreadSide; by: string; text: string; cableCodes: string[] }) => void;
  setThreadStatus: (pid: string, tid: string, status: ThreadStatus, side: ThreadSide, by: string) => void;
  updateThread: (pid: string, tid: string, patch: Partial<Pick<Thread, "subject" | "topic" | "priority">>) => void;
  markThreadSeen: (pid: string, tid: string, side: ThreadSide) => void;
}

export interface NewThreadInput {
  subject: string;
  topic: ThreadTopic;
  priority: ThreadPriority;
  linkId: string;
  side: ThreadSide;
  by: string;
  text: string;
  cableCodes: string[];
}

export interface CellEdit {
  cableId: string;
  colId: string;
  value: string;
}
export interface CellChange {
  cableId: string;
  colId: string;
  from: string;
  to: string;
}


const setGate = (n: number, stage: string, needs: string) => {
  gateReport.blocked = n;
  gateReport.stage = stage;
  gateReport.needs = needs;
};

const findP = (s: State, pid: string) => s.projects.find((p) => p.id === pid);

/** Invited managers and crew / client devices may not delete (the owner decides). The app shows a toast. */
const noDelete = (s: State, pid: string) => {
  const cl = findP(s, pid)?.cloud;
  if (!cl || cl.off || cl.role === "owner") return false;
  if (typeof window !== "undefined") window.dispatchEvent(new Event("cablegrid-nodelete"));
  return true;
};

const log = (p: Project, kind: Activity["kind"], text: string) => {
  p.activity.unshift({ id: uid(), at: nowIso(), kind, text, by: who() });
  if (p.activity.length > 400) p.activity.length = 400;
  p.updatedAt = nowIso();
};

/* ───────── work board helpers ───────── */

const tlog = (t: Task, kind: TaskEvent["kind"], text: string, by = who(), reportId?: string) => {
  (t.log ??= []).push({ id: uid(), at: nowIso(), by, kind, text, reportId });
  if (t.log.length > 200) t.log.splice(0, t.log.length - 200);
};

const endClaims = (t: Task, pick: (c: NonNullable<Task["claims"]>[number]) => boolean, outcome: ClaimOutcome, reportId?: string) => {
  const at = nowIso();
  let n = 0;
  for (const c of t.claims ?? [])
    if (!c.endedAt && pick(c)) {
      c.endedAt = at;
      c.outcome = outcome;
      if (reportId) c.reportId = reportId;
      n++;
    }
  return n;
};

const closeTask = (t: Task, by: string) => {
  t.status = "done";
  t.completedAt = nowIso();
  t.completedBy = by;
  t.stop = undefined;
  t.remaining = undefined;
};

/** Write what happened to a task into the history of every cable it lists (once per change). */
const taskToCables = (p: Project, t: Task, outcome: TaskOutcome, by: string, reportId?: string) => {
  if (!t.cableCodes.length) return;
  const want = new Set(t.cableCodes.map(normCode));
  const at = nowIso();
  for (const c of p.cables) {
    if (!want.has(normCode(c.code))) continue;
    const last = c.history.find((h) => h.kind === "task" && h.taskId === t.id);
    if (last?.outcome === outcome) continue;
    c.history.unshift(ev({ kind: "task", at, by, taskId: t.id, outcome, note: t.title, reportId }));
    c.updatedAt = at;
  }
};

/** Foreman's end-of-day result on a board task (sent with the crew report = the foreman's confirmation). */
const applyOutcome = (t: Task, te: ReportTaskEntry, r: Report) => {
  const by = r.submittedByName || r.linkName;
  const at = nowIso();
  const outcome = te.outcome!;
  endClaims(t, (c) => c.linkId === r.linkId, outcome, r.id);
  const others = activeClaims(t);
  t.pendingReport = { id: r.id, number: r.number };
  const parts = [`${r.linkName}: ${outcome === "done" ? "done" : outcome === "partial" ? "partly done" : "not done"}`];
  if (te.didText) parts.push(`✓ ${te.didText}`);
  if (te.leftText) parts.push(`→ ${te.leftText}`);
  if (te.reasonNote) parts.push(te.reasonNote);
  if (te.needs) parts.push(`⚑ ${te.needs}`);
  if (te.note) parts.push(te.note);
  tlog(t, "report", parts.join(" · "), by, r.id);
  if (outcome === "done") {
    const today = localDay(at);
    const round = (t.claims ?? []).filter((c) => c.endedAt && localDay(c.endedAt) === today && c.outcome !== "reassigned" && c.outcome !== "released");
    if (!others.length && round.every((c) => c.outcome === "done")) {
      closeTask(t, by);
      tlog(t, "done", by, by, r.id);
    } else if (!others.length) t.status = t.free ? "todo" : "progress";
    else t.status = "progress";
    return;
  }
  if (te.didText) t.progressDone = te.didText;
  if (te.leftText) t.remaining = te.leftText;
  else if (!t.remaining) t.remaining = t.title;
  t.stop = { reason: te.reason, note: te.reasonNote || undefined, needs: te.needs || undefined, blocked: !!te.blocked, at, by, reportId: r.id };
  if (te.blocked) tlog(t, "blocked", te.reasonNote || te.reason || "", by, r.id);
  if (!others.length) t.status = t.free ? "todo" : "progress";
};

/** A cable line of a report: create or update the incomplete work for that cable (never twice). */
const upsertCableWork = (p: Project, e: ReportCableEntry, r: Report, idx: Map<string, Cable>) => {
  const map = stageMap(p);
  const tracked = trackedStages(map);
  const nc = normCode(e.code);
  const cable = (e.cableId ? p.cables.find((c) => c.id === e.cableId) : undefined) ?? idx.get(nc);
  const pred = stagesFromCable(p, cable);
  const ids = new Set(e.actionIds ?? (e.actionId ? [e.actionId] : []));
  for (const k of tracked) {
    const col = map[k]!;
    const v = e.values?.[col];
    if (k === "test" && v && FAIL_RE.test(v)) pred[k] = { state: "failed" };
    else if (v || ids.has(col)) pred[k] = { state: "done" };
  }
  for (const k of STAGE_KEYS) if (e.stages?.[k]) pred[k] = { ...e.stages[k]! };
  const incomplete = !!e.stop || (tracked.length > 0 && !stagesComplete(pred));
  const key = workKeyFor(e.code);
  let t = p.tasks.find((x) => x.status !== "done" && x.workKey === key);
  let ambiguous: string[] = [];
  if (!t) {
    const cands = p.tasks.filter((x) => x.status !== "done" && !x.workKey && x.cableCodes.length === 1 && normCode(x.cableCodes[0]) === nc);
    if (cands.length === 1) t = cands[0];
    else if (cands.length > 1) ambiguous = cands.map((x) => x.id);
  }
  if (!t && !incomplete) return;
  const by = r.submittedByName || r.linkName;
  const at = nowIso();
  if (!t) {
    t = {
      id: uid(),
      title: cable?.code ?? e.code,
      description: "",
      assigneeIds: [],
      priority: "normal",
      status: "todo",
      cableCodes: [cable?.code ?? e.code],
      comments: [],
      createdAt: at,
      origin: { reportId: r.id, reportNumber: r.number, linkName: r.linkName, linkId: r.linkId },
      workKey: key,
      log: [],
    };
    if (ambiguous.length) t.ambiguous = [{ code: e.code, reportId: r.id, number: r.number, taskIds: ambiguous }];
    p.tasks.unshift(t);
    tlog(t, "created", `#${r.number} · ${r.linkName}`, by, r.id);
  }
  t.stagesReported = { stages: pred, reportId: r.id, number: r.number, at, by };
  if (e.stop) {
    t.stop = { ...e.stop, at, by, reportId: r.id };
    if (e.stop.blocked) tlog(t, "blocked", e.stop.note || e.stop.reason || "", by, r.id);
  } else if (!incomplete && t.stop && !t.stop.blocked) t.stop = undefined;
  const st = STAGE_KEYS.filter((k) => pred[k] && pred[k]!.state !== "na")
    .map((k) => `${k}:${pred[k]!.state}${pred[k]!.pct != null ? ` ${pred[k]!.pct}%` : ""}`)
    .join(", ");
  tlog(t, "report", [`${r.linkName}`, st, e.stop?.note, e.stop?.needs ? `⚑ ${e.stop.needs}` : "", e.note].filter(Boolean).join(" · "), by, r.id);
};

/** Manager approved a report: confirm the reported cable stages from the registry. */
const confirmStages = (p: Project, r: Report, idx: Map<string, Cable>) => {
  for (const t of [...p.tasks]) {
    if (t.pendingReport?.id === r.id) t.pendingReport = undefined;
    const rep = t.stagesReported;
    if (!rep || rep.reportId !== r.id) continue;
    const code = t.cableCodes[0] ?? "";
    const line = r.cables.find((e) => normCode(e.code) === normCode(code));
    if (line && !line.approved) {
      t.stagesReported = undefined;
      dropIfOnlyFrom(p, t, r.id);
      continue;
    }
    const cable = idx.get(normCode(code)) ?? p.cables.find((c) => normCode(c.code) === normCode(code));
    const before = t.stages;
    const fresh = stagesFromCable(p, cable, rep.stages);
    for (const k of STAGE_KEYS) {
      const was = before?.[k]?.state;
      const said = rep.stages[k]?.state;
      if (was === "done" && said && said !== "done" && said !== "na") {
        (t.conflicts ??= []).push({ stage: k, reported: said, reportNumber: r.number, at: nowIso() });
        tlog(t, "conflict", `${k}: ${said} (#${r.number})`, r.linkName, r.id);
      }
    }
    t.stages = fresh;
    t.stagesReported = undefined;
    if (stagesComplete(fresh) && !t.stop?.blocked) {
      endClaims(t, () => true, "done", r.id);
      closeTask(t, r.submittedByName || r.linkName);
      tlog(t, "done", r.linkName, who(), r.id);
      taskToCables(p, t, "done", r.submittedByName || r.linkName, r.id);
    }
  }
};

/** Work created by one report and nothing else happened to it → remove it with the report. */
const dropIfOnlyFrom = (p: Project, t: Task, reportId: string) => {
  if (t.origin?.reportId !== reportId || t.free || t.crewLinkId || t.status === "done" || activeClaims(t).length) return;
  if ((t.log ?? []).some((e) => e.reportId && e.reportId !== reportId) || t.stages) return;
  p.tasks = p.tasks.filter((x) => x.id !== t.id);
};

const ev = (e: Omit<HistoryEvent, "id" | "at"> & { at?: string }): HistoryEvent => ({
  id: uid(),
  at: e.at ?? nowIso(),
  ...e,
});

const newCable = (code: string, values: Record<string, string>, by: string, kind: "created" | "imported", note?: string): Cable => {
  const t = nowIso();
  return {
    id: uid(),
    code: code.trim(),
    values,
    done: {},
    history: [ev({ kind, by, note })],
    createdAt: t,
    updatedAt: t,
  };
};

const colNameMap = (p: Project): Map<string, string> => {
  const m = new Map<string, string>();
  for (const s of p.sheets) for (const c of s.columns) m.set(c.id, c.name);
  return m;
};

/** A column with the same name on another sheet — columns with equal names are shared across sheets. */
const twinColumn = (p: Project, sheetId: string, name: string): Column | undefined => {
  const n = normName(name);
  if (!n) return undefined;
  for (const s of p.sheets) {
    if (s.id === sheetId) continue;
    const c = s.columns.find((x) => normName(x.name) === n);
    if (c) return c;
  }
  return undefined;
};

const progressCol = (p: Project, colId: string): Column | undefined => {
  for (const s of p.sheets) {
    const c = s.columns.find((x) => x.id === colId);
    if (c) return c.progress ? c : undefined;
  }
  return undefined;
};

/** Value written when a progress column is "marked" without an explicit value (bulk mark, legacy reports). */
const markValue = (col: Column, date: string) => (col.type === "checkbox" ? "yes" : col.type === "date" ? date : col.type === "number" ? "1" : "✓");

/** Keep the done-date of one progress column in line with its value. Returns "done" / "undone" when it flipped. */
const syncDone = (col: Column, c: Cable, date: string): "done" | "undone" | null => {
  const filled = isFilled(col.type, c.values[col.id]);
  if (filled && !c.done[col.id]) {
    c.done[col.id] = date;
    return "done";
  }
  if (!filled && c.done[col.id]) {
    delete c.done[col.id];
    return "undone";
  }
  return null;
};

/** Run rules + formulas on one mutable cable and record what rules changed. */
const autoApply = (ctx: AutoCtx | null, c: Cable, p: Project, opts: { skip?: Set<string>; at?: string; date?: string } = {}) => {
  if (!ctx) return 0;
  const ch = runAuto(ctx, c, opts.skip);
  for (const pc of ctx.prog) syncDone(pc, c, opts.date ?? nowIso().slice(0, 10));
  if (ch.length) {
    const byRule = new Map<string, { column: string; from: string; to: string }[]>();
    for (const x of ch) {
      const arr = byRule.get(x.rule ?? "") ?? [];
      arr.push({ column: x.column, from: x.from, to: x.to });
      byRule.set(x.rule ?? "", arr);
    }
    for (const [rule, changes] of byRule) c.history.unshift(ev({ kind: "edited", by: "Rule", note: rule, changes, at: opts.at }));
  }
  void p;
  return ch.length;
};

/** Re-derive done-dates of every progress column from values (used after migration / flag changes). */
const resyncAllDone = (p: Project) => {
  const today = nowIso().slice(0, 10);
  const prog = new Map<string, Column>();
  for (const s of p.sheets) for (const c of s.columns) if (c.progress) prog.set(c.id, c);
  for (const cab of p.cables) {
    for (const k of Object.keys(cab.done)) if (!prog.has(k)) delete cab.done[k];
    for (const col of prog.values()) syncDone(col, cab, cab.updatedAt?.slice(0, 10) || today);
  }
};

/** When no sheet shows a list any more, cables leave it; cables left on no list at all are deleted. */
const dropList = (p: Project, list: string) => {
  if (p.sheets.some((x) => sheetList(x) === list)) return;
  const keep: Cable[] = [];
  let removed = 0;
  for (const c of p.cables) {
    const ls = cableLists(c);
    if (!ls.includes(list)) {
      keep.push(c);
      continue;
    }
    const rest = ls.filter((l) => l !== list);
    if (!rest.length) {
      removed++;
      continue;
    }
    c.lists = rest;
    keep.push(c);
  }
  if (removed || keep.length !== p.cables.length) p.cables = keep;
};

/** How many cables a sheet deletion would remove (cables only on that sheet's list, when no other sheet shows the list). */
export const sheetDeleteImpact = (p: Project, sheetIds: string[]) => {
  const gone = new Set(sheetIds);
  const rest = new Set(p.sheets.filter((x) => !gone.has(x.id)).map(sheetList));
  return p.cables.filter((c) => !cableLists(c).some((l) => rest.has(l))).length;
};

const uniqueFormula = (p: Project) => p.sheets.some((sh) => sh.columns.some((c) => c.formula));

/** Recalculate every formula column on every cable (after a formula or column name changed). */
const recomputeFormulas = (p: Project) => {
  const ctx = buildAuto({ ...p, rules: [] } as Project);
  if (!ctx) return;
  for (const c of p.cables) runAuto(ctx, c);
};

const columnUsed = (p: Project, colId: string) => p.sheets.some((s) => s.columns.some((c) => c.id === colId));

/** Stages (project actions) mirror progress columns 1:1 — same id, same name. Weight and colour are kept. */
const syncActions = (p: Project) => {
  const out: WorkAction[] = [];
  for (const s of p.sheets)
    for (const c of s.columns) {
      if (!c.progress || out.some((a) => a.id === c.id)) continue;
      const ex = p.actions.find((a) => a.id === c.id);
      out.push(
        ex
          ? { ...ex, name: c.name }
          : { id: c.id, name: c.name, weight: 10, color: STAGE_COLORS[out.length % STAGE_COLORS.length] },
      );
    }
  p.actions = out;
};

/** Merge every column with the same name into one shared column (values and progress marks are combined). */
const unifyColumns = (p: Project) => {
  const byName = new Map<string, Column>();
  const remap = new Map<string, string>();
  for (const s of p.sheets) {
    const seen = new Set<string>();
    s.columns = s.columns.filter((c) => {
      const n = normName(c.name);
      const keep = byName.get(n);
      if (keep && keep.id !== c.id) {
        remap.set(c.id, keep.id);
        if (seen.has(keep.id)) return false;
        Object.assign(c, { ...keep, width: c.width, locked: c.locked });
      } else if (keep) {
        Object.assign(c, { ...keep, width: c.width, locked: c.locked });
      } else if (n) byName.set(n, c);
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  }
  if (remap.size) {
    for (const cab of p.cables)
      for (const [from, to] of remap) {
        const v = cab.values[from];
        if (v !== undefined) {
          if (!cab.values[to]) cab.values[to] = v;
          delete cab.values[from];
        }
        const d = cab.done[from];
        if (d !== undefined) {
          if (!cab.done[to]) cab.done[to] = d;
          delete cab.done[from];
        }
      }
    for (const l of p.links) if (l.client) l.client.columnIds = [...new Set(l.client.columnIds.map((id) => remap.get(id) ?? id))];
  }
  syncActions(p);
};

/** Bring older saved projects up to date: stages become progress columns, equal columns are shared. */
export const migrateProject = (p: Project, legacyVersion = false) => {
  const used = new Set<string>();
  for (const c of p.cables) for (const k of Object.keys(c.done)) used.add(k);
  for (const r of p.reports) for (const e of r.cables) for (const a of e.actionIds ?? (e.actionId ? [e.actionId] : [])) used.add(a);
  const oldDefaults = ["pulled", "terminated", "tested", "labeled"].every((id) => p.actions.some((a) => a.id === id));
  const hasProgressCols = p.sheets.some((s) => s.columns.some((c) => c.progress));
  const legacy =
    legacyVersion || (!p.sheets.length && oldDefaults) || (!hasProgressCols && p.actions.length > 0 && p.sheets.length > 0 && p.sheets.every((s) => s.stageIds === undefined));
  if (legacy) {
    p.actions = p.actions.filter((a) => used.has(a.id));
    for (const s of p.sheets) if (s.stageIds === undefined) s.stageIds = s.hideProgress ? [] : p.actions.map((a) => a.id);
  }
  // v2 sheet stages → progress columns
  for (const s of p.sheets) {
    for (const id of s.stageIds ?? []) {
      const a = p.actions.find((x) => x.id === id);
      if (a && !s.columns.some((c) => c.id === id)) s.columns.push({ id, name: a.name, type: "checkbox", progress: true });
    }
    delete s.stageIds;
  }
  unifyColumns(p);
  // v3 → v4: progress columns keep a real value; done-dates are derived from it
  const prog = new Map<string, Column>();
  for (const s of p.sheets) for (const c of s.columns) if (c.progress) prog.set(c.id, c);
  for (const cab of p.cables)
    for (const col of prog.values()) {
      const d = cab.done[col.id];
      if (d && !isFilled(col.type, cab.values[col.id])) cab.values[col.id] = markValue(col, d);
    }
  resyncAllDone(p);
  p.rfis ??= [];
  p.rfiSeq ??= 0;
  migrateMessages(p);
  // v5 → v6: workbooks, rules, views, revisions
  p.books ??= [];
  if (p.sheets.length && !p.books.length) p.books.push({ id: uid(), name: "Main book" });
  for (const sh of p.sheets) if (!sh.bookId || !p.books.some((b) => b.id === sh.bookId)) sh.bookId = p.books[0]?.id;
  p.rules ??= [];
  p.views ??= [];
  p.revisions ??= [];
};

/** v4 → v5: one-off client messages (+ a single reply) become conversation threads. */
const migrateMessages = (p: Project) => {
  p.threads ??= [];
  p.threadSeq ??= p.threads.length;
  if (!p.messages?.length) {
    p.messages = [];
    return;
  }
  for (const m of [...p.messages].reverse()) {
    const link = p.links.find((l) => l.id === m.linkId);
    const posts: Thread["posts"] = [{ id: uid(), at: m.createdAt, side: "external", by: m.author, text: m.text, cableCodes: m.cableCodes ?? [] }];
    if (m.reply) posts.push({ id: uid(), at: m.repliedAt ?? m.createdAt, side: "manager", by: who(), text: m.reply, cableCodes: [] });
    const last = posts[posts.length - 1].at;
    p.threads.unshift({
      id: m.id,
      number: ++p.threadSeq,
      subject: m.text.split("\n")[0].slice(0, 80),
      topic: "question",
      priority: "normal",
      status: "open",
      linkId: m.linkId,
      linkName: m.linkName,
      linkType: link?.type ?? "client",
      startedBy: m.author,
      startedSide: "external",
      cableCodes: m.cableCodes ?? [],
      posts,
      createdAt: m.createdAt,
      updatedAt: last,
      seenManager: m.read ? last : undefined,
      seenExternal: last,
    });
  }
  p.messages = [];
};

const ensureLinkFor = (p: Project, empId: string): string | null => {
  const has = p.links.some((l) => l.type === "crew" && l.memberIds.includes(empId));
  if (has) return null;
  const emp = p.employees.find((e) => e.id === empId);
  if (!emp) return null;
  const link: PortalLink = {
    id: uid(),
    token: token(),
    name: emp.name,
    type: "crew",
    memberIds: [empId],
    active: true,
    createdAt: nowIso(),
    auto: true,
  };
  p.links.push(link);
  log(p, "link", `Personal link created for ${emp.name}`);
  return link.id;
};

/** Last IndexedDB write error (quota, private mode, blocked storage). The UI shows it. */
export const storageError = { current: null as string | null, listeners: new Set<() => void>() };
const setStorageError = (msg: string | null) => {
  if (storageError.current === msg) return;
  storageError.current = msg;
  storageError.listeners.forEach((f) => f());
};

/**
 * IndexedDB storage with batched writes. Serialising thousands of cables on every keystroke froze the page,
 * so changes are collected and written once the user pauses (and right away when the tab is hidden).
 * A revision number lets other tabs (crew links opened in a new tab) notice a change without re-reading everything.
 */
type Persisted = StorageValue<Pick<State, "projects" | "lang">>;
const SAVE_DELAY = 600;
let pending: { name: string; value: Persisted } | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let knownRev: number | null = null;
let saving: Promise<void> = Promise.resolve();

const writeNow = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const job = pending;
  pending = null;
  if (!job) return saving;
  saving = saving.then(async () => {
    try {
      const rev = Date.now() + Math.random();
      await set(job.name, JSON.stringify(job.value));
      await set(`${job.name}:rev`, rev);
      knownRev = rev;
      setStorageError(null);
    } catch (e) {
      console.error("CableGrid: saving failed", e);
      setStorageError(e instanceof Error ? e.name : "error");
    }
  });
  return saving;
};

/** Write any pending change immediately (tab hidden, backup, before re-reading). */
export const flushSave = () => writeNow();

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => void writeNow());
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && void writeNow());
  window.addEventListener("beforeunload", (e) => {
    if (!pending) return;
    void writeNow();
    e.preventDefault();
  });
}

const idbStorage: PersistStorage<Pick<State, "projects" | "lang">> = {
  getItem: async (name) => {
    await saving;
    const [raw, rev] = await Promise.all([get<string | Persisted>(name), get<number>(`${name}:rev`)]);
    knownRev = rev ?? null;
    if (raw == null) return null;
    return typeof raw === "string" ? (JSON.parse(raw) as Persisted) : raw;
  },
  setItem: (name, value) => {
    pending = { name, value };
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void writeNow(), SAVE_DELAY);
  },
  removeItem: async (name) => {
    pending = null;
    await del(name);
  },
};

/** Re-read storage only when another tab saved something since our last read / write. */
export const refreshFromOtherTabs = async () => {
  if (pending) return;
  await saving;
  const rev = await get<number>("cablegrid-v1:rev");
  if (rev != null && rev !== knownRev) await useStore.persist.rehydrate();
};

export const useStore = create<State>()(
  persist(
    immer((setS, getS) => ({
      projects: [],
      lang: "en",
      hydrated: false,
      setLang: (l) => setS((s) => void (s.lang = l)),

      createProject: (input) => {
        const id = uid();
        const t = nowIso();
        setS((s) => {
          s.projects.unshift({
            id,
            ...input,
            idPattern: "",
            createdAt: t,
            updatedAt: t,
            books: [],
            sheets: [],
            cables: [],
            rules: [],
            views: [],
            revisions: [],
            actions: [],
            employees: [],
            tasks: [],
            links: [],
            reports: [],
            issues: [],
            rfis: [],
            rfiSeq: 0,
            messages: [],
            threads: [],
            threadSeq: 0,
            materials: [],
            activity: [{ id: uid(), at: t, kind: "registry", text: "Project created" }],
            reportSeq: 0,
          });
        });
        return id;
      },
      updateProject: (pid, patch) =>
        setS((s) => {
          const p = findP(s, pid);
          if (p) Object.assign(p, patch, { updatedAt: nowIso() });
        }),
      deleteProject: (pid) => setS((s) => void (s.projects = s.projects.filter((p) => p.id !== pid))),
      restoreProject: (proj, asCopy, replace) => {
        const id = replace ? proj.id : asCopy || getS().projects.some((p) => p.id === proj.id) ? uid() : proj.id;
        const np: Project = { ...structuredClone(proj), id, name: asCopy ? `${proj.name} (copy)` : proj.name, updatedAt: nowIso() };
        delete np.cloud;
        migrateProject(np);
        // a copy must not share crew/client links with the original (reports would land in the wrong project)
        const taken = new Set(getS().projects.filter((p) => p.id !== id).flatMap((p) => p.links.map((l) => l.token)));
        for (const l of np.links ?? []) if (asCopy || taken.has(l.token)) l.token = token();
        setS((s) => {
          const i = replace ? s.projects.findIndex((x) => x.id === id) : -1;
          if (i >= 0) {
            np.cloud = s.projects[i].cloud;
            s.projects[i] = np;
          } else s.projects.unshift(np);
        });
        return id;
      },

      addSheet: (pid, name, columns, opts = {}) => {
        const id = uid();
        setS((s) => {
          const p = findP(s, pid);
          if (!p) return;
          p.books ??= [];
          if (!p.books.length) p.books.push({ id: uid(), name: "Main book" });
          const bookId = opts.bookId && p.books.some((b) => b.id === opts.bookId) ? opts.bookId : p.books[0].id;
          // first sheet of a project uses the main list; later sheets get what the user picked (default: link to the main list)
          const listId = opts.listId === "new" ? uid() : opts.listId && opts.listId !== MAIN_LIST ? opts.listId : undefined;
          const cols: Column[] = [];
          for (const d of columns ?? []) {
            if (!d.name.trim()) continue;
            if (cols.some((c) => normName(c.name) === normName(d.name))) continue;
            const twin = twinColumn(p, id, d.name);
            cols.push(twin ? { ...twin } : { ...d, name: d.name.trim(), id: uid() });
          }
          p.sheets.push({ id, name, columns: cols, bookId, listId });
          syncActions(p);
          log(p, "registry", `Sheet “${name}” created`);
        });
        return id;
      },
      renameSheet: (pid, sheetId, name) =>
        setS((s) => {
          const sh = findP(s, pid)?.sheets.find((x) => x.id === sheetId);
          if (sh) sh.name = name;
        }),
      deleteSheet: (pid, sheetId) =>
        noDelete(getS(), pid) ||
        setS((s) => {
          const p = findP(s, pid);
          if (!p) return;
          const sh = p.sheets.find((x) => x.id === sheetId);
          p.sheets = p.sheets.filter((x) => x.id !== sheetId);
          syncActions(p);
          if (sh) dropList(p, sheetList(sh));
          if (sh) {
            for (const col of sh.columns) if (!columnUsed(p, col.id)) for (const c of p.cables) delete c.values[col.id];
            log(p, "registry", `Sheet “${sh.name}” deleted`);
          }
        }),
      moveSheet: (pid, sheetId, dir) =>
        setS((s) => {
          const p = findP(s, pid);
          if (!p) return;
          const i = p.sheets.findIndex((x) => x.id === sheetId);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= p.sheets.length) return;
          const [x] = p.sheets.splice(i, 1);
          p.sheets.splice(j, 0, x);
        }),
      addBook: (pid, name) => {
        const id = uid();
        setS((s) => {
          const p = findP(s, pid);
          if (!p) return;
          (p.books ??= []).push({ id, name: name.trim() } satisfies Book);
          log(p, "registry", `Book “${name.trim()}” created`);
        });
        return id;
      },
      renameBook: (pid, bookId, name) =>
        setS((s) => {
          const b = findP(s, pid)?.books.find((x) => x.id === bookId);
          if (b && name.trim()) b.name = name.trim();
        }),
      deleteBook: (pid, bookId) =>
        noDelete(getS(), pid) ||
        setS((s) => {
          const p = findP(s, pid);
          const b = p?.books.find((x) => x.id === bookId);
          if (!p || !b) return;
          const gone = p.sheets.filter((x) => x.bookId === bookId);
          p.sheets = p.sheets.filter((x) => x.bookId !== bookId);
          p.books = p.books.filter((x) => x.id !== bookId);
          syncActions(p);
          for (const sh of gone) {
            dropList(p, sheetList(sh));
            for (const col of sh.columns) if (!columnUsed(p, col.id)) for (const c of p.cables) delete c.values[col.id];
          }
          log(p, "registry", `Book “${b.name}” deleted`);
        }),
      moveBook: (pid, bookId, dir) =>
        setS((s) => {
          const p = findP(s, pid);
          if (!p) return;
          const i = p.books.findIndex((x) => x.id === bookId);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= p.books.length) return;
          const [x] = p.books.splice(i, 1);
          p.books.splice(j, 0, x);
        }),
      moveSheetToBook: (pid, sheetId, bookId) =>
        setS((s) => {
          const p = findP(s, pid);
          const sh = p?.sheets.find((x) => x.id === sheetId);
          if (sh && p?.books.some((b) => b.id === bookId)) sh.bookId = bookId;
        }),
      setSheetList: (pid, sheetId, listId, copyMembers) =>
        setS((s) => {
          const p = findP(s, pid);
          const sh = p?.sheets.find((x) => x.id === sheetId);
          if (!p || !sh) return;
          const old = sheetList(sh);
          const next = listId === "new" ? uid() : listId;
          if (old === next) return;
          sh.listId = next === MAIN_LIST ? undefined : next;
          if (copyMembers)
            for (const c of p.cables) {
              const ls = cableLists(c);
              if (ls.includes(old) && !ls.includes(next)) c.lists = [...ls, next];
            }
          dropList(p, old);
          log(p, "registry", `Sheet “${sh.name}” cable list changed`);
        }),
      addToList: (pid, ids, listId) =>
        setS((s) => {
          const p = findP(s, pid);
          if (!p) return;
          const set = new Set(ids);
          for (const c of p.cables) {
            if (!set.has(c.id)) continue;
            const ls = cableLists(c);
            if (!ls.includes(listId)) c.lists = [...ls, listId];
          }
        }),
      removeFromList: (pid, ids, listId) =>
        setS((s) => {
          const p = findP(s, pid);
          if (!p) return;
          const set = new Set(ids);
          // a cable that would be left on no list is deleted (same as deleting it)
          p.cables = p.cables.filter((c) => {
            if (!set.has(c.id)) return true;
            const rest = cableLists(c).filter((l) => l !== listId);
            if (!rest.length) return false;
            c.lists = rest;
            return true;
          });
          log(p, "registry", `${ids.length} cable(s) removed from a sheet`);
        }),
      linkColumn: (pid, sheetId, srcColId, locked) => {
        const p0 = findP(getS(), pid);
        const sh0 = p0?.sheets.find((x) => x.id === sheetId);
        const src = p0?.sheets.flatMap((x) => x.columns).find((c) => c.id === srcColId);
        if (!p0 || !sh0 || !src) return "Not found";
        if (sh0.columns.some((c) => c.id === srcColId)) return "This column is already on the sheet";
        if (sh0.columns.some((c) => normName(c.name) === normName(src.name))) return "A column with this name already exists on this sheet";
        setS((s) => {
          const p = findP(s, pid);
          const sh = p?.sheets.find((x) => x.id === sheetId);
          if (!p || !sh) return;
          sh.columns.push({ ...src, width: undefined, locked: locked || undefined });
          syncActions(p);
        });
        return null;
      },
      unlinkColumn: (pid, sheetId, colId, newName) => {
        const p0 = findP(getS(), pid);
        const sh0 = p0?.sheets.find((x) => x.id === sheetId);
        if (!p0 || !sh0 || !newName.trim()) return "Not found";
        if (p0.sheets.some((x) => x.columns.some((c) => c.id !== colId && normName(c.name) === normName(newName)))) return "A column with this name already exists";
        const nid = uid();
        setS((s) => {
          const p = findP(s, pid);
          const sh = p?.sheets.find((x) => x.id === sheetId);
          const c = sh?.columns.find((x) => x.id === colId);
          if (!p || !sh || !c) return;
          const list = sheetList(sh);
          Object.assign(c, { id: nid, name: newName.trim(), locked: undefined });
          for (const cab of p.cables) {
            if (!cableLists(cab).includes(list)) continue;
            if (cab.values[colId] !== undefined) cab.values[nid] = cab.values[colId];
            if (cab.done[colId] !== undefined) cab.done[nid] = cab.done[colId];
          }
          if (!columnUsed(p, colId)) for (const cab of p.cables) delete cab.values[colId];
          syncActions(p);
          resyncAllDone(p);
        });
        return null;
      },
      setRules: (pid, rules) =>
        setS((s) => {
          const p = findP(s, pid);
          if (p) p.rules = rules;
        }),
      applyAutomation: (pid) => {
        const p0 = findP(getS(), pid);
        const ctx = p0 && buildAuto(p0);
        if (!p0 || !ctx) return 0;
        let n = 0;
        const d = nowIso().slice(0, 10);
        const next = p0.cables.map((c0) => {
          const c: Cable = { ...c0, values: { ...c0.values }, done: { ...c0.done }, history: [...c0.history] };
          const before = JSON.stringify(c0.values);
          autoApply(ctx, c, p0, { date: d });
          if (JSON.stringify(c.values) === before) return c0;
          n++;
          c.updatedAt = nowIso();
          return c;
        });
        if (n)
          setS((s) => {
            const p = findP(s, pid);
            if (!p) return;
            p.cables = next;
            log(p, "registry", `Rules applied: ${n} cable(s) changed`);
          });
        return n;
      },
      setStageFlow: (pid, flow) =>
        setS((s) => {
          const p = findP(s, pid);
          if (p) p.stageFlow = flow;
        }),
      saveView: (pid, v) => {
        const id = uid();
        setS((s) => {
          const p = findP(s, pid);
          if (p) (p.views ??= []).push({ ...v, id });
        });
        return id;
      },
      setFormats: (pid, formats) =>
        setS((s) => {
          const p = findP(s, pid);
          if (p) p.formats = formats;
        }),
      deleteView: (pid, id) =>
        setS((s) => {
          const p = findP(s, pid);
          if (p) p.views = (p.views ?? []).filter((x) => x.id !== id);
        }),
      saveRevision: async (pid, name) => {
        const p0 = findP(getS(), pid);
        if (!p0) return "";
        const id = uid();
        const data: Record<string, Record<string, string>> = {};
        for (const c of p0.cables) data[c.code] = c.values;
        const text = JSON.stringify({ data, columns: Object.fromEntries(colNameMap(p0)) });
        await set(revKey(pid, id), text);
        if (p0.cloud?.key && !p0.cloud.off) void putBlob(pid, p0.cloud.key, `rev-${id}`, text).catch(() => undefined);
        setS((s) => {
          const p = findP(s, pid);
          if (!p) return;
          (p.revisions ??= []).unshift({ id, name: name.trim(), at: nowIso(), cables: p0.cables.length });
          log(p, "registry", `Revision “${name.trim()}” saved`);
        });
        return id;
      },
      deleteRevision: (pid, id) => {
        void del(revKey(pid, id));
        const cl = findP(getS(), pid)?.cloud;
        if (cl?.key && cl.role === "owner") void delBlob(pid, cl.key, `rev-${id}`);
        setS((s) => {
          const p = findP(s, pid);
          if (p) p.revisions = (p.revisions ?? []).filter((x) => x.id !== id);
        });
      },
      addColumn: (pid, sheetId, col) => {
        let id = uid();
        setS((s) => {
          const p = findP(s, pid);
          const sh = p?.sheets.find((x) => x.id === sheetId);
          if (!p || !sh) return;
          const own = sh.columns.find((x) => normName(x.name) === normName(col.name));
          if (own) {
            id = own.id;
            return;
          }
          const twin = twinColumn(p, sheetId, col.name);
          if (twin) {
            id = twin.id;
            sh.columns.push({ ...twin });
          } else sh.columns.push({ ...col, id });
          syncActions(p);
        });
        return id;
      },
      updateColumn: (pid, sheetId, colId, patch) =>
        setS((s) => {
          const p = findP(s, pid);
          if (!p) return;
          // shared columns stay identical on every sheet (width is per sheet)
          const { width, locked, ...shared } = patch;
          for (const sh of p.sheets) {
            const c = sh.columns.find((x) => x.id === colId);
            if (!c) continue;
            Object.assign(c, shared);
            if (width !== undefined && sh.id === sheetId) c.width = width;
            if (locked !== undefined && sh.id === sheetId) c.locked = locked || undefined;
          }
          if (patch.formula !== undefined || (patch.name !== undefined && uniqueFormula(p))) recomputeFormulas(p);
          if (patch.name !== undefined) unifyColumns(p);
          else syncActions(p);
          if (patch.progress !== undefined || patch.type !== undefined) resyncAllDone(p);
        }),
      deleteColumn: (pid, sheetId, colId) =>
        noDelete(getS(), pid) ||
        setS((s) => {
          const p = findP(s, pid);
          const sh = p?.sheets.find((x) => x.id === sheetId);
          if (!p || !sh) return;
          sh.columns = sh.columns.filter((c) => c.id !== colId);
          if (!columnUsed(p, colId)) for (const c of p.cables) delete c.values[colId];
          syncActions(p);
        }),
      moveColumn: (pid, sheetId, colId, dir) =>
        setS((s) => {
          const sh = findP(s, pid)?.sheets.find((x) => x.id === sheetId);
          if (!sh) return;
          const i = sh.columns.findIndex((c) => c.id === colId);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= sh.columns.length) return;
          const [x] = sh.columns.splice(i, 1);
          sh.columns.splice(j, 0, x);
        }),

      addCable: (pid, code, values = {}, by = who(), listId) => {
        const p0 = findP(getS(), pid);
        if (!p0 || !code.trim()) return null;
        const n = normCode(code);
        const list = listId ?? defaultList(p0);
        const ex = p0.cables.find((c) => normCode(c.code) === n);
        if (ex) {
          // the same ID on another sheet is the same cable: just add it to this sheet's list
          if (cableLists(ex).includes(list)) return null;
          setS((s) => {
            const c = findP(s, pid)?.cables.find((x) => x.id === ex.id);
            if (c) c.lists = [...cableLists(c), list];
          });
          return ex.id;
        }
        const cable = newCable(code, { ...values }, by, "created");
        if (list !== MAIN_LIST) cable.lists = [list];
        autoApply(buildAuto(p0), cable, p0);
        setS((s) => {
          const p = findP(s, pid);
          if (!p) return;
          p.cables.push(cable);
          log(p, "registry", `Cable ${cable.code} added`);
        });
        return cable.id;
      },
      setCableValue: (pid, cableId, colId, colName, value) =>
        setS((s) => {
          const p = findP(s, pid);
          const c = p?.cables.find((x) => x.id === cableId);
          if (!p || !c) return;
          const from = c.values[colId] ?? "";
          if (from === value) return;
          const pc0 = progressCol(p, colId);
          if (pc0) {
            const g = buildGate(p);
            const b = g.block(c.values, colId, isFilled(pc0.type, value));
            if (b) {
              setGate(1, pc0.name, g.names.get(b) ?? "");
              return;
            }
          }
          c.values[colId] = value;
          c.updatedAt = nowIso();
          autoApply(buildAuto(p), c, p, { skip: new Set([colId]) });
          const pc = progressCol(p, colId);
          const flip = pc ? syncDone(pc, c, nowIso().slice(0, 10)) : null;
          if (pc && flip) {
            c.history.unshift(
              ev({ kind: flip === "done" ? "action" : "undone", actionId: colId, actionName: colName, by: who(), changes: [{ column: colName, from, to: value }] }),
            );
            return;
          }
          const last = c.history[0];
          // merge rapid consecutive manual edits into one event
          if (last && last.kind === "edited" && last.by === who() && Date.now() - new Date(last.at).getTime() < 60_000) {
            const ch = last.changes?.find((x) => x.column === colName);
            if (ch) ch.to = value;
            else (last.changes ??= []).push({ column: colName, from, to: value });
          } else {
            c.history.unshift(ev({ kind: "edited", by: who(), changes: [{ column: colName, from, to: value }] }));
          }
        }),
      renameCable: (pid, cableId, code) => {
        const p0 = findP(getS(), pid);
        if (!p0 || !code.trim()) return false;
        if (p0.cables.some((c) => c.id !== cableId && normCode(c.code) === normCode(code))) return false;
        setS((s) => {
          const c = findP(s, pid)?.cables.find((x) => x.id === cableId);
          if (!c) return;
          c.history.unshift(ev({ kind: "edited", by: who(), changes: [{ column: "ID", from: c.code, to: code.trim() }] }));
          c.code = code.trim();
        });
        return true;
      },
      toggleAction: (pid, cableId, actionId, on) =>
        setS((s) => {
          const p = findP(s, pid);
          const c = p?.cables.find((x) => x.id === cableId);
          const col = p ? progressCol(p, actionId) : undefined;
          if (!c || !col) return;
          const g = buildGate(p!);
          const b = g.block(c.values, actionId, on);
          setGate(b ? 1 : 0, col.name, b ? g.names.get(b) ?? "" : "");
          if (b) return;
          const d = nowIso().slice(0, 10);
          const from = c.values[actionId] ?? "";
          c.values[actionId] = on ? (isFilled(col.type, from) ? from : markValue(col, d)) : "";
          if (syncDone(col, c, d))
            c.history.unshift(
              ev({ kind: on ? "action" : "undone", actionId, actionName: col.name, by: who(), changes: [{ column: col.name, from, to: c.values[actionId] }] }),
            );
          c.updatedAt = nowIso();
        }),
      setCableStatus: (pid, cableIds, state) =>
        setS((s) => {
          const p = findP(s, pid);
          if (!p) return;
          const ids = new Set(cableIds);
          const at = nowIso();
          for (const c of p.cables) {
            if (!ids.has(c.id)) continue;
            c.history.unshift(ev({ kind: "status", at, by: who(), state }));
            c.updatedAt = at;
          }
          log(p, "registry", cableIds.length === 1 ? `Status of ${p.cables.find((c) => c.id === cableIds[0])?.code ?? ""}: ${state}` : `Status of ${cableIds.length} cables: ${state}`);
        }),
      deleteCables: (pid, ids) =>
        noDelete(getS(), pid) ||
        setS((s) => {
          const p = findP(s, pid);
          if (!p) return;
          const set = new Set(ids);
          p.cables = p.cables.filter((c) => !set.has(c.id));
          log(p, "registry", `${ids.length} cable(s) deleted`);
        }),
      bulkSetValue: (pid, ids, colId, colName, value) =>
        setS((s) => {
          const p = findP(s, pid);
          if (!p) return;
          const set = new Set(ids);
          for (const c of p.cables) {
            if (!set.has(c.id)) continue;
            const from = c.values[colId] ?? "";
            if (from === value) continue;
            c.values[colId] = value;
            const pc = progressCol(p, colId);
            const flip = pc ? syncDone(pc, c, nowIso().slice(0, 10)) : null;
            c.history.unshift(
              ev({
                kind: flip === "done" ? "action" : flip === "undone" ? "undone" : "edited",
                actionId: flip ? colId : undefined,
                actionName: flip ? colName : undefined,
                by: who(),
                note: "Bulk edit",
                changes: [{ column: colName, from, to: value }],
              }),
            );
          }
          log(p, "registry", `Bulk edit “${colName}” on ${ids.length} cable(s)`);
        }),
      setCells: (pid, edits, note, opts = {}) => {
        const changed: CellChange[] = [];
        setGate(0, "", "");
        if (!edits.length) return changed;
        setS((s) => {
          const p = findP(s, pid);
          if (!p) return;
          const byId = new Map(p.cables.map((c) => [c.id, c] as const));
          const names = new Map<string, string>();
          for (const sh of p.sheets) for (const col of sh.columns) names.set(col.id, col.name);
          const perCable = new Map<string, CellEdit[]>();
          for (const e of edits) {
            if (!byId.has(e.cableId) || !names.has(e.colId)) continue;
            const arr = perCable.get(e.cableId) ?? [];
            arr.push(e);
            perCable.set(e.cableId, arr);
          }
          const d = nowIso().slice(0, 10);
          const gate = opts.force ? null : buildGate(p);
          const auto = buildAuto(p);
          let blocked = 0;
          let firstBlock: [string, string] | null = null;
          for (const [cid, list0] of perCable) {
            const c = byId.get(cid)!;
            const plain: { column: string; from: string; to: string }[] = [];
            // with a stage order: clear later stages first, then mark earlier stages first
            let list = list0;
            if (gate?.active && list.length > 1) {
              const idx = (e: CellEdit) => gate.order.indexOf(e.colId);
              const on = (e: CellEdit) => isFilled(gate.types.get(e.colId) ?? "text", e.value);
              list = [...list.filter((e) => !on(e)).sort((a, b) => idx(b) - idx(a)), ...list.filter(on).sort((a, b) => idx(a) - idx(b))];
            }
            const before = changed.length;
            for (const e of list) {
              const from = c.values[e.colId] ?? "";
              const to = e.value.trim();
              if (from === to) continue;
              if (gate?.active && progressCol(p, e.colId)) {
                const t = gate.types.get(e.colId) ?? "text";
                const wasOn = isFilled(t, from);
                const isOn = isFilled(t, to);
                const b = wasOn !== isOn || isOn ? gate.block(c.values, e.colId, isOn) : null;
                if (b && wasOn !== isOn) {
                  blocked++;
                  firstBlock ??= [names.get(e.colId) ?? "", names.get(b) ?? ""];
                  continue;
                }
              }
              c.values[e.colId] = to;
              changed.push({ cableId: cid, colId: e.colId, from, to });
              const colName = names.get(e.colId)!;
              const pc = progressCol(p, e.colId);
              const flip = pc ? syncDone(pc, c, d) : null;
              if (flip)
                c.history.unshift(ev({ kind: flip === "done" ? "action" : "undone", actionId: e.colId, actionName: colName, by: who(), note, changes: [{ column: colName, from, to }] }));
              else plain.push({ column: colName, from, to });
            }
            if (plain.length) c.history.unshift(ev({ kind: "edited", by: who(), note, changes: plain }));
            if (changed.length > before) {
              c.updatedAt = nowIso();
              if (auto) {
                const vals = { ...c.values };
                autoApply(auto, c, p, { skip: new Set(list.map((e) => e.colId)) });
                // rule / formula results join the undo step
                for (const [k, v] of Object.entries(c.values)) if ((vals[k] ?? "") !== v) changed.push({ cableId: cid, colId: k, from: vals[k] ?? "", to: v });
              }
            }
          }
          if (blocked) setGate(blocked, firstBlock?.[0] ?? "", firstBlock?.[1] ?? "");
          if (changed.length > 1) log(p, "registry", `${note ?? "Edit"}: ${changed.length} cell(s)`);
        });
        return changed;
      },
      bulkAction: (pid, ids, actionId, on) =>
        setS((s) => {
          const p = findP(s, pid);
          const col = p ? progressCol(p, actionId) : undefined;
          if (!p || !col) return;
          const set = new Set(ids);
          const d = nowIso().slice(0, 10);
          const g = buildGate(p);
          let blocked = 0;
          let needs = "";
          for (const c of p.cables) {
            if (!set.has(c.id)) continue;
            const from = c.values[actionId] ?? "";
            if (on === isFilled(col.type, from)) continue;
            const b = g.block(c.values, actionId, on);
            if (b) {
              blocked++;
              needs ||= g.names.get(b) ?? "";
              continue;
            }
            c.values[actionId] = on ? markValue(col, d) : "";
            syncDone(col, c, d);
            c.history.unshift(
              ev({ kind: on ? "action" : "undone", actionId, actionName: col.name, by: who(), note: "Bulk", changes: [{ column: col.name, from, to: c.values[actionId] }] }),
            );
          }
          setGate(blocked, col.name, needs);
          log(p, "registry", `“${col.name}” ${on ? "marked" : "cleared"} on ${ids.length - blocked} cable(s)`);
        }),
      importRows: (pid, rows, source, opts = {}) => {
        const mode = opts.mode ?? "all";
        const stats = { created: 0, updated: 0, unchanged: 0, skipped: 0 };
        // Work on plain copies outside immer: walking thousands of cables through draft proxies was the slow part.
        const p0 = findP(getS(), pid);
        if (!p0) return stats;
        const names = colNameMap(p0);
        const today = nowIso().slice(0, 10);
        const now = nowIso();
        const prog = p0.sheets.flatMap((x) => x.columns).filter((c) => c.progress);
        const auto = buildAuto(p0);
        const dl = defaultList(p0);
        const withLists = (c: Cable, lists: string[] | undefined) => {
          if (!lists?.length) return false;
          const cur = cableLists(c);
          const add = lists.filter((l) => !cur.includes(l));
          if (!add.length) return false;
          const next = [...cur, ...add];
          c.lists = next.length === 1 && next[0] === MAIN_LIST ? undefined : next;
          return true;
        };
        const index = new Map<string, Cable>();
        for (const c of p0.cables) index.set(normCode(c.code), c);
        const replaced = new Map<string, Cable>();
        const added: Cable[] = [];
        const fresh = new Set<Cable>(); // created or already copied in this call — safe to mutate
        const applyProgress = (c: Cable) => {
          for (const col of prog) {
            const flip = syncDone(col, c, /^\d{4}-\d{2}-\d{2}/.test(c.values[col.id] ?? "") ? c.values[col.id]!.slice(0, 10) : today);
            if (flip === "done") c.history.unshift(ev({ kind: "action", actionId: col.id, actionName: col.name, by: who(), note: source, at: now }));
          }
        };
        for (const r of rows) {
          const code = r.code?.trim();
          if (!code) continue;
          const k = normCode(code);
          const ex = index.get(k);
          if (ex) {
            if (mode === "new") {
              stats.skipped++;
              continue;
            }
            const changes: { column: string; from: string; to: string }[] = [];
            for (const [colId, v] of Object.entries(r.values)) {
              if ((v === "" || v == null) && !opts.clearEmpty) continue;
              if ((ex.values[colId] ?? "") !== v) changes.push({ column: names.get(colId) ?? colId, from: ex.values[colId] ?? "", to: v });
            }
            const newList = !!r.lists?.length && r.lists.some((l) => !cableLists(ex).includes(l));
            if (!changes.length && !newList) {
              stats.unchanged++;
              continue;
            }
            const c: Cable = fresh.has(ex) ? ex : { ...ex, values: { ...ex.values }, done: { ...ex.done }, history: [...ex.history], lists: ex.lists && [...ex.lists] };
            for (const [colId, v] of Object.entries(r.values)) if (!((v === "" || v == null) && !opts.clearEmpty)) c.values[colId] = v;
            withLists(c, r.lists);
            if (changes.length) c.history.unshift(ev({ kind: "imported", by: who(), note: source, changes, at: now }));
            autoApply(auto, c, p0, { at: now, date: today });
            applyProgress(c);
            c.updatedAt = now;
            if (!fresh.has(c)) {
              fresh.add(c);
              replaced.set(c.id, c);
            }
            index.set(k, c);
            stats.updated++;
          } else {
            if (mode === "update") {
              stats.skipped++;
              continue;
            }
            const c = newCable(code, Object.fromEntries(Object.entries(r.values).filter(([, v]) => v !== "")), who(), "imported", source);
            const ls = r.lists?.length ? r.lists : [dl];
            if (!(ls.length === 1 && ls[0] === MAIN_LIST)) c.lists = [...new Set(ls)];
            autoApply(auto, c, p0, { at: now, date: today });
            applyProgress(c);
            added.push(c);
            fresh.add(c);
            index.set(k, c);
            stats.created++;
          }
        }
        if (!replaced.size && !added.length) return stats;
        const base = p0.cables;
        const next = replaced.size ? base.map((c) => replaced.get(c.id) ?? c) : base.slice();
        for (const c of added) next.push(c);
        setS((s) => {
          const p = findP(s, pid);
          if (!p) return;
          p.cables = next;
          log(p, "import", `Import “${source}”: ${stats.created} new, ${stats.updated} updated`);
        });
        return stats;
      },

      setActions: (pid, actions) =>
        setS((s) => {
          const p = findP(s, pid);
          if (!p) return;
          // only weight and colour are edited here; stages themselves come from progress columns
          for (const a of p.actions) {
            const n = actions.find((x) => x.id === a.id);
            if (n) Object.assign(a, { weight: n.weight, color: n.color });
          }
        }),
      setMaterials: (pid, materials) =>
        setS((s) => {
          const p = findP(s, pid);
          if (p) p.materials = materials;
        }),

      addEmployee: (pid, e) => {
        const id = uid();
        setS((s) => {
          const p = findP(s, pid);
          if (!p) return;
          p.employees.push({ ...e, id, createdAt: nowIso() });
          log(p, "team", `${e.name} added to team`);
        });
        return id;
      },
      updateEmployee: (pid, id, patch) =>
        setS((s) => {
          const e = findP(s, pid)?.employees.find((x) => x.id === id);
          if (e) Object.assign(e, patch);
        }),
      deleteEmployee: (pid, id) =>
        noDelete(getS(), pid) ||
        setS((s) => {
          const p = findP(s, pid);
          if (!p) return;
          p.employees = p.employees.filter((e) => e.id !== id);
          for (const l of p.links) l.memberIds = l.memberIds.filter((m) => m !== id);
          for (const t of p.tasks) t.assigneeIds = t.assigneeIds.filter((m) => m !== id);
        }),

      addTask: (pid, t) => {
        const id = uid();
        const newLinks: string[] = [];
        setS((s) => {
          const p = findP(s, pid);
          if (!p) return;
          p.tasks.unshift({ ...t, id, createdAt: nowIso(), comments: [] });
          tlog(p.tasks[0], "created", t.free ? `free:${t.slots ?? 1}` : "", who());
          for (const a of t.assigneeIds) {
            const l = ensureLinkFor(p, a);
            if (l) newLinks.push(l);
          }
          log(p, "task", `Task “${t.title}” created`);
        });
        return { taskId: id, newLinks };
      },
      updateTask: (pid, id, patch, by = who()) => {
        const newLinks: string[] = [];
        setS((s) => {
          const p = findP(s, pid);
          const t = p?.tasks.find((x) => x.id === id);
          if (!p || !t) return;
          const wasDone = t.status === "done";
          const wasStatus = t.status;
          // reassigning a task people already took: end their part, keep the history
          const crewChange = "crewLinkId" in patch && patch.crewLinkId !== t.crewLinkId;
          const freeOff = patch.free === false && !!t.free;
          if ((crewChange || freeOff) && activeClaims(t).length) {
            const names = activeClaims(t).map((c) => c.name).join(", ");
            endClaims(t, () => true, "reassigned");
            tlog(t, "released", names, by);
          }
          if (crewChange && patch.crewLinkId) tlog(t, "assigned", p.links.find((l) => l.id === patch.crewLinkId)?.name ?? "", by);
          if (patch.free && !t.free) tlog(t, "freed", String(patch.slots ?? 1), by);
          Object.assign(t, patch);
          if (patch.status === "done" && !wasDone) {
            t.completedAt = nowIso();
            t.completedBy = by;
            log(p, "task", `Task “${t.title}” completed by ${by}`);
          }
          if (patch.status && patch.status !== "done") {
            if (wasDone) tlog(t, "reopened", "", by);
            t.completedAt = undefined;
            t.completedBy = undefined;
          }
          if (patch.status === "done" && !wasDone) {
            endClaims(t, () => true, "done");
            tlog(t, "done", by, by);
            taskToCables(p, t, "done", by);
          } else if (patch.status && patch.status !== "done" && wasDone) taskToCables(p, t, "reopened", by);
          else if (patch.status === "progress" && wasStatus === "todo") taskToCables(p, t, "started", by);
          if (patch.assigneeIds)
            for (const a of patch.assigneeIds) {
              const l = ensureLinkFor(p, a);
              if (l) newLinks.push(l);
            }
        });
        return newLinks;
      },
      deleteTask: (pid, id) =>
        setS((s) => {
          const p = findP(s, pid);
          if (p) p.tasks = p.tasks.filter((t) => t.id !== id);
        }),
      addTaskComment: (pid, taskId, by, text) =>
        setS((s) => {
          const t = findP(s, pid)?.tasks.find((x) => x.id === taskId);
          if (t) t.comments.push({ id: uid(), at: nowIso(), by, text });
        }),

      boardLinks: (pid, action) =>
        setS((s) => {
          const p = findP(s, pid);
          if (!p) return;
          const fresh = () => ({ token: token() + token(), takeToken: token() + token(), active: true, createdAt: nowIso() });
          if (action === "create" && !p.board) p.board = fresh();
          else if (action === "regen") p.board = fresh();
          else if (p.board) p.board = { ...p.board, active: action === "on" };
          log(p, "link", action === "regen" ? "Board links replaced" : action === "off" ? "Board links turned off" : "Board links turned on");
        }),
      setCableStages: (pid, map) =>
        setS((s) => {
          const p = findP(s, pid);
          if (p) p.cableStages = map;
        }),
      addNotice: (pid, n) =>
        setS((s) => {
          const p = findP(s, pid);
          if (!p) return;
          p.notices = [{ ...n, id: uid(), createdAt: nowIso(), by: who() }, ...(p.notices ?? [])];
          log(p, "link", `Announcement: ${n.title}`);
        }),
      updateNotice: (pid, id, patch) =>
        setS((s) => {
          const p = findP(s, pid);
          if (!p?.notices) return;
          p.notices = p.notices.map((x) => (x.id === id ? { ...x, ...patch } : x));
        }),
      removeNotice: (pid, id) =>
        setS((s) => {
          const p = findP(s, pid);
          if (p?.notices) p.notices = p.notices.filter((x) => x.id !== id);
        }),
      addContact: (pid, c) =>
        setS((s) => {
          const p = findP(s, pid);
          if (!p) return;
          p.contacts = [...(p.contacts ?? []), { ...c, id: uid() }];
          log(p, "link", `Contact: ${c.name}`);
        }),
      updateContact: (pid, id, patch) =>
        setS((s) => {
          const p = findP(s, pid);
          if (!p?.contacts) return;
          p.contacts = p.contacts.map((x) => (x.id === id ? { ...x, ...patch } : x));
        }),
      removeContact: (pid, id) =>
        setS((s) => {
          const p = findP(s, pid);
          if (p?.contacts) p.contacts = p.contacts.filter((x) => x.id !== id);
        }),
      setSchedules: (pid, list) =>
        setS((s) => {
          const p = findP(s, pid);
          if (!p) return;
          p.schedules = list;
          // the old single schedule now lives in the list
          if (p.schedule) delete p.schedule;
        }),
      moveContact: (pid, id, dir) =>
        setS((s) => {
          const p = findP(s, pid);
          if (!p?.contacts) return;
          const list = [...p.contacts];
          const i = list.findIndex((x) => x.id === id);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= list.length) return;
          [list[i], list[j]] = [list[j], list[i]];
          p.contacts = list;
        }),
      blockTask: (pid, id, stop) =>
        setS((s) => {
          const t = findP(s, pid)?.tasks.find((x) => x.id === id);
          if (!t) return;
          t.stop = { ...stop, blocked: true, at: nowIso(), by: who() };
          tlog(t, "blocked", stop.note || stop.reason || "");
        }),
      unblockTask: (pid, id) =>
        setS((s) => {
          const t = findP(s, pid)?.tasks.find((x) => x.id === id);
          if (!t?.stop) return;
          t.stop = { ...t.stop, blocked: false };
          tlog(t, "unblocked", "");
          if (t.free && !activeClaims(t).length && t.status !== "done") t.status = "todo";
        }),
      assignTask: (pid, id, a) =>
        setS((s) => {
          const p = findP(s, pid);
          const t = p?.tasks.find((x) => x.id === id);
          if (!p || !t) return;
          if ("free" in a) {
            t.free = true;
            t.slots = Math.max(1, a.slots);
            t.crewLinkId = undefined;
            t.assigneeIds = [];
            tlog(t, "freed", String(t.slots));
            if (!activeClaims(t).length && t.status !== "done") t.status = "todo";
          } else {
            if (activeClaims(t).length) {
              tlog(t, "released", activeClaims(t).map((c) => c.name).join(", "));
              endClaims(t, () => true, "reassigned");
            }
            t.free = false;
            t.slots = undefined;
            t.crewLinkId = a.crewLinkId;
            tlog(t, "assigned", p.links.find((l) => l.id === a.crewLinkId)?.name ?? "");
          }
        }),
      linkWork: (pid, workId, targetId) =>
        setS((s) => {
          const p = findP(s, pid);
          const w = p?.tasks.find((x) => x.id === workId);
          const t = p?.tasks.find((x) => x.id === targetId);
          if (!p || !w || !t || w === t) return;
          t.log = [...(t.log ?? []), ...(w.log ?? [])].sort((a, b) => a.at.localeCompare(b.at));
          tlog(t, "linked", w.title);
          for (const c of w.cableCodes) if (!t.cableCodes.some((x) => normCode(x) === normCode(c))) t.cableCodes.push(c);
          t.claims = [...(t.claims ?? []), ...(w.claims ?? [])];
          t.comments = [...t.comments, ...w.comments];
          if (!t.stop && w.stop) t.stop = w.stop;
          if (!t.stages && w.stages) t.stages = w.stages;
          if (!t.stagesReported && w.stagesReported) t.stagesReported = w.stagesReported;
          if (!t.remaining && w.remaining) t.remaining = w.remaining;
          if (!t.workKey && w.workKey) t.workKey = w.workKey;
          p.tasks = p.tasks.filter((x) => x.id !== w.id);
        }),
      releaseClaim: (pid, taskId, claimId) =>
        setS((s) => {
          const t = findP(s, pid)?.tasks.find((x) => x.id === taskId);
          if (!t) return;
          const c = t.claims?.find((x) => x.id === claimId);
          if (!c || c.endedAt) return;
          endClaims(t, (x) => x.id === claimId, "released");
          tlog(t, "released", c.name);
          if (!activeClaims(t).length && t.status === "progress" && t.free) t.status = "todo";
        }),
      clearConflicts: (pid, id) =>
        setS((s) => {
          const t = findP(s, pid)?.tasks.find((x) => x.id === id);
          if (t) {
            t.conflicts = undefined;
            t.ambiguous = undefined;
          }
        }),

      addLink: (pid, l) => {
        const id = uid();
        setS((s) => {
          const p = findP(s, pid);
          if (!p) return;
          p.links.push({ ...l, id, token: token(), createdAt: nowIso() });
          log(p, "link", `Link “${l.name}” created`);
        });
        return id;
      },
      updateLink: (pid, id, patch) =>
        setS((s) => {
          const l = findP(s, pid)?.links.find((x) => x.id === id);
          if (l) Object.assign(l, patch);
        }),
      deleteLink: (pid, id) =>
        noDelete(getS(), pid) ||
        setS((s) => {
          const p = findP(s, pid);
          if (p) p.links = p.links.filter((l) => l.id !== id);
        }),
      regenerateLink: (pid, id) =>
        setS((s) => {
          const l = findP(s, pid)?.links.find((x) => x.id === id);
          if (l) l.token = token();
        }),

      submitReport: (pid, r) => {
        let num = 0;
        setS((s) => {
          const p = findP(s, pid);
          if (!p) return;
          p.reportSeq += 1;
          num = p.reportSeq;
          p.reports.unshift({ ...r, id: uid(), number: num, status: "pending", submittedAt: nowIso() });
          const rep = p.reports[0];
          // board: the foreman's results and incomplete cable work
          for (const te of rep.tasks) {
            const t = p.tasks.find((x) => x.id === te.taskId);
            if (t && te.outcome && t.status !== "done") {
              applyOutcome(t, te, rep);
              const by = rep.submittedByName || rep.linkName;
              taskToCables(p, t, (t.status as Task["status"]) === "done" ? "done" : te.outcome === "not_done" ? "not_done" : "partial", by, rep.id);
            }
          }
          const idx = new Map<string, Cable>();
          for (const c of p.cables) idx.set(normCode(c.code), c);
          for (const e of rep.cables) upsertCableWork(p, e, rep, idx);
          log(p, "report", `Report #${num} submitted by ${r.linkName} (${r.submittedByName})`);
        });
        return num;
      },
      approveReport: (pid, reportId, input) =>
        setS((s) => {
          const p = findP(s, pid);
          const r = p?.reports.find((x) => x.id === reportId);
          if (!p || !r || r.status !== "pending") return;
          const okCables = new Set(input.cableEntryIds);
          const okIssues = new Set(input.issueIds);
          const names = colNameMap(p);
          const index = new Map<string, Cable>();
          for (const c of p.cables) index.set(normCode(c.code), c);
          const at = new Date(`${r.date}T12:00:00`).toISOString();
          const reportAuto = buildAuto(p);

          for (const e of r.cables) {
            e.approved = okCables.has(e.id);
            if (!e.approved) continue;
            let c = (e.cableId ? p.cables.find((x) => x.id === e.cableId) : undefined) ?? index.get(normCode(e.code));
            if (!c && e.cableId && !e.isNew) {
              // the cable was deleted after the report was sent — do not resurrect it
              e.approved = false;
              continue;
            }
            if (!c) {
              c = newCable(e.code, {}, r.linkName, "created", `Report #${r.number}`);
              const dl = defaultList(p);
              if (dl !== MAIN_LIST) c.lists = [dl];
              c.history[0].reportId = r.id;
              c.history[0].employee = r.submittedByName;
              p.cables.push(c);
              index.set(normCode(e.code), c);
            }
            const changes: { column: string; from: string; to: string }[] = [];
            const vals: Record<string, string> = { ...(e.values ?? {}) };
            // legacy lines: stage ids without values
            for (const id of e.actionIds ?? (e.actionId ? [e.actionId] : [])) {
              const col = progressCol(p, id);
              if (col && !vals[id]) vals[id] = isFilled(col.type, c.values[id]) ? c.values[id]! : markValue(col, r.date);
            }
            let first = true;
            for (const [colId, v] of Object.entries(vals)) {
              if (!v) continue;
              const col = progressCol(p, colId);
              const from = c.values[colId] ?? "";
              if (!col) {
                if (from !== v) {
                  c.values[colId] = v;
                  changes.push({ column: names.get(colId) ?? colId, from, to: v });
                }
                continue;
              }
              const wasDone = !!c.done[colId];
              c.values[colId] = v;
              const nowDone = isFilled(col.type, v);
              if (nowDone) c.done[colId] = r.date;
              else delete c.done[colId];
              c.history.unshift(
                ev({
                  kind: nowDone ? "action" : "undone",
                  at,
                  actionId: colId,
                  actionName: col.name,
                  by: r.linkName,
                  employee: r.submittedByName,
                  reportId: r.id,
                  repeat: (nowDone && wasDone) || undefined,
                  reason: nowDone && wasDone ? e.reason : undefined,
                  note: first ? e.note : undefined,
                  changes: [{ column: col.name, from, to: v }],
                }),
              );
              first = false;
            }
            if (changes.length || (first && e.note)) {
              c.history.unshift(
                ev({ kind: "edited", at, by: r.linkName, employee: r.submittedByName, reportId: r.id, note: first ? e.note : undefined, changes }),
              );
            }
            c.updatedAt = nowIso();
            autoApply(reportAuto, c, p, { date: r.date });
          }

          for (const i of r.issues) {
            i.approved = okIssues.has(i.id);
            if (!i.approved) continue;
            p.issues.unshift({
              id: uid(),
              code: i.code,
              title: i.title,
              description: i.description,
              severity: i.severity,
              status: "open",
              source: "report",
              reportId: r.id,
              reportedBy: `${r.linkName} · ${r.submittedByName}`,
              createdAt: nowIso(),
            });
            if (i.code) {
              const c = index.get(normCode(i.code));
              if (c)
                c.history.unshift(
                  ev({ kind: "issue", at, by: r.linkName, employee: r.submittedByName, reportId: r.id, note: i.title }),
                );
            }
          }

          for (const te of r.tasks) {
            const t = p.tasks.find((x) => x.id === te.taskId);
            if (!t || te.outcome) continue;
            if (te.done && t.status !== "done") {
              t.status = "done";
              t.completedAt = nowIso();
              t.completedBy = r.submittedByName;
              taskToCables(p, t, "done", r.submittedByName || r.linkName, r.id);
            } else if (!te.done && t.status === "todo") {
              t.status = "progress";
              taskToCables(p, t, "started", r.submittedByName || r.linkName, r.id);
            }
            if (te.note) t.comments.push({ id: uid(), at: nowIso(), by: r.submittedByName, text: te.note });
          }

          confirmStages(p, r, index);

          const totalLines = r.cables.length + r.issues.length;
          const okLines = okCables.size + okIssues.size;
          r.status = totalLines === 0 || okLines === totalLines ? "approved" : okLines === 0 ? "rejected" : "partial";
          r.reviewedAt = nowIso();
          r.managerComment = input.comment || undefined;
          log(p, "approve", `Report #${r.number} (${r.linkName}) ${r.status}`);
        }),
      rejectReport: (pid, reportId, comment) =>
        setS((s) => {
          const p = findP(s, pid);
          const r = p?.reports.find((x) => x.id === reportId);
          if (!p || !r) return;
          for (const t of [...p.tasks]) {
            if (t.pendingReport?.id === r.id) t.pendingReport = undefined;
            if (t.stagesReported?.reportId === r.id) {
              t.stagesReported = undefined;
              dropIfOnlyFrom(p, t, r.id);
            }
          }
          r.status = "rejected";
          r.reviewedAt = nowIso();
          r.managerComment = comment || undefined;
          log(p, "approve", `Report #${r.number} (${r.linkName}) rejected`);
        }),
      undoApproval: (pid, reportId) =>
        setS((s) => {
          const p = findP(s, pid);
          const r = p?.reports.find((x) => x.id === reportId);
          if (!p || !r || r.status === "pending") return;
          for (const c of p.cables) {
            const own = c.history.filter((h) => h.reportId === r.id);
            if (!own.length) continue;
            c.history = c.history.filter((h) => h.reportId !== r.id);
            for (const h of own) {
              if ((h.kind === "action" || h.kind === "undone") && h.actionId) {
                const ch = h.changes?.[0];
                if (ch) c.values[h.actionId] = ch.from;
                const col = progressCol(p, h.actionId);
                const prev = c.history.find((x) => x.kind === "action" && x.actionId === h.actionId);
                if (col && isFilled(col.type, c.values[h.actionId])) c.done[h.actionId] = prev ? prev.at.slice(0, 10) : c.done[h.actionId] ?? r.date;
                else delete c.done[h.actionId];
                continue;
              }
              for (const ch of h.changes ?? []) {
                if (ch.column === "ID") continue;
                const col = [...colNameMap(p).entries()].find(([, n]) => n === ch.column);
                if (col) c.values[col[0]] = ch.from;
              }
            }
          }
          p.cables = p.cables.filter((c) => c.history.length > 0);
          p.issues = p.issues.filter((i) => i.reportId !== r.id);
          for (const e of r.cables) e.approved = undefined;
          for (const i of r.issues) i.approved = undefined;
          r.status = "pending";
          r.reviewedAt = undefined;
          log(p, "approve", `Approval of report #${r.number} undone`);
        }),

      addIssue: (pid, i) => {
        const id = uid();
        setS((s) => {
          const p = findP(s, pid);
          if (!p) return;
          p.issues.unshift({ ...i, id, status: "open", createdAt: nowIso() });
          if (i.code) {
            const c = p.cables.find((x) => normCode(x.code) === normCode(i.code!));
            c?.history.unshift(ev({ kind: "issue", by: i.reportedBy, note: i.title }));
          }
          log(p, "issue", `Issue “${i.title}” opened`);
        });
        return id;
      },
      updateIssue: (pid, id, patch) =>
        setS((s) => {
          const p = findP(s, pid);
          const i = p?.issues.find((x) => x.id === id);
          if (!p || !i) return;
          const wasResolved = i.status === "resolved";
          Object.assign(i, patch);
          if (patch.status === "resolved" && !wasResolved) {
            i.resolvedAt = nowIso();
            if (i.code) {
              const c = p.cables.find((x) => normCode(x.code) === normCode(i.code!));
              c?.history.unshift(ev({ kind: "resolved", by: who(), note: i.resolution ? `${i.title} — ${i.resolution}` : i.title }));
            }
            log(p, "issue", `Issue “${i.title}” resolved`);
          }
        }),

      submitRfi: (pid, r) => {
        let num = 0;
        setS((s) => {
          const p = findP(s, pid);
          if (!p) return;
          p.rfis ??= [];
          p.rfiSeq = (p.rfiSeq ?? 0) + 1;
          num = p.rfiSeq;
          p.rfis.unshift({ ...r, id: uid(), number: num, status: "pending", createdAt: nowIso() });
          log(p, "rfi", `RFI #${num} for ${r.code} from ${r.linkName} (${r.submittedByName})`);
        });
        return num;
      },
      approveRfi: (pid, id, comment) => {
        const p0 = findP(getS(), pid);
        const r0 = p0?.rfis?.find((x) => x.id === id);
        if (!p0 || !r0 || r0.status !== "pending") return "Not found";
        const cab0 = p0.cables.find((c) => c.id === r0.cableId) ?? p0.cables.find((c) => normCode(c.code) === normCode(r0.code));
        if (!cab0) return "The cable is no longer in the registry";
        const newCode = r0.changes.find((c) => c.colId === "__code")?.to.trim();
        if (newCode && p0.cables.some((c) => c.id !== cab0.id && normCode(c.code) === normCode(newCode))) return "This cable ID is already taken";
        setS((s) => {
          const p = findP(s, pid);
          const r = p?.rfis.find((x) => x.id === id);
          const c = p?.cables.find((x) => x.id === cab0.id);
          if (!p || !r || !c) return;
          const changes: { column: string; from: string; to: string }[] = [];
          for (const ch of r.changes) {
            if (ch.colId === "__code") {
              if (newCode && newCode !== c.code) {
                changes.push({ column: "ID", from: c.code, to: newCode });
                c.code = newCode;
              }
              continue;
            }
            const from = c.values[ch.colId] ?? "";
            if (from === ch.to) continue;
            c.values[ch.colId] = ch.to;
            changes.push({ column: ch.column, from, to: ch.to });
            const pc = progressCol(p, ch.colId);
            if (pc) syncDone(pc, c, nowIso().slice(0, 10));
          }
          if (changes.length)
            c.history.unshift(ev({ kind: "edited", by: r.linkName, employee: r.submittedByName, note: `RFI #${r.number}: ${r.reason}`, changes }));
          autoApply(buildAuto(p), c, p, { skip: new Set(r.changes.map((x) => x.colId)) });
          c.updatedAt = nowIso();
          r.status = "approved";
          r.reviewedAt = nowIso();
          r.managerComment = comment || undefined;
          log(p, "rfi", `RFI #${r.number} (${r.code}) approved`);
        });
        return null;
      },
      rejectRfi: (pid, id, comment) =>
        setS((s) => {
          const p = findP(s, pid);
          const r = p?.rfis?.find((x) => x.id === id);
          if (!p || !r) return;
          r.status = "rejected";
          r.reviewedAt = nowIso();
          r.managerComment = comment || undefined;
          log(p, "rfi", `RFI #${r.number} (${r.code}) rejected`);
        }),

      startThread: (pid, input) => {
        const id = uid();
        setS((s) => {
          const p = findP(s, pid);
          const link = p?.links.find((l) => l.id === input.linkId);
          if (!p || !link) return;
          p.threads ??= [];
          const at = nowIso();
          const codes = [...new Set(input.cableCodes)];
          p.threadSeq = (p.threadSeq ?? 0) + 1;
          p.threads.unshift({
            id,
            number: p.threadSeq,
            subject: input.subject.trim(),
            topic: input.topic,
            priority: input.priority,
            status: "open",
            linkId: link.id,
            linkName: link.name,
            linkType: link.type,
            startedBy: input.by,
            startedSide: input.side,
            cableCodes: codes,
            posts: [{ id: uid(), at, side: input.side, by: input.by, text: input.text.trim(), cableCodes: codes }],
            createdAt: at,
            updatedAt: at,
            ...(input.side === "manager" ? { seenManager: at } : { seenExternal: at }),
          });
          log(p, "message", `Conversation #${p.threadSeq} “${input.subject.trim()}” started by ${input.by} (${link.name})`);
        });
        return id;
      },
      postToThread: (pid, tid, post) =>
        setS((s) => {
          const p = findP(s, pid);
          const th = p?.threads?.find((x) => x.id === tid);
          if (!p || !th || th.status === "resolved") return;
          const at = nowIso();
          const codes = [...new Set(post.cableCodes)];
          th.posts.push({ id: uid(), at, side: post.side, by: post.by, text: post.text.trim(), cableCodes: codes });
          for (const c of codes) if (!th.cableCodes.some((x) => normCode(x) === normCode(c))) th.cableCodes.push(c);
          th.updatedAt = at;
          if (post.side === "manager") th.seenManager = at;
          else th.seenExternal = at;
          if (post.side === "external") log(p, "message", `New message in #${th.number} from ${post.by} (${th.linkName})`);
        }),
      setThreadStatus: (pid, tid, status, side, by) =>
        setS((s) => {
          const p = findP(s, pid);
          const th = p?.threads?.find((x) => x.id === tid);
          if (!p || !th || th.status === status) return;
          const at = nowIso();
          th.status = status;
          th.resolvedAt = status === "resolved" ? at : undefined;
          th.resolvedBy = status === "resolved" ? by : undefined;
          th.posts.push({ id: uid(), at, side, by, text: "", cableCodes: [], system: status === "resolved" ? "resolved" : "reopened" });
          th.updatedAt = at;
          log(p, "message", `Conversation #${th.number} ${status === "resolved" ? "resolved" : "reopened"} by ${by}`);
        }),
      updateThread: (pid, tid, patch) =>
        setS((s) => {
          const th = findP(s, pid)?.threads?.find((x) => x.id === tid);
          if (th) Object.assign(th, patch);
        }),
      markThreadSeen: (pid, tid, side) => {
        const th = findP(getS(), pid)?.threads?.find((x) => x.id === tid);
        if (!th) return;
        const last = th.posts[th.posts.length - 1]?.at ?? th.updatedAt;
        if ((side === "manager" ? th.seenManager : th.seenExternal) === last) return;
        setS((s) => {
          const t2 = findP(s, pid)?.threads?.find((x) => x.id === tid);
          if (t2) t2[side === "manager" ? "seenManager" : "seenExternal"] = last;
        });
      },
    })),
    {
      name: "cablegrid-v1",
      version: 6,
      migrate: (state, version) => {
        const st = state as { projects?: Project[] };
        for (const p of st.projects ?? []) migrateProject(p, version < 2);
        return st as State;
      },
      storage: idbStorage,
      partialize: (s) => ({ projects: s.projects, lang: s.lang }),
      onRehydrateStorage: () => () => {
        useStore.setState({ hydrated: true });
      },
    },
  ),
);

/** Storage key of a revision snapshot. */
export const revKey = (pid: string, id: string) => `cablegrid-rev:${pid}:${id}`;

export const loadRevision = async (pid: string, id: string) => {
  let raw = await get<string>(revKey(pid, id));
  const cl = useStore.getState().projects.find((p) => p.id === pid)?.cloud;
  if (!raw && cl?.key && !cl.off) {
    raw = (await getBlob(pid, cl.key, `rev-${id}`)) ?? undefined;
    if (raw) await set(revKey(pid, id), raw);
  }
  return raw ? (JSON.parse(raw) as import("./types").RevisionData) : null;
};

/** Find a project + the link that matches a public token. */
export const findByToken = (projects: Project[], tok: string) => {
  for (const p of projects) {
    const l = p.links.find((x) => x.token === tok);
    if (l) return { project: p, link: l };
  }
  return null;
};
