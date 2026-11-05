import { AlertTriangle, CheckCircle2, Plus, RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { EmptyState, IssueStatusBadge, PageHeader, SeverityBadge, useProject } from "@/components/common";
import { IssueDialog } from "@/components/dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cableIndex } from "@/lib/derive";
import { normCode, textMatches } from "@/lib/ids";
import { useFmt, useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { IssueStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const Issues = () => {
  const p = useProject()!;
  const t = useT();
  const f = useFmt();
  const updateIssue = useStore((s) => s.updateIssue);
  const [tab, setTab] = useState<"active" | "resolved">("active");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const idx = useMemo(() => cableIndex(p.cables), [p.cables]);

  const list = p.issues.filter((i) => {
    if (tab === "active" ? i.status === "resolved" : i.status !== "resolved") return false;
    const qq = q.trim().toLowerCase();
    return !qq || (!!i.code && textMatches(i.code, qq)) || `${i.title} ${i.code ?? ""} ${i.reportedBy} ${i.description}`.toLowerCase().includes(qq);
  });
  const sevOrder = { high: 0, medium: 1, low: 2 };
  if (tab === "active") list.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  return (
    <>
      <PageHeader
        title={t("Issues")}
        subtitle={t("Problems reported by crews or the manager. Cables with open issues are highlighted red in the registry.")}
        actions={
          <Button onClick={() => setOpen(true)} className="bg-bad hover:bg-bad/90">
            <Plus className="h-4 w-4" /> {t("Report an issue")}
          </Button>
        }
      />
      <div className="panel overflow-hidden">
        <div className="flex flex-col gap-2 border-b p-3 md:flex-row md:items-center md:p-4">
          <div className="flex gap-1 rounded-lg bg-[#EEF1EC] p-1">
            {(["active", "resolved"] as const).map((k) => (
              <button key={k} onClick={() => setTab(k)} className={cn("h-8 rounded-md px-3 text-sm font-semibold", tab === k ? "bg-white shadow-sm" : "text-sub")}>
                {t(k === "active" ? "Active" : "Resolved")}{" "}
                <span className="tnum text-xs font-normal text-sub">{p.issues.filter((i) => (k === "active" ? i.status !== "resolved" : i.status === "resolved")).length}</span>
              </button>
            ))}
          </div>
          <div className="relative md:ml-auto md:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sub" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search issues or cable ID…")} className="h-10 pl-9" />
          </div>
        </div>
        {list.length === 0 ? (
          <EmptyState icon={tab === "active" ? <CheckCircle2 /> : <AlertTriangle />} title={tab === "active" ? t("No open issues") : t("Nothing resolved yet")} />
        ) : (
          <ul className="divide-y">
            {list.map((i) => {
              const c = i.code ? idx.get(normCode(i.code)) : undefined;
              return (
                <li key={i.id} className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-start md:px-5">
                  <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", i.status === "resolved" ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad")}>
                    {i.status === "resolved" ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{i.title}</span>
                      <SeverityBadge s={i.severity} />
                      <IssueStatusBadge s={i.status} />
                    </div>
                    {i.description && <p className="mt-1 text-sm text-ink/80">{i.description}</p>}
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-sub">
                      {i.code &&
                        (c ? (
                          <Link to={`/p/${p.id}/registry/cable/${c.id}`} className="font-mono font-semibold text-cat hover:underline">
                            {i.code}
                          </Link>
                        ) : (
                          <span className="font-mono">{i.code}</span>
                        ))}
                      <span>{i.reportedBy === "Manager" ? t("Manager") : i.reportedBy}</span>
                      <span>{f.dateTime(i.createdAt)}</span>
                      {i.reportId && (
                        <Link to={`/p/${p.id}/reports?open=${i.reportId}`} className="text-cat hover:underline">
                          {t("From report")} #{p.reports.find((r) => r.id === i.reportId)?.number}
                        </Link>
                      )}
                    </div>
                    {i.resolution && <div className="mt-2 rounded-md bg-ok-soft px-2.5 py-1.5 text-[13px]">{i.resolution}</div>}
                    {resolving === i.id && (
                      <form
                        className="mt-2 flex gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          updateIssue(p.id, i.id, { status: "resolved", resolution: note.trim() || undefined });
                          setResolving(null);
                          setNote("");
                          toast.success(t("Issue resolved"));
                        }}
                      >
                        <Input autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("How was it fixed? (optional)")} />
                        <Button type="submit" className="bg-ok hover:bg-ok/90">
                          {t("Resolve")}
                        </Button>
                      </form>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {i.status === "resolved" ? (
                      <Button size="sm" variant="outline" onClick={() => updateIssue(p.id, i.id, { status: "open" as IssueStatus, resolvedAt: undefined })}>
                        <RotateCcw className="h-4 w-4" /> {t("Reopen")}
                      </Button>
                    ) : (
                      <>
                        {i.status === "open" && (
                          <Button size="sm" variant="outline" onClick={() => updateIssue(p.id, i.id, { status: "progress" })}>
                            {t("Start fixing")}
                          </Button>
                        )}
                        {resolving !== i.id && (
                          <Button size="sm" className="bg-ok hover:bg-ok/90" onClick={() => setResolving(i.id)}>
                            <CheckCircle2 className="h-4 w-4" /> {t("Resolve")}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <IssueDialog p={p} open={open} onOpenChange={setOpen} />
    </>
  );
};

export default Issues;
