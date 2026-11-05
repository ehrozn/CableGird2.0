import { CalendarClock, Megaphone, Newspaper, PartyPopper, Pencil, Plus, ShieldAlert, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { NOTICE_KINDS, type NoticeState, isUrgent, localDay, noticeState } from "@/lib/board";
import { useFmt, useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { Notice, NoticeKind, Project } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICON: Record<NoticeKind, typeof Megaphone> = { info: Newspaper, important: Megaphone, safety: ShieldAlert, good: PartyPopper };
const MAX_TITLE = 120;
const MAX_TEXT = 280;

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDay(d.toISOString());
};

const TEMPLATES: { kind: NoticeKind; title: string }[] = [
  { kind: "safety", title: "Hard hats, vests and safety boots on site at all times" },
  { kind: "safety", title: "Safety briefing at 7:30 at the site office" },
  { kind: "important", title: "Material delivery today — keep the loading area free" },
  { kind: "important", title: "Power shutdown on this floor — check before you start" },
  { kind: "info", title: "Daily reports are due by 17:00" },
  { kind: "good", title: "Great work, team — milestone reached!" },
];

const STATE_STYLE: Record<NoticeState, { label: string; cls: string }> = {
  live: { label: "On the TV now", cls: "bg-ok-soft text-ok" },
  scheduled: { label: "Scheduled", cls: "bg-cat-soft text-cat" },
  expired: { label: "Expired", cls: "bg-ink/[0.06] text-sub" },
  hidden: { label: "Hidden", cls: "bg-ink/[0.06] text-sub" },
};

type Draft = { kind: NoticeKind; title: string; text: string; from: string; until: string };
const empty: Draft = { kind: "info", title: "", text: "", from: "", until: "" };

/** Manager: announcements and news for the TV board. */
export const NoticesEditor = ({ p, manager }: { p: Project; manager: boolean }) => {
  const t = useT();
  const f = useFmt();
  const addNotice = useStore((s) => s.addNotice);
  const updateNotice = useStore((s) => s.updateNotice);
  const removeNotice = useStore((s) => s.removeNotice);
  const today = localDay(new Date().toISOString());
  const [d, setD] = useState<Draft>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const list = useMemo(() => {
    const order: Record<NoticeState, number> = { live: 0, scheduled: 1, hidden: 2, expired: 3 };
    return (p.notices ?? [])
      .map((n) => ({ n, st: noticeState(n, today) }))
      .sort((a, b) => order[a.st] - order[b.st] || b.n.createdAt.localeCompare(a.n.createdAt));
  }, [p.notices, today]);
  const liveCount = list.filter((x) => x.st === "live").length;

  const reset = () => {
    setD(empty);
    setEditing(null);
    setOpen(false);
  };
  const save = () => {
    const title = d.title.trim();
    if (!title) return;
    if (d.from && d.until && d.until < d.from) {
      toast.error(t("“Until” is before “From”"));
      return;
    }
    const v = { kind: d.kind, title, text: d.text.trim() || undefined, from: d.from || undefined, until: d.until || undefined };
    if (editing) {
      updateNotice(p.id, editing, v);
      toast.success(t("Announcement updated"));
    } else {
      addNotice(p.id, { ...v, active: true });
      toast.success(d.from && d.from > today ? t("Announcement scheduled") : t("Announcement is on the TV"));
    }
    reset();
  };
  const edit = (n: Notice) => {
    setD({ kind: n.kind, title: n.title, text: n.text ?? "", from: n.from ?? "", until: n.until ?? "" });
    setEditing(n.id);
    setOpen(true);
  };

  const when = (n: Notice) => {
    if (n.from && n.until) return n.from === n.until ? f.short(n.from) : `${f.short(n.from)} – ${f.short(n.until)}`;
    if (n.until) return n.until === today ? t("Today only") : t("Until {d}", { d: f.short(n.until) });
    if (n.from) return t("From {d}", { d: f.short(n.from) });
    return t("Until removed");
  };
  const presets: { label: string; until: string }[] = [
    { label: t("Until removed"), until: "" },
    { label: t("Today"), until: today },
    { label: t("3 days"), until: addDays(today, 2) },
    { label: t("1 week"), until: addDays(today, 6) },
  ];

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            <Megaphone className="h-4 w-4 text-brand" /> {t("Announcements & news")}
            {liveCount > 0 && <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-bold text-ok">{t("{n} on the TV", { n: liveCount })}</span>}
          </h2>
          <p className="mt-1 text-sm text-sub">{t("Safety and important notices show as a bold strip under the board header. News and good news crawl along the bottom.")}</p>
        </div>
        {!open && (
          <Button size="sm" disabled={!manager} onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> {t("New announcement")}
          </Button>
        )}
      </div>

      {open && (
        <form
          className="rise mt-4 space-y-3 rounded-xl border border-brand/25 bg-brand-soft/25 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {NOTICE_KINDS.map((k) => {
              const I = ICON[k.id];
              const on = d.kind === k.id;
              return (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setD({ ...d, kind: k.id })}
                  className={cn("flex items-center justify-center gap-1.5 rounded-lg border-2 px-2 py-2 text-[13px] font-bold transition active:scale-[0.97]", on ? "shadow-sm" : "border-transparent bg-white text-sub hover:text-ink")}
                  style={on ? { color: k.fg, background: k.bg, borderColor: k.fg } : undefined}
                >
                  <I className="h-4 w-4 shrink-0" /> {t(k.label)}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-sub">{isUrgent(d) ? t("Shown as a bold strip under the header, one at a time.") : t("Crawls along the bottom of the TV screen.")}</p>
          <div>
            <Input
              autoFocus
              value={d.title}
              maxLength={MAX_TITLE}
              onChange={(e) => setD({ ...d, title: e.target.value })}
              placeholder={t("Headline, e.g. Safety briefing at 7:30")}
              className="bg-white text-[15px] font-semibold"
            />
            {d.title.length > MAX_TITLE - 30 && <div className="mt-1 text-right text-[11px] text-sub tnum">{d.title.length}/{MAX_TITLE}</div>}
          </div>
          <Textarea
            value={d.text}
            maxLength={MAX_TEXT}
            onChange={(e) => setD({ ...d, text: e.target.value })}
            rows={2}
            placeholder={t("Details (optional)")}
            className="bg-white"
          />
          {!editing && !d.title && (
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATES.map((x) => {
                const k = NOTICE_KINDS.find((y) => y.id === x.kind)!;
                return (
                  <button
                    key={x.title}
                    type="button"
                    onClick={() => setD({ ...d, kind: x.kind, title: t(x.title) })}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-left text-xs font-medium text-ink transition hover:border-brand/40"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: k.fg }} />
                    <span className="truncate">{t(x.title)}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="rounded-lg bg-white/70 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold">
              <CalendarClock className="h-4 w-4 text-sub" /> {t("Show on the TV")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((x) => (
                <button
                  key={x.label}
                  type="button"
                  onClick={() => setD({ ...d, from: "", until: x.until })}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-semibold transition",
                    !d.from && d.until === x.until ? "border-ink bg-ink text-white" : "bg-white text-ink hover:border-ink/30",
                  )}
                >
                  {x.label}
                </button>
              ))}
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <label className="text-xs text-sub">
                {t("From")}
                <Input type="date" value={d.from} min={editing ? undefined : today} onChange={(e) => setD({ ...d, from: e.target.value })} className="mt-1 h-9 bg-white" />
              </label>
              <label className="text-xs text-sub">
                {t("Until")}
                <Input type="date" value={d.until} min={d.from || today} onChange={(e) => setD({ ...d, until: e.target.value })} className="mt-1 h-9 bg-white" />
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={reset}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={!d.title.trim()}>
              {editing ? t("Save") : d.from && d.from > today ? t("Schedule") : t("Show on the TV")}
            </Button>
          </div>
        </form>
      )}

      {list.length > 0 ? (
        <ul className="mt-4 divide-y rounded-xl border bg-white">
          {list.map(({ n, st }) => {
            const k = NOTICE_KINDS.find((x) => x.id === n.kind) ?? NOTICE_KINDS[0];
            const I = ICON[n.kind] ?? Newspaper;
            const ss = STATE_STYLE[st];
            return (
              <li key={n.id} className={cn("flex items-start gap-3 px-3.5 py-3 transition", (st === "expired" || st === "hidden") && "opacity-60", editing === n.id && "bg-brand-soft/30")}>
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ color: k.fg, background: k.bg }}>
                  <I className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="break-words text-sm font-semibold leading-snug text-ink">{n.title}</div>
                  {n.text && <div className="mt-0.5 break-words text-[13px] text-sub">{n.text}</div>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="rounded px-1.5 py-0.5 font-bold" style={{ color: k.fg, background: k.bg }}>
                      {t(k.label)}
                    </span>
                    <span className={cn("rounded px-1.5 py-0.5 font-bold", ss.cls)}>{t(ss.label)}</span>
                    <span className="text-sub">{when(n)}</span>
                    {n.by && <span className="text-sub">· {n.by}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Switch
                    checked={n.active}
                    disabled={!manager}
                    onCheckedChange={(on) => updateNotice(p.id, n.id, { active: on })}
                    aria-label={n.active ? t("Hide from the TV") : t("Show on the TV")}
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!manager} onClick={() => edit(n)} aria-label={t("Edit")}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-sub hover:bg-bad-soft hover:text-bad"
                    disabled={!manager}
                    onClick={() => {
                      removeNotice(p.id, n.id);
                      if (editing === n.id) reset();
                      toast(t("Announcement deleted"), { icon: <X className="h-4 w-4" /> });
                    }}
                    aria-label={t("Delete")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        !open && (
          <div className="mt-4 rounded-xl border border-dashed bg-white/60 px-4 py-6 text-center text-sm text-sub">{t("No announcements yet. Add a safety rule, a delivery or good news — the TV shows it right away.")}</div>
        )
      )}
    </section>
  );
};
