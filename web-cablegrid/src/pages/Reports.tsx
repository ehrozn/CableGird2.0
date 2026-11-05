import { textMatches } from "@/lib/ids";
import { Download, FileText, Package, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { EmptyState, NativeSelect, PageHeader, ReportStatusBadge, useProject } from "@/components/common";
import { ReviewDrawer } from "@/components/ReviewDrawer";
import { RfiReviewList } from "@/components/RfiReview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exportRowsXlsx } from "@/lib/backup";
import { entryActions } from "@/lib/derive";
import { useFmt, useT } from "@/lib/i18n";
import type { Report } from "@/lib/types";
import { cn } from "@/lib/utils";

const Reports = () => {
  const p = useProject()!;
  const t = useT();
  const f = useFmt();
  const [sp, setSp] = useSearchParams();
  const [tab, setTab] = useState<"reports" | "rfi" | "materials" | "tasks">("reports");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [crew, setCrew] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const openId = sp.get("open");

  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return p.reports.filter((r) => {
      if (status && r.status !== status) return false;
      if (crew && r.linkId !== crew) return false;
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
      if (!qq) return true;
      if (`#${r.number} ${r.linkName} ${r.submittedByName} ${r.notes}`.toLowerCase().includes(qq)) return true;
      if (r.cables.some((c) => textMatches(c.code, qq))) return true;
      return r.workerIds.some((id) => p.employees.find((e) => e.id === id)?.name.toLowerCase().includes(qq));
    });
  }, [p.reports, p.employees, q, status, crew, from, to]);

  const materials = useMemo(() => {
    const m = new Map<string, { name: string; unit: string; qty: number; reports: number }>();
    for (const r of list) {
      if (r.status === "rejected") continue;
      for (const x of r.materials) {
        const k = `${x.name.trim().toLowerCase()}|${x.unit}`;
        const cur = m.get(k) ?? { name: x.name.trim(), unit: x.unit, qty: 0, reports: 0 };
        cur.qty += x.qty;
        cur.reports++;
        m.set(k, cur);
      }
    }
    return [...m.values()].sort((a, b) => b.qty - a.qty);
  }, [list]);

  const doneTasks = p.tasks.filter((x) => x.status === "done").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  const crews = p.links.filter((l) => l.type === "crew");
  const hours = (r: Report) => r.tasks.reduce((a, x) => a + (x.hours || 0), 0);

  const exportList = () => {
    if (tab === "materials")
      return exportRowsXlsx(`${p.name} - materials`, [t("Material"), t("Quantity"), t("Unit"), t("Reports")], materials.map((m) => [m.name, m.qty, m.unit, m.reports]));
    if (tab === "tasks")
      return exportRowsXlsx(`${p.name} - completed tasks`, [t("Task"), t("Completed"), t("By"), t("Cables")], doneTasks.map((x) => [x.title, x.completedAt?.slice(0, 10) ?? "", x.completedBy ?? "", x.cableCodes.join(", ")]));
    const rows: (string | number)[][] = [];
    for (const r of list)
      for (const c of r.cables.length ? r.cables : [null])
        rows.push([
          r.number,
          r.date,
          r.linkName,
          r.submittedByName,
          r.crewSize,
          hours(r),
          r.status,
          c?.code ?? "",
          c ? entryActions(c).map((id) => p.actions.find((a) => a.id === id)?.name ?? "").filter(Boolean).join(", ") : "",
          c?.repeat ? c.reason ?? "" : "",
          c?.approved === undefined ? "" : c.approved ? "yes" : "no",
        ]);
    exportRowsXlsx(`${p.name} - reports`, ["#", t("Date"), t("Crew"), t("Submitted by"), t("People"), t("Hours"), t("Status"), t("Cable ID"), t("Stage"), t("Repeat reason"), t("Approved")], rows);
  };

  return (
    <>
      <PageHeader
        title={t("Reports")}
        subtitle={t("Archive of every crew report. Search by who, when or which cable.")}
        actions={
          <Button variant="outline" onClick={exportList} disabled={!p.reports.length && !doneTasks.length}>
            <Download className="h-4 w-4" /> {t("Export Excel")}
          </Button>
        }
      />
      <div className="mb-4 flex w-fit gap-1 rounded-lg bg-white p-1 shadow-sm ring-1 ring-border">
        {(
          [
            ["reports", t("Reports"), p.reports.length],
            ["rfi", "RFI", (p.rfis ?? []).filter((r) => r.status === "pending").length],
            ["materials", t("Materials"), materials.length],
            ["tasks", t("Completed tasks"), doneTasks.length],
          ] as const
        ).map(([k, l, n]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("h-9 rounded-md px-3 text-sm font-semibold transition", tab === k ? "bg-brand-soft text-brand-deep" : "text-sub hover:text-ink")}>
            {l} <span className="tnum text-xs font-normal">{n}</span>
          </button>
        ))}
      </div>

      {tab === "rfi" && (
        <div className="panel overflow-hidden">
          {(p.rfis ?? []).length === 0 ? (
            <EmptyState icon={<FileText />} title={t("No requests waiting")} text={t("When a crew asks to change a cable's data, the request shows up here.")} />
          ) : (
            <RfiReviewList p={p} list={[...(p.rfis ?? [])].sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"))} />
          )}
        </div>
      )}

      {tab !== "tasks" && tab !== "rfi" && (
        <div className="panel mb-4 grid gap-2 p-3 md:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] md:p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sub" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Cable ID, person, crew, #…")} className="h-10 pl-9" />
          </div>
          <NativeSelect value={status} onChange={setStatus} aria-label={t("Status")}>
            <option value="">{t("Any status")}</option>
            <option value="pending">{t("Pending review")}</option>
            <option value="approved">{t("Approved")}</option>
            <option value="partial">{t("Partly approved")}</option>
            <option value="rejected">{t("Rejected")}</option>
          </NativeSelect>
          <NativeSelect value={crew} onChange={setCrew} aria-label={t("Crew")}>
            <option value="">{t("All crews")}</option>
            {crews.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </NativeSelect>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t("From")} className="h-10" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("To")} className="h-10" />
        </div>
      )}

      {tab === "reports" && (
        <div className="panel overflow-hidden">
          {list.length === 0 ? (
            <EmptyState icon={<FileText />} title={p.reports.length ? t("No reports match") : t("No reports yet")} text={p.reports.length ? undefined : t("Crews submit daily reports through their link. Create one on the Links page.")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-[#F5F7F3] text-left text-[12.5px] text-sub">
                  <tr>
                    <th className="px-5 py-2.5 font-semibold">#</th>
                    <th className="px-3 py-2.5 font-semibold">{t("Date")}</th>
                    <th className="px-3 py-2.5 font-semibold">{t("Crew")}</th>
                    <th className="px-3 py-2.5 font-semibold">{t("Submitted by")}</th>
                    <th className="px-3 py-2.5 text-right font-semibold">{t("People")}</th>
                    <th className="px-3 py-2.5 text-right font-semibold">{t("Hours")}</th>
                    <th className="px-3 py-2.5 text-right font-semibold">{t("Cables")}</th>
                    <th className="px-3 py-2.5 font-semibold">{t("Issues")}</th>
                    <th className="px-5 py-2.5 font-semibold">{t("Status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {list.map((r) => (
                    <tr key={r.id} onClick={() => setSp({ open: r.id })} className={cn("cursor-pointer hover:bg-[#F7F9F5]", r.status === "pending" && "bg-fiber-soft/40")}>
                      <td className="px-5 py-3 font-mono text-[13px] font-semibold">#{r.number}</td>
                      <td className="px-3 py-3">{f.date(r.date)}</td>
                      <td className="px-3 py-3 font-medium">{r.linkName}</td>
                      <td className="px-3 py-3">{r.submittedByName}</td>
                      <td className="tnum px-3 py-3 text-right">{r.crewSize}</td>
                      <td className="tnum px-3 py-3 text-right">{hours(r)}</td>
                      <td className="tnum px-3 py-3 text-right">{r.cables.length}</td>
                      <td className="px-3 py-3">{r.issues.length > 0 ? <span className="font-semibold text-bad">{r.issues.length}</span> : <span className="text-sub">—</span>}</td>
                      <td className="px-5 py-3">
                        <ReportStatusBadge s={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "materials" && (
        <div className="panel overflow-hidden">
          {materials.length === 0 ? (
            <EmptyState icon={<Package />} title={t("No materials reported")} text={t("Crews log connectors, ties, tape and more in their reports. Totals for the filtered reports appear here.")} />
          ) : (
            <ul className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
              {materials.map((m) => (
                <li key={`${m.name}|${m.unit}`} className="flex items-center gap-3 bg-white p-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-fiber-soft text-fiber-deep">
                    <Package className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{m.name}</span>
                    <span className="block text-xs text-sub">{t("{n} reports", { n: m.reports })}</span>
                  </span>
                  <span className="tnum text-xl font-extrabold">
                    {f.num(m.qty)} <span className="text-sm font-medium text-sub">{m.unit}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "tasks" && (
        <div className="panel overflow-hidden">
          {doneTasks.length === 0 ? (
            <EmptyState icon={<FileText />} title={t("No completed tasks yet")} />
          ) : (
            <ul className="divide-y">
              {doneTasks.map((x) => (
                <li key={x.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-medium">{x.title}</span>
                  <span className="text-sm text-sub">
                    {f.dateTime(x.completedAt)} · {x.completedBy === "Manager" ? t("Manager") : x.completedBy}
                    {x.cableCodes.length > 0 && <span className="ml-2 font-mono text-xs">{x.cableCodes.slice(0, 3).join(", ")}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ReviewDrawer p={p} report={p.reports.find((r) => r.id === openId)} onClose={() => setSp({})} />
    </>
  );
};

export default Reports;
