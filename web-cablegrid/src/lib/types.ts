export type Lang = "en" | "es" | "ru";

export type ColumnType = "text" | "number" | "select" | "date" | "checkbox";

export interface Column {
  id: string;
  name: string;
  type: ColumnType;
  options?: string[];
  width?: number;
  /** Progress column: keeps its own type; crews fill it in reports and a filled value counts as done for readiness. Its id is also the stage id. */
  progress?: boolean;
  /** Per sheet: read-only on this sheet (a lookup of a column that is edited on another sheet). */
  locked?: boolean;
  /** Computed column: formula over other columns, e.g. `{Length} * 1.1` or `{A-end} & " → " & {B-end}`. Read-only. */
  formula?: string;
  /** Validation: required value. */
  required?: boolean;
  /** Validation: values must be unique across cables (e.g. panel port). */
  unique?: boolean;
}

export type ColumnDraft = Omit<Column, "id">;

/** A workbook (file) of the registry; it holds sheets. */
export interface Book {
  id: string;
  name: string;
}

export interface Sheet {
  id: string;
  name: string;
  /** workbook the sheet lives in */
  bookId?: string;
  /** Cable list the sheet shows. Sheets with the same list are linked by Cable ID. Missing = "main". */
  listId?: string;
  columns: Column[];
  /** @deprecated legacy (v2) — stages are now progress columns. */
  stageIds?: string[];
  hideProgress?: boolean;
}

export type HistoryKind = "created" | "imported" | "edited" | "action" | "issue" | "resolved" | "undone" | "task" | "status";

/** What happened to a task this cable belongs to (history kind "task"). */
export type TaskOutcome = "taken" | "started" | "done" | "partial" | "not_done" | "reopened";
/** Status set by hand when the registry has no progress columns (history kind "status"). */
export type ManualState = "none" | "progress" | "complete";

export interface HistoryEvent {
  id: string;
  at: string;
  kind: HistoryKind;
  actionId?: string;
  actionName?: string;
  by: string;
  employee?: string;
  reportId?: string;
  note?: string;
  repeat?: boolean;
  reason?: string;
  changes?: { column: string; from: string; to: string }[];
  /** kind "task": the task (note = its title) and what happened */
  taskId?: string;
  outcome?: TaskOutcome;
  /** kind "status": the status picked by hand */
  state?: ManualState;
}

export interface Cable {
  id: string;
  code: string;
  /** Cable lists (see Sheet.listId) this cable belongs to. Missing = ["main"]. */
  lists?: string[];
  values: Record<string, string>;
  done: Record<string, string>;
  history: HistoryEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkAction {
  id: string;
  name: string;
  weight: number;
  color: string;
}

export type Role = "manager" | "foreman" | "technician" | "inspector" | "subcontractor";
export type Access = "registry" | "tasks" | "reports" | "issues";

export interface Employee {
  id: string;
  name: string;
  role: Role;
  phone?: string;
  email?: string;
  crew?: string;
  access: Access[];
  active: boolean;
  createdAt: string;
}

export interface TaskComment {
  id: string;
  at: string;
  by: string;
  text: string;
}

export type TaskStatus = "todo" | "progress" | "done";
export type Priority = "low" | "normal" | "high";

export interface Task {
  id: string;
  title: string;
  description: string;
  assigneeIds: string[];
  due?: string;
  priority: Priority;
  status: TaskStatus;
  cableCodes: string[];
  comments: TaskComment[];
  createdAt: string;
  completedAt?: string;
  completedBy?: string;
  /* ── work board ── */
  /** free task: anyone takes it by scanning the board QR, no approval */
  free?: boolean;
  /** free task: how many people can take it at once (default 1) */
  slots?: number;
  /** crew task: only this crew link works on it */
  crewLinkId?: string;
  location?: string;
  /** do not show before this date */
  start?: string;
  /** what "done" means */
  criteria?: string;
  /** tools, access, permits… */
  requirements?: string;
  files?: TaskFile[];
  /** who took / worked on it (never deleted — the history of the task) */
  claims?: TaskClaim[];
  log?: TaskEvent[];
  /** what is done so far / what is left (from foreman reports) */
  progressDone?: string;
  remaining?: string;
  stop?: WorkStop;
  /** incomplete work found in a report (not a task the manager created) */
  origin?: { reportId: string; reportNumber: number; linkName: string; linkId?: string };
  /** dedupe key of report-made work: `cable:<CODE>` */
  workKey?: string;
  /** the latest foreman result on this task waits for the manager's approval */
  pendingReport?: { id: string; number: number };
  /** cable stages confirmed by the manager */
  stages?: CableStages;
  /** stages a crew reported, waiting for the manager */
  stagesReported?: { stages: CableStages; reportId: string; number: number; at: string; by: string };
  /** contradictions between reports, shown to the manager */
  conflicts?: { stage: StageKey; reported: StageState; reportNumber: number; at: string }[];
  /** cable lines that could belong to several tasks — the manager decides */
  ambiguous?: { code: string; reportId: string; number: number; taskIds: string[] }[];
}

export interface TaskFile {
  id: string;
  name: string;
  size: number;
  type: string;
  at: string;
}

export type ClaimOutcome = "done" | "partial" | "not_done" | "reassigned" | "released";

/** One person on a free task (taken via QR) — or a crew finishing its share. */
export interface TaskClaim {
  id: string;
  empId?: string;
  name: string;
  linkId: string;
  linkName: string;
  at: string;
  endedAt?: string;
  outcome?: ClaimOutcome;
  reportId?: string;
  note?: string;
}

export type TaskEventKind =
  | "created"
  | "claimed"
  | "note"
  | "report"
  | "assigned"
  | "freed"
  | "blocked"
  | "unblocked"
  | "done"
  | "reopened"
  | "linked"
  | "conflict"
  | "released";

export interface TaskEvent {
  id: string;
  at: string;
  by: string;
  kind: TaskEventKind;
  text: string;
  reportId?: string;
}

export type StopReason = "material" | "route" | "access" | "equipment" | "other_crew" | "time" | "other";

/** Why work stopped. blocked = cannot continue until the manager clears it. */
export interface WorkStop {
  reason?: StopReason;
  note?: string;
  needs?: string;
  blocked: boolean;
  at: string;
  by: string;
  reportId?: string;
}

export type StageKey = "pull" | "termA" | "termB" | "test";
export type StageState = "not_started" | "progress" | "done" | "na" | "failed";
export interface StageInfo {
  state: StageState;
  /** pull: percent done */
  pct?: number;
  /** pull: length done */
  len?: number;
}
export type CableStages = Partial<Record<StageKey, StageInfo>>;

/** Board links: TV (view only) and QR take page. */
export interface BoardSettings {
  token: string;
  takeToken: string;
  active: boolean;
  createdAt: string;
}

/** Announcement on the TV board (and the QR page). */
export type NoticeKind = "info" | "important" | "safety" | "good";
export interface Notice {
  id: string;
  kind: NoticeKind;
  title: string;
  text?: string;
  /** YYYY-MM-DD: show from this day (inclusive) */
  from?: string;
  /** YYYY-MM-DD: show until this day (inclusive) */
  until?: string;
  active: boolean;
  createdAt: string;
  by?: string;
}

/** Who to call — shown big on the TV board and tappable on the QR page. */
export type ContactRole = "emergency" | "foreman" | "manager" | "safety" | "warehouse" | "other";
export interface SiteContact {
  id: string;
  role: ContactRole;
  /** custom role name, e.g. "Electrician on call" */
  label?: string;
  name: string;
  phone: string;
  /** hours, room, radio channel… */
  note?: string;
}

/** Daily work schedule — on the TV with a live countdown and on the QR page. */
export type ShiftItemKind = "lunch" | "break" | "briefing" | "other";
export interface ShiftItem {
  id: string;
  kind: ShiftItemKind;
  /** custom name, e.g. "Toolbox talk" */
  label?: string;
  /** "HH:MM" */
  start: string;
  /** "HH:MM"; empty = a moment (briefing, delivery) */
  end?: string;
}
export interface ShiftSchedule {
  id?: string;
  /** group name, e.g. "Crew A" — needed when there is more than one schedule */
  name?: string;
  /** crew links that work on this schedule (their QR page shows it first) */
  crewIds?: string[];
  /** "HH:MM" */
  start: string;
  end: string;
  /** working days, 0 = Sunday … 6 = Saturday */
  days: number[];
  items: ShiftItem[];
}

export type LinkType = "crew" | "client";

export interface ClientSettings {
  sheetId?: string;
  columnIds: string[];
  showStats: boolean;
  showIssues: boolean;
  allowMessages: boolean;
}

export interface PortalLink {
  id: string;
  token: string;
  name: string;
  type: LinkType;
  memberIds: string[];
  active: boolean;
  pin?: string;
  expiresAt?: string;
  createdAt: string;
  auto?: boolean;
  client?: ClientSettings;
}

export interface ReportCableEntry {
  id: string;
  code: string;
  isNew: boolean;
  /** registry cable at submit time — survives renames (ID changes) before approval */
  cableId?: string;
  /** @deprecated single stage of older reports — use actionIds */
  actionId?: string;
  actionIds?: string[];
  repeat: boolean;
  reason?: string;
  note?: string;
  values?: Record<string, string>;
  approved?: boolean;
  /** "not finished": state of each cable stage */
  stages?: CableStages;
  stop?: Omit<WorkStop, "at" | "by">;
}

export interface ReportTaskEntry {
  taskId: string;
  hours: number;
  done: boolean;
  note: string;
  /** foreman's end-of-day result (board tasks) — applied when the report is sent */
  outcome?: "done" | "partial" | "not_done";
  didText?: string;
  leftText?: string;
  reason?: StopReason;
  reasonNote?: string;
  needs?: string;
  blocked?: boolean;
}

export type Severity = "low" | "medium" | "high";

export interface ReportIssue {
  id: string;
  code?: string;
  title: string;
  description: string;
  severity: Severity;
  approved?: boolean;
}

export interface MaterialUse {
  name: string;
  qty: number;
  unit: string;
}

export type ReportStatus = "pending" | "approved" | "partial" | "rejected";

export interface Report {
  id: string;
  number: number;
  linkId: string;
  linkName: string;
  date: string;
  submittedBy: string;
  submittedByName: string;
  crewSize: number;
  workerIds: string[];
  tasks: ReportTaskEntry[];
  cables: ReportCableEntry[];
  materials: MaterialUse[];
  issues: ReportIssue[];
  notes: string;
  status: ReportStatus;
  submittedAt: string;
  reviewedAt?: string;
  managerComment?: string;
}

export type IssueStatus = "open" | "progress" | "resolved";

export interface Issue {
  id: string;
  code?: string;
  title: string;
  description: string;
  severity: Severity;
  status: IssueStatus;
  source: "report" | "manager" | "client";
  reportId?: string;
  reportedBy: string;
  createdAt: string;
  resolvedAt?: string;
  resolution?: string;
}

export type RfiStatus = "pending" | "approved" | "rejected";

/** One requested change. colId "__code" means the cable ID itself. */
export interface RfiChange {
  colId: string;
  column: string;
  from: string;
  to: string;
}

/** Request for information / change: crew asks to change non-progress data of a cable. */
export interface Rfi {
  id: string;
  number: number;
  linkId: string;
  linkName: string;
  submittedBy: string;
  submittedByName: string;
  cableId?: string;
  code: string;
  changes: RfiChange[];
  reason: string;
  status: RfiStatus;
  createdAt: string;
  reviewedAt?: string;
  managerComment?: string;
}

export interface Message {
  id: string;
  linkId: string;
  linkName: string;
  author: string;
  text: string;
  cableCodes: string[];
  createdAt: string;
  read: boolean;
  reply?: string;
  repliedAt?: string;
}

export type ThreadPriority = "low" | "normal" | "high" | "urgent";
export type ThreadTopic = "question" | "schedule" | "change" | "issue" | "docs" | "other";
export type ThreadStatus = "open" | "resolved";
/** manager = project office; external = whoever uses a client / crew link */
export type ThreadSide = "manager" | "external";

export interface ThreadPost {
  id: string;
  at: string;
  side: ThreadSide;
  by: string;
  text: string;
  cableCodes: string[];
  /** service line in the conversation (status changes) */
  system?: "resolved" | "reopened";
}

/** A conversation on one question between the manager and a client / crew link. Runs until someone marks it resolved. */
export interface Thread {
  id: string;
  number: number;
  subject: string;
  topic: ThreadTopic;
  priority: ThreadPriority;
  status: ThreadStatus;
  linkId?: string;
  linkName: string;
  linkType: LinkType;
  startedBy: string;
  startedSide: ThreadSide;
  /** every cable attached anywhere in the conversation */
  cableCodes: string[];
  posts: ThreadPost[];
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  seenManager?: string;
  seenExternal?: string;
}

export interface Activity {
  id: string;
  at: string;
  text: string;
  kind: "report" | "approve" | "task" | "issue" | "import" | "message" | "registry" | "link" | "team" | "rfi";
  /** who did it (manager name) */
  by?: string;
}

export type RuleOp = "ends" | "starts" | "contains" | "not_contains" | "equals" | "not_equals" | "empty" | "filled" | "regex";

/** field: "__code" for the cable ID, otherwise a column id */
export interface RuleCond {
  field: string;
  op: RuleOp;
  value: string;
}

export interface RuleSet {
  colId: string;
  value: string;
}

/** "If … then …" rule: when the conditions match, columns get values. */
export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  match: "all" | "any";
  when: RuleCond[];
  then: RuleSet[];
  /** replace values that are already filled (otherwise only empty cells are filled) */
  overwrite: boolean;
}

/** Order of work stages (progress columns) and how strictly it is enforced. */
export interface StageFlow {
  order: string[];
  /** a stage can be marked only when every earlier stage is done */
  requirePrevious: boolean;
  /** an earlier stage cannot be cleared while a later one is marked */
  lockEarlier: boolean;
}

export interface SavedView {
  id: string;
  name: string;
  sheetId: string;
  q: string;
  state: string;
  colF: string;
  valF: string;
  groupBy: string;
  sort: { key: string; dir: 1 | -1 } | null;
}

/** Conditional formatting: rows that match get a colour. */
export interface CondFormat {
  id: string;
  name: string;
  when: RuleCond;
  color: string;
}

export type ProjectKind = "datacenter" | "structured" | "fiber" | "telecom" | "mixed";
export type Units = "m" | "ft";

export interface Project {
  id: string;
  name: string;
  client: string;
  location: string;
  kind: ProjectKind;
  description: string;
  startDate?: string;
  endDate?: string;
  units: Units;
  idPattern: string;
  createdAt: string;
  updatedAt: string;
  books: Book[];
  sheets: Sheet[];
  cables: Cable[];
  rules: Rule[];
  stageFlow?: StageFlow;
  views: SavedView[];
  formats?: CondFormat[];
  /** registry revisions (snapshots) */
  revisions: Revision[];
  actions: WorkAction[];
  employees: Employee[];
  tasks: Task[];
  links: PortalLink[];
  reports: Report[];
  issues: Issue[];
  rfis: Rfi[];
  rfiSeq: number;
  /** @deprecated single messages of older versions — migrated into threads */
  messages: Message[];
  threads: Thread[];
  threadSeq: number;
  materials: string[];
  activity: Activity[];
  reportSeq: number;
  /** work board TV / QR links */
  board?: BoardSettings;
  /** announcements and news on the TV board */
  notices?: Notice[];
  /** who to call — on the TV board and the QR page */
  contacts?: SiteContact[];
  /** daily work schedule — on the TV and the QR page */
  /** @deprecated the first single schedule — read through `projectSchedules` */
  schedule?: ShiftSchedule;
  /** work schedules, one per group of crews */
  schedules?: ShiftSchedule[];
  /** which progress column is each cable stage; "na" = not required on this project */
  cableStages?: Partial<Record<StageKey, string>>;
  /** cloud sync state of this device (never synced itself) */
  cloud?: CloudMeta;
}

export interface CloudMeta {
  role: "owner" | "editor" | "crew" | "client";
  /** secret: owner key, manager share token or crew/client link token */
  key: string;
  /** last server change applied here */
  seq: number;
  /** first full upload finished */
  ready: boolean;
  /** cloud unavailable for this project (id taken / deleted) */
  off?: boolean;
}

/** A frozen copy of cable values at a moment ("Rev B — issued for construction"). The data itself lives in its own storage key. */
export interface Revision {
  id: string;
  name: string;
  at: string;
  cables: number;
}

export interface RevisionData {
  /** cable code → values by column id */
  data: Record<string, Record<string, string>>;
  /** column id → name at that moment */
  columns: Record<string, string>;
}
