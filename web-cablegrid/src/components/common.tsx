import { Check, Globe } from "lucide-react";
import type { ReactNode } from "react";
import { useParams } from "react-router-dom";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { CableState } from "@/lib/derive";
import { LANGS, useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { IssueStatus, Priority, ReportStatus, Severity, TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export const useProject = () => {
  const { pid } = useParams();
  return useStore((s) => s.projects.find((p) => p.id === pid));
};

export const Logo = ({ compact = false }: { compact?: boolean }) => (
  <div className="flex items-center gap-2.5">
    <img src="/logo-128.png" alt="" className="h-9 w-9 rounded-[9px] shadow-sm" />
    {!compact && (
      <div className="leading-tight">
        <div className="text-[17px] font-extrabold tracking-tight text-ink">CableGrid</div>
        <div className="text-[11px] text-sub">Cables · Crews · Progress</div>
      </div>
    )}
  </div>
);

export const PageHeader = ({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
}) => (
  <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
    <div className="min-w-0">
      {back}
      <h1 className="text-2xl font-extrabold tracking-tight text-ink md:text-[28px]">{title}</h1>
      {subtitle && <div className="mt-1 text-sm text-sub">{subtitle}</div>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

export const EmptyState = ({
  icon,
  title,
  text,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode;
  className?: string;
}) => (
  <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
    <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border bg-white text-brand shadow-sm [&_svg]:h-6 [&_svg]:w-6">
      {icon}
    </div>
    <div className="text-base font-bold text-ink">{title}</div>
    {text && <p className="mt-1 max-w-md text-sm text-sub">{text}</p>}
    {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
  </div>
);

const tone = {
  gray: "bg-[#EEF1EC] text-sub border-[#D5DAD2]",
  blue: "bg-cat-soft text-cat border-cat/25",
  yellow: "bg-fiber-soft text-fiber-deep border-fiber/40",
  green: "bg-ok-soft text-ok border-ok/25",
  red: "bg-bad-soft text-bad border-bad/30",
  orange: "bg-brand-soft text-brand-deep border-brand/30",
} as const;

export type Tone = keyof typeof tone;

export const Badge = ({ t, children, className, dot }: { t: Tone; children: ReactNode; className?: string; dot?: boolean }) => (
  <span
    className={cn(
      "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold",
      tone[t],
      className,
    )}
  >
    {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
    {children}
  </span>
);

export const CableStateBadge = ({ state, label }: { state: CableState; label?: string }) => {
  const t = useT();
  const map: Record<CableState, [Tone, string]> = {
    none: ["gray", "Not started"],
    progress: ["blue", "In progress"],
    complete: ["green", "Complete"],
    issue: ["red", "Issue"],
  };
  const [tn, l] = map[state];
  return (
    <Badge t={tn} dot>
      {label ?? t(l)}
    </Badge>
  );
};

export const ReportStatusBadge = ({ s }: { s: ReportStatus }) => {
  const t = useT();
  const map: Record<ReportStatus, [Tone, string]> = {
    pending: ["yellow", "Pending review"],
    approved: ["green", "Approved"],
    partial: ["blue", "Partly approved"],
    rejected: ["red", "Rejected"],
  };
  return <Badge t={map[s][0]}>{t(map[s][1])}</Badge>;
};

export const TaskStatusBadge = ({ s }: { s: TaskStatus }) => {
  const t = useT();
  const map: Record<TaskStatus, [Tone, string]> = {
    todo: ["gray", "To do"],
    progress: ["blue", "In progress"],
    done: ["green", "Done"],
  };
  return <Badge t={map[s][0]} dot>{t(map[s][1])}</Badge>;
};

export const PriorityBadge = ({ p }: { p: Priority }) => {
  const t = useT();
  const map: Record<Priority, [Tone, string]> = { low: ["gray", "Low"], normal: ["blue", "Normal"], high: ["red", "High"] };
  return <Badge t={map[p][0]}>{t(map[p][1])}</Badge>;
};

export const SeverityBadge = ({ s }: { s: Severity }) => {
  const t = useT();
  const map: Record<Severity, [Tone, string]> = { low: ["gray", "Low"], medium: ["yellow", "Medium"], high: ["red", "Critical"] };
  return <Badge t={map[s][0]}>{t(map[s][1])}</Badge>;
};

export const IssueStatusBadge = ({ s }: { s: IssueStatus }) => {
  const t = useT();
  const map: Record<IssueStatus, [Tone, string]> = { open: ["red", "Open"], progress: ["blue", "In progress"], resolved: ["green", "Resolved"] };
  return <Badge t={map[s][0]} dot>{t(map[s][1])}</Badge>;
};

export const LanguageSwitcher = ({ className }: { className?: string }) => {
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const cur = LANGS.find((l) => l.id === lang)!;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-lg border bg-white px-2.5 text-sm font-semibold text-ink transition hover:border-brand/50",
          className,
        )}
        aria-label="Language"
      >
        <Globe className="h-4 w-4 text-sub" />
        {cur.short}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LANGS.map((l) => (
          <DropdownMenuItem key={l.id} onClick={() => setLang(l.id)} className="gap-2">
            <span className="w-6 font-mono text-xs text-sub">{l.short}</span>
            {l.label}
            {l.id === lang && <Check className="ml-auto h-4 w-4 text-brand" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const Ring = ({ pct, size = 96, stroke = 10, color = "#FF5A1F" }: { pct: number; size?: number; stroke?: number; color?: string }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="-rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#EEF1EC" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (c * Math.min(100, pct)) / 100}
        style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(.2,.8,.2,1)" }}
      />
    </svg>
  );
};

export const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <label className="block">
    <span className="mb-1.5 block text-[13px] font-semibold text-ink">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-sub">{hint}</span>}
  </label>
);

export const Section = ({
  title,
  count,
  action,
  children,
  className,
}: {
  title: ReactNode;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <section className={cn("panel flex min-w-0 flex-col", className)}>
    <header className="flex items-center justify-between gap-3 border-b px-4 py-3 md:px-5">
      <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
        {title}
        {count !== undefined && count > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">{count}</span>
        )}
      </h2>
      {action}
    </header>
    <div className="min-w-0 flex-1">{children}</div>
  </section>
);

export const NativeSelect = ({
  value,
  onChange,
  children,
  className,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  className?: string;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value">) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className={cn(
      "h-10 w-full rounded-lg border border-input bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20",
      className,
    )}
    {...rest}
  >
    {children}
  </select>
);
