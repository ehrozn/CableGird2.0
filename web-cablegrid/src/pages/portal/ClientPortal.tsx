import { codeParts, parseCableQuery } from "@/lib/cable-search";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, Check, MessagesSquare, Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { CableStateBadge, NativeSelect, Ring } from "@/components/common";
import { Input } from "@/components/ui/input";
import { type CableState, cableState, openIssueMap, projectStats } from "@/lib/derive";
import { normCode, textMatches, natCmp } from "@/lib/ids";
import { useFmt, useT } from "@/lib/i18n";
import type { PortalLink, Project } from "@/lib/types";
import { cn } from "@/lib/utils";

import { LinkGate, PortalTop } from "./PortalShell";
import { PortalThreads, portalUnread } from "./PortalThreads";

const ROW = 44;

const ClientInner = ({ p, link }: { p: Project; link: PortalLink }) => {
  const t = useT();
  const fmt = useFmt();
  const cfg = link.client ?? { columnIds: [], showStats: true, showIssues: false, allowMessages: true };
  const sheet = p.sheets.find((s) => s.id === cfg.sheetId) ?? p.sheets[0];
  const cols = (sheet?.columns ?? []).filter((c) => cfg.columnIds.includes(c.id));
  const stats = useMemo(() => projectStats(p), [p]);
  const issueMap = useMemo(() => (cfg.showIssues ? openIssueMap(p.issues) : new Map()), [p.issues, cfg.showIssues]);

  const [q, setQ] = useState("");
  const [colF, setColF] = useState("");
  const [valF, setValF] = useState("");
  const [stF, setStF] = useState<CableState | "">("");
  const [attach, setAttach] = useState<string[]>([]);
  const nameKey = `cg-client-name-${link.id}`;
  const [author, setAuthor] = useState(() => localStorage.getItem(nameKey) ?? "");

  const values = useMemo(() => {
    if (!colF) return [];
    const m = new Map<string, number>();
    for (const c of p.cables) {
      const v = c.values[colF] ?? "";
      if (v) m.set(v, (m.get(v) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => natCmp(a[0], b[0]));
  }, [p.cables, colF]);

  const rows = useMemo(() => {
    const s = q.trim();
    const pq = parseCableQuery(s, new Set(p.cables.map((c) => normCode(c.code))));
    const inList = pq.kind === "list" ? new Set(pq.codes.map(normCode)) : null;
    return p.cables
      .map((c) => ({ c, st: cableState(c, p.actions, issueMap) }))
      .filter(({ c, st }) => {
        if (stF && st !== stF) return false;
        if (colF && valF && (c.values[colF] ?? "") !== valF) return false;
        if (!s) return true;
        if (inList) return inList.has(normCode(c.code));
        if (pq.kind === "range") {
          const cp = codeParts(c.code);
          return !!cp && cp[0] === pq.prefix && cp[1] >= pq.from && cp[1] <= pq.to;
        }
        return textMatches(c.code, s) || cols.some((col) => textMatches(c.values[col.id], s));
      })
      .sort((a, b) => natCmp(a.c.code, b.c.code));
  }, [p.cables, p.actions, issueMap, q, stF, colF, valF, cols]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW, overscan: 12 });

  const grid = `140px ${cols.map(() => "minmax(130px,1fr)").join(" ")} ${p.actions.map(() => "84px").join(" ")} 140px`;
  const toggleAttach = (code: string) => setAttach((a) => (a.includes(code) ? a.filter((x) => x !== code) : [...a, code]));


  return (
    <div className="blueprint min-h-dvh">
      <PortalTop
        p={p}
        title={`${t("Client view")} · ${link.name}`}
        right={
          cfg.allowMessages && portalUnread(p, link) > 0 ? (
            <button
              onClick={() => document.getElementById("conversations")?.scrollIntoView({ behavior: "smooth" })}
              className="flex items-center gap-1.5 rounded-full bg-brand px-3 py-1 text-[12px] font-bold text-white shadow-sm transition active:scale-95"
            >
              <MessagesSquare className="h-3.5 w-3.5" /> {t("{n} new replies", { n: portalUnread(p, link) })}
            </button>
          ) : null
        }
      />
      <main className="mx-auto max-w-[1200px] space-y-4 px-3 py-5 md:px-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight md:text-[28px]">{p.name}</h1>
          <p className="mt-1 text-sm text-sub">{[p.client, p.location].filter(Boolean).join(" · ") || t("Project progress")}</p>
        </div>

        {cfg.showStats && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="panel rise flex items-center gap-4 p-4">
              <div className="relative">
                <Ring pct={stats.pct} size={72} stroke={8} />
                <span className="tnum absolute inset-0 grid place-items-center text-lg font-extrabold">{stats.pct}%</span>
              </div>
              <div>
                <div className="text-sm font-semibold">{t("Readiness")}</div>
                <div className="text-xs text-sub">{t("{n} of {m} complete", { n: fmt.num(stats.complete), m: fmt.num(stats.total) })}</div>
              </div>
            </div>
            {stats.perAction.slice(0, cfg.showIssues ? 2 : 3).map(({ action, done }) => (
              <div key={action.id} className="panel rise p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: action.color }} />
                  {t(action.name)}
                </div>
                <div className="tnum mt-1 text-2xl font-extrabold">{fmt.num(done)}</div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#EEF1EC]">
                  <div className="h-full rounded-full" style={{ width: `${stats.total ? (done / stats.total) * 100 : 0}%`, background: action.color }} />
                </div>
              </div>
            ))}
            {cfg.showIssues && (
              <div className="panel rise p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <AlertTriangle className="h-4 w-4 text-bad" /> {t("Open issues")}
                </div>
                <div className="tnum mt-1 text-2xl font-extrabold text-bad">{stats.openIssues}</div>
              </div>
            )}
          </div>
        )}

        <section className="panel overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b p-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sub" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search cables…")} className="pl-9" />
            </div>
            {cols.length > 0 && (
              <>
                <NativeSelect value={colF} onChange={(v) => { setColF(v); setValF(""); }} className="w-40" aria-label={t("Filter column")}>
                  <option value="">{t("Filter by…")}</option>
                  {cols.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
                {colF && (
                  <NativeSelect value={valF} onChange={setValF} className="w-44" aria-label={t("Value")}>
                    <option value="">{t("Any value")}</option>
                    {values.map(([val, n]) => (
                      <option key={val} value={val}>
                        {val} ({n})
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </>
            )}
            <NativeSelect value={stF} onChange={(v) => setStF(v as CableState | "")} className="w-40" aria-label={t("Status")}>
              <option value="">{t("All statuses")}</option>
              <option value="none">{t("Not started")}</option>
              <option value="progress">{t("In progress")}</option>
              <option value="complete">{t("Complete")}</option>
              {cfg.showIssues && <option value="issue">{t("Issue")}</option>}
            </NativeSelect>
            <span className="text-sm text-sub">{t("{n} cables", { n: fmt.num(rows.length) })}</span>
          </div>
          <div ref={scrollRef} className="scrollbar-thin h-[min(60dvh,620px)] overflow-auto">
            <div style={{ minWidth: 140 + cols.length * 130 + p.actions.length * 84 + 140 }}>
              <div className="sticky top-0 z-10 grid h-10 items-center border-b bg-[#F6F8F5] text-[12px] font-semibold uppercase tracking-wide text-sub" style={{ gridTemplateColumns: grid }}>
                <div className="px-3">ID</div>
                {cols.map((c) => (
                  <div key={c.id} className="truncate px-3">
                    {c.name}
                  </div>
                ))}
                {p.actions.map((a) => (
                  <div key={a.id} className="truncate px-1 text-center">
                    {t(a.name)}
                  </div>
                ))}
                <div className="px-3">{t("Status")}</div>
              </div>
              <div style={{ height: v.getTotalSize(), position: "relative" }}>
                {v.getVirtualItems().map((vi) => {
                  const { c, st } = rows[vi.index];
                  const on = attach.includes(c.code);
                  return (
                    <div
                      key={c.id}
                      className={cn("absolute inset-x-0 grid items-center border-b text-sm", st === "issue" ? "bg-bad-soft" : "bg-white hover:bg-[#F9FAF8]", on && "!bg-brand-soft")}
                      style={{ top: vi.start, height: ROW, gridTemplateColumns: grid }}
                    >
                      <div className="flex items-center gap-1.5 px-3">
                        {cfg.allowMessages && (
                          <button
                            onClick={() => toggleAttach(c.code)}
                            className={cn("grid h-5 w-5 shrink-0 place-items-center rounded border", on ? "border-brand bg-brand text-white" : "bg-white")}
                            title={t("Attach to message")}
                            aria-label={t("Attach to message")}
                          >
                            {on && <Check className="h-3 w-3" />}
                          </button>
                        )}
                        <span className="truncate font-mono font-semibold text-cat">{c.code}</span>
                      </div>
                      {cols.map((col) => (
                        <div key={col.id} className="truncate px-3">
                          {c.values[col.id] ?? ""}
                        </div>
                      ))}
                      {p.actions.map((a) => (
                        <div key={a.id} className="flex justify-center">
                          {c.done[a.id] ? (
                            <span className="tnum rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: a.color }}>
                              {fmt.short(c.done[a.id])}
                            </span>
                          ) : (
                            <span className="h-2 w-2 rounded-full bg-[#D5DAD2]" />
                          )}
                        </div>
                      ))}
                      <div className="px-3">
                        <CableStateBadge state={st} />
                      </div>
                    </div>
                  );
                })}
              </div>
              {rows.length === 0 && <div className="p-10 text-center text-sm text-sub">{t("No cables match")}</div>}
            </div>
          </div>
        </section>

        {cfg.allowMessages && (
          <div id="conversations" className="scroll-mt-20">
          <PortalThreads
            p={p}
            link={link}
            me={author}
            askName={{
              value: author,
              onChange: (v) => {
                setAuthor(v);
                localStorage.setItem(nameKey, v.trim());
              },
            }}
            attach={attach}
            setAttach={setAttach}
            tableHint
          />
          </div>
        )}
      </main>
    </div>
  );
};

const ClientPortal = () => <LinkGate>{(p, link) => <ClientInner p={p} link={link} />}</LinkGate>;
export default ClientPortal;
