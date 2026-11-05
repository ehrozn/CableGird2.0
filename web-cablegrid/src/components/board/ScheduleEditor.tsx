import { AlertTriangle, Copy, Plus, Timer, Trash2, Users } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_SCHEDULE, SHIFT_KINDS, WEEK_ORDER, hmMin, isHm, projectSchedules, shiftKind } from "@/lib/board";
import { uid } from "@/lib/ids";
import { useFmt, useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { PortalLink, Project, ShiftItem, ShiftItemKind, ShiftSchedule } from "@/lib/types";
import { cn } from "@/lib/utils";

import { SHIFT_ICON, scheduleName } from "./Shift";

const QUICK: { kind: ShiftItemKind; start: string; end?: string }[] = [
  { kind: "lunch", start: "12:00", end: "12:30" },
  { kind: "break", start: "10:00", end: "10:15" },
  { kind: "briefing", start: "07:00" },
  { kind: "other", start: "15:00" },
];

const fresh = (from?: ShiftSchedule): ShiftSchedule => {
  const base = from ?? DEFAULT_SCHEDULE;
  return { ...base, id: uid(), name: undefined, crewIds: [], days: [...base.days], items: base.items.map((x) => ({ ...x, id: uid() })) };
};

/** Manager: one or more work schedules (one per group of crews) — the TV counts down to each break. */
export const ScheduleEditor = ({ p, manager }: { p: Project; manager: boolean }) => {
  const t = useT();
  const setSchedules = useStore((s) => s.setSchedules);
  const list = useMemo(() => projectSchedules(p), [p]);
  const crews = useMemo(() => p.links.filter((l) => l.type === "crew"), [p.links]);
  const multi = list.length > 1;

  const write = (next: ShiftSchedule[]) => setSchedules(p.id, next);
  const patch = (id: string | undefined, v: Partial<ShiftSchedule>) => {
    // a crew works on one schedule: linking it here unlinks it from the others
    const taken = new Set(v.crewIds ?? []);
    write(list.map((s) => (s.id === id ? { ...s, ...v } : v.crewIds && s.crewIds?.some((c) => taken.has(c)) ? { ...s, crewIds: s.crewIds.filter((c) => !taken.has(c)) } : s)));
  };

  const add = (from?: ShiftSchedule) => {
    const s = fresh(from);
    // "Tue–Fri" next to "Mon–Thu" is the usual second group — start from an empty week so nothing overlaps by accident
    if (list.length && !from) s.days = [];
    write([...list.map((x, i) => (x.name?.trim() || list.length > 1 ? x : { ...x, name: t("Group {n}", { n: i + 1 }) })), { ...s, name: t("Group {n}", { n: list.length + 1 }) }]);
    toast.success(list.length ? t("New schedule added") : t("Schedule is on the TV"));
  };

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            <Timer className="h-4 w-4 text-brand" /> {t("Work schedule")}
            {list.length > 0 && <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-bold text-ok">{t("On the TV now")}</span>}
          </h2>
          <p className="mt-1 text-sm text-sub">
            {list.length
              ? t("Groups with different days or hours get their own schedule. Link crews so their QR page shows their schedule first.")
              : t("Start, lunch, breaks and end of the day. The TV counts down to each: “Lunch in 25 min”.")}
          </p>
        </div>
        {list.length === 0 ? (
          <Button
            size="sm"
            disabled={!manager}
            onClick={() => {
              write([fresh()]);
              toast.success(t("Schedule is on the TV"));
            }}
          >
            <Plus className="h-4 w-4" /> {t("Set up the schedule")}
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={!manager || list.length >= 6} onClick={() => add()}>
            <Plus className="h-4 w-4" /> {t("Add a group schedule")}
          </Button>
        )}
      </div>

      <div className="mt-4 space-y-4">
        {list.map((s, i) => (
          <ScheduleCard
            key={s.id ?? i}
            s={s}
            index={i}
            multi={multi}
            crews={crews}
            others={list.filter((x) => x.id !== s.id)}
            manager={manager}
            onChange={(v) => patch(s.id, v)}
            onCopy={list.length < 6 ? () => add(s) : undefined}
            onRemove={() => {
              write(list.filter((x) => x.id !== s.id));
              toast(list.length === 1 ? t("Schedule removed from the TV") : t("Schedule removed"));
            }}
          />
        ))}
      </div>
    </section>
  );
};

const ScheduleCard = ({
  s,
  index,
  multi,
  crews,
  others,
  manager,
  onChange,
  onCopy,
  onRemove,
}: {
  s: ShiftSchedule;
  index: number;
  multi: boolean;
  crews: PortalLink[];
  others: ShiftSchedule[];
  manager: boolean;
  onChange: (v: Partial<ShiftSchedule>) => void;
  onCopy?: () => void;
  onRemove: () => void;
}) => {
  const t = useT();
  const f = useFmt();
  const items = s.items;
  const setItem = (id: string, v: Partial<ShiftItem>) => onChange({ items: items.map((x) => (x.id === id ? { ...x, ...v } : x)) });
  const addItem = (q: (typeof QUICK)[number]) => {
    const taken = items.some((x) => x.start === q.start);
    const start = taken ? items.reduce((m, x) => (isHm(x.end) && hmMin(x.end!) > hmMin(m) ? x.end! : m), q.start) : q.start;
    const dur = q.end ? hmMin(q.end) - hmMin(q.start) : 0;
    const endMin = hmMin(start) + dur;
    const end = q.end ? `${String(Math.floor(endMin / 60) % 24).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}` : undefined;
    onChange({ items: [...items, { id: uid(), kind: q.kind, start, end }] });
  };
  const a = hmMin(s.start);
  const b = hmMin(s.end);
  const badDay = isHm(s.start) && isHm(s.end) && b <= a;
  // a crew sits on one schedule: picking it here takes it off the other one
  const crewOwner = (id: string) => others.find((o) => o.crewIds?.includes(id));

  return (
    <div className={cn("rounded-xl", multi && "border bg-ink/[0.02] p-4")}>
      {multi && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input
            value={s.name ?? ""}
            maxLength={40}
            disabled={!manager}
            onChange={(e) => onChange({ name: e.target.value || undefined })}
            placeholder={t("Group name, e.g. Crew A")}
            className={cn("h-10 min-w-[180px] flex-1 bg-white text-[15px] font-bold", !s.name?.trim() && "border-brand")}
            aria-label={scheduleName(s, index, t)}
          />
          {onCopy && (
            <Button variant="ghost" size="sm" disabled={!manager} onClick={onCopy}>
              <Copy className="h-4 w-4" /> {t("Duplicate")}
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-sub hover:bg-bad-soft hover:text-bad" disabled={!manager} onClick={onRemove}>
            <Trash2 className="h-4 w-4" /> {t("Delete")}
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[auto_auto_1fr]">
        <label className="text-xs font-semibold text-sub">
          {t("Start of work")}
          <Input type="time" step={300} disabled={!manager} value={s.start} onChange={(e) => isHm(e.target.value) && onChange({ start: e.target.value })} className="mt-1 h-10 w-[130px] bg-white font-mono text-[15px] font-bold text-ink" />
        </label>
        <label className="text-xs font-semibold text-sub">
          {t("End of work")}
          <Input type="time" step={300} disabled={!manager} value={s.end} onChange={(e) => isHm(e.target.value) && onChange({ end: e.target.value })} className="mt-1 h-10 w-[130px] bg-white font-mono text-[15px] font-bold text-ink" />
        </label>
        <div className="text-xs font-semibold text-sub">
          {t("Working days")}
          <div className="mt-1 flex flex-wrap gap-1">
            {WEEK_ORDER.map((d) => {
              const on = s.days.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  disabled={!manager}
                  onClick={() => onChange({ days: on ? s.days.filter((x) => x !== d) : [...s.days, d] })}
                  className={cn("h-10 min-w-10 rounded-lg border px-2 text-[13px] font-bold capitalize transition active:scale-95", on ? "border-ink bg-ink text-white" : "bg-white text-sub hover:text-ink")}
                >
                  {f.weekday(d).replace(".", "")}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {badDay && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-bad">
          <AlertTriangle className="h-3.5 w-3.5" /> {t("The end of work is before the start")}
        </p>
      )}
      {s.days.length === 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-brand-deep">
          <AlertTriangle className="h-3.5 w-3.5" /> {t("Pick the working days of this group")}
        </p>
      )}

      {multi && crews.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-sub">
            <Users className="h-3.5 w-3.5" /> {t("Crews on this schedule")}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {crews.map((c) => {
              const on = !!s.crewIds?.includes(c.id);
              const elsewhere = !on ? crewOwner(c.id) : undefined;
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={!manager}
                  title={elsewhere ? t("Now on: {name}", { name: elsewhere.name || "—" }) : undefined}
                  onClick={() => onChange({ crewIds: on ? (s.crewIds ?? []).filter((x) => x !== c.id) : [...(s.crewIds ?? []), c.id] })}
                  className={cn(
                    "inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition active:scale-95",
                    on ? "border-ink bg-ink text-white" : "bg-white text-ink hover:border-ink/30",
                    elsewhere && "text-sub",
                  )}
                >
                  <span className="truncate">{c.name}</span>
                  {elsewhere?.name && <span className="truncate font-medium opacity-70">· {elsewhere.name}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 text-xs font-semibold text-sub">{t("Lunch, breaks and briefings")}</div>
      {items.length > 0 && (
        <ul className="mt-1.5 space-y-2">
          {[...items]
            .sort((x, y) => hmMin(x.start) - hmMin(y.start))
            .map((x) => {
              const k = shiftKind(x.kind);
              const I = SHIFT_ICON[x.kind];
              const outside = isHm(x.start) && (hmMin(x.start) < a || hmMin(x.start) >= b);
              const backwards = isHm(x.end) && hmMin(x.end!) <= hmMin(x.start);
              return (
                <li key={x.id} className="rounded-xl border bg-white p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white" style={{ background: k.color }}>
                      <I className="h-4 w-4" />
                    </span>
                    <Select value={x.kind} disabled={!manager} onValueChange={(v) => setItem(x.id, { kind: v as ShiftItemKind })}>
                      <SelectTrigger className="h-9 w-[132px] bg-white font-semibold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SHIFT_KINDS.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {t(o.id === "other" ? "Own name" : o.label)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={x.label ?? ""}
                      maxLength={40}
                      disabled={!manager}
                      onChange={(e) => setItem(x.id, { label: e.target.value || undefined })}
                      placeholder={x.kind === "other" ? t("Name, e.g. Clean-up") : t(k.label)}
                      className={cn("h-9 min-w-[120px] flex-1 bg-white", x.kind === "other" && !x.label?.trim() && "border-brand")}
                    />
                    <div className="flex items-center gap-1">
                      <Input type="time" step={300} disabled={!manager} value={x.start} onChange={(e) => isHm(e.target.value) && setItem(x.id, { start: e.target.value })} className="h-9 w-[112px] bg-white font-mono font-semibold" aria-label={t("From")} />
                      <span className="text-sub">–</span>
                      <Input
                        type="time"
                        step={300}
                        disabled={!manager}
                        value={x.end ?? ""}
                        onChange={(e) => setItem(x.id, { end: isHm(e.target.value) ? e.target.value : undefined })}
                        className="h-9 w-[112px] bg-white font-mono font-semibold"
                        aria-label={t("Until")}
                      />
                    </div>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-sub hover:bg-bad-soft hover:text-bad" disabled={!manager} onClick={() => onChange({ items: items.filter((y) => y.id !== x.id) })} aria-label={t("Delete")}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {(outside || backwards) && (
                    <p className="mt-1.5 flex items-center gap-1.5 pl-11 text-xs font-semibold text-brand-deep">
                      <AlertTriangle className="h-3.5 w-3.5" /> {backwards ? t("Ends before it starts") : t("Outside working hours — not shown on the TV")}
                    </p>
                  )}
                </li>
              );
            })}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {QUICK.map((q) => {
          const I = SHIFT_ICON[q.kind];
          return (
            <button
              key={q.kind}
              type="button"
              disabled={!manager || items.length >= 12}
              onClick={() => addItem(q)}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed bg-white px-3 py-1.5 text-xs font-bold text-ink transition hover:border-brand/50 hover:text-brand-deep disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              <I className="h-3.5 w-3.5" style={{ color: shiftKind(q.kind).color }} />
              {t(q.kind === "other" ? "Own name" : shiftKind(q.kind).label)}
            </button>
          );
        })}
        {!multi && (
          <Button size="sm" variant="ghost" className="ml-auto text-sub hover:bg-bad-soft hover:text-bad" disabled={!manager} onClick={onRemove}>
            <Trash2 className="h-4 w-4" /> {t("Remove")}
          </Button>
        )}
      </div>
      <p className="mt-2 text-xs text-sub">{t("Leave the end empty for a moment in time, e.g. a briefing or a delivery.")}</p>
    </div>
  );
};
