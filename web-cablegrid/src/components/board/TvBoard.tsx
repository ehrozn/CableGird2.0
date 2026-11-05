import { AlertTriangle, Cable as CableIcon, CheckCircle2, Clock, MapPin, Maximize2, Megaphone, Minimize2, Newspaper, PartyPopper, Phone, QrCode, ShieldAlert, Users, Wifi, WifiOff } from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  type BoardData,
  type BoardItem,
  SECTIONS,
  type SectionId,
  activeClaims,
  boardItems,
  boardSchedules,
  contactRole,
  crewQueue,
  daysUntil,
  isUrgent,
  liveNotices,
  lastNote,
  localDay,
  reasonLabel,
  slotsOf,
  sortContacts,
  statusOf,
  tagsOf,
  whoOn,
} from "@/lib/board";
import type { FeedStatus } from "@/lib/board-feed";
import type { Notice, SiteContact } from "@/lib/types";
import { useFmt, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { ShiftsPanel } from "./Shift";
import { CONTACT_ICON, Marquee, PriorityMark, useNow, Qr, StageBar, StatusPill, TagChip } from "./bits";

export const TV_W = 1920;
export const TV_H = 1080;
/** seconds a page stays on screen */
const PAGE_SECONDS = 12;
const PER_PAGE: Record<SectionId, number> = { free: 3, assigned: 3, progress: 3, incomplete: 3, blocked: 3, done: 5 };

/** Renders a fixed 1920×1080 canvas scaled to fit its box (TV, preview). */
export const ScaledStage = ({ children, className }: { children: ReactNode; className?: string }) => {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(Math.min(el.clientWidth / TV_W, el.clientHeight / TV_H));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className={cn("relative overflow-hidden", className)}>
      <div
        className="absolute left-1/2 top-1/2"
        style={{ width: TV_W, height: TV_H, transform: `translate(-50%, -50%) scale(${scale || 0.0001})`, transformOrigin: "center" }}
      >
        {children}
      </div>
    </div>
  );
};


/** Statuses that the panel title already says — the card does not repeat them. */
const IMPLIED: Partial<Record<SectionId, string>> = { free: "open", assigned: "assigned", progress: "progress", blocked: "blocked" };
const NEW_MS = 3 * 3600 * 1000;

/** Card for one work item. Every line glides slowly when it does not fit, so nothing is cut off. */
const WorkCard = ({
  item,
  d,
  now,
  delay,
  moved,
  queue,
}: {
  item: BoardItem;
  d: BoardData;
  now: Date;
  delay: number;
  moved: boolean;
  queue?: { crew: string; pos: number };
}) => {
  const t = useT();
  const f = useFmt();
  const today = localDay(now.toISOString());
  const tk = item.task;

  if (item.issue) {
    const i = item.issue;
    return (
      <div className="tv-in flex h-full min-w-0 flex-col justify-center gap-1.5 rounded-2xl border-2 border-bad/25 bg-bad-soft/60 px-5" style={{ animationDelay: `${delay}ms` }}>
        <div className="flex min-w-0 items-center gap-3">
          <AlertTriangle className="h-6 w-6 shrink-0 text-bad" strokeWidth={2.6} />
          <Marquee className="flex-1">
            <span className="text-[23px] font-bold leading-tight text-ink">{i.title}</span>
          </Marquee>
          <span className="inline-flex h-7 shrink-0 items-center rounded-full bg-bad px-3 text-[14px] font-bold text-white">{t("Issue")}</span>
        </div>
        <Marquee innerClassName="gap-4 text-[17px] text-sub">
          {i.code && <span className="font-mono font-semibold text-ink">{i.code}</span>}
          <span className={cn(i.severity === "high" && "font-bold text-bad")}>{t(i.severity === "high" ? "Critical" : i.severity === "medium" ? "Medium" : "Low")}</span>
          <span>{f.short(i.createdAt)}</span>
        </Marquee>
      </div>
    );
  }
  if (!tk) return null;
  const st = statusOf(tk, today);
  const tags = tagsOf(tk, now).filter((x) => !(x.id === "blocked" && st === "blocked") && x.id !== "overdue");
  const who = whoOn(tk, d);
  const note = tk.stop ? [t(reasonLabel(tk.stop.reason)), tk.stop.note, tk.stop.needs && `→ ${tk.stop.needs}`].filter(Boolean).join(" · ") : lastNote(tk)?.text;
  const stages = tk.stagesReported?.stages ?? tk.stages;
  const act = activeClaims(tk).length;

  if (item.section === "done") {
    return (
      <div className="tv-in flex h-full min-w-0 items-center gap-4 rounded-2xl bg-ok-soft/70 px-5" style={{ animationDelay: `${delay}ms` }}>
        <CheckCircle2 className="h-7 w-7 shrink-0 text-ok" strokeWidth={2.4} />
        <div className="min-w-0 flex-1">
          <Marquee>
            <span className="text-[21px] font-bold leading-tight text-ink">{tk.title}</span>
          </Marquee>
          <Marquee>
            <span className="text-[16px] text-sub">{[who.crews.join(", ") || tk.completedBy, tk.location, tk.cableCodes.slice(0, 3).join(", ") + (tk.cableCodes.length > 3 ? ` +${tk.cableCodes.length - 3}` : "")].filter(Boolean).join(" · ")}</span>
          </Marquee>
        </div>
        <span className="tnum shrink-0 font-mono text-[18px] font-semibold text-ok">{tk.completedAt ? f.time(tk.completedAt) : ""}</span>
      </div>
    );
  }

  const dueN = tk.due ? daysUntil(tk.due, today) : null;
  const dueText =
    dueN == null
      ? ""
      : dueN < 0
        ? t("Overdue by {n} d", { n: -dueN })
        : dueN === 0
          ? t("Due today")
          : dueN === 1
            ? t("Due tomorrow")
            : dueN <= 6
              ? t("Due in {n} days", { n: dueN })
              : t("Due {d}", { d: f.short(tk.due!) });
  const isNew = (item.section === "free" || item.section === "assigned") && now.getTime() - Date.parse(tk.createdAt) < NEW_MS;
  const crews = queue ? who.crews.filter((c) => c !== queue.crew) : who.crews;
  const showStatus = IMPLIED[item.section] !== st;
  const hasLine3 = !!stages || !!tk.remaining || tags.length > 0 || !!note || isNew;

  return (
    <div
      className={cn(
        "tv-in h-full min-w-0 overflow-hidden rounded-2xl border bg-white px-5 py-2 shadow-[0_1px_0_rgba(11,31,51,0.04)] transition-colors duration-700",
        st === "blocked" ? "border-bad/40" : tk.priority === "high" ? "border-l-[6px] border-l-bad" : dueN != null && dueN < 0 ? "border-bad/30" : "border-ink/10",
        moved && "tv-glow",
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* if the lines still do not fit in height, the whole card glides up and back */}
      <Marquee axis="y" speed={18} hold={2600} className="h-full" innerClassName="flex min-h-full flex-col justify-center gap-1">
        <div className="flex min-w-0 items-center gap-3">
          <Marquee className="flex-1">
            <span className="text-[23px] font-bold leading-[1.2] text-ink">{tk.title}</span>
          </Marquee>
          {showStatus && <StatusPill s={st} size="lg" className="h-8" />}
        </div>
        <Marquee innerClassName="h-8 gap-4 text-[17px] text-ink/80">
          {queue && (
            <span className="inline-flex shrink-0 items-center gap-2">
              <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-2.5 font-bold text-white">
                <Users className="h-[17px] w-[17px] opacity-70" />
                {queue.crew}
              </span>
              <span className={cn("inline-flex h-8 items-center rounded-lg px-2.5 text-[15px] font-bold", queue.pos === 1 ? "bg-cat text-white" : "bg-ink/[0.06] text-ink")}>
                {queue.pos === 1 ? t("Next up") : t("#{n} in queue", { n: queue.pos })}
              </span>
            </span>
          )}
          {tk.priority !== "normal" && <PriorityMark p={tk.priority} size="lg" />}
          {dueText && (
            <span className={cn("inline-flex items-center gap-1.5 tnum", dueN! < 0 ? "font-bold text-bad" : dueN! <= 1 ? "font-bold text-brand-deep" : "text-sub")}>
              <Clock className="h-[18px] w-[18px]" />
              {dueText}
            </span>
          )}
          {tk.location && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-[18px] w-[18px] text-sub" />
              {tk.location}
            </span>
          )}
          {tk.cableCodes.length > 0 && (
            <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-ink">
              <CableIcon className="h-[18px] w-[18px] text-sub" />
              {tk.cableCodes.slice(0, 3).join(", ")}
              {tk.cableCodes.length > 3 && <span className="text-sub">+{tk.cableCodes.length - 3}</span>}
            </span>
          )}
          {(crews.length > 0 || who.people.length > 0) && (
            <span className="inline-flex items-center gap-1.5 text-ink">
              {!queue && <Users className="h-[18px] w-[18px] text-sub" />}
              {crews.length > 0 && <b className="font-semibold">{crews.join(", ")}</b>}
              {crews.length > 0 && who.people.length > 0 && " · "}
              {who.people.join(", ")}
            </span>
          )}
          {tk.free && <span className="tnum font-semibold text-ink">{t("{n} of {m} taken", { n: act, m: slotsOf(tk) })}</span>}
        </Marquee>
        {hasLine3 && (
          <Marquee innerClassName="h-8 gap-2">
            {isNew && <span className="inline-flex h-8 items-center rounded-md bg-brand-soft px-2.5 text-[15px] font-bold text-brand-deep">{t("New")}</span>}
            {stages && <StageBar st={stages} size="lg" />}
            {!stages && tk.remaining && (
              <span className="text-[16px] text-sub">
                {t("Left")}: <span className="text-ink">{tk.remaining}</span>
              </span>
            )}
            {tags.map((g) => (
              <TagChip key={g.id} tag={g} size="lg" />
            ))}
            {note && <span className={cn("text-[16px]", tk.stop?.blocked ? "font-semibold text-bad" : "italic text-sub")}>{note}</span>}
          </Marquee>
        )}
      </Marquee>
    </div>
  );
};

/** Sections the crews see on the TV. Blocks and "done today" stay on the manager's board. */
const TV_SECTIONS = SECTIONS.filter((s) => s.id !== "blocked" && s.id !== "done");

const Panel = ({
  id,
  items,
  d,
  now,
  tick,
  moved,
  per = PER_PAGE[id],
  style,
}: {
  id: SectionId;
  items: BoardItem[];
  d: BoardData;
  now: Date;
  tick: number;
  moved: Set<string>;
  per?: number;
  style?: CSSProperties;
}) => {
  const t = useT();
  const meta = SECTIONS.find((s) => s.id === id)!;
  const pages = Math.max(1, Math.ceil(items.length / per));
  const page = tick % pages;
  const shown = items.slice(page * per, page * per + per);
  const today = localDay(now.toISOString());
  const queue = useMemo(() => (id === "assigned" ? crewQueue(items, d) : null), [id, items, d]);
  // what needs attention first, at a glance in the panel title
  const overdue = id === "done" ? 0 : items.filter((x) => x.task?.due && x.task.due < today).length;
  const dueToday = id === "done" ? 0 : items.filter((x) => x.task?.due === today).length;
  return (
    <section style={style} className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[22px] bg-white/70 shadow-[0_1px_0_rgba(11,31,51,0.05),0_12px_32px_-18px_rgba(11,31,51,0.25)] ring-1 ring-ink/[0.06]">
      <header className="flex h-[64px] shrink-0 items-center gap-3 px-5">
        <span className="h-7 w-2 shrink-0 rounded-full" style={{ background: meta.tone }} />
        <h2 className="truncate text-[26px] font-extrabold tracking-tight text-ink">{t(meta.label)}</h2>
        <span className="tnum grid h-9 min-w-9 shrink-0 place-items-center rounded-full px-2.5 text-[20px] font-bold text-white" style={{ background: meta.tone }}>
          {items.length}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          {overdue > 0 ? (
            <span className="tnum inline-flex h-8 items-center gap-1.5 rounded-full bg-bad px-3 text-[15px] font-bold text-white">
              <Clock className="h-4 w-4" />
              {t("{n} overdue", { n: overdue })}
            </span>
          ) : dueToday > 0 ? (
            <span className="tnum inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-soft px-3 text-[15px] font-bold text-brand-deep">
              <Clock className="h-4 w-4" />
              {t("{n} due today", { n: dueToday })}
            </span>
          ) : null}
          {pages > 1 && (
            <div className="flex items-center gap-2">
              <span className="tnum text-[15px] font-semibold text-sub">
                {page + 1}/{pages}
              </span>
              {pages <= 6 && (
                <div className="flex gap-1.5">
                  {Array.from({ length: pages }, (_, i) => (
                    <span key={i} className={cn("h-2.5 rounded-full transition-all duration-500", i === page ? "w-7" : "w-2.5 bg-ink/15")} style={i === page ? { background: meta.tone } : undefined} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </header>
      {pages > 1 && (
        <div className="mx-5 h-[3px] overflow-hidden rounded-full bg-ink/[0.06]">
          <div key={`${tick}`} className="tv-progress h-full rounded-full" style={{ background: meta.tone, opacity: 0.5, animationDuration: `${PAGE_SECONDS}s` }} />
        </div>
      )}
      <div
        key={`${id}-${page}`}
        className="grid min-h-0 flex-1 gap-2 p-3.5"
        style={{ gridTemplateRows: `repeat(${per}, minmax(0, 1fr))`, gridTemplateColumns: "minmax(0, 1fr)" }}
      >
        {shown.length === 0 ? (
          <div className="row-span-full grid place-items-center text-center text-[20px] font-medium text-sub/80">{t(id === "blocked" ? "No blocks — all clear" : "Nothing here right now")}</div>
        ) : (
          shown.map((it, i) => <WorkCard key={it.key} item={it} d={d} now={now} delay={i * 90} moved={moved.has(it.key)} queue={queue?.get(it.key)} />)
        )}
      </div>
    </section>
  );
};

/* ───────── who to call ───────── */

const CONTACTS_PER_PAGE = 4;

const ContactRow = ({ c, delay }: { c: SiteContact; delay: number }) => {
  const t = useT();
  const r = contactRole(c);
  const I = CONTACT_ICON[c.role] ?? Phone;
  const sos = c.role === "emergency";
  return (
    <div
      className={cn("tv-in flex min-h-0 items-center gap-4 rounded-2xl px-4", sos ? "bg-bad text-white" : "bg-white ring-1 ring-ink/[0.06]")}
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-xl", sos && "bg-white/20")} style={sos ? undefined : { color: r.fg, background: r.bg }}>
        <I className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <Marquee>
          <span className={cn("text-[14px] font-extrabold uppercase tracking-wider", sos ? "text-white/80" : "")} style={sos ? undefined : { color: r.fg }}>
            {c.label?.trim() || t(r.label)}
          </span>
        </Marquee>
        <Marquee>
          <span className="text-[22px] font-bold leading-tight">{c.name}</span>
          {c.note && <span className={cn("ml-2.5 text-[16px] font-medium", sos ? "text-white/80" : "text-sub")}>· {c.note}</span>}
        </Marquee>
      </div>
      <span className={cn("tnum shrink-0 whitespace-nowrap font-mono text-[30px] font-bold tracking-tight", sos ? "text-white" : "text-ink")}>{c.phone}</span>
    </div>
  );
};

/** Who to call: foreman, manager, safety, warehouse — names and big phone numbers. */
const ContactsPanel = ({ list, tick, style }: { list: SiteContact[]; tick: number; style?: CSSProperties }) => {
  const t = useT();
  const pages = Math.max(1, Math.ceil(list.length / CONTACTS_PER_PAGE));
  const page = tick % pages;
  const shown = list.slice(page * CONTACTS_PER_PAGE, page * CONTACTS_PER_PAGE + CONTACTS_PER_PAGE);
  return (
    <section style={style} className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[22px] bg-white/70 shadow-[0_1px_0_rgba(11,31,51,0.05),0_12px_32px_-18px_rgba(11,31,51,0.25)] ring-1 ring-ink/[0.06]">
      <header className="flex h-[64px] shrink-0 items-center gap-3 px-5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink text-white">
          <Phone className="h-[18px] w-[18px]" />
        </span>
        <h2 className="truncate text-[26px] font-extrabold tracking-tight text-ink">{t("Who to call")}</h2>
        {pages > 1 && (
          <div className="ml-auto flex shrink-0 gap-1.5">
            {Array.from({ length: pages }, (_, i) => (
              <span key={i} className={cn("h-2.5 rounded-full transition-all duration-500", i === page ? "w-7 bg-ink" : "w-2.5 bg-ink/15")} />
            ))}
          </div>
        )}
      </header>
      <div key={page} className="grid min-h-0 flex-1 gap-2 p-3.5 pt-1" style={{ gridTemplateRows: `repeat(${CONTACTS_PER_PAGE}, minmax(0, 1fr))`, gridTemplateColumns: "minmax(0, 1fr)" }}>
        {shown.length === 0 ? (
          <div className="row-span-full grid place-items-center px-6 text-center text-[19px] font-medium text-sub/80">{t("No contacts yet — the manager adds them on the Board page")}</div>
        ) : (
          shown.map((c, i) => <ContactRow key={c.id} c={c} delay={i * 90} />)
        )}
      </div>
    </section>
  );
};

/* ───────── announcements ───────── */

const BANNER_SECONDS = 9;
const URGENT_STYLE = {
  safety: { bg: "#E5384B", label: "Safety", Icon: ShieldAlert },
  important: { bg: "#FF5A1F", label: "Important", Icon: Megaphone },
} as const;

/** Safety / important notices: a bold strip under the header, one at a time. */
const NoticeBanner = ({ list, now }: { list: Notice[]; now: Date }) => {
  const t = useT();
  const i = Math.floor(now.getTime() / (BANNER_SECONDS * 1000)) % list.length;
  const n = list[i];
  const st = URGENT_STYLE[n.kind === "safety" ? "safety" : "important"];
  return (
    <div className="relative flex h-[92px] shrink-0 items-center gap-5 overflow-hidden px-9 text-white transition-colors duration-700" style={{ background: st.bg }}>
      <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:repeating-linear-gradient(135deg,#fff_0_14px,transparent_14px_36px)]" />
      <span className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/20">
        <st.Icon className="tv-ring h-8 w-8" strokeWidth={2.4} />
      </span>
      <span className="relative shrink-0 rounded-lg bg-white px-3 py-1 text-[17px] font-extrabold uppercase tracking-[0.14em]" style={{ color: st.bg }}>
        {t(st.label)}
      </span>
      <div key={n.id} className="tv-in relative min-w-0 flex-1">
        <Marquee speed={60}>
          <span className="text-[32px] font-extrabold leading-tight tracking-tight">{n.title}</span>
          {n.text && <span className="ml-5 text-[24px] font-medium text-white/85">{n.text}</span>}
        </Marquee>
      </div>
      {list.length > 1 && (
        <div className="relative flex shrink-0 items-center gap-3">
          <span className="tnum text-[17px] font-bold text-white/80">
            {i + 1}/{list.length}
          </span>
          <div className="flex gap-1.5">
            {list.map((x, k) => (
              <span key={x.id} className={cn("h-2.5 rounded-full bg-white transition-all duration-500", k === i ? "w-7" : "w-2.5 opacity-40")} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const TICKER_DOT: Record<Notice["kind"], string> = { info: "#2563EB", good: "#1F9D63", important: "#FF5A1F", safety: "#E5384B" };

/** News and good news: a slow, endless crawl along the bottom of the screen. */
const NewsTicker = ({ list, now }: { list: Notice[]; now: Date }) => {
  const t = useT();
  const track = useRef<HTMLDivElement>(null);
  const one = useRef<HTMLDivElement>(null);
  const sig = list.map((n) => `${n.id}:${n.title}:${n.text ?? ""}`).join("|");
  // enough copies to always fill the strip, however short the news is
  const [reps, setReps] = useState(3);
  useLayoutEffect(() => {
    const w = one.current?.offsetWidth ?? 0;
    if (w) setReps(Math.max(2, Math.ceil(1800 / w) + 1));
  }, [sig]);
  useLayoutEffect(() => {
    const el = track.current;
    const w = one.current?.offsetWidth ?? 0;
    if (!el || !w || typeof el.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const a = el.animate([{ transform: "translateX(0)" }, { transform: `translateX(${-w}px)` }], { duration: (w / 70) * 1000, iterations: Infinity });
    return () => a.cancel();
  }, [sig]);
  const fresh = (n: Notice) => now.getTime() - Date.parse(n.createdAt) < 2 * 3600 * 1000;
  const copy = (ref?: typeof one) => (
    <div ref={ref} className="flex shrink-0 items-center">
      {list.map((n) => (
        <span key={n.id} className="inline-flex items-center gap-3 whitespace-nowrap pr-14">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: TICKER_DOT[n.kind] }} />
          {n.kind === "good" && <PartyPopper className="h-6 w-6 text-ok" />}
          {fresh(n) && <span className="rounded-md bg-brand px-2 py-0.5 text-[14px] font-extrabold uppercase tracking-wider text-white">{t("New")}</span>}
          <span className="text-[24px] font-bold text-ink">{n.title}</span>
          {n.text && <span className="text-[22px] text-ink/70">{n.text}</span>}
        </span>
      ))}
    </div>
  );
  return (
    <div className="relative flex h-[64px] shrink-0 items-stretch overflow-hidden border-t border-ink/10 bg-white">
      <div className="relative z-10 flex shrink-0 items-center gap-2.5 bg-ink pl-9 pr-6 text-white">
        <Newspaper className="h-6 w-6 text-brand" />
        <span className="text-[19px] font-extrabold uppercase tracking-[0.14em]">{t("News")}</span>
        <span className="absolute -right-4 top-0 h-full w-8 skew-x-[-14deg] bg-ink" />
      </div>
      <div className="relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_48px,#000_calc(100%-48px),transparent)]">
        <div ref={track} className="absolute inset-y-0 left-0 flex items-center pl-12 will-change-transform">
          {copy(one)}
          {Array.from({ length: reps - 1 }, (_, k) => (
            <div key={k} className="contents">
              {copy()}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export interface TvBoardProps {
  data: BoardData;
  takeUrl: string | null;
  status: FeedStatus;
  updatedAt: number | null;
  /** show the fullscreen button (the real TV page, not the manager preview) */
  fullscreen?: boolean;
}

export const TvBoard = ({ data, takeUrl, status, updatedAt, fullscreen }: TvBoardProps) => {
  const t = useT();
  const [fs, setFs] = useState(false);
  const fsReady = typeof document !== "undefined" && document.fullscreenEnabled;
  useEffect(() => {
    const on = () => setFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFs = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  };
  const f = useFmt();
  const now = useNow(1000);
  const tick = Math.floor(now.getTime() / (PAGE_SECONDS * 1000));
  const today = localDay(now.toISOString());
  const items = useMemo(() => boardItems(data, today), [data, today]);
  // a calm halo for cards that just changed section (never on the first load)
  const prev = useRef<Map<string, SectionId> | null>(null);
  const [moved, setMoved] = useState<Set<string>>(new Set());
  useEffect(() => {
    const cur = new Map<string, SectionId>();
    for (const s of SECTIONS) for (const it of items[s.id]) cur.set(it.key, s.id);
    const was = prev.current;
    prev.current = cur;
    if (!was) return;
    const m = new Set([...cur].filter(([k, s]) => was.has(k) && was.get(k) !== s).map(([k]) => k));
    if (!m.size) return;
    setMoved(m);
    const id = setTimeout(() => setMoved(new Set()), 2600);
    return () => clearTimeout(id);
  }, [items]);
  const load = useMemo(() => {
    return data.crews
      .filter((c) => c.active)
      .map((c) => {
        let busy = 0;
        let queued = 0;
        for (const tk of data.tasks) {
          if (tk.status === "done") continue;
          const s = items.progress.some((x) => x.task?.id === tk.id);
          if (activeClaims(tk).some((x) => x.linkId === c.id) || (s && tk.crewLinkId === c.id)) busy++;
          else if (tk.crewLinkId === c.id) queued++;
        }
        return { id: c.id, name: c.name, busy, queued, people: activeClaimsCount(data, c.id) };
      })
      .filter((c) => c.busy || c.queued)
      .sort((a, b) => b.busy - a.busy || b.queued - a.queued)
      .slice(0, 7);
  }, [data, items]);
  const max = Math.max(1, ...load.map((c) => c.busy + c.queued));
  const live = status === "live";
  const notices = useMemo(() => liveNotices(data.notices, today), [data.notices, today]);
  const urgent = notices.filter(isUrgent);
  const news = notices.filter((n) => !isUrgent(n));
  const contacts = useMemo(() => sortContacts(data.contacts), [data.contacts]);
  const schedules = useMemo(() => boardSchedules(data), [data]);
  const openFree = items.free.filter((x) => x.task && tagsOf(x.task, now).some((g) => g.id === "take" || g.id === "need")).length;

  return (
    <div className="relative flex h-full w-full flex-col bg-[#EEF1EC] font-sans text-ink">
      <div className="pointer-events-none absolute inset-0 opacity-[0.55] [background-image:linear-gradient(rgba(11,31,51,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(11,31,51,0.045)_1px,transparent_1px)] [background-size:48px_48px]" />
      {/* header */}
      <header className="relative flex h-[118px] shrink-0 items-center gap-8 bg-ink px-9 text-white">
        <div className="flex min-w-0 items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand">
            <img src="/logo-128.png" alt="" className="h-9 w-9 rounded-lg" />
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-bold uppercase tracking-[0.18em] text-brand">{t("Work board")}</div>
            <div className="max-w-[460px] truncate text-[34px] font-extrabold leading-tight tracking-tight">{data.name}</div>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center gap-2.5">
          {TV_SECTIONS.map((s) => (
            <div key={s.id} className="flex items-center gap-2.5 rounded-2xl bg-white/[0.07] px-4 py-2.5 ring-1 ring-white/10">
              <span className="h-3 w-3 rounded-full" style={{ background: s.id === "assigned" ? "#9FB0C0" : s.tone }} />
              <span className="tnum text-[32px] font-extrabold leading-none">{items[s.id].length}</span>
              <span className="max-w-[118px] text-[14px] font-semibold leading-tight text-white/70">{t(s.label)}</span>
            </div>
          ))}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {fullscreen && fsReady && (
            <button
              type="button"
              onClick={toggleFs}
              title={fs ? t("Exit fullscreen") : t("Fullscreen")}
              className="flex h-8 items-center gap-2 rounded-full bg-white/10 px-3 text-[15px] font-bold text-white/80 transition-colors hover:bg-white/20 hover:text-white active:scale-95"
            >
              {fs ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              {fs ? t("Exit fullscreen") : t("Fullscreen")}
            </button>
          )}
          <div className="flex items-baseline gap-4">
            <span className="text-[19px] font-semibold capitalize text-white/70">{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</span>
            <span className="tnum font-mono text-[52px] font-bold leading-none tracking-tight">
              {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <span
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-full px-3 text-[15px] font-bold transition-colors duration-700",
              live ? "bg-ok/20 text-[#7EE2B3]" : status === "connecting" ? "bg-white/10 text-white/70" : "bg-fiber text-ink",
            )}
          >
            {live ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            {live ? t("Live") : status === "connecting" ? t("Connecting…") : status === "revoked" ? t("Board link turned off") : t("No connection")}
            {updatedAt && !live && <span className="font-semibold">· {t("updated {t}", { t: f.time(new Date(updatedAt).toISOString()) })}</span>}
          </span>
        </div>
      </header>

      {urgent.length > 0 && <NoticeBanner list={urgent} now={now} />}

      {/* body */}
      <div className="relative grid min-h-0 flex-1 gap-4 p-5" style={{ gridTemplateColumns: `repeat(3, minmax(0, 1fr)) ${schedules.length ? 460 : 380}px`, gridTemplateRows: "1fr 1fr" }}>
        {/* in progress gets the tall middle column; blocks and "done today" are for managers */}
        <Panel id="free" items={items.free} d={data} now={now} tick={tick} moved={moved} style={{ gridColumn: 1, gridRow: 1 }} />
        <Panel id="progress" items={items.progress} d={data} now={now} tick={tick} moved={moved} per={6} style={{ gridColumn: 2, gridRow: "1 / span 2" }} />
        <Panel id="incomplete" items={items.incomplete} d={data} now={now} tick={tick} moved={moved} style={{ gridColumn: 3, gridRow: 1 }} />
        <Panel id="assigned" items={items.assigned} d={data} now={now} tick={tick} moved={moved} style={{ gridColumn: 1, gridRow: 2 }} />
        <ContactsPanel list={contacts} tick={tick} style={{ gridColumn: 3, gridRow: 2 }} />
        {/* QR column */}
        <aside className="flex min-h-0 flex-col gap-4" style={{ gridColumn: 4, gridRow: "1 / span 2" }}>
          {schedules.length > 0 ? (
            /* compact QR: the schedule below needs the room */
            <div className="flex items-center gap-5 rounded-[22px] bg-white p-5 shadow-[0_12px_32px_-18px_rgba(11,31,51,0.35)] ring-1 ring-ink/[0.06]">
              <div className="shrink-0 rounded-2xl bg-white p-2 ring-[3px] ring-brand">
                {takeUrl ? <Qr value={takeUrl} className="h-[160px] w-[160px]" /> : <div className="grid h-[160px] w-[160px] place-items-center text-sub"><QrCode className="h-16 w-16 opacity-30" /></div>}
              </div>
              <div className="min-w-0">
                <div className="text-[24px] font-extrabold leading-tight text-ink">{t("Scan to take a free task")}</div>
                <div className="mt-1.5 text-[15px] leading-snug text-sub">{t("Pick your crew and your name — no login")}</div>
                <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand-soft px-3.5 py-1.5 text-[16px] font-bold text-brand-deep">
                  <span className="tnum text-[20px]">{openFree}</span>
                  {t("free tasks open")}
                </div>
              </div>
            </div>
          ) : (
          <div className="flex flex-col items-center rounded-[22px] bg-white px-7 pb-6 pt-6 text-center shadow-[0_12px_32px_-18px_rgba(11,31,51,0.35)] ring-1 ring-ink/[0.06]">
            <div className="relative rounded-2xl bg-white p-3 ring-[3px] ring-brand">
              {takeUrl ? (
                <Qr value={takeUrl} className="h-[248px] w-[248px]" />
              ) : (
                <div className="grid h-[248px] w-[248px] place-items-center text-sub">
                  <QrCode className="h-24 w-24 opacity-30" />
                </div>
              )}
            </div>
            <div className="mt-5 text-[25px] font-extrabold leading-tight text-ink">{t("Scan to take a free task")}</div>
            <div className="mt-1.5 text-[16px] leading-snug text-sub">{t("Pick your crew and your name — no login")}</div>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-soft px-4 py-2 text-[18px] font-bold text-brand-deep">
              <span className="tnum text-[22px]">{openFree}</span>
              {t("free tasks open")}
            </div>
          </div>
          )}
          {schedules.length > 0 ? (
            <ShiftsPanel list={schedules} now={now} tick={tick} />
          ) : (
          <div className="flex min-h-0 flex-1 flex-col rounded-[22px] bg-white/70 p-5 ring-1 ring-ink/[0.06]">
            <h3 className="flex items-center gap-2 text-[21px] font-extrabold text-ink">
              <Users className="h-5 w-5 text-sub" /> {t("Crew load")}
            </h3>
            <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
              {load.length === 0 && <div className="text-[17px] text-sub">{t("No crew has work on the board yet")}</div>}
              {load.map((c) => (
                <div key={c.id} className="tv-in">
                  <div className="flex items-baseline justify-between gap-2">
                    <Marquee className="flex-1">
                      <span className="text-[18px] font-bold">{c.name}</span>
                    </Marquee>
                    <span className="tnum shrink-0 text-[15px] text-sub">
                      {t("{n} active", { n: c.busy })} · {t("{n} queued", { n: c.queued })}
                    </span>
                  </div>
                  <div className="mt-1.5 flex h-3 overflow-hidden rounded-full bg-ink/[0.07]">
                    <div className="h-full bg-cat transition-all duration-700" style={{ width: `${(c.busy / max) * 100}%` }} />
                    <div className="h-full bg-ink/25 transition-all duration-700" style={{ width: `${(c.queued / max) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          )}
        </aside>
      </div>
      {news.length > 0 && <NewsTicker list={news} now={now} />}
    </div>
  );
};

const activeClaimsCount = (d: BoardData, linkId: string) => d.tasks.reduce((n, tk) => n + activeClaims(tk).filter((c) => c.linkId === linkId).length, 0);
