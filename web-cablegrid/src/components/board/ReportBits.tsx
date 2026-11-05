import { AlertTriangle, Check, Clock, Lock, Minus, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  activeClaims,
  STAGE_KEYS,
  STAGE_LABEL,
  STAGE_STATE_LABEL,
  STOP_REASONS,
} from "@/lib/board";
import { useFmt, useT } from "@/lib/i18n";
import type {
  CableStages,
  PortalLink,
  StageKey,
  StageState,
  StopReason,
  Task,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export type Outcome = "done" | "partial" | "not_done";

export interface TaskDraft {
  done: boolean;
  hours: string;
  note: string;
  outcome?: Outcome;
  didText?: string;
  leftText?: string;
  reason?: StopReason | "";
  reasonNote?: string;
  needs?: string;
  blocked?: boolean;
}

export interface EntryStop {
  reason?: StopReason;
  note?: string;
  needs?: string;
  blocked: boolean;
}

/** What is missing in a task result before the report can be sent. Empty = ok. */
export const outcomeProblems = (v: TaskDraft): string[] => {
  if (v.outcome === "partial") {
    const m: string[] = [];
    if (!v.didText?.trim()) m.push("What was done");
    if (!v.leftText?.trim()) m.push("What is left");
    if (!v.reason) m.push("Reason");
    if (!v.needs?.trim()) m.push("What is needed to continue");
    return m;
  }
  if (v.outcome === "not_done") {
    const m: string[] = [];
    if (!v.reason) m.push("Reason");
    if (!v.needs?.trim()) m.push("Next step");
    return m;
  }
  return [];
};

const OUTCOMES: {
  id: Outcome;
  label: string;
  icon: typeof Check;
  on: string;
}[] = [
  { id: "done", label: "Done", icon: Check, on: "border-ok bg-ok text-white" },
  {
    id: "partial",
    label: "Partly done",
    icon: Minus,
    on: "border-fiber-deep bg-fiber text-ink",
  },
  {
    id: "not_done",
    label: "Not done",
    icon: X,
    on: "border-bad bg-bad text-white",
  },
];

const ReasonSelect = ({
  value,
  onChange,
  bad,
}: {
  value?: string;
  onChange: (v: StopReason | "") => void;
  bad?: boolean;
}) => {
  const t = useT();
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value as StopReason | "")}
      className={cn(
        "h-9 w-full rounded-md border bg-white px-2 text-sm",
        bad && "border-bad ring-2 ring-bad/20",
      )}
      aria-label={t("Reason")}
    >
      <option value="">{t("Reason…")}</option>
      {STOP_REASONS.map((r) => (
        <option key={r.id} value={r.id}>
          {t(r.label)}
        </option>
      ))}
    </select>
  );
};

const BlockToggle = ({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) => {
  const t = useT();
  return (
    <div
      className="flex flex-wrap gap-1.5"
      role="radiogroup"
      aria-label={t("Can the work continue?")}
    >
      {[
        { v: false, label: "Can continue", icon: Clock },
        { v: true, label: "Blocked", icon: Lock },
      ].map((o) => (
        <button
          key={String(o.v)}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition active:scale-95",
            value === o.v
              ? o.v
                ? "border-bad bg-bad text-white"
                : "border-cat bg-cat text-white"
              : "bg-white text-ink/80 hover:border-ink/30",
          )}
        >
          <o.icon className="h-3.5 w-3.5" />
          {t(o.label)}
        </button>
      ))}
    </div>
  );
};

/** Foreman's end-of-day result for one task: Done / Partly done / Not done with required fields. */
export const TaskOutcome = ({
  task,
  link,
  value,
  onChange,
  tried,
}: {
  task: Task;
  link: PortalLink;
  value: TaskDraft;
  onChange: (x: Partial<TaskDraft>) => void;
  tried: boolean;
}) => {
  const t = useT();
  const fmt = useFmt();
  const missing = tried ? outcomeProblems(value) : [];
  const miss = (k: string) => missing.includes(k);
  const people = activeClaims(task).filter((c) => c.linkId === link.id);
  return (
    <div className="space-y-2">
      {people.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-sub">
          <span className="font-semibold text-ink">{t("Taken by")}:</span>
          {people.map((c) => (
            <span
              key={c.id}
              className="rounded-full border bg-white px-2 py-0.5"
            >
              {c.name} · {fmt.time(c.at)}
            </span>
          ))}
        </div>
      )}
      <div
        className="flex flex-wrap gap-1.5"
        role="radiogroup"
        aria-label={t("Result")}
      >
        {OUTCOMES.map((o) => {
          const on = value.outcome === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() =>
                onChange({
                  outcome: on ? undefined : o.id,
                  done: !on && o.id === "done",
                })
              }
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition active:scale-95",
                on ? o.on : "bg-white text-ink/80 hover:border-ink/30",
              )}
            >
              <o.icon className="h-3.5 w-3.5" strokeWidth={3} />
              {t(o.label)}
            </button>
          );
        })}
      </div>
      {value.outcome === "partial" && (
        <div className="rise grid gap-2 sm:grid-cols-2">
          <Textarea
            rows={2}
            value={value.didText ?? ""}
            onChange={(e) => onChange({ didText: e.target.value })}
            placeholder={t("What was done")}
            className={cn(
              miss("What was done") && "border-bad ring-2 ring-bad/20",
            )}
          />
          <Textarea
            rows={2}
            value={value.leftText ?? ""}
            onChange={(e) => onChange({ leftText: e.target.value })}
            placeholder={t("What is left")}
            className={cn(
              miss("What is left") && "border-bad ring-2 ring-bad/20",
            )}
          />
        </div>
      )}
      {(value.outcome === "partial" || value.outcome === "not_done") && (
        <div className="rise space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <ReasonSelect
              value={value.reason}
              onChange={(r) => onChange({ reason: r })}
              bad={miss("Reason")}
            />
            <Input
              value={value.reasonNote ?? ""}
              onChange={(e) => onChange({ reasonNote: e.target.value })}
              placeholder={t("Details (optional)")}
              className="h-9"
            />
          </div>
          <Input
            value={value.needs ?? ""}
            onChange={(e) => onChange({ needs: e.target.value })}
            placeholder={
              value.outcome === "partial"
                ? t("What is needed to continue")
                : t("Next step")
            }
            className={cn(
              "h-9",
              (miss("What is needed to continue") || miss("Next step")) &&
                "border-bad ring-2 ring-bad/20",
            )}
          />
          <BlockToggle
            value={!!value.blocked}
            onChange={(b) => onChange({ blocked: b })}
          />
          {missing.length > 0 && (
            <p className="flex items-center gap-1 text-xs text-bad">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t("Required: {list}", {
                list: missing.map((m) => t(m)).join(", "),
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

const STATE_OPTS: StageState[] = [
  "not_started",
  "progress",
  "done",
  "failed",
  "na",
];

/** "Not finished?" block of a cable line: state of each tracked stage and why work stopped. */
export const CableUnfinished = ({
  tracked,
  stages,
  stop,
  onChange,
}: {
  tracked: StageKey[];
  stages: CableStages;
  stop: EntryStop;
  onChange: (x: { stages?: CableStages; stop?: EntryStop }) => void;
}) => {
  const t = useT();
  return (
    <div className="rise space-y-2 rounded-lg border border-fiber-deep/40 bg-fiber-soft/50 p-3">
      {tracked.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {STAGE_KEYS.filter((k) => tracked.includes(k)).map((k) => (
            <label key={k} className="text-[13px]">
              <span className="mb-1 block font-semibold">
                {t(STAGE_LABEL[k])}
              </span>
              <select
                value={stages[k]?.state ?? ""}
                onChange={(e) => {
                  const next = { ...stages };
                  if (!e.target.value) delete next[k];
                  else
                    next[k] = {
                      ...(next[k] ?? {}),
                      state: e.target.value as StageState,
                    };
                  onChange({ stages: next });
                }}
                className="h-9 w-full rounded-md border bg-white px-2 text-sm"
              >
                <option value="">{t("As marked")}</option>
                {STATE_OPTS.filter((s) => k === "test" || s !== "failed").map(
                  (s) => (
                    <option key={s} value={s}>
                      {t(STAGE_STATE_LABEL[s])}
                    </option>
                  ),
                )}
              </select>
              {k === "pull" && stages.pull?.state === "progress" && (
                <Input
                  inputMode="numeric"
                  value={stages.pull.pct ?? ""}
                  onChange={(e) =>
                    onChange({
                      stages: {
                        ...stages,
                        pull: {
                          state: "progress",
                          pct:
                            Math.min(
                              100,
                              Number(e.target.value.replace(/\D/g, "")) || 0,
                            ) || undefined,
                        },
                      },
                    })
                  }
                  placeholder={t("% done")}
                  className="tnum mt-1 h-8"
                />
              )}
            </label>
          ))}
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <ReasonSelect
          value={stop.reason}
          onChange={(r) =>
            onChange({ stop: { ...stop, reason: r || undefined } })
          }
        />
        <Input
          value={stop.note ?? ""}
          onChange={(e) =>
            onChange({ stop: { ...stop, note: e.target.value } })
          }
          placeholder={t("Details (optional)")}
          className="h-9"
        />
      </div>
      <Input
        value={stop.needs ?? ""}
        onChange={(e) => onChange({ stop: { ...stop, needs: e.target.value } })}
        placeholder={t("What is needed to continue")}
        className="h-9"
      />
      <BlockToggle
        value={stop.blocked}
        onChange={(b) => onChange({ stop: { ...stop, blocked: b } })}
      />
    </div>
  );
};

/** Cable codes from the registry mentioned in free text and not yet in the report. */
export const codesInText = (
  text: string,
  index: Map<string, { code: string }>,
  inReport: Set<string>,
  norm: (s: string) => string,
): string[] => {
  if (!text.trim()) return [];
  const found = new Map<string, string>();
  for (const raw of text.split(/[\s,;()[\]{}"'«»]+/)) {
    const w = raw.replace(/[.:!?]+$/, "");
    if (w.length < 2) continue;
    const n = norm(w);
    const c = index.get(n);
    if (c && !inReport.has(n)) found.set(n, c.code);
  }
  return [...found.values()];
};
