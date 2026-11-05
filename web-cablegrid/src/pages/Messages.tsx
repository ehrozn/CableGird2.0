import {
  ArrowLeft,
  CheckCircle2,
  Database,
  Inbox,
  Link2,
  MessagesSquare,
  Paperclip,
  Plus,
  RotateCcw,
  Search,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { CableStateBadge, NativeSelect, PageHeader, useProject } from "@/components/common";
import {
  AttachField,
  Avatar,
  Composer,
  Conversation,
  emptyDraft,
  linkKindLabel,
  NewThreadFields,
  participants,
  PRIO_BAR,
  PRIORITIES,
  StatusPill,
  ThreadPriorityBadge,
  ThreadRow,
  TOPICS,
  topicOf,
} from "@/components/threads";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cableState, openIssueMap, PRIORITY_RANK, threadAwaits, threadUnread } from "@/lib/derive";
import { normCode, textMatches } from "@/lib/ids";
import { useFmt, useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { Project, Thread, ThreadPriority, ThreadTopic } from "@/lib/types";
import { cn } from "@/lib/utils";

type Filter = "reply" | "open" | "resolved" | "all";
const MAX_TABS = 8;

/* ------------------------------------------------------------------ new conversation */

const NewThreadDialog = ({ p, open, onOpenChange, onCreated, index }: { p: Project; open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void; index: Map<string, string> }) => {
  const t = useT();
  const startThread = useStore((s) => s.startThread);
  const links = p.links.filter((l) => l.active);
  const [linkId, setLinkId] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [attach, setAttach] = useState<string[]>([]);
  useEffect(() => {
    if (open) {
      setDraft(emptyDraft());
      setAttach([]);
      setLinkId((x) => (links.some((l) => l.id === x) ? x : links.find((l) => l.type === "client")?.id ?? links[0]?.id ?? ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const ok = !!linkId && draft.subject.trim() && draft.text.trim();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("New conversation")}</DialogTitle>
          <DialogDescription>{t("The recipient sees it on their link and can answer until the conversation is resolved.")}</DialogDescription>
        </DialogHeader>
        {links.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-sub">
            {t("Create a client or crew link first — conversations run through links.")}
            <div className="mt-3">
              <Link to={`/p/${p.id}/links`} className="font-semibold text-cat hover:underline">
                {t("Go to links")}
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-ink">{t("To")}</span>
              <NativeSelect value={linkId} onChange={setLinkId}>
                {(["client", "crew"] as const).map((k) => {
                  const ls = links.filter((l) => l.type === k);
                  return ls.length ? (
                    <optgroup key={k} label={k === "client" ? t("Clients") : t("Crews")}>
                      {ls.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null;
                })}
              </NativeSelect>
            </label>
            <NewThreadFields draft={draft} setDraft={setDraft} />
            <AttachField attach={attach} setAttach={setAttach} index={index} hint={t("Attach cables the question is about")} p={p} />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("Cancel")}
          </Button>
          <Button
            disabled={!ok}
            onClick={() => {
              const id = startThread(p.id, { ...draft, linkId, side: "manager", by: "Manager", cableCodes: attach });
              onOpenChange(false);
              onCreated(id);
              toast.success(t("Conversation started"));
            }}
          >
            {t("Start conversation")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ------------------------------------------------------------------ details */

const Details = ({ p, th }: { p: Project; th: Thread }) => {
  const t = useT();
  const f = useFmt();
  const { updateThread } = useStore.getState();
  const idx = useMemo(() => new Map(p.cables.map((c) => [normCode(c.code), c])), [p.cables]);
  const issues = useMemo(() => openIssueMap(p.issues), [p.issues]);
  const people = participants(th);
  const link = p.links.find((l) => l.id === th.linkId);
  return (
    <div className="scrollbar-thin h-full space-y-5 overflow-y-auto p-4">
      <div>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-sub">{t("Participants")}</div>
        <ul className="space-y-2">
          {people.map((x) => (
            <li key={x.who + x.name} className="flex items-center gap-2.5">
              <Avatar name={x.name} who={x.who} size={30} />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[13px] font-semibold">{x.who === "manager" ? t("Manager") : x.name}</span>
                <span className="block truncate text-[11.5px] text-sub">{x.who === "manager" ? t("Project manager") : `${t(linkKindLabel(th.linkType))} · ${th.linkName}`}</span>
              </span>
              <span className="tnum text-[11px] text-sub">{x.n}</span>
            </li>
          ))}
        </ul>
        {link && (
          <Link to={`/p/${p.id}/links`} className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-cat hover:underline">
            <Link2 className="h-3.5 w-3.5" /> {t("Link settings")}
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-sub">{t("Importance")}</span>
          <NativeSelect value={th.priority} onChange={(v) => updateThread(p.id, th.id, { priority: v as ThreadPriority })} className="h-9">
            {PRIORITIES.map((x) => (
              <option key={x.id} value={x.id}>
                {t(x.label)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-sub">{t("Topic")}</span>
          <NativeSelect value={th.topic} onChange={(v) => updateThread(p.id, th.id, { topic: v as ThreadTopic })} className="h-9">
            {TOPICS.map((x) => (
              <option key={x.id} value={x.id}>
                {t(x.label)}
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
        <dt className="text-sub">{t("Status")}</dt>
        <dd className="text-right">
          <StatusPill th={th} />
        </dd>
        <dt className="text-sub">{t("Started")}</dt>
        <dd className="tnum text-right">
          {f.dateTime(th.createdAt)} · {th.startedSide === "manager" ? t("Manager") : th.startedBy}
        </dd>
        <dt className="text-sub">{t("Last activity")}</dt>
        <dd className="tnum text-right">{f.dateTime(th.updatedAt)}</dd>
        {th.resolvedAt && (
          <>
            <dt className="text-sub">{t("Resolved")}</dt>
            <dd className="tnum text-right">
              {f.dateTime(th.resolvedAt)} · {th.resolvedBy === "Manager" ? t("Manager") : th.resolvedBy}
            </dd>
          </>
        )}
        <dt className="text-sub">{t("Messages")}</dt>
        <dd className="tnum text-right">{th.posts.filter((x) => !x.system).length}</dd>
      </dl>

      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-sub">
          <Paperclip className="h-3.5 w-3.5" /> {t("Attached cables")}
          <span className="tnum ml-auto">{th.cableCodes.length}</span>
        </div>
        {th.cableCodes.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-[12px] text-sub">{t("No cables attached")}</p>
        ) : (
          <>
            <ul className="divide-y rounded-lg border bg-white">
              {th.cableCodes.slice(0, 60).map((code) => {
                const c = idx.get(normCode(code));
                return (
                  <li key={code} className="flex items-center gap-2 px-2.5 py-1.5">
                    {c ? (
                      <Link to={`/p/${p.id}/registry/cable/${c.id}`} className="min-w-0 flex-1 truncate font-mono text-[12.5px] font-semibold text-cat hover:underline">
                        {c.code}
                      </Link>
                    ) : (
                      <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-sub line-through">{code}</span>
                    )}
                    {c ? <CableStateBadge state={cableState(c, p.actions, issues)} /> : <span className="text-[11px] text-sub">{t("Deleted")}</span>}
                  </li>
                );
              })}
            </ul>
            <Link
              to={`/p/${p.id}/registry?q=${encodeURIComponent(th.cableCodes.join(", "))}`}
              className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-cat hover:underline"
            >
              <Database className="h-3.5 w-3.5" /> {t("Open in registry")}
            </Link>
          </>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ page */

const Messages = () => {
  const p = useProject()!;
  const t = useT();
  const { postToThread, setThreadStatus, markThreadSeen } = useStore.getState();
  const [sp, setSp] = useSearchParams();
  const threads = useMemo(() => p.threads ?? [], [p.threads]);
  const activeId = sp.get("t") && threads.some((x) => x.id === sp.get("t")) ? sp.get("t")! : null;
  const active = threads.find((x) => x.id === activeId) ?? null;

  const tabsKey = `cg-open-threads-${p.id}`;
  const [tabs, setTabs] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(tabsKey) ?? "[]") as string[];
    } catch {
      return [];
    }
  });
  const liveTabs = tabs.filter((id) => threads.some((x) => x.id === id));
  useEffect(() => {
    sessionStorage.setItem(tabsKey, JSON.stringify(liveTabs));
  }, [liveTabs, tabsKey]);
  // whatever is opened (list, dashboard, notification) becomes a tab
  useEffect(() => {
    if (activeId && !tabs.includes(activeId)) setTabs((x) => [...x.filter((id) => id !== activeId), activeId].slice(-MAX_TABS));
  }, [activeId, tabs]);

  const openThread = (id: string | null) => setSp(id ? { t: id } : {}, { replace: false });
  const closeTab = (id: string) => {
    const rest = liveTabs.filter((x) => x !== id);
    setTabs(rest);
    if (id === activeId) openThread(rest[rest.length - 1] ?? null);
  };

  // reading = opening; also marks new messages that arrive while the chat is open
  useEffect(() => {
    if (active) markThreadSeen(p.id, active.id, "manager");
  }, [active, markThreadSeen, p.id]);

  /* ---- list ---- */
  const [filter, setFilter] = useState<Filter>("open");
  const [q, setQ] = useState("");
  const [linkF, setLinkF] = useState("");
  const [prioF, setPrioF] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "priority">("recent");
  const counts = useMemo(
    () => ({
      reply: threads.filter((x) => threadAwaits(x, "manager")).length,
      open: threads.filter((x) => x.status === "open").length,
      resolved: threads.filter((x) => x.status === "resolved").length,
      all: threads.length,
      unread: threads.filter((x) => threadUnread(x, "manager")).length,
    }),
    [threads],
  );
  const linkOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of threads) m.set(x.linkId ?? x.linkName, x.linkName);
    return [...m.entries()];
  }, [threads]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return threads
      .filter((x) => {
        if (filter === "reply" && !threadAwaits(x, "manager")) return false;
        if (filter === "open" && x.status !== "open") return false;
        if (filter === "resolved" && x.status !== "resolved") return false;
        if (linkF && (x.linkId ?? x.linkName) !== linkF) return false;
        if (prioF && x.priority !== prioF) return false;
        if (!s) return true;
        if (`#${x.number} ${x.subject} ${x.linkName} ${x.startedBy}`.toLowerCase().includes(s)) return true;
        if (x.cableCodes.some((c) => textMatches(c, s))) return true;
        return x.posts.some((m) => m.text.toLowerCase().includes(s) || m.by.toLowerCase().includes(s));
      })
      .sort((a, b) => {
        const u = Number(threadUnread(b, "manager")) - Number(threadUnread(a, "manager"));
        if (u) return u;
        if (sortBy === "priority") {
          const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
          if (pr) return pr;
        }
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  }, [threads, filter, q, linkF, prioF, sortBy]);

  /* ---- cables ---- */
  const index = useMemo(() => new Map(p.cables.map((c) => [normCode(c.code), c.code])), [p.cables]);
  const cableById = useMemo(() => new Map(p.cables.map((c) => [normCode(c.code), c])), [p.cables]);
  const [attach, setAttach] = useState<string[]>([]);
  useEffect(() => setAttach([]), [activeId]);
  const [newOpen, setNewOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(true);

  const renderCable = (code: string) => {
    const c = cableById.get(normCode(code));
    return c ? (
      <Link to={`/p/${p.id}/registry/cable/${c.id}`} className="inline-block rounded-md bg-cat-soft px-1.5 py-0.5 font-mono text-[12px] font-semibold text-cat hover:underline">
        {c.code}
      </Link>
    ) : (
      <span className="inline-block rounded-md bg-[#EEF1EC] px-1.5 py-0.5 font-mono text-[12px] text-sub">{code}</span>
    );
  };

  const FILTERS: { id: Filter; label: string }[] = [
    { id: "reply", label: "Needs reply" },
    { id: "open", label: "Open" },
    { id: "resolved", label: "Resolved" },
    { id: "all", label: "All" },
  ];

  return (
    <>
      <PageHeader
        title={t("Messages")}
        subtitle={t("Conversations with clients and crews — each question in its own thread until it is resolved.")}
        actions={
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" /> {t("New conversation")}
          </Button>
        }
      />

      <div
        className={cn(
          "panel grid h-[calc(100dvh-200px)] min-h-[560px] overflow-hidden",
          "grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]",
          active && showDetails && "xl:grid-cols-[290px_minmax(0,1fr)_270px] 2xl:grid-cols-[360px_minmax(0,1fr)_300px]",
        )}
      >
        {/* ---------------- list ---------------- */}
        <aside className={cn("flex min-h-0 flex-col border-r bg-[#F8FAF7]", active && "hidden lg:flex")}>
          <div className="space-y-2.5 border-b bg-white p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sub" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("Search subject, text, person or cable ID…")}
                className="h-9 w-full rounded-lg border bg-[#F8FAF7] pl-9 pr-3 text-[13px] outline-none transition focus:border-brand focus:bg-white"
              />
            </div>
            <div className="flex gap-0.5 rounded-lg bg-[#EEF1EC] p-0.5">
              {FILTERS.map((x) => (
                <button
                  key={x.id}
                  onClick={() => setFilter(x.id)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1.5 text-[12px] font-semibold transition",
                    filter === x.id ? "bg-white text-ink shadow-sm" : "text-sub hover:text-ink",
                  )}
                >
                  {t(x.label)}
                  {counts[x.id] > 0 && (
                    <span className={cn("tnum rounded-full px-1.5 text-[10.5px]", x.id === "reply" ? "bg-brand text-white" : "bg-[#DDE2D9] text-ink/70")}>{counts[x.id]}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <NativeSelect value={linkF} onChange={setLinkF} className="h-8 flex-1 text-[12px]" aria-label={t("From")}>
                <option value="">{t("Everyone")}</option>
                {linkOptions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect value={prioF} onChange={setPrioF} className="h-8 w-[110px] text-[12px]" aria-label={t("Importance")}>
                <option value="">{t("Any importance")}</option>
                {PRIORITIES.map((x) => (
                  <option key={x.id} value={x.id}>
                    {t(x.label)}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect value={sortBy} onChange={(v) => setSortBy(v as "recent" | "priority")} className="h-8 w-[104px] text-[12px]" aria-label={t("Sort")}>
                <option value="recent">{t("Newest")}</option>
                <option value="priority">{t("Importance")}</option>
              </NativeSelect>
            </div>
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            {list.length === 0 ? (
              <div className="grid h-full place-items-center p-8 text-center">
                <div>
                  <Inbox className="mx-auto h-9 w-9 text-sub/50" />
                  <p className="mt-2 text-sm font-semibold text-ink">{threads.length ? t("Nothing here") : t("No conversations yet")}</p>
                  <p className="mt-1 text-xs text-sub">
                    {threads.length ? t("Try another filter.") : t("Questions from client and crew links appear here. You can also start one yourself.")}
                  </p>
                </div>
              </div>
            ) : (
              list.map((x) => <ThreadRow key={x.id} th={x} side="manager" active={x.id === activeId} onClick={() => openThread(x.id)} />)
            )}
          </div>
        </aside>

        {/* ---------------- conversation ---------------- */}
        <section className={cn("flex min-h-0 min-w-0 flex-col bg-[#FBFCFA]", !active && "hidden lg:flex")}>
          {liveTabs.length > 0 && (
            <div className="scrollbar-thin flex shrink-0 items-end gap-1 overflow-x-auto border-b bg-[#F1F4EF] px-2 pt-2" role="tablist" aria-label={t("Open conversations")}>
              {liveTabs.map((id) => {
                const x = threads.find((y) => y.id === id)!;
                const on = id === activeId;
                const unread = threadUnread(x, "manager");
                return (
                  <div
                    key={id}
                    role="tab"
                    aria-selected={on}
                    className={cn(
                      "group relative flex max-w-[220px] shrink-0 items-center gap-1.5 rounded-t-lg border border-b-0 pl-2.5 pr-1 text-[12.5px] transition",
                      on ? "-mb-px h-9 bg-[#FBFCFA] font-semibold text-ink" : "h-8 bg-white/60 text-sub hover:bg-white hover:text-ink",
                    )}
                  >
                    <span className={cn("absolute inset-x-2 top-0 h-[2px] rounded-b", on ? PRIO_BAR[x.priority] : "bg-transparent")} />
                    <button onClick={() => openThread(id)} className="flex min-w-0 items-center gap-1.5">
                      {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" />}
                      {x.status === "resolved" && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-ok" />}
                      <span className="tnum font-mono text-[11px] text-sub">#{x.number}</span>
                      <span className="truncate">{x.subject}</span>
                    </button>
                    <button onClick={() => closeTab(id)} className="grid h-5 w-5 shrink-0 place-items-center rounded text-sub opacity-60 hover:bg-[#E6EAE3] hover:opacity-100" aria-label={t("Close")}>
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {!active ? (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <div className="max-w-sm">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white shadow-sm ring-1 ring-[#D5DAD2]">
                  <MessagesSquare className="h-8 w-8 text-brand" />
                </div>
                <h2 className="mt-4 text-lg font-extrabold">{t("Pick a conversation")}</h2>
                <p className="mt-1 text-sm text-sub">{t("Open several at once — they stay as tabs above, so you can switch between questions.")}</p>
                {counts.reply > 0 && (
                  <button onClick={() => setFilter("reply")} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 text-[13px] font-semibold text-brand-deep">
                    {t("{n} waiting for your reply", { n: counts.reply })}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <header className="flex shrink-0 items-start gap-3 border-b bg-white px-4 py-3 md:px-5">
                <button onClick={() => openThread(null)} className="mt-1 grid h-8 w-8 place-items-center rounded-lg border lg:hidden" aria-label={t("Back")}>
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tnum font-mono text-[12px] font-semibold text-sub">#{active.number}</span>
                    <h2 className="min-w-0 text-[17px] font-extrabold leading-tight tracking-tight">{active.subject}</h2>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-sub">
                    <span className="inline-flex items-center gap-1.5">
                      <Avatar name="PM" who="manager" size={20} />
                      <span className="font-semibold text-ink">{t("Manager")}</span>
                      <span className="text-sub">⇄</span>
                      <Avatar name={active.startedSide === "external" ? active.startedBy : active.linkName} who={active.linkType} size={20} />
                      <span className="font-semibold text-ink">{active.startedSide === "external" ? active.startedBy : active.linkName}</span>
                      <span>
                        · {t(linkKindLabel(active.linkType))} · {active.linkName}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <ThreadPriorityBadge p={active.priority} />
                      {(() => {
                        const tp = topicOf(active.topic);
                        return (
                          <span className="inline-flex items-center gap-1">
                            <tp.icon className="h-3.5 w-3.5" />
                            {t(tp.label)}
                          </span>
                        );
                      })()}
                      <StatusPill th={active} />
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {active.status === "open" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-ok/40 text-ok hover:bg-ok-soft hover:text-ok"
                      onClick={() => {
                        setThreadStatus(p.id, active.id, "resolved", "manager", "Manager");
                        toast.success(t("Conversation resolved"));
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4" /> {t("Resolve")}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setThreadStatus(p.id, active.id, "open", "manager", "Manager")}>
                      <RotateCcw className="h-4 w-4" /> {t("Reopen")}
                    </Button>
                  )}
                  <button
                    onClick={() => setShowDetails((x) => !x)}
                    className={cn("hidden h-8 w-8 place-items-center rounded-lg border transition xl:grid", showDetails ? "bg-ink text-white" : "bg-white text-sub hover:text-ink")}
                    aria-label={t("Details")}
                    title={t("Details")}
                  >
                    <Users className="h-4 w-4" />
                  </button>
                </div>
              </header>

              <Conversation key={active.id} th={active} side="manager" renderCable={renderCable} className="min-h-0 flex-1" />

              {active.status === "open" ? (
                <Composer
                  key={`composer-${active.id}`}
                  attach={attach}
                  setAttach={setAttach}
                  index={index}
                  p={p}
                  placeholder={t("Reply to {n}…", { n: active.startedSide === "external" ? active.startedBy : active.linkName })}
                  onSend={(text) => {
                    postToThread(p.id, active.id, { side: "manager", by: "Manager", text, cableCodes: attach });
                    setAttach([]);
                  }}
                />
              ) : (
                <div className="flex items-center justify-center gap-3 border-t bg-ok-soft/60 px-4 py-3 text-[13px] text-ok">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="font-semibold">{t("This conversation is resolved.")}</span>
                  <button onClick={() => setThreadStatus(p.id, active.id, "open", "manager", "Manager")} className="font-semibold text-ink underline-offset-2 hover:underline">
                    {t("Reopen to continue")}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* ---------------- details ---------------- */}
        {active && showDetails && (
          <aside className="hidden min-h-0 border-l bg-white xl:block">
            <Details p={p} th={active} />
          </aside>
        )}
      </div>

      <NewThreadDialog p={p} open={newOpen} onOpenChange={setNewOpen} onCreated={(id) => openThread(id)} index={index} />
    </>
  );
};

export default Messages;
