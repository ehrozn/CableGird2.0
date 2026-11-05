import {
  ArrowLeft,
  Cable as CableIcon,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  ClipboardList,
  FileText,
  Hand,
  Loader2,
  Lock,
  MapPin,
  Megaphone,
  Phone,
  Newspaper,
  PartyPopper,
  Search,
  ShieldAlert,
  Send,
  UserRound,
  Users,
  WifiOff,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import {
  CONTACT_ICON,
  PriorityMark,
  StageBar,
  StatusPill,
  TagChip,
  useNow,
} from "@/components/board/bits";
import { ShiftList } from "@/components/board/Shift";
import { LanguageSwitcher } from "@/components/common";
import { Textarea } from "@/components/ui/textarea";
import {
  type BoardData,
  activeClaims,
  NOTICE_KINDS,
  boardSchedules,
  canTake,
  contactRole,
  crewSchedule,
  liveNotices,
  localDay,
  openSlots,
  reasonLabel,
  slotsOf,
  sortContacts,
  statusOf,
  tagsOf,
  telHref,
  whoOn,
} from "@/lib/board";
import { addClaimNote, claimTask, useBoardFeed } from "@/lib/board-feed";
import { CloudError } from "@/lib/cloud-api";
import { uid } from "@/lib/ids";
import { openTaskFile } from "@/lib/files";
import { type TFn, useFmt, useT } from "@/lib/i18n";
import type { NoticeKind, Task, TaskClaim } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Me {
  linkId: string;
  empId?: string;
  name: string;
}
type View = { k: "list" } | { k: "task"; id: string } | { k: "mine" };

const ERRORS: Record<string, string> = {
  full: "All places on this task are already taken",
  blocked: "This task is blocked right now",
  not_free: "This task belongs to a crew — it can't be taken by QR",
  done: "This task is already done",
  missing: "This task no longer exists",
  crew: "Your crew link is not active — ask your foreman",
};

const isMine = (c: TaskClaim, me: Me) =>
  c.linkId === me.linkId &&
  (me.empId
    ? c.empId === me.empId
    : !c.empId && c.name.toLowerCase() === me.name.toLowerCase());
const ridKey = (taskId: string, me: Me) =>
  `cg-rid-${taskId}-${me.linkId}-${me.empId ?? me.name.toLowerCase()}`;

/** Mobile page behind the board QR: /take/:token. Picking a crew and a name gives no foreman or manager rights. */
const TakePage = () => {
  const { token = "" } = useParams();
  const t = useT();
  const client = useMemo(
    () => `take-${Math.random().toString(36).slice(2, 9)}`,
    [],
  );
  const feed = useBoardFeed(token, client);
  const store = `cg-take-${token}`;
  const [me, setMeState] = useState<Me | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(store) ?? "null") as Me | null;
    } catch {
      return null;
    }
  });
  const [crewPick, setCrewPick] = useState<string | null>(null);
  const [view, setView] = useState<View>({ k: "list" });
  // just took a task: stay on the list, say where it went
  const [took, setTook] = useState<{ id: string; title: string; crew: string } | null>(null);
  useEffect(() => {
    if (!took) return;
    const id = setTimeout(() => setTook(null), 6000);
    return () => clearTimeout(id);
  }, [took]);
  const setMe = (m: Me | null) => {
    setMeState(m);
    if (m) localStorage.setItem(store, JSON.stringify(m));
    else localStorage.removeItem(store);
  };
  const d = feed.data;
  const crew =
    d && me ? d.crews.find((c) => c.id === me.linkId && c.active) : undefined;

  useEffect(() => {
    document.title = t("Take a task");
  }, [t]);
  // the crew link was turned off: ask again
  useEffect(() => {
    if (d && me && !d.crews.some((c) => c.id === me.linkId && c.active))
      setMeState(null);
  }, [d, me]);

  if (feed.status === "revoked" && !d)
    return (
      <Shell>
        <div className="mt-16 text-center">
          <Lock className="mx-auto h-10 w-10 text-sub" />
          <h1 className="mt-3 text-xl font-extrabold">
            {t("This QR code is no longer active")}
          </h1>
          <p className="mt-1 text-sub">
            {t("Scan the code on the board again or ask your foreman.")}
          </p>
        </div>
      </Shell>
    );
  if (!d)
    return (
      <Shell>
        <div className="grid h-[60dvh] place-items-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
        </div>
      </Shell>
    );

  if (!me || !crew)
    return (
      <Shell title={d.name} status={feed.status}>
        {crewPick ? (
          <PickName
            d={d}
            linkId={crewPick}
            onBack={() => setCrewPick(null)}
            onPick={(m) => (
              setMe(m),
              setCrewPick(null),
              setView({ k: "list" })
            )}
          />
        ) : (
          <PickCrew d={d} onPick={setCrewPick} />
        )}
      </Shell>
    );

  const mine = d.tasks.filter((x) =>
    (x.claims ?? []).some(
      (c) =>
        isMine(c, me) &&
        (!c.endedAt ||
          localDay(c.endedAt) === localDay(new Date().toISOString())),
    ),
  );
  const activeMine = mine.filter((x) =>
    activeClaims(x).some((c) => isMine(c, me)),
  );

  return (
    <Shell
      title={d.name}
      status={feed.status}
      who={
        <button
          onClick={() => setMe(null)}
          className="flex min-w-0 items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-3 text-left text-[13px] font-semibold"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold">
            {me.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 truncate">
            {me.name} · {crew.name}
          </span>
        </button>
      }
    >
      {view.k === "task" ? (
        <TaskView
          d={d}
          id={view.id}
          me={me}
          pid={feed.pid}
          token={token}
          onBack={() => setView({ k: "list" })}
          onTaken={(tk) => {
            feed.patchTask(tk);
            setTook({ id: tk.id, title: tk.title, crew: crew.name });
            setView({ k: "list" });
            window.scrollTo({ top: 0, behavior: "smooth" });
            navigator.vibrate?.(30);
          }}
        />
      ) : (
        <>
          <div className="sticky top-[60px] z-10 -mx-4 mb-3 bg-[#EEF1EC]/95 px-4 pb-2 pt-3 backdrop-blur">
            <div className="grid grid-cols-2 rounded-xl bg-ink/[0.06] p-1">
              {(["list", "mine"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setView({ k })}
                  className={cn(
                    "flex h-10 items-center justify-center gap-2 rounded-lg text-[15px] font-bold transition",
                    view.k === k ? "bg-white text-ink shadow-sm" : "text-sub",
                  )}
                >
                  {t(k === "list" ? "Free tasks" : "My tasks")}
                  {k === "mine" && activeMine.length > 0 && (
                    <span key={took?.id ?? "n"} className={cn("grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[11px] text-white", took && "tv-ring")}>
                      {activeMine.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          {took && view.k === "list" && (
            <div className="rise mb-3 flex items-center gap-3 rounded-2xl bg-ok px-4 py-3 text-white shadow-[0_10px_24px_-14px_rgba(31,157,99,0.8)]">
              <CheckCircle2 className="h-7 w-7 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-extrabold leading-tight">{t("Task taken")}</div>
                <div className="truncate text-[13px] text-white/85">
                  {t("“{t}” is now with {c} — see My tasks", { t: took.title, c: took.crew })}
                </div>
              </div>
              <button
                onClick={() => (setTook(null), setView({ k: "mine" }))}
                className="shrink-0 rounded-full bg-white/20 px-3 py-1.5 text-[13px] font-bold active:scale-95"
              >
                {t("Open")}
              </button>
            </div>
          )}
          {view.k === "list" ? (
            <FreeList
              d={d}
              me={me}
              onOpen={(id) => setView({ k: "task", id })}
            />
          ) : (
            <MineList
              tasks={mine}
              d={d}
              me={me}
              pid={feed.pid}
              token={token}
              onOpen={(id) => setView({ k: "task", id })}
              onFind={() => setView({ k: "list" })}
            />
          )}
          <Schedule d={d} me={me} />
          <Contacts d={d} />
        </>
      )}
    </Shell>
  );
};

const Shell = ({
  children,
  title,
  status,
  who,
}: {
  children: React.ReactNode;
  title?: string;
  status?: string;
  who?: React.ReactNode;
}) => {
  const t = useT();
  return (
    <div className="min-h-dvh bg-[#EEF1EC] text-ink">
      <header className="sticky top-0 z-20 flex h-[60px] items-center gap-3 bg-ink px-4 text-white">
        <img src="/logo-128.png" alt="" className="h-8 w-8 rounded-lg" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand">
            {t("Work board")}
          </div>
          <div className="truncate text-[15px] font-bold leading-tight">
            {title ?? "CableGrid"}
          </div>
        </div>
        {who}
        {!who && (
          <LanguageSwitcher className="h-8 border-white/20 bg-white/10 text-white" />
        )}
      </header>
      {status === "offline" && (
        <div className="flex items-center gap-2 bg-fiber px-4 py-2 text-[13px] font-semibold">
          <WifiOff className="h-4 w-4" />{" "}
          {t("No connection — showing the last loaded list")}
        </div>
      )}
      <main className="mx-auto max-w-lg px-4 pb-16">{children}</main>
    </div>
  );
};

const StepHead = ({
  n,
  title,
  sub,
}: {
  n: number;
  title: string;
  sub: string;
}) => {
  const t = useT();
  return (
    <div className="rise pb-4 pt-6">
      <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-brand-deep">
        {t("Step {n} of 2", { n })}
      </div>
      <h1 className="mt-1 text-[26px] font-extrabold leading-tight tracking-tight">
        {title}
      </h1>
      <p className="mt-1 text-[14px] text-sub">{sub}</p>
    </div>
  );
};

const PickCrew = ({
  d,
  onPick,
}: {
  d: BoardData;
  onPick: (id: string) => void;
}) => {
  const t = useT();
  const crews = d.crews.filter((c) => c.active);
  return (
    <>
      <StepHead
        n={1}
        title={t("Which crew are you in?")}
        sub={t(
          "Choosing a crew only lets you take free tasks — it gives no foreman rights.",
        )}
      />
      {crews.length === 0 && (
        <div className="panel p-6 text-center text-sub">
          {t("No active crews yet — ask your foreman.")}
        </div>
      )}
      <div className="space-y-2">
        {crews.map((c, i) => (
          <button
            key={c.id}
            onClick={() => onPick(c.id)}
            className="rise panel flex w-full items-center gap-3 p-4 text-left transition active:scale-[0.99]"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cat-soft text-cat">
              <Users className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-bold">
                {c.name}
              </span>
              <span className="block text-[13px] text-sub">
                {t("{n} people", { n: c.memberIds.length })}
              </span>
            </span>
            <ChevronRight className="h-5 w-5 text-sub" />
          </button>
        ))}
      </div>
    </>
  );
};

const PickName = ({
  d,
  linkId,
  onBack,
  onPick,
}: {
  d: BoardData;
  linkId: string;
  onBack: () => void;
  onPick: (m: Me) => void;
}) => {
  const t = useT();
  const [q, setQ] = useState("");
  const crew = d.crews.find((c) => c.id === linkId)!;
  const members = d.people.filter(
    (p) => p.active && crew.memberIds.includes(p.id),
  );
  const others =
    q.trim().length >= 2
      ? d.people.filter(
          (p) =>
            p.active &&
            !crew.memberIds.includes(p.id) &&
            p.name.toLowerCase().includes(q.trim().toLowerCase()),
        )
      : [];
  const shown = members.filter(
    (p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const typed = q.trim();
  const exact = [...members, ...others].some(
    (p) => p.name.toLowerCase() === typed.toLowerCase(),
  );
  return (
    <>
      <button
        onClick={onBack}
        className="mt-4 inline-flex items-center gap-1 text-[14px] font-semibold text-sub"
      >
        <ArrowLeft className="h-4 w-4" /> {crew.name}
      </button>
      <StepHead
        n={2}
        title={t("What's your name?")}
        sub={t("Pick yourself from the list or type your name.")}
      />
      <label className="panel flex h-12 items-center gap-2 px-3">
        <Search className="h-4 w-4 text-sub" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("Search or type your name")}
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none"
        />
      </label>
      <div className="mt-3 space-y-2">
        {[...shown, ...others].map((p) => (
          <button
            key={p.id}
            onClick={() => onPick({ linkId, empId: p.id, name: p.name })}
            className="panel flex w-full items-center gap-3 p-3.5 text-left active:scale-[0.99]"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-[15px] font-bold text-white">
              {p.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-semibold">
                {p.name}
              </span>
              {p.crew && (
                <span className="block truncate text-[12px] text-sub">
                  {p.crew}
                </span>
              )}
            </span>
            <ChevronRight className="h-5 w-5 text-sub" />
          </button>
        ))}
        {typed.length >= 2 && !exact && (
          <button
            onClick={() => onPick({ linkId, name: typed })}
            className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-brand/40 bg-brand-soft/50 p-3.5 text-left"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-white">
              <UserRound className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1 text-[15px]">
              {t("Continue as")} <b>{typed}</b>
            </span>
          </button>
        )}
        {shown.length === 0 && others.length === 0 && typed.length < 2 && (
          <div className="p-4 text-center text-[14px] text-sub">
            {t("No names in this crew yet — type yours.")}
          </div>
        )}
      </div>
    </>
  );
};

const TaskRow = ({
  tk,
  d,
  onOpen,
  i,
}: {
  tk: Task;
  d: BoardData;
  onOpen: () => void;
  i: number;
}) => {
  const t = useT();
  const f = useFmt();
  const now = new Date();
  const today = localDay(now.toISOString());
  const takeable = canTake(tk, today);
  const tags = tagsOf(tk, now).filter((g) => g.id !== "foreman");
  return (
    <button
      onClick={onOpen}
      className={cn(
        "rise panel block w-full p-4 text-left transition active:scale-[0.99]",
        !takeable && "opacity-70",
      )}
      style={{ animationDelay: `${i * 35}ms` }}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 text-[16px] font-bold leading-snug">
          {tk.title}
        </div>
        <StatusPill s={statusOf(tk, today)} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-sub">
        <PriorityMark p={tk.priority} />
        {tk.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {tk.location}
          </span>
        )}
        {tk.cableCodes[0] && (
          <span className="inline-flex items-center gap-1 font-mono font-semibold text-ink">
            <CableIcon className="h-3.5 w-3.5 text-sub" />
            {tk.cableCodes[0]}
            {tk.cableCodes.length > 1 && ` +${tk.cableCodes.length - 1}`}
          </span>
        )}
        {tk.due && (
          <span
            className={cn(
              "inline-flex items-center gap-1",
              tk.due < today && "font-bold text-bad",
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            {f.short(tk.due)}
          </span>
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {tags.map((g) => (
          <TagChip key={g.id} tag={g} />
        ))}
        {tk.free && (
          <span className="tnum text-[12px] font-semibold text-sub">
            {t("{n} of {m} taken", {
              n: activeClaims(tk).length,
              m: slotsOf(tk),
            })}
          </span>
        )}
        {!takeable && !tk.stop?.blocked && openSlots(tk) === 0 && (
          <span className="text-[12px] font-semibold text-sub">
            · {t("All places taken")}
          </span>
        )}
        {whoOn(tk, d).people.length > 0 && (
          <span className="truncate text-[12px] text-sub">
            · {whoOn(tk, d).people.join(", ")}
          </span>
        )}
      </div>
    </button>
  );
};

const NOTICE_ICON: Record<NoticeKind, typeof Megaphone> = { info: Newspaper, important: Megaphone, safety: ShieldAlert, good: PartyPopper };

/** Announcements from the manager — the same ones the TV shows. */
const Notices = ({ d }: { d: BoardData }) => {
  const t = useT();
  const list = liveNotices(d.notices, localDay(new Date().toISOString()));
  if (!list.length) return null;
  return (
    <div className="space-y-2">
      {list.map((n) => {
        const k = NOTICE_KINDS.find((x) => x.id === n.kind) ?? NOTICE_KINDS[0];
        const I = NOTICE_ICON[n.kind] ?? Newspaper;
        const urgent = n.kind === "safety" || n.kind === "important";
        return (
          <div
            key={n.id}
            className={cn("flex gap-3 rounded-2xl p-3.5", urgent ? "text-white shadow-sm" : "border bg-white")}
            style={urgent ? { background: n.kind === "safety" ? "#E5384B" : "#FF5A1F" } : undefined}
          >
            <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", urgent && "bg-white/20")} style={urgent ? undefined : { color: k.fg, background: k.bg }}>
              <I className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className={cn("text-[11px] font-extrabold uppercase tracking-wider", urgent ? "text-white/80" : "text-sub")}>{t(k.label)}</div>
              <div className="break-words font-bold leading-snug">{n.title}</div>
              {n.text && <div className={cn("mt-0.5 break-words text-[14px]", urgent ? "text-white/90" : "text-sub")}>{n.text}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const Schedule = ({ d, me }: { d: BoardData; me: Me | null }) => {
  const now = useNow(15000);
  const list = boardSchedules(d);
  if (!list.length) return null;
  return <ShiftList list={list} now={now} mine={crewSchedule(list, me?.linkId)?.id} />;
};

/** Who to call — the same list as on the TV, one tap to call. */
const Contacts = ({ d }: { d: BoardData }) => {
  const t = useT();
  const list = sortContacts(d.contacts);
  if (!list.length) return null;
  return (
    <section className="mt-6">
      <h2 className="mb-2 flex items-center gap-2 px-1 text-[13px] font-extrabold uppercase tracking-wider text-sub">
        <Phone className="h-4 w-4" /> {t("Who to call")}
      </h2>
      <div className="divide-y overflow-hidden rounded-2xl border bg-white">
        {list.map((c) => {
          const r = contactRole(c);
          const I = CONTACT_ICON[c.role] ?? Phone;
          const sos = c.role === "emergency";
          return (
            <a key={c.id} href={telHref(c.phone)} className={cn("flex items-center gap-3 px-3.5 py-3 transition active:bg-ink/[0.04]", sos && "bg-bad text-white active:bg-bad/90")}>
              <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", sos && "bg-white/20")} style={sos ? undefined : { color: r.fg, background: r.bg }}>
                <I className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className={cn("text-[11px] font-extrabold uppercase tracking-wider", sos && "text-white/80")} style={sos ? undefined : { color: r.fg }}>
                  {c.label || t(r.label)}
                </div>
                <div className="break-words font-bold leading-snug">{c.name}</div>
                {c.note && <div className={cn("break-words text-[13px]", sos ? "text-white/85" : "text-sub")}>{c.note}</div>}
              </div>
              <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 font-mono text-[14px] font-bold", sos ? "bg-white text-bad" : "bg-ok-soft text-ok")}>
                <Phone className="h-4 w-4" />
                {c.phone}
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
};

const FreeList = ({
  d,
  me,
  onOpen,
}: {
  d: BoardData;
  me: Me;
  onOpen: (id: string) => void;
}) => {
  const t = useT();
  const today = localDay(new Date().toISOString());
  const free = d.tasks.filter(
    (x) =>
      x.free &&
      x.status !== "done" &&
      !(x.start && x.start > today) &&
      !activeClaims(x).some((c) => isMine(c, me)),
  );
  const open = free.filter((x) => canTake(x, today));
  const closed = free.filter((x) => !canTake(x, today));
  return (
    <div className="space-y-2.5">
      <Notices d={d} />
      {open.length === 0 && (
        <div className="panel p-8 text-center">
          <ClipboardList className="mx-auto h-9 w-9 text-sub/60" />
          <div className="mt-2 font-bold">{t("No free tasks right now")}</div>
          <div className="text-[14px] text-sub">
            {t("New ones appear here as soon as the manager posts them.")}
          </div>
        </div>
      )}
      {open.map((x, i) => (
        <TaskRow key={x.id} tk={x} d={d} i={i} onOpen={() => onOpen(x.id)} />
      ))}
      {closed.length > 0 && (
        <div className="px-1 pt-3 text-[12px] font-bold uppercase tracking-wider text-sub">
          {t("Can't be taken now")}
        </div>
      )}
      {closed.map((x, i) => (
        <TaskRow key={x.id} tk={x} d={d} i={i} onOpen={() => onOpen(x.id)} />
      ))}
    </div>
  );
};

const Notes = ({ tk }: { tk: Task }) => {
  const t = useT();
  const f = useFmt();
  const notes = [
    ...(tk.log ?? [])
      .filter((e) => e.kind === "note" || e.kind === "report")
      .map((e) => ({ id: e.id, at: e.at, by: e.by, text: e.text })),
    ...tk.comments.map((c) => ({ id: c.id, at: c.at, by: c.by, text: c.text })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);
  if (!notes.length) return null;
  return (
    <Block title={t("Notes")}>
      <div className="space-y-2.5">
        {notes.map((n) => (
          <div key={n.id} className="text-[14px]">
            <div className="text-[12px] text-sub">
              <b className="text-ink">{n.by}</b> · {f.dateTime(n.at)}
            </div>
            <div className="whitespace-pre-wrap">{n.text}</div>
          </div>
        ))}
      </div>
    </Block>
  );
};

const Block = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="panel p-4">
    <h3 className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-sub">
      {title}
    </h3>
    {children}
  </section>
);

const takeError = (t: TFn, e: unknown) =>
  e instanceof CloudError
    ? t(ERRORS[e.code] ?? "Couldn't take the task — try again")
    : t("No connection — try again");

const TaskView = ({
  d,
  id,
  me,
  pid,
  token,
  onBack,
  onTaken,
}: {
  d: BoardData;
  id: string;
  me: Me;
  pid: string;
  token: string;
  onBack: () => void;
  onTaken: (t: Task) => void;
}) => {
  const t = useT();
  const f = useFmt();
  const tk = d.tasks.find((x) => x.id === id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileErr, setFileErr] = useState("");
  if (!tk)
    return (
      <div className="pt-6">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 text-[14px] font-semibold text-sub"
        >
          <ArrowLeft className="h-4 w-4" /> {t("Back")}
        </button>
        <div className="panel mt-4 p-6 text-center text-sub">
          {t("This task no longer exists")}
        </div>
      </div>
    );
  const today = localDay(new Date().toISOString());
  const mineNow = activeClaims(tk).some((c) => isMine(c, me));
  const takeable = canTake(tk, today) && !mineNow;
  const take = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    const k = ridKey(tk.id, me);
    // same request id on a retry after a lost answer → the server never makes a second claim
    const rid = sessionStorage.getItem(k) ?? `${uid()}${uid()}`.slice(0, 20);
    sessionStorage.setItem(k, rid);
    try {
      const r = await claimTask(pid, token, {
        taskId: tk.id,
        linkId: me.linkId,
        empId: me.empId,
        name: me.name,
        rid,
      });
      sessionStorage.removeItem(k);
      onTaken(r.task);
    } catch (e) {
      if (e instanceof CloudError) sessionStorage.removeItem(k);
      setError(takeError(t, e));
    } finally {
      setBusy(false);
    }
  };
  const why = !tk.free
    ? t(ERRORS.not_free)
    : tk.status === "done"
      ? t(ERRORS.done)
      : tk.stop?.blocked
        ? t(ERRORS.blocked)
        : openSlots(tk) === 0
          ? t(ERRORS.full)
          : tk.start && tk.start > today
            ? t("Starts {d}", { d: f.short(tk.start) })
            : "";
  const stages = tk.stagesReported?.stages ?? tk.stages;
  return (
    <div className="pb-28 pt-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-[14px] font-semibold text-sub"
      >
        <ArrowLeft className="h-4 w-4" /> {t("Back")}
      </button>
      <div className="rise mt-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill s={statusOf(tk, today)} />
          <PriorityMark p={tk.priority} />
          {tagsOf(tk).map((g) => (
            <TagChip key={g.id} tag={g} />
          ))}
        </div>
        <h1 className="mt-2.5 text-[24px] font-extrabold leading-tight tracking-tight">
          {tk.title}
        </h1>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[14px]">
          {tk.location && (
            <Fact icon={MapPin} label={t("Location")} value={tk.location} />
          )}
          {tk.due && (
            <Fact
              icon={Clock}
              label={t("Due")}
              value={f.date(tk.due)}
              bad={tk.due < today}
            />
          )}
          <Fact
            icon={Users}
            label={t("Places")}
            value={t("{n} of {m} taken", {
              n: activeClaims(tk).length,
              m: slotsOf(tk),
            })}
          />
          {tk.cableCodes.length > 0 && (
            <Fact
              icon={CableIcon}
              label={t("Cables")}
              value={tk.cableCodes.join(", ")}
              mono
            />
          )}
        </div>
      </div>
      <div className="mt-3 space-y-2.5">
        {tk.description && (
          <Block title={t("What to do")}>
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
              {tk.description}
            </p>
          </Block>
        )}
        {tk.criteria && (
          <Block title={t("Done when")}>
            <p className="whitespace-pre-wrap text-[15px]">{tk.criteria}</p>
          </Block>
        )}
        {tk.requirements && (
          <Block title={t("You'll need")}>
            <p className="whitespace-pre-wrap text-[15px]">{tk.requirements}</p>
          </Block>
        )}
        {(tk.remaining || tk.progressDone || tk.stop || stages) && (
          <Block title={t("Progress so far")}>
            {stages && <StageBar st={stages} />}
            {tk.progressDone && (
              <p className="mt-1 text-[14px]">
                <b>{t("Done")}:</b> {tk.progressDone}
              </p>
            )}
            {tk.remaining && (
              <p className="mt-1 text-[14px]">
                <b>{t("Left")}:</b> {tk.remaining}
              </p>
            )}
            {tk.stop && (
              <p
                className={cn(
                  "mt-1 text-[14px]",
                  tk.stop.blocked && "font-semibold text-bad",
                )}
              >
                {t(reasonLabel(tk.stop.reason))}
                {tk.stop.note && ` — ${tk.stop.note}`}
              </p>
            )}
          </Block>
        )}
        {(tk.files?.length ?? 0) > 0 && (
          <Block title={t("Documents")}>
            {tk.files!.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() =>
                  void openTaskFile(pid, token, x).then(
                    (ok) => !ok && setFileErr(x.id),
                  )
                }
                className="flex w-full items-center gap-2 rounded-lg py-1.5 text-left text-[14px] font-medium text-cat active:bg-cat/5"
              >
                <FileText className="h-4 w-4 shrink-0" />{" "}
                <span className="truncate underline-offset-2 hover:underline">
                  {x.name}
                </span>
                {fileErr === x.id && (
                  <span className="ml-auto shrink-0 text-[12px] text-bad">
                    {t("Couldn't open the file")}
                  </span>
                )}
              </button>
            ))}
          </Block>
        )}
        {activeClaims(tk).length > 0 && (
          <Block title={t("On it now")}>
            {activeClaims(tk).map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between py-1 text-[14px]"
              >
                <span>
                  <b>{c.name}</b> · {c.linkName}
                </span>
                <span className="text-sub">{f.time(c.at)}</span>
              </div>
            ))}
          </Block>
        )}
        <Notes tk={tk} />
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur">
        <div className="mx-auto max-w-lg">
          {error && (
            <div className="mb-2 rounded-lg bg-bad-soft px-3 py-2 text-[13px] font-semibold text-bad">
              {error}
            </div>
          )}
          {mineNow ? (
            <div className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-ok-soft text-[16px] font-bold text-ok">
              <CheckCircle2 className="h-5 w-5" /> {t("You're on this task")}
            </div>
          ) : takeable ? (
            <button
              onClick={take}
              disabled={busy}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand text-[17px] font-extrabold text-white shadow-[0_8px_24px_-8px_rgba(255,90,31,0.7)] transition active:scale-[0.98] disabled:opacity-70"
            >
              {busy ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Hand className="h-5 w-5" />
              )}
              {busy ? t("Taking…") : t("Take this task")}
            </button>
          ) : (
            <div className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-ink/[0.06] px-4 text-center text-[14px] font-semibold text-sub">
              <Lock className="h-4 w-4 shrink-0" />{" "}
              {why || t("Can't be taken now")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Fact = ({
  icon: Icon,
  label,
  value,
  bad,
  mono,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
  bad?: boolean;
  mono?: boolean;
}) => (
  <div className="rounded-xl bg-white/70 px-3 py-2 ring-1 ring-ink/[0.06]">
    <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-sub">
      <Icon className="h-3 w-3" /> {label}
    </div>
    <div
      className={cn(
        "truncate text-[14px] font-semibold",
        bad && "text-bad",
        mono && "font-mono",
      )}
    >
      {value}
    </div>
  </div>
);

const OUTCOME: Record<string, string> = {
  done: "Done",
  partial: "Partly done",
  not_done: "Not done",
  reassigned: "Reassigned",
  released: "Released",
};

const MineList = ({
  tasks,
  d,
  me,
  pid,
  token,
  onOpen,
  onFind,
}: {
  tasks: Task[];
  d: BoardData;
  me: Me;
  pid: string;
  token: string;
  onOpen: (id: string) => void;
  onFind: () => void;
}) => {
  const t = useT();
  const f = useFmt();
  if (!tasks.length)
    return (
      <div className="panel p-8 text-center">
        <Hand className="mx-auto h-9 w-9 text-sub/60" />
        <div className="mt-2 font-bold">
          {t("You haven't taken a task yet")}
        </div>
        <button
          onClick={onFind}
          className="mt-3 inline-flex h-10 items-center rounded-xl bg-brand px-4 text-[14px] font-bold text-white"
        >
          {t("See free tasks")}
        </button>
      </div>
    );
  return (
    <div className="space-y-3">
      {tasks.map((tk) => {
        const c = [...(tk.claims ?? [])].reverse().find((x) => isMine(x, me))!;
        return (
          <div key={tk.id} className="rise panel overflow-hidden">
            <button
              onClick={() => onOpen(tk.id)}
              className="block w-full p-4 text-left"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 text-[16px] font-bold">
                  {tk.title}
                </div>
                {c.endedAt ? (
                  <span className="rounded-full bg-ink/[0.06] px-2.5 py-1 text-[12px] font-bold text-sub">
                    {t(OUTCOME[c.outcome ?? "released"])}
                  </span>
                ) : (
                  <StatusPill s={statusOf(tk)} />
                )}
              </div>
              <div className="mt-1 text-[13px] text-sub">
                {t("Taken at {t}", { t: f.time(c.at) })}
                {tk.location && ` · ${tk.location}`}
                {whoOn(tk, d).people.length > 1 &&
                  ` · ${t("with {names}", {
                    names: whoOn(tk, d)
                      .people.filter((n) => n !== c.name)
                      .join(", "),
                  })}`}
              </div>
            </button>
            {!c.endedAt && (
              <NoteBox pid={pid} token={token} taskId={tk.id} claimId={c.id} />
            )}
          </div>
        );
      })}
      <p className="px-2 text-center text-[12px] text-sub">
        {t("Your foreman confirms the result of the day in the crew report.")}
      </p>
    </div>
  );
};

const NoteBox = ({
  pid,
  token,
  taskId,
  claimId,
}: {
  pid: string;
  token: string;
  taskId: string;
  claimId: string;
}) => {
  const t = useT();
  const [text, setText] = useState("");
  const [nid, setNid] = useState(() => uid());
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">(
    "idle",
  );
  const send = async () => {
    if (!text.trim() || state === "busy") return;
    setState("busy");
    try {
      await addClaimNote(pid, token, { taskId, claimId, text, nid });
      setText("");
      setNid(uid());
      setState("sent");
    } catch {
      setState("error");
    }
  };
  return (
    <div className="border-t bg-[#F7F8F5] p-3">
      <div className="flex items-end gap-2">
        <Textarea
          value={text}
          onChange={(e) => (
            setText(e.target.value),
            state !== "busy" && setState("idle")
          )}
          placeholder={t("Add a note for the foreman…")}
          rows={1}
          className="min-h-[42px] flex-1 resize-none bg-white text-[15px]"
        />
        <button
          onClick={send}
          disabled={!text.trim() || state === "busy"}
          className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl bg-ink text-white disabled:opacity-40"
          aria-label={t("Send")}
        >
          {state === "busy" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
      {state === "sent" && (
        <div className="mt-1.5 flex items-center gap-1 text-[12px] font-semibold text-ok">
          <Check className="h-3.5 w-3.5" /> {t("Note saved")}
        </div>
      )}
      {state === "error" && (
        <div className="mt-1.5 text-[12px] font-semibold text-bad">
          {t("Not sent — check the connection and try again")}
        </div>
      )}
    </div>
  );
};

export default TakePage;
