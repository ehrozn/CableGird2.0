import { CalendarDays, Coffee, Flag, Megaphone, Moon, Play, Sun, Timer, Users, Utensils } from "lucide-react";
import { useMemo } from "react";

import { type ShiftNow, fmtDays, fmtLeft, hmMin, isHm, shiftKind, shiftNow, sortShiftItems } from "@/lib/board";
import { type TFn, useFmt, useT } from "@/lib/i18n";

import { Marquee } from "./bits";
import type { ShiftItem, ShiftItemKind, ShiftSchedule } from "@/lib/types";
import { cn } from "@/lib/utils";

export const SHIFT_ICON: Record<ShiftItemKind, typeof Coffee> = { lunch: Utensils, break: Coffee, briefing: Megaphone, other: Flag };

export const shiftItemName = (x: Pick<ShiftItem, "kind" | "label">, t: TFn) => x.label?.trim() || t(shiftKind(x.kind).label);

type Fmt = ReturnType<typeof useFmt>;

/** "Crew A" — or "Schedule 2" when the manager left the name empty */
export const scheduleName = (s: ShiftSchedule, i: number, t: TFn) => s.name?.trim() || t("Schedule {n}", { n: i + 1 });
const daysText = (s: ShiftSchedule, f: Fmt) => fmtDays(s.days, (d) => f.weekday(d).replace(".", ""));

/** One headline + one subline for "what now". `soon` = the next change is within 15 minutes. */
export const shiftHeadline = (n: ShiftNow, t: TFn, f: Fmt) => {
  const next = (x?: { day: number; start: string }, today = new Date().getDay()) =>
    !x ? "" : x.day === (today + 1) % 7 ? t("Next shift: tomorrow at {t}", { t: f.hm(x.start) }) : t("Next shift: {d} at {t}", { d: f.weekday(x.day, "long"), t: f.hm(x.start) });
  switch (n.k) {
    case "dayoff":
      return { title: t("Day off today"), sub: next(n.next), tone: "off" as const, soon: false, Icon: Moon };
    case "over":
      return { title: t("The shift is over"), sub: next(n.next), tone: "off" as const, soon: false, Icon: Moon };
    case "before":
      return { title: t("Work starts in {x}", { x: fmtLeft(n.left, t) }), sub: t("Start at {t}", { t: f.hm(n.at) }), tone: "before" as const, soon: n.left <= 15, Icon: Sun };
    case "in":
      return {
        title: t("{what} now", { what: shiftItemName(n.item, t) }),
        sub: t("Back to work at {t} · {x} left", { t: f.hm(n.until), x: fmtLeft(n.left, t) }),
        tone: "pause" as const,
        soon: n.left <= 5,
        Icon: SHIFT_ICON[n.item.kind] ?? Coffee,
      };
    case "work":
      return n.next.item
        ? {
            title: t("{what} in {x}", { what: shiftItemName(n.next.item, t), x: fmtLeft(n.next.left, t) }),
            sub: t("at {t}", { t: f.hm(n.next.at) }),
            tone: "work" as const,
            soon: n.next.left <= 15,
            Icon: SHIFT_ICON[n.next.item.kind] ?? Timer,
          }
        : {
            title: t("End of the shift in {x}", { x: fmtLeft(n.next.left, t) }),
            sub: t("at {t}", { t: f.hm(n.next.at) }),
            tone: "work" as const,
            soon: n.next.left <= 15,
            Icon: Flag,
          };
  }
};

/** Start → breaks → end, as rows. */
const rowsOf = (s: ShiftSchedule, t: TFn) => [
  { id: "__start", name: t("Start of work"), start: s.start, end: undefined as string | undefined, color: "#0B1F33", Icon: Play },
  ...sortShiftItems(s.items)
    .filter((x) => hmMin(x.start) > hmMin(s.start) && hmMin(x.start) < hmMin(s.end))
    .map((x) => ({ id: x.id, name: shiftItemName(x, t), start: x.start, end: isHm(x.end) ? x.end : undefined, color: shiftKind(x.kind).color, Icon: SHIFT_ICON[x.kind] ?? Flag })),
  { id: "__end", name: t("End of work"), start: s.end, end: undefined, color: "#0B1F33", Icon: Flag },
];

/** A thin day bar: work, breaks as colored blocks, a "now" needle. */
const Timeline = ({ s, now, big }: { s: ShiftSchedule; now: Date; big?: boolean }) => {
  const a = hmMin(s.start);
  const b = hmMin(s.end);
  const span = Math.max(1, b - a);
  const pct = (m: number) => `${Math.min(100, Math.max(0, ((m - a) / span) * 100))}%`;
  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const today = s.days.includes(now.getDay());
  const items = sortShiftItems(s.items);
  return (
    <div className={cn("relative rounded-full bg-ink/[0.07]", big ? "h-4" : "h-2.5")}>
      {today && nowMin > a && <div className="absolute inset-y-0 left-0 rounded-full bg-ink/20 transition-all duration-1000" style={{ width: pct(nowMin) }} />}
      {items.map((x) =>
        isHm(x.end) ? (
          <div key={x.id} className="absolute inset-y-0 rounded-full" style={{ left: pct(hmMin(x.start)), width: `calc(${pct(hmMin(x.end!))} - ${pct(hmMin(x.start))})`, minWidth: 6, background: shiftKind(x.kind).color }} />
        ) : (
          <div key={x.id} className={cn("absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white", big ? "h-3 w-3" : "h-2 w-2")} style={{ left: pct(hmMin(x.start)), background: shiftKind(x.kind).color }} />
        ),
      )}
      {today && nowMin >= a && nowMin <= b && (
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-1000" style={{ left: pct(nowMin) }}>
          <div className={cn("rounded-full bg-ink ring-[3px] ring-white", big ? "h-7 w-[7px]" : "h-5 w-[5px]")} />
        </div>
      )}
    </div>
  );
};

const TONE = {
  work: "bg-ink text-white",
  pause: "bg-ok text-white",
  before: "bg-cat text-white",
  off: "bg-ink/[0.07] text-ink",
} as const;

/** TV: today's shift with a live countdown. */
export const ShiftCard = ({ s, now, title }: { s: ShiftSchedule; now: Date; title?: string }) => {
  const t = useT();
  const f = useFmt();
  const n = shiftNow(s, now);
  const h = shiftHeadline(n, t, f);
  const rows = useMemo(() => rowsOf(s, t), [s, t]);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const workday = s.days.includes(now.getDay());
  const soon = h.soon && h.tone !== "off";
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] bg-white/70 p-5 ring-1 ring-ink/[0.06]">
      {(title || daysText(s, f)) && (
        <div className="mb-3 flex items-center gap-2 px-1">
          {title && <span className="min-w-0 truncate text-[21px] font-extrabold">{title}</span>}
          {daysText(s, f) && (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink/[0.06] px-2.5 py-1 text-[15px] font-bold capitalize text-sub">
              <CalendarDays className="h-4 w-4" />
              {daysText(s, f)}
            </span>
          )}
        </div>
      )}
      <div className={cn("flex items-center gap-3.5 rounded-2xl px-4 py-3.5 transition-colors duration-700", soon ? "bg-brand text-white" : TONE[h.tone])}>
        <h.Icon className={cn("h-9 w-9 shrink-0", soon && "tv-ring")} />
        <div className="min-w-0">
          <div className="text-[26px] font-extrabold leading-tight tracking-tight">{h.title}</div>
          {h.sub && <div className={cn("text-[16px] font-semibold", h.tone === "off" && !soon ? "text-sub" : "text-white/80")}>{h.sub}</div>}
        </div>
      </div>
      {workday && (
        <div className="mt-4 px-1">
          <Timeline s={s} now={now} big />
        </div>
      )}
      <ul className="mt-3 flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
        {rows.map((r) => {
          const past = workday && (r.end ? hmMin(r.end) <= nowMin : hmMin(r.start) < nowMin && r.id !== "__start") ;
          const cur = workday && !!r.end && hmMin(r.start) <= nowMin && nowMin < hmMin(r.end);
          return (
            <li key={r.id} className={cn("flex items-center gap-3 rounded-xl px-2.5 py-1.5 transition-opacity duration-700", past && "opacity-40", cur && "bg-ok-soft")}>
              <r.Icon className="h-5 w-5 shrink-0" style={{ color: r.color }} />
              <span className="min-w-0 flex-1 truncate text-[19px] font-bold">{r.name}</span>
              <span className="tnum shrink-0 font-mono text-[19px] font-bold">
                {f.hm(r.start)}
                {r.end && <span className="text-sub">–{f.hm(r.end)}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/** How far along the current stretch (work until lunch, lunch until work…) we are, 0–1. */
const stretch = (s: ShiftSchedule, now: Date) => {
  const n = shiftNow(s, now);
  const min = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  if (n.k === "in") {
    const a = hmMin(n.item.start);
    return (min - a) / Math.max(1, hmMin(n.until) - a);
  }
  if (n.k === "work") {
    // the stretch began at the start of the day or at the end of the last break
    const from = sortShiftItems(s.items).reduce((m, x) => {
      const e = isHm(x.end) ? hmMin(x.end!) : hmMin(x.start);
      return e <= min && e > m ? e : m;
    }, hmMin(s.start));
    return (min - from) / Math.max(1, hmMin(n.next.at) - from);
  }
  return null;
};

/** One team on site today: name, what's next (big), progress, day bar, the day's times. */
const TeamCard = ({ s, name, now, delay, roomy }: { s: ShiftSchedule; name: string; now: Date; delay: number; roomy: boolean }) => {
  const t = useT();
  const f = useFmt();
  const h = shiftHeadline(shiftNow(s, now), t, f);
  const soon = h.soon && h.tone !== "off";
  const over = h.tone === "off";
  const part = stretch(s, now);
  const rows = rowsOf(s, t);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const cols = Math.min(rows.length, 4);
  return (
    <div
      className={cn("tv-in flex min-h-0 flex-1 flex-col rounded-2xl bg-white shadow-[0_10px_28px_-20px_rgba(11,31,51,0.45)] ring-1 ring-ink/[0.06]", roomy ? "p-4" : "p-3.5", over && "opacity-60")}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-2.5">
        {!over ? (
          <span className="relative flex h-3.5 w-3.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-ok" />
          </span>
        ) : (
          <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-ink/25" />
        )}
        <Marquee className="min-w-0 flex-1">
          <span className={cn("font-extrabold tracking-tight", roomy ? "text-[26px]" : "text-[23px]")}>{name}</span>
        </Marquee>
        {daysText(s, f) && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink/[0.06] px-2.5 py-1 text-[15px] font-bold capitalize text-sub">
            <CalendarDays className="h-4 w-4" />
            {daysText(s, f)}
          </span>
        )}
      </div>

      {/* status: re-enters when it changes, so "Lunch now" lands with a soft slide */}
      <div key={h.title} className={cn("tv-in relative overflow-hidden rounded-xl px-4 transition-colors", roomy ? "mt-3 py-3" : "mt-2.5 py-2", " duration-700", soon ? "bg-brand text-white" : TONE[h.tone])}>
        <div className="flex items-center gap-3">
          <h.Icon className={cn("shrink-0", roomy ? "h-9 w-9" : "h-8 w-8", soon && "tv-ring")} />
          <div className="min-w-0 flex-1">
            <Marquee>
              <span className={cn("font-extrabold leading-tight tracking-tight", roomy ? "text-[28px]" : "text-[23px]")}>{h.title}</span>
            </Marquee>
            {h.sub && <div className={cn("truncate font-semibold", roomy ? "text-[17px]" : "text-[15px]", over && !soon ? "text-sub" : "text-white/80")}>{h.sub}</div>}
          </div>
        </div>
        {part !== null && (
          <div className="absolute inset-x-0 bottom-0 h-1.5 bg-white/15">
            <div className="h-full bg-white/70 transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(100, Math.max(0, part * 100))}%` }} />
          </div>
        )}
      </div>

      {!over && (
        <div className={cn("px-0.5", roomy ? "mt-4" : "mt-3")}>
          <Timeline s={s} now={now} big />
        </div>
      )}

      <div className={cn("mt-auto grid gap-x-2 gap-y-2", roomy ? "pt-4" : "pt-3")} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {rows.map((r) => {
          const past = r.end ? hmMin(r.end) <= nowMin : r.id !== "__start" && hmMin(r.start) < nowMin;
          const cur = !!r.end && hmMin(r.start) <= nowMin && nowMin < hmMin(r.end);
          return (
            <div key={r.id} className={cn("min-w-0 rounded-lg px-2 transition-all", roomy ? "py-1.5" : "py-1", " duration-700", cur ? "bg-ok-soft ring-1 ring-ok/30" : "bg-ink/[0.035]", past && !cur && "opacity-45")}>
              {roomy ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <r.Icon className="h-4 w-4 shrink-0" style={{ color: r.color }} />
                    <span className="truncate text-[13px] font-bold uppercase tracking-wide text-sub">{r.name}</span>
                  </div>
                  <div className="tnum mt-0.5 truncate font-mono text-[18px] font-bold leading-tight">{f.hm(r.start)}</div>
                  {r.end && <div className="tnum truncate font-mono text-[14px] font-semibold leading-tight text-sub">– {f.hm(r.end)}</div>}
                </>
              ) : (
                /* two teams on screen: icon + time only; the break length is on the day bar */
                <div className="flex items-center gap-1.5">
                  <r.Icon className="h-4 w-4 shrink-0" style={{ color: r.color }} />
                  <span className="tnum truncate font-mono text-[17px] font-bold">{f.hm(r.start)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const TEAMS_PER_PAGE = 2;

/** TV: the teams on site today. Teams with a day off are not shown. */
export const ShiftsPanel = ({ list, now, tick }: { list: ShiftSchedule[]; now: Date; tick: number }) => {
  const t = useT();
  const f = useFmt();
  const day = now.getDay();
  const named = list.map((s, i) => ({ s, name: list.length === 1 && !s.name?.trim() ? t("Today's shift") : scheduleName(s, i, t) }));
  // working now first, finished today last
  const today = named
    .filter((x) => x.s.days.includes(day))
    .sort((a, b) => Number(shiftNow(a.s, now).k === "over") - Number(shiftNow(b.s, now).k === "over"));
  const pages = Math.max(1, Math.ceil(today.length / TEAMS_PER_PAGE));
  const page = tick % pages;
  const shown = today.slice(page * TEAMS_PER_PAGE, page * TEAMS_PER_PAGE + TEAMS_PER_PAGE);

  // nobody works today: say when the next team is back
  const next = (() => {
    for (let i = 1; i <= 7; i++) {
      const d = (day + i) % 7;
      const who = named.filter((x) => x.s.days.includes(d));
      if (who.length) return { d, i, who, start: [...who].sort((a, b) => hmMin(a.s.start) - hmMin(b.s.start))[0].s.start };
    }
    return null;
  })();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] bg-white/70 p-4 ring-1 ring-ink/[0.06]">
      <div className="mb-3 flex items-center gap-2.5 px-1">
        <Timer className="h-6 w-6 text-sub" />
        <span className="truncate text-[24px] font-extrabold tracking-tight">{t("On site today")}</span>
        {today.length > 0 && <span className="tnum grid h-8 min-w-8 shrink-0 place-items-center rounded-full bg-ok px-2 text-[17px] font-bold text-white">{today.length}</span>}
        {pages > 1 && (
          <div className="ml-auto flex gap-1.5">
            {Array.from({ length: pages }, (_, i) => (
              <span key={i} className={cn("h-2.5 rounded-full transition-all duration-500", i === page ? "w-7 bg-ink" : "w-2.5 bg-ink/15")} />
            ))}
          </div>
        )}
      </div>
      {today.length === 0 ? (
        <div className="tv-in flex flex-1 flex-col items-center justify-center rounded-2xl bg-white px-6 text-center ring-1 ring-ink/[0.06]">
          <Moon className="h-14 w-14 text-sub/60" />
          <div className="mt-3 text-[28px] font-extrabold">{t("Day off for all teams")}</div>
          {next && (
            <div className="mt-2 text-[18px] font-semibold text-sub">
              {t("Back {d} at {t}", { d: next.i === 1 ? t("tomorrow") : f.weekday(next.d, "long"), t: f.hm(next.start) })}
              <div className="mt-1 text-[16px] font-bold text-ink">{next.who.map((x) => x.name).join(", ")}</div>
            </div>
          )}
        </div>
      ) : (
        <div key={page} className="flex min-h-0 flex-1 flex-col gap-3">
          {shown.map((x, i) => (
            <TeamCard key={x.s.id ?? i} s={x.s} name={x.name} now={now} delay={i * 120} roomy={shown.length === 1} />
          ))}
        </div>
      )}
    </div>
  );
};

/** QR page: every schedule, the scanner's own crew first. */
export const ShiftList = ({ list, now, mine }: { list: ShiftSchedule[]; now: Date; mine?: string }) => {
  const t = useT();
  const named = list.map((s, i) => ({ s, name: list.length > 1 || s.name?.trim() ? scheduleName(s, i, t) : undefined }));
  const sorted = [...named].sort((a, b) => Number(b.s.id === mine) - Number(a.s.id === mine));
  return (
    <section className="mt-6">
      <h2 className="mb-2 flex items-center gap-2 px-1 text-[13px] font-extrabold uppercase tracking-wider text-sub">
        <Timer className="h-4 w-4" /> {t("Work schedule")}
      </h2>
      <div className="space-y-3">
        {sorted.map((x, i) => (
          <ShiftStrip key={x.s.id ?? i} s={x.s} now={now} name={x.name} mine={!!mine && x.s.id === mine} />
        ))}
      </div>
    </section>
  );
};

/** QR page: compact version of the same card. */
const ShiftStrip = ({ s, now, name, mine }: { s: ShiftSchedule; now: Date; name?: string; mine?: boolean }) => {
  const t = useT();
  const f = useFmt();
  const h = shiftHeadline(shiftNow(s, now), t, f);
  const rows = useMemo(() => rowsOf(s, t), [s, t]);
  const workday = s.days.includes(now.getDay());
  const soon = h.soon && h.tone !== "off";
  const days = daysText(s, f);
  return (
      <div className={cn("overflow-hidden rounded-2xl border bg-white", mine && "border-brand ring-2 ring-brand/30")}>
        {(name || days) && (
          <div className="flex items-center gap-2 px-3.5 pb-2 pt-3">
            {name && <span className="min-w-0 truncate font-extrabold">{name}</span>}
            {mine && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand-deep">
                <Users className="h-3 w-3" /> {t("Your crew")}
              </span>
            )}
            {days && <span className="ml-auto shrink-0 rounded-full bg-ink/[0.06] px-2 py-0.5 text-[12px] font-bold capitalize text-sub">{days}</span>}
          </div>
        )}
        <div className={cn("flex items-center gap-3 px-3.5 py-3", soon ? "bg-brand text-white" : TONE[h.tone])}>
          <h.Icon className="h-6 w-6 shrink-0" />
          <div className="min-w-0">
            <div className="font-extrabold leading-snug">{h.title}</div>
            {h.sub && <div className={cn("text-[13px] font-medium", h.tone === "off" && !soon ? "text-sub" : "text-white/85")}>{h.sub}</div>}
          </div>
        </div>
        {workday && (
          <div className="px-3.5 pt-3">
            <Timeline s={s} now={now} />
          </div>
        )}
        <ul className="px-2 py-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2.5 px-1.5 py-1">
              <r.Icon className="h-4 w-4 shrink-0" style={{ color: r.color }} />
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{r.name}</span>
              <span className="tnum shrink-0 font-mono text-[13px] font-bold">
                {f.hm(r.start)}
                {r.end && <span className="text-sub">–{f.hm(r.end)}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
  );
};
