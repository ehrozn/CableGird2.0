/**
 * Work board model: which section a task lives in, its tags, cable stages.
 * Shared by the TV board, the QR take page, the manager's preview and the crew portal.
 */
import { normCode, todayStr } from "./ids";
import type { Cable, CableStages, ContactRole, Issue, Notice, ShiftItem, ShiftItemKind, ShiftSchedule, SiteContact, PortalLink, Project, StageKey, StageState, StopReason, Task, TaskClaim } from "./types";

export interface BoardCrew {
  id: string;
  name: string;
  memberIds: string[];
  active: boolean;
}
export interface BoardPerson {
  id: string;
  name: string;
  crew?: string;
  active: boolean;
}
export interface BoardIssue {
  id: string;
  title: string;
  code?: string;
  severity: Issue["severity"];
  createdAt: string;
  status: Issue["status"];
}
export interface BoardData {
  seq: number;
  now: string;
  name: string;
  cableStages: Project["cableStages"] | null;
  /** only for the TV link: the QR page token */
  takeToken?: string | null;
  tasks: Task[];
  crews: BoardCrew[];
  people: BoardPerson[];
  issues: BoardIssue[];
  /** announcements (older servers do not send them) */
  notices?: Notice[];
  /** who to call (older servers do not send them) */
  contacts?: SiteContact[];
  /** daily work schedule (older servers do not send it) */
  schedule?: ShiftSchedule | null;
  /** work schedules per group of crews */
  schedules?: ShiftSchedule[];
}

/* ───────── work schedule ───────── */

export const SHIFT_KINDS: { id: ShiftItemKind; label: string; color: string }[] = [
  { id: "lunch", label: "Lunch", color: "#FF5A1F" },
  { id: "break", label: "Break", color: "#2563EB" },
  { id: "briefing", label: "Briefing", color: "#1F9D63" },
  { id: "other", label: "Other", color: "#0B1F33" },
];
export const shiftKind = (k: ShiftItemKind) => SHIFT_KINDS.find((x) => x.id === k) ?? SHIFT_KINDS[SHIFT_KINDS.length - 1];
export const DEFAULT_SCHEDULE: ShiftSchedule = {
  start: "07:00",
  end: "17:00",
  days: [1, 2, 3, 4, 5],
  items: [
    { id: "lunch", kind: "lunch", start: "12:00", end: "12:30" },
  ],
};
/** every schedule of a project; the old single one becomes the first */
export const projectSchedules = (p: Pick<Project, "schedule" | "schedules">): ShiftSchedule[] =>
  p.schedules ?? (p.schedule ? [{ ...p.schedule, id: p.schedule.id ?? "main" }] : []);
export const boardSchedules = (d: Pick<BoardData, "schedule" | "schedules">): ShiftSchedule[] => d.schedules ?? (d.schedule ? [d.schedule] : []);
/** the schedule of a crew, if the manager linked one */
export const crewSchedule = (list: ShiftSchedule[], linkId?: string) => (linkId ? list.find((s) => s.crewIds?.includes(linkId)) : undefined);
/** Monday first — how crews read a week */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
/** "Mon–Thu", "Tue–Fri, Sun" */
export const fmtDays = (days: number[], name: (d: number) => string) => {
  const on = WEEK_ORDER.filter((d) => days.includes(d));
  if (on.length === 7) return null;
  const out: string[] = [];
  for (let i = 0; i < on.length; ) {
    let j = i;
    while (j + 1 < on.length && WEEK_ORDER.indexOf(on[j + 1]) === WEEK_ORDER.indexOf(on[j]) + 1) j++;
    out.push(j - i >= 2 ? `${name(on[i])}–${name(on[j])}` : on.slice(i, j + 1).map(name).join(", "));
    i = j + 1;
  }
  return out.join(", ");
};

const HM = /^([01]?\d|2[0-3]):([0-5]\d)$/;
export const isHm = (s?: string) => !!s && HM.test(s);
/** minutes since midnight */
export const hmMin = (s: string) => {
  const m = HM.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};
export const sortShiftItems = (items: ShiftItem[]) => [...items].filter((x) => isHm(x.start)).sort((a, b) => hmMin(a.start) - hmMin(b.start));

/** What is happening right now, for the countdown on the TV. */
export type ShiftNow =
  | { k: "dayoff"; next?: { day: number; start: string } }
  | { k: "before"; at: string; left: number }
  | { k: "in"; item: ShiftItem; until: string; left: number }
  | { k: "work"; next: { item?: ShiftItem; at: string; left: number } }
  | { k: "over"; next?: { day: number; start: string } };

export const shiftNow = (s: ShiftSchedule, now: Date): ShiftNow => {
  const day = now.getDay();
  const min = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const nextDay = () => {
    for (let i = 1; i <= 7; i++) {
      const d = (day + i) % 7;
      if (s.days.includes(d)) return { day: d, start: s.start };
    }
    return undefined;
  };
  if (!s.days.includes(day)) return { k: "dayoff", next: nextDay() };
  const start = hmMin(s.start);
  const end = hmMin(s.end);
  if (min < start) return { k: "before", at: s.start, left: start - min };
  if (min >= end) return { k: "over", next: nextDay() };
  const items = sortShiftItems(s.items);
  const cur = items.find((x) => x.end && isHm(x.end) && min >= hmMin(x.start) && min < hmMin(x.end));
  if (cur) return { k: "in", item: cur, until: cur.end!, left: hmMin(cur.end!) - min };
  const nx = items.find((x) => hmMin(x.start) > min && hmMin(x.start) < end);
  if (nx) return { k: "work", next: { item: nx, at: nx.start, left: hmMin(nx.start) - min } };
  return { k: "work", next: { at: s.end, left: end - min } };
};
/** "25 min" / "2 h 10 min" */
export const fmtLeft = (min: number, t: (k: string, v?: Record<string, string | number>) => string) => {
  const m = Math.max(1, Math.ceil(min));
  if (m < 60) return t("{n} min", { n: m });
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? t("{h} h {m} min", { h, m: r }) : t("{h} h", { h });
};

/* ───────── contacts ───────── */

export const CONTACT_ROLES: { id: ContactRole; label: string; fg: string; bg: string }[] = [
  { id: "emergency", label: "Emergency", fg: "#C42537", bg: "#FDE8EB" },
  { id: "foreman", label: "Foreman", fg: "#D9430E", bg: "#FFEDE5" },
  { id: "manager", label: "Project manager", fg: "#2563EB", bg: "#E6EEFE" },
  { id: "safety", label: "Safety officer", fg: "#167A4C", bg: "#E3F5EC" },
  { id: "warehouse", label: "Warehouse / materials", fg: "#8A6D00", bg: "#FFF6CC" },
  { id: "other", label: "Other", fg: "#0B1F33", bg: "#E4E9EE" },
];
export const contactRole = (c: Pick<SiteContact, "role">) => CONTACT_ROLES.find((r) => r.id === c.role) ?? CONTACT_ROLES[CONTACT_ROLES.length - 1];
/** emergency numbers always first, then the manager's order */
export const sortContacts = (list: SiteContact[] | undefined) =>
  (list ?? []).map((c, i) => ({ c, i })).sort((a, b) => Number(b.c.role === "emergency") - Number(a.c.role === "emergency") || a.i - b.i).map((x) => x.c);
/** a phone number a `tel:` link understands */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+*#,;]/g, "")}`;

/* ───────── announcements ───────── */

export const NOTICE_KINDS: { id: Notice["kind"]; label: string; fg: string; bg: string }[] = [
  { id: "info", label: "News", fg: "#0B1F33", bg: "#E4E9EE" },
  { id: "important", label: "Important", fg: "#D9430E", bg: "#FFEDE5" },
  { id: "safety", label: "Safety", fg: "#C42537", bg: "#FDE8EB" },
  { id: "good", label: "Good news", fg: "#167A4C", bg: "#E3F5EC" },
];
/** important and safety notices get the banner under the board header */
export const isUrgent = (n: Pick<Notice, "kind">) => n.kind === "important" || n.kind === "safety";
export type NoticeState = "live" | "scheduled" | "expired" | "hidden";
export const noticeState = (n: Notice, today: string): NoticeState =>
  !n.active ? "hidden" : n.from && n.from > today ? "scheduled" : n.until && n.until < today ? "expired" : "live";
/** What the TV shows today: urgent first (safety before important), then newest. */
export const liveNotices = (list: Notice[] | undefined, today: string) => {
  const rank = { safety: 0, important: 1, good: 2, info: 2 } as const;
  return (list ?? []).filter((n) => noticeState(n, today) === "live").sort((a, b) => rank[a.kind] - rank[b.kind] || b.createdAt.localeCompare(a.createdAt));
};

const linkActive = (l: PortalLink, today: string) => l.active !== false && !(l.expiresAt && l.expiresAt < today);

/** The same data the server gives the TV, built from a local project (manager preview). */
export const boardDataFromProject = (p: Project): BoardData => {
  const today = new Date().toISOString().slice(0, 10);
  return {
    seq: p.cloud?.seq ?? 0,
    now: new Date().toISOString(),
    name: p.name,
    cableStages: p.cableStages ?? null,
    tasks: p.tasks,
    crews: p.links.filter((l) => l.type === "crew").map((l) => ({ id: l.id, name: l.name, memberIds: l.memberIds, active: linkActive(l, today) })),
    people: p.employees.map((e) => ({ id: e.id, name: e.name, crew: e.crew, active: e.active })),
    issues: p.issues
      .filter((i) => i.status !== "resolved")
      .map((i) => ({ id: i.id, title: i.title, code: i.code, severity: i.severity, createdAt: i.createdAt, status: i.status })),
    notices: (p.notices ?? []).filter((n) => n.active),
    contacts: p.contacts ?? [],
    schedules: projectSchedules(p),
  };
};

/* ───────── task mode & claims ───────── */

export type TaskMode = "free" | "crew" | "people" | "none";
export const taskMode = (t: Task): TaskMode => (t.free ? "free" : t.crewLinkId ? "crew" : t.assigneeIds.length ? "people" : "none");
export const activeClaims = (t: Task): TaskClaim[] => (t.claims ?? []).filter((c) => !c.endedAt);
export const slotsOf = (t: Task) => Math.max(1, t.slots ?? 1);
export const openSlots = (t: Task) => Math.max(0, slotsOf(t) - activeClaims(t).length);
/** can someone take it from the QR page right now */
export const canTake = (t: Task, today = todayStr()) => !!t.free && t.status !== "done" && !t.stop?.blocked && openSlots(t) > 0 && !(t.start && t.start > today);

/** local calendar day of an ISO timestamp */
export const localDay = (iso?: string) => {
  if (!iso) return "";
  if (iso.length === 10) return iso;
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/* ───────── sections ───────── */

export type SectionId = "free" | "assigned" | "progress" | "incomplete" | "blocked" | "done";
export const SECTIONS: { id: SectionId; label: string; tone: string }[] = [
  { id: "free", label: "Free tasks", tone: "#FF5A1F" },
  { id: "assigned", label: "Assigned to crews", tone: "#0B1F33" },
  { id: "progress", label: "In progress", tone: "#2563EB" },
  { id: "incomplete", label: "Incomplete work", tone: "#C79A00" },
  { id: "blocked", label: "Problems & blocks", tone: "#E5384B" },
  { id: "done", label: "Done today", tone: "#1F9D63" },
];

/** One task → one main section (or hidden). */
export const sectionOf = (t: Task, today = todayStr()): SectionId | null => {
  if (t.start && t.start > today && t.status !== "done") return null;
  if (t.status === "done") return localDay(t.completedAt) === today ? "done" : null;
  if (t.stop?.blocked) return "blocked";
  if (activeClaims(t).length) return "progress";
  if (t.free) return "free";
  const mode = taskMode(t);
  if (mode === "none" && t.origin) return "incomplete";
  if (t.remaining || t.stop || t.stagesReported || (t.origin && mode === "none")) return "incomplete";
  if (mode === "crew" && t.status === "progress") return "progress";
  return "assigned";
};

export type StatusId = "open" | "assigned" | "unassigned" | "progress" | "partial" | "blocked" | "done";
export const STATUS: Record<StatusId, { label: string; fg: string; bg: string }> = {
  open: { label: "Open", fg: "#D9430E", bg: "#FFEDE5" },
  assigned: { label: "Assigned", fg: "#0B1F33", bg: "#E4E9EE" },
  unassigned: { label: "Needs a decision", fg: "#7A5B00", bg: "#FFF6CC" },
  progress: { label: "In progress", fg: "#2563EB", bg: "#E6EEFE" },
  partial: { label: "Partly done", fg: "#7A5B00", bg: "#FFF6CC" },
  blocked: { label: "Blocked", fg: "#C42537", bg: "#FDE8EB" },
  done: { label: "Done", fg: "#167A4C", bg: "#E3F5EC" },
};
export const statusOf = (t: Task, today = todayStr()): StatusId => {
  const s = sectionOf(t, today);
  if (t.status === "done") return "done";
  if (t.stop?.blocked) return "blocked";
  if (s === "progress") return "progress";
  if (s === "free") return "open";
  if (s === "incomplete") return taskMode(t) === "none" ? "unassigned" : "partial";
  return taskMode(t) === "none" ? "unassigned" : "assigned";
};

export type TagId = "blocked" | "take" | "need" | "foreman" | "approval" | "overdue";
export interface Tag {
  id: TagId;
  label: string;
  vars?: Record<string, string | number>;
}
const FOREMAN_HOUR = 17;
export const tagsOf = (t: Task, now = new Date()): Tag[] => {
  const today = localDay(now.toISOString());
  const out: Tag[] = [];
  if (t.status === "done") return out;
  const act = activeClaims(t);
  if (t.stop?.blocked) out.push({ id: "blocked", label: "Blocked" });
  if (t.free && !t.stop?.blocked) {
    const left = openSlots(t);
    if (left > 0 && act.length === 0) out.push({ id: "take", label: "Can take" });
    else if (left > 0) out.push({ id: "need", label: "Need {n} more", vars: { n: left } });
  }
  if (act.some((c) => localDay(c.at) < today) || (act.length && now.getHours() >= FOREMAN_HOUR)) out.push({ id: "foreman", label: "Awaiting foreman report" });
  if (t.pendingReport || t.stagesReported) out.push({ id: "approval", label: "Awaiting approval" });
  if (t.due && t.due < today) out.push({ id: "overdue", label: "Overdue" });
  return out;
};

export interface BoardItem {
  key: string;
  section: SectionId;
  task?: Task;
  issue?: BoardIssue;
  rank: number;
}

const PRI: Record<string, number> = { high: 0, normal: 1, low: 2 };
/** Board items per section, each work exactly once. */
export const boardItems = (d: BoardData, today = todayStr()): Record<SectionId, BoardItem[]> => {
  const out: Record<SectionId, BoardItem[]> = { free: [], assigned: [], progress: [], incomplete: [], blocked: [], done: [] };
  for (const t of d.tasks) {
    const s = sectionOf(t, today);
    if (!s) continue;
    const overdue = t.due && t.due < today ? 0 : 1;
    out[s].push({ key: t.id, section: s, task: t, rank: s === "done" ? -Date.parse(t.completedAt ?? "0") : overdue * 10 + (PRI[t.priority] ?? 1) + (t.due ? 0 : 0.5) });
  }
  for (const i of d.issues) out.blocked.push({ key: `i-${i.id}`, section: "blocked", issue: i, rank: 5 + (i.severity === "high" ? 0 : i.severity === "medium" ? 1 : 2) });
  for (const s of Object.keys(out) as SectionId[]) out[s].sort((a, b) => a.rank - b.rank || (a.task?.due ?? "9").localeCompare(b.task?.due ?? "9"));
  return out;
};

/** Whole days from today to a YYYY-MM-DD date (negative = past). */
export const daysUntil = (day: string, today: string) => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);

/** Order of each crew's waiting tasks: key → { crew, pos } (1 = next up). */
export const crewQueue = (items: BoardItem[], d: Pick<BoardData, "crews">) => {
  const count = new Map<string, number>();
  const out = new Map<string, { crew: string; pos: number }>();
  for (const it of items) {
    const id = it.task?.crewLinkId;
    if (!id) continue;
    const n = (count.get(id) ?? 0) + 1;
    count.set(id, n);
    out.set(it.key, { crew: d.crews.find((c) => c.id === id)?.name ?? "", pos: n });
  }
  return out;
};

/** Crew name(s) and people working on a task. */
export const whoOn = (t: Task, d: Pick<BoardData, "crews" | "people">) => {
  const crews = new Set<string>();
  const people: string[] = [];
  if (t.crewLinkId) {
    const c = d.crews.find((x) => x.id === t.crewLinkId);
    if (c) crews.add(c.name);
  }
  for (const id of t.assigneeIds) {
    const e = d.people.find((x) => x.id === id);
    if (e) people.push(e.name);
  }
  for (const c of activeClaims(t)) {
    crews.add(c.linkName);
    if (!people.includes(c.name)) people.push(c.name);
  }
  return { crews: [...crews], people };
};

/** Last thing somebody wrote about the task. */
export const lastNote = (t: Task): { text: string; by: string; at: string } | null => {
  const ev = [...(t.log ?? [])].reverse().find((e) => e.kind === "note" || e.kind === "report");
  const cm = t.comments[t.comments.length - 1];
  if (ev && (!cm || ev.at >= cm.at)) return { text: ev.text, by: ev.by, at: ev.at };
  return cm ? { text: cm.text, by: cm.by, at: cm.at } : null;
};

/* ───────── stop reasons ───────── */

export const STOP_REASONS: { id: StopReason; label: string }[] = [
  { id: "material", label: "No material / conduit" },
  { id: "route", label: "Route not ready" },
  { id: "access", label: "No access" },
  { id: "equipment", label: "No equipment" },
  { id: "other_crew", label: "Needs another crew" },
  { id: "time", label: "Ran out of time" },
  { id: "other", label: "Other" },
];
export const reasonLabel = (r?: StopReason) => STOP_REASONS.find((x) => x.id === r)?.label ?? "Reason not given";

/* ───────── cable stages ───────── */

export const STAGE_KEYS: StageKey[] = ["pull", "termA", "termB", "test"];
export const STAGE_LABEL: Record<StageKey, string> = { pull: "Pulling", termA: "Termination A", termB: "Termination B", test: "Testing" };
export const STAGE_STATE_LABEL: Record<StageState, string> = {
  not_started: "Not started",
  progress: "In progress",
  done: "Done",
  na: "Not required",
  failed: "Test failed",
};
export const STAGE_COLOR: Record<StageState, string> = { not_started: "#D4DAD2", progress: "#2563EB", done: "#1F9D63", na: "#EEF1EC", failed: "#E5384B" };

const DETECT: Record<StageKey, RegExp> = {
  pull: /pull|протяж|проклад|tend|lay|instal|монтаж/i,
  termA: /(term|оконц|конц|термин|conect|terminac|connect)[^]*?(\bA\b|-A\b|\(A\)|сторона\s*A|side\s*A|A[- ]?end)|(\bA[- ]?end|side\s*A|сторона\s*A)/i,
  termB: /(term|оконц|конц|термин|conect|terminac|connect)[^]*?(\bB\b|-B\b|\(B\)|сторона\s*B|side\s*B|B[- ]?end)|(\bB[- ]?end|side\s*B|сторона\s*B)/i,
  test: /test|тест|prueba|fluke|certif|измер|cert\b/i,
};
export const FAIL_RE = /fail|fallo|брак|не\s*прош|не\s*годен|❌|✗/i;

/** Which progress column is which stage: saved mapping, else guessed from column names. */
export const stageMap = (p: Pick<Project, "cableStages" | "actions">): Partial<Record<StageKey, string>> => {
  if (p.cableStages) return p.cableStages;
  const out: Partial<Record<StageKey, string>> = {};
  const used = new Set<string>();
  for (const k of ["termA", "termB", "test", "pull"] as StageKey[]) {
    const a = p.actions.find((x) => !used.has(x.id) && DETECT[k].test(x.name));
    if (a) {
      out[k] = a.id;
      used.add(a.id);
    }
  }
  if (!out.termA) {
    const a = p.actions.find((x) => !used.has(x.id) && /term|оконц|термин|terminac|conect/i.test(x.name));
    if (a) out.termA = a.id;
  }
  return out;
};
export const trackedStages = (map: Partial<Record<StageKey, string>>) => STAGE_KEYS.filter((k) => map[k] && map[k] !== "na");

/** Stage states of a cable from the registry (prev keeps "in progress" details for stages not done yet). */
export const stagesFromCable = (p: Pick<Project, "cableStages" | "actions">, c: Cable | undefined, prev?: CableStages): CableStages => {
  const map = stageMap(p);
  const out: CableStages = {};
  for (const k of STAGE_KEYS) {
    const col = map[k];
    if (!col) continue;
    if (col === "na") {
      out[k] = { state: "na" };
      continue;
    }
    const v = c?.values[col] ?? "";
    if (k === "test" && v && FAIL_RE.test(v)) out[k] = { state: "failed" };
    else if (c?.done[col]) out[k] = { state: "done" };
    else if (prev?.[k] && prev[k]!.state !== "done") out[k] = { ...prev[k]! };
    else out[k] = { state: "not_started" };
  }
  return out;
};

/** Every required stage done and the test passed. */
export const stagesComplete = (st: CableStages) => {
  const vals = Object.values(st);
  return vals.length > 0 && vals.every((s) => s && (s.state === "done" || s.state === "na"));
};
export const stagesSummary = (st: CableStages) => {
  const vals = STAGE_KEYS.filter((k) => st[k] && st[k]!.state !== "na");
  return { done: vals.filter((k) => st[k]!.state === "done").length, total: vals.length };
};

export const workKeyFor = (code: string) => `cable:${normCode(code)}`;
