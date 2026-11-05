import { AlertOctagon, ChevronsDown, ChevronsUp, Equal, HardHat, Package, Phone, ShieldCheck, Siren, UserRound } from "lucide-react";
import QRCode from "qrcode";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

import { STAGE_COLOR, STAGE_KEYS, STAGE_STATE_LABEL, STATUS, STOP_REASONS, type StatusId, type Tag } from "@/lib/board";
import { useT } from "@/lib/i18n";
import type { CableStages, ContactRole, Priority, StageKey } from "@/lib/types";
import { cn } from "@/lib/utils";

/** a Date that re-renders every `ms` */
export const useNow = (ms: number) => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return now;
};

export const CONTACT_ICON: Record<ContactRole, typeof Phone> = { emergency: Siren, foreman: HardHat, manager: UserRound, safety: ShieldCheck, warehouse: Package, other: Phone };

/** Status: filled pill with a dot (text + colour). */
export const StatusPill = ({ s, size = "md", className }: { s: StatusId; size?: "md" | "lg"; className?: string }) => {
  const t = useT();
  const st = STATUS[s];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-bold transition-colors duration-700",
        size === "lg" ? "h-9 px-3.5 text-[17px]" : "h-6 px-2.5 text-xs",
        className,
      )}
      style={{ color: st.fg, background: st.bg }}
    >
      {s === "blocked" ? (
        <AlertOctagon className={size === "lg" ? "h-[18px] w-[18px]" : "h-3.5 w-3.5"} strokeWidth={2.6} />
      ) : (
        <span className={cn("rounded-full", size === "lg" ? "h-2.5 w-2.5" : "h-2 w-2")} style={{ background: st.fg }} />
      )}
      {t(st.label)}
    </span>
  );
};

/** Priority: chevron glyph + word, outlined (a different signal from the status pill). */
export const PriorityMark = ({ p, size = "md" }: { p: Priority; size?: "md" | "lg" }) => {
  const t = useT();
  const Icon = p === "high" ? ChevronsUp : p === "low" ? ChevronsDown : Equal;
  const c = p === "high" ? "#E5384B" : p === "low" ? "#5B6B78" : "#0B1F33";
  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border-2 font-bold uppercase tracking-wide", size === "lg" ? "h-9 px-2.5 text-[15px]" : "h-6 px-1.5 text-[10px]")}
      style={{ color: c, borderColor: p === "high" ? c : "rgba(11,31,51,0.14)" }}
    >
      <Icon className={size === "lg" ? "h-5 w-5" : "h-3.5 w-3.5"} strokeWidth={2.8} />
      {t(p === "high" ? "High" : p === "low" ? "Low" : "Normal")}
    </span>
  );
};

const TAG_STYLE: Record<Tag["id"], string> = {
  blocked: "bg-bad text-white",
  take: "bg-brand text-white",
  need: "bg-brand-soft text-brand-deep",
  foreman: "bg-[#FFF6CC] text-[#7A5B00]",
  approval: "bg-cat-soft text-cat",
  overdue: "border border-bad/40 text-bad bg-white",
};
export const TagChip = ({ tag, size = "md" }: { tag: Tag; size?: "md" | "lg" }) => {
  const t = useT();
  return (
    <span className={cn("inline-flex shrink-0 items-center whitespace-nowrap rounded-md font-bold", size === "lg" ? "h-8 px-2.5 text-[15px]" : "h-5 px-1.5 text-[11px]", TAG_STYLE[tag.id])}>
      {t(tag.label, tag.vars)}
    </span>
  );
};

const SHORT: Record<StageKey, string> = { pull: "Pull", termA: "A", termB: "B", test: "Test" };
/** Four cable stages as segments. */
export const StageBar = ({ st, size = "md" }: { st: CableStages; size?: "md" | "lg" }) => {
  const t = useT();
  const keys = STAGE_KEYS.filter((k) => st[k]);
  if (!keys.length) return null;
  return (
    <span className={cn("inline-flex items-stretch gap-1", size === "lg" ? "h-8" : "h-5")}>
      {keys.map((k) => {
        const s = st[k]!;
        const dark = s.state === "progress" || s.state === "done" || s.state === "failed";
        return (
          <span
            key={k}
            title={`${t(SHORT[k])}: ${t(STAGE_STATE_LABEL[s.state])}`}
            className={cn("relative inline-flex items-center overflow-hidden rounded font-bold transition-colors duration-700", size === "lg" ? "px-2.5 text-[15px]" : "px-1.5 text-[10px]")}
            style={{ background: s.state === "progress" ? "#E6EEFE" : STAGE_COLOR[s.state], color: s.state === "progress" ? "#2563EB" : dark ? "#fff" : "#5B6B78" }}
          >
            {s.state === "progress" && s.pct != null && <span className="absolute inset-y-0 left-0 bg-cat/25" style={{ width: `${Math.min(100, s.pct)}%` }} />}
            <span className={cn("relative", s.state === "na" && "line-through")}>
              {t(SHORT[k])}
              {s.state === "progress" && s.pct != null ? ` ${s.pct}%` : ""}
              {s.state === "failed" ? " ✗" : s.state === "done" ? " ✓" : ""}
            </span>
          </span>
        );
      })}
    </span>
  );
};

/** QR code as inline SVG. */
export const Qr = ({ value, className }: { value: string; className?: string }) => {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let on = true;
    QRCode.toString(value, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0B1F33", light: "#FFFFFF" } })
      .then((s) => on && setSvg(s))
      .catch(() => undefined);
    return () => {
      on = false;
    };
  }, [value]);
  return <div className={cn("[&>svg]:h-full [&>svg]:w-full", className)} dangerouslySetInnerHTML={{ __html: svg }} />;
};

/** Task history line in the reader's language (the log is stored language-neutral). */
export const fmtLog = (t: (k: string, v?: Record<string, string | number>) => string, kind: string, text: string) => {
  const stage = (s: string) =>
    s.replace(/\b(pull|termA|termB|test):(not_started|progress|done|na|failed)/g, (_, k: StageKey, st: keyof typeof STAGE_STATE_LABEL) => `${t(STAGE_LABEL_SHORT[k])}: ${t(STAGE_STATE_LABEL[st])}`);
  const reason = STOP_REASONS.find((r) => r.id === text);
  switch (kind) {
    case "created":
      return text.startsWith("free:") ? t("Created as a free task · {n} places", { n: text.slice(5) }) : text ? t("Found in report {r}", { r: text }) : t("Created");
    case "claimed":
      return t("Taken by {who}", { who: text });
    case "assigned":
      return t("Assigned to crew {c}", { c: text });
    case "freed":
      return t("Made free · {n} places", { n: text });
    case "blocked":
      return `${t("Blocked")}${text ? `: ${reason ? t(reason.label) : text}` : ""}`;
    case "unblocked":
      return t("Unblocked");
    case "done":
      return t("Closed as done · {who}", { who: text });
    case "reopened":
      return t("Reopened");
    case "linked":
      return t("Merged with “{n}”", { n: text });
    case "released":
      return t("Their part ended: {who}", { who: text });
    case "conflict":
      return `${t("Contradiction")}: ${stage(text)}`;
    case "report":
      return stage(text.replace(/: (partly done|not done|done)\b/, (_, o: string) => `: ${t(o === "done" ? "Done" : o === "partly done" ? "Partly done" : "Not done")}`));
    default:
      return text;
  }
};
const STAGE_LABEL_SHORT: Record<StageKey, string> = { pull: "Pulling", termA: "Termination A", termB: "Termination B", test: "Testing" };

/**
 * Shows content that does not fit by slowly gliding it to the end and back (ping-pong with pauses),
 * so a TV viewer can read everything. Does nothing when it fits. Hover pauses it.
 */
export const Marquee = ({
  children,
  className,
  innerClassName,
  axis = "x",
  speed = 46,
  hold = 1800,
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  axis?: "x" | "y";
  /** px per second */
  speed?: number;
  /** ms to rest at each end */
  hold?: number;
}) => {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const anim = useRef<Animation | null>(null);
  const [dist, setDist] = useState(0);
  const fade = axis === "x" ? 22 : 14;
  useLayoutEffect(() => {
    const b = box.current;
    const i = inner.current;
    if (!b || !i) return;
    const measure = () => {
      const over = axis === "x" ? i.offsetWidth - b.clientWidth : i.offsetHeight - b.clientHeight;
      // leave the last characters clear of the fade
      setDist(over > 1 ? Math.ceil(over + fade) : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(b);
    ro.observe(i);
    return () => ro.disconnect();
  }, [axis, fade]);
  useEffect(() => {
    const i = inner.current;
    if (!i || !dist || typeof i.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const travel = Math.max(1400, (dist / speed) * 1000);
    const total = hold * 2 + travel * 2;
    const tr = (v: number) => (axis === "x" ? `translateX(${-v}px)` : `translateY(${-v}px)`);
    const a = i.animate(
      [
        { transform: tr(0), offset: 0 },
        { transform: tr(0), offset: hold / total, easing: "cubic-bezier(0.45, 0, 0.55, 1)" },
        { transform: tr(dist), offset: (hold + travel) / total },
        { transform: tr(dist), offset: (hold * 2 + travel) / total, easing: "cubic-bezier(0.45, 0, 0.55, 1)" },
        { transform: tr(0), offset: 1 },
      ],
      { duration: total, iterations: Infinity },
    );
    anim.current = a;
    return () => {
      a.cancel();
      anim.current = null;
    };
  }, [dist, speed, hold, axis]);
  const mask =
    dist > 0
      ? axis === "x"
        ? `linear-gradient(90deg, #000 calc(100% - ${fade}px), transparent)`
        : `linear-gradient(180deg, #000 calc(100% - ${fade}px), transparent)`
      : undefined;
  return (
    <div
      ref={box}
      className={cn("min-w-0 overflow-hidden", className)}
      style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
      onMouseEnter={() => anim.current?.pause()}
      onMouseLeave={() => anim.current?.play()}
    >
      <div
        ref={inner}
        className={cn(axis === "x" ? "inline-flex w-max items-center whitespace-nowrap will-change-transform" : "will-change-transform", innerClassName)}
      >
        {children}
      </div>
    </div>
  );
};
