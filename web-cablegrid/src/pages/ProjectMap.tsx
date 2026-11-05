import { AlertTriangle, ArrowRight, Network, Server } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { EmptyState, NativeSelect, PageHeader, useProject } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { allColumns, cablePct, cableState, openIssueMap } from "@/lib/derive";
import { useFmt, useT } from "@/lib/i18n";
import type { Cable } from "@/lib/types";
import { cn } from "@/lib/utils";
import { natCmp } from "@/lib/ids";

interface Node {
  key: string;
  cables: Cable[];
  pct: number;
  issues: number;
  complete: number;
  perAction: number[];
}

const ProjectMap = () => {
  const p = useProject()!;
  const t = useT();
  const fmt = useFmt();
  const cols = useMemo(() => allColumns(p), [p]);
  const [sp, setSp] = useSearchParams();
  const guess = cols.find((c) => /idf|mdf|floor|room|rack|этаж|помещ|стойк|piso|sala/i.test(c.name))?.id ?? cols[0]?.id ?? "";
  const colId = sp.get("by") && cols.some((c) => c.id === sp.get("by")) ? sp.get("by")! : guess;
  const [openKey, setOpenKey] = useState<string | null>(null);
  const issueMap = useMemo(() => openIssueMap(p.issues), [p.issues]);

  const nodes = useMemo<Node[]>(() => {
    if (!colId) return [];
    const m = new Map<string, Cable[]>();
    for (const c of p.cables) {
      const k = (c.values[colId] ?? "").trim() || "—";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(c);
    }
    return [...m.entries()]
      .map(([key, cables]) => {
        let sum = 0;
        let issues = 0;
        let complete = 0;
        const perAction = p.actions.map(() => 0);
        for (const c of cables) {
          sum += cablePct(c, p.actions);
          const st = cableState(c, p.actions, issueMap);
          if (st === "issue") issues++;
          if (st === "complete") complete++;
          p.actions.forEach((a, i) => c.done[a.id] && perAction[i]++);
        }
        return { key, cables, pct: Math.round(sum / cables.length), issues, complete, perAction };
      })
      .sort((a, b) => natCmp(a.key, b.key));
  }, [p.cables, p.actions, colId, issueMap]);

  const colName = cols.find((c) => c.id === colId)?.name ?? "";
  const open = nodes.find((n) => n.key === openKey);

  return (
    <>
      <PageHeader
        title={t("Project map")}
        subtitle={t("Live schematic of the project grouped by any column. Click a node to see its cables.")}
        actions={
          cols.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-sub">{t("Group by")}</span>
              <NativeSelect value={colId} onChange={(v) => setSp({ by: v }, { replace: true })} className="w-52" aria-label={t("Group by")}>
                {cols.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )
        }
      />
      {p.cables.length === 0 || !colId ? (
        <div className="panel">
          <EmptyState
            icon={<Network />}
            title={t("Nothing to map yet")}
            text={t("Add cables and a column such as IDF, Floor or Room — the map builds itself from your registry.")}
            action={
              <Button asChild>
                <Link to={`/p/${p.id}/registry`}>{t("Open registry")}</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="panel blueprint relative overflow-hidden p-4 md:p-8">
          <div className="mb-6 flex flex-wrap items-center gap-4 text-[13px] text-sub">
            {p.actions.map((a) => (
              <span key={a.id} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.color }} />
                {t(a.name)}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-bad" />
              {t("Issue")}
            </span>
          </div>
          {/* head node */}
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-3 rounded-xl border-2 border-ink bg-ink px-5 py-3 text-white shadow-lg">
              <Server className="h-5 w-5 text-brand" />
              <div>
                <div className="font-bold leading-tight">{p.name}</div>
                <div className="text-xs text-white/70">
                  {fmt.num(p.cables.length)} {t("cables")} · {colName}
                </div>
              </div>
            </div>
            <svg className="h-8 w-1" aria-hidden>
              <line x1="0.5" y1="0" x2="0.5" y2="32" stroke="#0B1F33" strokeWidth="2" className="cable-line" />
            </svg>
          </div>
          <div className="relative">
            <div className="absolute left-[4%] right-[4%] top-0 h-0.5 bg-ink/80" aria-hidden />
            <div className="grid grid-cols-2 gap-x-3 gap-y-6 pt-0 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
              {nodes.map((n, i) => (
                <div key={n.key} className="flex flex-col items-center" style={{ animationDelay: `${Math.min(i, 20) * 25}ms` }}>
                  <span className="h-5 w-0.5 bg-ink/80" aria-hidden />
                  <button
                    onClick={() => setOpenKey(n.key)}
                    className={cn(
                      "rise w-full rounded-[10px] border-2 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                      n.issues ? "border-bad" : n.pct === 100 ? "border-ok" : "border-[#D5DAD2]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="truncate font-mono text-[13px] font-bold text-ink">{n.key}</span>
                      {n.issues > 0 && (
                        <span className="flex items-center gap-1 rounded-full bg-bad px-1.5 text-[11px] font-bold text-white">
                          <AlertTriangle className="h-3 w-3" />
                          {n.issues}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="tnum text-2xl font-extrabold text-ink">{n.pct}%</span>
                      <span className="text-xs text-sub">
                        {fmt.num(n.cables.length)} {t("cables")}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1">
                      {p.actions.map((a, ai) => (
                        <div key={a.id} className="h-1.5 overflow-hidden rounded-full bg-[#EEF1EC]" title={`${t(a.name)}: ${n.perAction[ai]}`}>
                          <div className="h-full rounded-full" style={{ width: `${(n.perAction[ai] / n.cables.length) * 100}%`, background: a.color }} />
                        </div>
                      ))}
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenKey(null)}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          {open && (
            <>
              <SheetHeader className="border-b p-5 text-left">
                <SheetTitle className="font-mono">{open.key}</SheetTitle>
                <div className="text-sm text-sub">
                  {colName} · {open.cables.length} {t("cables")} · {t("{n} complete", { n: open.complete })}
                </div>
                <Button asChild size="sm" variant="outline" className="mt-2 w-fit">
                  <Link to={`/p/${p.id}/registry?col=${colId}&val=${encodeURIComponent(open.key === "—" ? "" : open.key)}`}>
                    {t("Open in registry")} <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </SheetHeader>
              <div className="scrollbar-thin flex-1 overflow-y-auto">
                {open.cables.slice(0, 400).map((c) => {
                  const st = cableState(c, p.actions, issueMap);
                  return (
                    <Link
                      key={c.id}
                      to={`/p/${p.id}/registry/cable/${c.id}`}
                      className={cn("flex items-center gap-3 border-b px-5 py-2.5 text-sm hover:bg-muted", st === "issue" && "bg-bad-soft")}
                    >
                      <span className="w-28 truncate font-mono font-semibold text-cat">{c.code}</span>
                      <span className="flex flex-1 gap-1">
                        {p.actions.map((a) => (
                          <span key={a.id} className="h-2 flex-1 rounded-full" style={{ background: c.done[a.id] ? a.color : "#E3E7E0" }} />
                        ))}
                      </span>
                      <span className="tnum w-10 text-right text-xs text-sub">{cablePct(c, p.actions)}%</span>
                    </Link>
                  );
                })}
                {open.cables.length > 400 && <div className="p-4 text-center text-xs text-sub">{t("Showing first 400 — open the registry for all.")}</div>}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};

export default ProjectMap;
