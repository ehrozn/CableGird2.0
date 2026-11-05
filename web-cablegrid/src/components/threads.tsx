import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileText,
  GitPullRequestArrow,
  HelpCircle,
  MessageCircle,
  Paperclip,
  RotateCcw,
  Search,
  Send,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

import { CablePickerDialog } from "@/components/CablePicker";
import { parseCodes } from "@/lib/cable-search";
import { threadUnread } from "@/lib/derive";
import { normCode } from "@/lib/ids";
import { useFmt, useT } from "@/lib/i18n";
import type { Cable, LinkType, Project, Thread, ThreadPriority, ThreadSide, ThreadTopic } from "@/lib/types";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ vocab */

export const TOPICS: { id: ThreadTopic; label: string; icon: typeof HelpCircle }[] = [
  { id: "question", label: "Question", icon: HelpCircle },
  { id: "schedule", label: "Schedule", icon: CalendarClock },
  { id: "change", label: "Change request", icon: GitPullRequestArrow },
  { id: "issue", label: "Problem", icon: AlertTriangle },
  { id: "docs", label: "Documents", icon: FileText },
  { id: "other", label: "Other", icon: MessageCircle },
];
export const topicOf = (id: ThreadTopic) => TOPICS.find((x) => x.id === id) ?? TOPICS[0];

export const PRIORITIES: { id: ThreadPriority; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "normal", label: "Normal" },
  { id: "high", label: "High" },
  { id: "urgent", label: "Urgent" },
];

const PRIO_CLS: Record<ThreadPriority, string> = {
  low: "border-[#D5DAD2] bg-[#F3F5F1] text-sub",
  normal: "border-cat/25 bg-cat-soft text-cat",
  high: "border-bad/30 bg-bad-soft text-bad",
  urgent: "border-bad bg-bad text-white",
};
/** colour strip on list rows / tabs */
export const PRIO_BAR: Record<ThreadPriority, string> = { low: "bg-[#C9D0C5]", normal: "bg-cat", high: "bg-bad/70", urgent: "bg-bad" };

export const ThreadPriorityBadge = ({ p, className }: { p: ThreadPriority; className?: string }) => {
  const t = useT();
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-[1px] text-[11px] font-bold", PRIO_CLS[p], className)}>
      {p === "urgent" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
      {t(PRIORITIES.find((x) => x.id === p)!.label)}
    </span>
  );
};

export const TopicChip = ({ topic, className }: { topic: ThreadTopic; className?: string }) => {
  const t = useT();
  const tp = topicOf(topic);
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap text-[11.5px] font-medium text-sub", className)}>
      <tp.icon className="h-3.5 w-3.5" />
      {t(tp.label)}
    </span>
  );
};

export const StatusPill = ({ th }: { th: Thread }) => {
  const t = useT();
  return th.status === "resolved" ? (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-ok-soft px-2 py-[1px] text-[11px] font-bold text-ok">
      <CheckCircle2 className="h-3 w-3" /> {t("Resolved")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-fiber-soft px-2 py-[1px] text-[11px] font-bold text-fiber-deep">
      <span className="h-1.5 w-1.5 rounded-full bg-fiber" /> {t("Open")}
    </span>
  );
};

/* ------------------------------------------------------------------ people */

type Who = "manager" | LinkType;
const initials = (s: string) =>
  s
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";

export const Avatar = ({ name, who, size = 36, className }: { name: string; who: Who; size?: number; className?: string }) => (
  <span
    className={cn(
      "grid shrink-0 place-items-center rounded-full font-bold",
      who === "manager" ? "bg-ink text-white" : who === "client" ? "bg-cat-soft text-cat ring-1 ring-cat/25" : "bg-brand-soft text-brand-deep ring-1 ring-brand/30",
      className,
    )}
    style={{ width: size, height: size, fontSize: size * 0.36 }}
    aria-hidden
  >
    {who === "manager" ? "PM" : initials(name)}
  </span>
);

export const linkKindLabel = (k: LinkType) => (k === "client" ? "Client" : "Crew");

/** Everyone who wrote in the conversation, manager first. */
export const participants = (th: Thread) => {
  const out: { name: string; who: Who; n: number; last: string }[] = [];
  for (const x of th.posts) {
    if (x.system) continue;
    const who: Who = x.side === "manager" ? "manager" : th.linkType;
    const key = who === "manager" ? "manager" : x.by;
    let e = out.find((o) => (o.who === "manager" ? "manager" : o.name) === key);
    if (!e) {
      e = { name: x.by, who, n: 0, last: x.at };
      out.push(e);
    }
    e.n++;
    e.last = x.at;
  }
  return out.sort((a, b) => Number(b.who === "manager") - Number(a.who === "manager"));
};

/* ------------------------------------------------------------------ list row */

export const lastPost = (th: Thread) => {
  for (let i = th.posts.length - 1; i >= 0; i--) if (!th.posts[i].system) return th.posts[i];
  return th.posts[0];
};

export const ThreadRow = ({ th, side, active, onClick, showLink = true }: { th: Thread; side: ThreadSide; active?: boolean; onClick: () => void; showLink?: boolean }) => {
  const t = useT();
  const f = useFmt();
  const unread = threadUnread(th, side);
  const lp = lastPost(th);
  const today = new Date().toISOString().slice(0, 10);
  const counterpart = side === "manager" ? th.startedSide === "external" ? th.startedBy : th.linkName : t("Project manager");
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex w-full gap-3 border-b px-3.5 py-3 text-left transition",
        active ? "bg-brand-soft/60" : unread ? "bg-white hover:bg-[#F7F9F5]" : "bg-white/60 hover:bg-white",
      )}
    >
      <span className={cn("absolute inset-y-2 left-0 w-[3px] rounded-r", PRIO_BAR[th.priority], th.priority === "low" && !active && "opacity-0")} />
      <Avatar name={counterpart} who={side === "manager" ? th.linkType : "manager"} size={36} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cn("min-w-0 truncate text-[13px]", unread ? "font-bold text-ink" : "font-semibold text-ink/80")}>{counterpart}</span>
          {showLink && side === "manager" && th.startedSide === "external" && <span className="min-w-0 truncate text-[11.5px] text-sub">· {th.linkName}</span>}
          <span className={cn("tnum ml-auto shrink-0 text-[11px]", unread ? "font-bold text-brand-deep" : "text-sub")}>
            {th.updatedAt.slice(0, 10) === today ? f.time(th.updatedAt) : f.short(th.updatedAt)}
          </span>
        </span>
        <span className={cn("mt-0.5 block truncate text-[13.5px]", unread ? "font-bold text-ink" : "font-medium text-ink")}>
          <span className="tnum mr-1 font-mono text-[11.5px] font-semibold text-sub">#{th.number}</span>
          {th.subject}
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] text-sub">
          {lp.side === side ? `${t("You")}: ` : ""}
          {lp.text || "—"}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {th.priority !== "normal" && <ThreadPriorityBadge p={th.priority} />}
          <TopicChip topic={th.topic} />
          {th.cableCodes.length > 0 && (
            <span className="tnum inline-flex items-center gap-0.5 text-[11.5px] font-medium text-cat">
              <Paperclip className="h-3 w-3" />
              {th.cableCodes.length}
            </span>
          )}
          {th.status === "resolved" && <StatusPill th={th} />}
        </span>
      </span>
      {unread && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand shadow-[0_0_0_3px_rgba(255,90,31,0.18)]" aria-label={t("Unread")} />}
    </button>
  );
};

/* ------------------------------------------------------------------ conversation */

const sameDay = (a: string, b: string) => a.slice(0, 10) === b.slice(0, 10);

export const Conversation = ({
  th,
  side,
  renderCable,
  className,
}: {
  th: Thread;
  side: ThreadSide;
  renderCable: (code: string) => ReactNode;
  className?: string;
}) => {
  const t = useT();
  const f = useFmt();
  const ref = useRef<HTMLDivElement>(null);
  const seen = (side === "manager" ? th.seenManager : th.seenExternal) ?? "";
  // first unread from the other side — marks "new" divider (captured when the thread is opened)
  const [divider, setDivider] = useState<string | null>(null);
  useEffect(() => {
    const first = th.posts.find((x) => x.side !== side && !x.system && x.at > seen);
    setDivider(first?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [th.id]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [th.id, th.posts.length]);

  return (
    <div ref={ref} className={cn("scrollbar-thin overflow-y-auto px-4 py-5 md:px-6", className)}>
      <div className="mx-auto flex max-w-[760px] flex-col gap-1">
        {th.posts.map((x, i) => {
          const prev = th.posts[i - 1];
          const dayBreak = !prev || !sameDay(prev.at, x.at);
          const dayLabel = dayBreak ? (
            <div className="my-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-sub">
              <span className="h-px flex-1 bg-[#D5DAD2]" />
              {f.date(x.at)}
              <span className="h-px flex-1 bg-[#D5DAD2]" />
            </div>
          ) : null;
          const newMark =
            divider === x.id ? (
              <div className="my-2 flex items-center gap-3 text-[11px] font-bold uppercase tracking-wide text-brand">
                <span className="h-px flex-1 bg-brand/40" />
                {t("New")}
                <span className="h-px flex-1 bg-brand/40" />
              </div>
            ) : null;
          if (x.system)
            return (
              <div key={x.id}>
                {dayLabel}
                <div className="my-2 flex justify-center">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold",
                      x.system === "resolved" ? "bg-ok-soft text-ok" : "bg-fiber-soft text-fiber-deep",
                    )}
                  >
                    {x.system === "resolved" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    {x.system === "resolved" ? t("{n} marked the conversation as resolved", { n: x.side === "manager" ? t("Manager") : x.by }) : t("{n} reopened the conversation", { n: x.side === "manager" ? t("Manager") : x.by })}
                    <span className="tnum font-normal opacity-70">· {f.time(x.at)}</span>
                  </span>
                </div>
              </div>
            );
          const mine = x.side === side;
          const grouped = !dayBreak && prev && !prev.system && prev.side === x.side && prev.by === x.by && new Date(x.at).getTime() - new Date(prev.at).getTime() < 5 * 60000 && divider !== x.id;
          const who: Who = x.side === "manager" ? "manager" : th.linkType;
          return (
            <div key={x.id}>
              {dayLabel}
              {newMark}
              <div className={cn("rise flex items-end gap-2.5", mine ? "flex-row-reverse" : "flex-row", grouped ? "mt-0.5" : "mt-3")}>
                {grouped ? <span className="w-8 shrink-0" /> : <Avatar name={x.by} who={who} size={32} />}
                <div className={cn("flex max-w-[78%] flex-col", mine ? "items-end" : "items-start")}>
                  {!grouped && (
                    <div className={cn("mb-1 flex items-baseline gap-2 px-1 text-[11.5px]", mine && "flex-row-reverse")}>
                      <span className="font-bold text-ink">{x.side === "manager" ? t("Manager") : x.by}</span>
                      <span className="tnum text-sub">{f.time(x.at)}</span>
                    </div>
                  )}
                  <div
                    className={cn(
                      "rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed shadow-[0_1px_0_rgba(11,31,51,0.04)]",
                      mine ? "rounded-br-md bg-ink text-white" : "rounded-bl-md border bg-white text-ink",
                    )}
                  >
                    {x.text && <p className="whitespace-pre-wrap">{x.text}</p>}
                    {x.cableCodes.length > 0 && (
                      <div className={cn("flex flex-wrap gap-1", x.text && "mt-2 border-t pt-2", mine ? "border-white/15" : "border-[#E6E9E3]")}>
                        <Paperclip className={cn("mt-1 h-3.5 w-3.5", mine ? "text-white/60" : "text-sub")} />
                        {x.cableCodes.map((c) => (
                          <span key={c}>{renderCable(c)}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ attachments */

/** Attached cable IDs with an inline field: type or paste IDs (comma / line separated) and press Enter. */
export const AttachField = ({
  attach,
  setAttach,
  index,
  hint,
  p,
  cables,
}: {
  attach: string[];
  setAttach: (f: (a: string[]) => string[]) => void;
  index: Map<string, string>;
  hint?: string;
  /** When given, a "Browse" button opens the registry picker with search, ranges and filters. */
  p?: Project;
  cables?: Cable[];
}) => {
  const t = useT();
  const [val, setVal] = useState("");
  const [browse, setBrowse] = useState(false);
  const [miss, setMiss] = useState<string[]>([]);
  const add = () => {
    const codes = parseCodes(val, new Set(index.keys()));
    const hits: string[] = [];
    const bad: string[] = [];
    for (const c of codes) {
      const real = index.get(normCode(c));
      if (real) hits.push(real);
      else bad.push(c);
    }
    setAttach((a) => {
      const have = new Set(a.map(normCode));
      return [...a, ...hits.filter((h) => !have.has(normCode(h)))];
    });
    setMiss(bad);
    setVal("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Paperclip className="h-4 w-4 shrink-0 text-sub" />
      {attach.map((c) => (
        <span key={c} className="inline-flex items-center gap-1 rounded-md border border-cat/25 bg-cat-soft py-0.5 pl-1.5 pr-0.5 font-mono text-[12px] font-semibold text-cat">
          {c}
          <button type="button" onClick={() => setAttach((a) => a.filter((x) => x !== c))} aria-label={t("Remove")} className="rounded p-0.5 hover:bg-cat/10">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={() => val.trim() && add()}
        onPaste={(e) => {
          const txt = e.clipboardData.getData("text");
          if (/[\n,;\t]/.test(txt)) {
            e.preventDefault();
            setVal(txt);
            setTimeout(add, 0);
          }
        }}
        className="h-7 w-36 rounded-md border bg-white px-2 font-mono text-xs outline-none transition focus:w-48 focus:border-brand"
        placeholder={t("Cable ID + Enter")}
        aria-label={t("Attach cables by ID")}
      />
      {p && (
        <>
          <button
            type="button"
            onClick={() => setBrowse(true)}
            className="inline-flex h-7 items-center gap-1 rounded-md border bg-white px-2 text-xs font-semibold text-ink transition hover:border-cat/40 hover:bg-cat-soft hover:text-cat"
          >
            <Search className="h-3.5 w-3.5" />
            {t("Browse")}
          </button>
          <CablePickerDialog
            open={browse}
            onOpenChange={setBrowse}
            p={p}
            cables={cables}
            value={attach}
            title={t("Attach cables")}
            onApply={(codes) => {
              setAttach(() => codes);
              setMiss([]);
            }}
          />
        </>
      )}
      {attach.length === 0 && hint && <span className="text-xs text-sub">{hint}</span>}
      {miss.length > 0 && <span className="text-xs font-medium text-bad">{t("Not in the registry: {ids}", { ids: miss.slice(0, 5).join(", ") })}</span>}
    </div>
  );
};

/* ------------------------------------------------------------------ composer */

export const Composer = ({
  onSend,
  attach,
  setAttach,
  index,
  hint,
  placeholder,
  disabled,
  top,
  p,
  cables,
}: {
  onSend: (text: string) => void;
  attach: string[];
  setAttach: (f: (a: string[]) => string[]) => void;
  index: Map<string, string>;
  hint?: string;
  placeholder?: string;
  disabled?: boolean;
  top?: ReactNode;
  p?: Project;
  cables?: Cable[];
}) => {
  const t = useT();
  const [text, setText] = useState("");
  const ta = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);
  const send = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText("");
  };
  return (
    <div className="border-t bg-white/90 px-3 pb-3 pt-2.5 backdrop-blur md:px-5">
      {top}
      <div className="mb-2">
        <AttachField attach={attach} setAttach={setAttach} index={index} hint={hint} p={p} cables={cables} />
      </div>
      <div className="flex items-end gap-2 rounded-xl border bg-white p-1.5 pl-3 transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
        <textarea
          ref={ta}
          rows={1}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={placeholder ?? t("Write a message…")}
          className="max-h-[180px] min-h-[36px] flex-1 resize-none bg-transparent py-2 text-[14px] outline-none placeholder:text-sub/70"
        />
        <button
          type="button"
          onClick={send}
          disabled={!text.trim() || disabled}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand text-white transition hover:bg-brand-deep active:scale-95 disabled:bg-[#D5DAD2]"
          aria-label={t("Send")}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-1 px-1 text-[11px] text-sub">{t("Enter to send · Shift+Enter for a new line")}</div>
    </div>
  );
};

/* ------------------------------------------------------------------ new conversation form */

export interface NewThreadDraft {
  subject: string;
  topic: ThreadTopic;
  priority: ThreadPriority;
  text: string;
}

export const NewThreadFields = ({ draft, setDraft }: { draft: NewThreadDraft; setDraft: (d: NewThreadDraft) => void }) => {
  const t = useT();
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-semibold text-ink">{t("Subject")}</span>
        <input
          autoFocus
          value={draft.subject}
          onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
          maxLength={120}
          placeholder={t("e.g. Rack B-04 — patch panel labels")}
          className="h-10 w-full rounded-lg border bg-white px-3 text-[14px] font-semibold outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </label>
      <div>
        <span className="mb-1.5 block text-[13px] font-semibold text-ink">{t("Topic")}</span>
        <div className="flex flex-wrap gap-1.5">
          {TOPICS.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setDraft({ ...draft, topic: x.id })}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition active:scale-[0.97]",
                draft.topic === x.id ? "border-ink bg-ink text-white" : "bg-white text-ink/80 hover:border-ink/40",
              )}
            >
              <x.icon className="h-3.5 w-3.5" />
              {t(x.label)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="mb-1.5 block text-[13px] font-semibold text-ink">{t("Importance")}</span>
        <div className="inline-flex rounded-lg border bg-white p-0.5">
          {PRIORITIES.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setDraft({ ...draft, priority: x.id })}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold transition",
                draft.priority === x.id ? (x.id === "urgent" || x.id === "high" ? "bg-bad text-white" : x.id === "normal" ? "bg-cat text-white" : "bg-ink text-white") : "text-sub hover:text-ink",
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", draft.priority === x.id ? "bg-white" : PRIO_BAR[x.id])} />
              {t(x.label)}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-semibold text-ink">{t("Message")}</span>
        <textarea
          value={draft.text}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          rows={4}
          placeholder={t("Describe the question in detail…")}
          className="w-full resize-y rounded-lg border bg-white px-3 py-2.5 text-[14px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </label>
    </div>
  );
};

export const emptyDraft = (): NewThreadDraft => ({ subject: "", topic: "question", priority: "normal", text: "" });
