import { ArrowLeft, CheckCircle2, MessagesSquare, Paperclip, Plus, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  AttachField,
  Composer,
  Conversation,
  emptyDraft,
  NewThreadFields,
  StatusPill,
  ThreadPriorityBadge,
  ThreadRow,
  topicOf,
} from "@/components/threads";
import { Button } from "@/components/ui/button";
import { threadUnread } from "@/lib/derive";
import { normCode } from "@/lib/ids";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { PortalLink, Project } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Unread replies from the manager on this link. */
export const portalUnread = (p: Project, link: PortalLink) => (p.threads ?? []).filter((x) => x.linkId === link.id && threadUnread(x, "external")).length;

/**
 * Conversations of one link with the project manager: several questions at once, each its own thread
 * that both sides continue until it is resolved. Cables can be attached by ID or (client) ticked in the table.
 */
export const PortalThreads = ({
  p,
  link,
  me,
  askName,
  attach,
  setAttach,
  tableHint,
  className,
}: {
  p: Project;
  link: PortalLink;
  me: string;
  /** client links: the visitor types their name once */
  askName?: { value: string; onChange: (v: string) => void };
  attach: string[];
  setAttach: (f: (a: string[]) => string[]) => void;
  /** shown when cables can also be ticked in a table on the page */
  tableHint?: boolean;
  className?: string;
}) => {
  const t = useT();
  const { startThread, postToThread, setThreadStatus, markThreadSeen } = useStore.getState();
  const threads = useMemo(() => (p.threads ?? []).filter((x) => x.linkId === link.id).sort((a, b) => Number(a.status === "resolved") - Number(b.status === "resolved") || b.updatedAt.localeCompare(a.updatedAt)), [p.threads, link.id]);
  const [activeId, setActiveId] = useState<string | "new" | null>(null);
  const cur = activeId === "new" ? "new" : threads.find((x) => x.id === activeId) ?? null;
  const [draft, setDraft] = useState(emptyDraft);
  const index = useMemo(() => new Map(p.cables.map((c) => [normCode(c.code), c.code])), [p.cables]);
  const unread = threads.filter((x) => threadUnread(x, "external")).length;
  const view = cur ?? (threads.length ? null : "new");

  useEffect(() => {
    if (cur && cur !== "new") markThreadSeen(p.id, cur.id, "external");
  }, [cur, markThreadSeen, p.id]);

  const who = me.trim() || link.name;
  const nameField = askName && (
    <input
      value={askName.value}
      onChange={(e) => askName.onChange(e.target.value)}
      placeholder={t("Your name")}
      className="mb-2 h-8 w-full max-w-[260px] rounded-md border bg-white px-2.5 text-[13px] outline-none focus:border-brand"
      aria-label={t("Your name")}
    />
  );
  const hint = tableHint ? t("Tick cables in the table to attach them, or type IDs") : t("Type cable IDs to attach them");
  const renderCable = (code: string) => <span className="inline-block rounded-md bg-cat-soft px-1.5 py-0.5 font-mono text-[12px] font-semibold text-cat">{code}</span>;

  const create = () => {
    if (!draft.subject.trim() || !draft.text.trim()) return;
    const id = startThread(p.id, { ...draft, linkId: link.id, side: "external", by: who, cableCodes: attach });
    setDraft(emptyDraft());
    setAttach(() => []);
    setActiveId(id);
    toast.success(t("Sent to the project manager"));
  };

  return (
    <section className={cn("panel overflow-hidden", className)}>
      <header className="flex items-center gap-2 border-b px-4 py-3 md:px-5">
        <MessagesSquare className="h-4 w-4 text-brand" />
        <h2 className="text-[15px] font-bold">{t("Conversations with the project manager")}</h2>
        {unread > 0 && <span className="tnum rounded-full bg-brand px-2 text-[11px] font-bold text-white">{t("{n} new", { n: unread })}</span>}
        <Button size="sm" className="ml-auto" onClick={() => setActiveId("new")} disabled={view === "new"}>
          <Plus className="h-4 w-4" /> {t("New question")}
        </Button>
      </header>
      <div className="grid h-[min(72dvh,640px)] min-h-[460px] md:grid-cols-[300px_minmax(0,1fr)]">
        <aside className={cn("scrollbar-thin min-h-0 overflow-y-auto border-r bg-[#F8FAF7]", view && "hidden md:block")}>
          {threads.length === 0 ? (
            <p className="p-6 text-center text-[13px] text-sub">{t("Ask the manager anything — each question gets its own conversation.")}</p>
          ) : (
            threads.map((x) => <ThreadRow key={x.id} th={x} side="external" active={x.id === activeId} onClick={() => setActiveId(x.id)} />)
          )}
        </aside>

        <div className={cn("flex min-h-0 min-w-0 flex-col bg-[#FBFCFA]", !view && "hidden md:flex")}>
          {view === "new" ? (
            <div className="scrollbar-thin flex-1 overflow-y-auto p-4 md:p-6">
              <div className="mx-auto max-w-[620px]">
                {threads.length > 0 && (
                  <button onClick={() => setActiveId(null)} className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-cat hover:underline">
                    <ArrowLeft className="h-3.5 w-3.5" /> {t("Back")}
                  </button>
                )}
                <h3 className="text-lg font-extrabold">{t("New question")}</h3>
                <p className="mb-4 mt-0.5 text-[13px] text-sub">{t("One question per conversation — you can keep writing in it until it is resolved.")}</p>
                {nameField}
                <NewThreadFields draft={draft} setDraft={setDraft} />
                <div className="mt-4 rounded-lg border bg-white p-3">
                  <AttachField attach={attach} setAttach={setAttach} index={index} hint={hint} p={p} />
                </div>
                <Button className="mt-4" onClick={create} disabled={!draft.subject.trim() || !draft.text.trim()}>
                  <Send className="h-4 w-4" /> {t("Send")}
                </Button>
              </div>
            </div>
          ) : !view ? (
            <div className="grid flex-1 place-items-center p-8 text-center text-sm text-sub">
              <div>
                <MessagesSquare className="mx-auto h-9 w-9 text-sub/50" />
                <p className="mt-2">{t("Pick a conversation or ask a new question.")}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex shrink-0 items-start gap-3 border-b bg-white px-4 py-3">
                <button onClick={() => setActiveId(null)} className="mt-0.5 grid h-8 w-8 place-items-center rounded-lg border md:hidden" aria-label={t("Back")}>
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tnum font-mono text-[12px] font-semibold text-sub">#{view.number}</span>
                    <h3 className="text-[16px] font-extrabold leading-tight">{view.subject}</h3>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-sub">
                    <ThreadPriorityBadge p={view.priority} />
                    {(() => {
                      const tp = topicOf(view.topic);
                      return (
                        <span className="inline-flex items-center gap-1">
                          <tp.icon className="h-3.5 w-3.5" />
                          {t(tp.label)}
                        </span>
                      );
                    })()}
                    <StatusPill th={view} />
                    {view.cableCodes.length > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-cat">
                        <Paperclip className="h-3 w-3" /> {t("{n} cables", { n: view.cableCodes.length })}
                      </span>
                    )}
                  </div>
                </div>
                {view.status === "open" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-ok/40 text-ok hover:bg-ok-soft hover:text-ok"
                    onClick={() => {
                      setThreadStatus(p.id, view.id, "resolved", "external", who);
                      toast.success(t("Conversation resolved"));
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4" /> <span className="hidden sm:inline">{t("Resolved")}</span>
                  </Button>
                )}
              </div>
              <Conversation key={view.id} th={view} side="external" renderCable={renderCable} className="min-h-0 flex-1" />
              {view.status === "open" ? (
                <Composer
                  key={`composer-${view.id}`}
                  attach={attach}
                  setAttach={setAttach}
                  index={index}
                  hint={hint}
                  p={p}
                  top={nameField}
                  placeholder={t("Write to the manager…")}
                  onSend={(text) => {
                    postToThread(p.id, view.id, { side: "external", by: who, text, cableCodes: attach });
                    setAttach(() => []);
                  }}
                />
              ) : (
                <div className="flex flex-wrap items-center justify-center gap-3 border-t bg-ok-soft/60 px-4 py-3 text-[13px] text-ok">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="font-semibold">{t("This conversation is resolved.")}</span>
                  <button onClick={() => setActiveId("new")} className="font-semibold text-ink hover:underline">
                    {t("Ask a new question")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
};
