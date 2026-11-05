import { MessageSquareWarning, Search } from "lucide-react";
import { useState } from "react";

import { EmptyState, PageHeader, useProject } from "@/components/common";
import { RfiReviewList } from "@/components/RfiReview";
import { Input } from "@/components/ui/input";
import { textMatches } from "@/lib/ids";
import { useT } from "@/lib/i18n";
import type { RfiStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const TABS: { id: RfiStatus; label: string }[] = [
  { id: "pending", label: "Pending review" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

const RfiPage = () => {
  const p = useProject()!;
  const t = useT();
  const [tab, setTab] = useState<RfiStatus>("pending");
  const [q, setQ] = useState("");
  const rfis = p.rfis ?? [];
  const qq = q.trim().toLowerCase();
  const list = rfis.filter(
    (r) => r.status === tab && (!qq || textMatches(r.code, qq) || `${r.number} ${r.code} ${r.linkName} ${r.submittedByName} ${r.reason}`.toLowerCase().includes(qq)),
  );

  return (
    <>
      <PageHeader
        title={t("Change requests (RFI)")}
        subtitle={t("Crews request changes to registry data that is not progress — cable ID, IDF, route. Approve to apply the change.")}
      />
      <div className="panel overflow-hidden">
        <div className="flex flex-col gap-2 border-b p-3 md:flex-row md:items-center md:p-4">
          <div className="flex gap-1 rounded-lg bg-[#EEF1EC] p-1">
            {TABS.map((k) => (
              <button key={k.id} onClick={() => setTab(k.id)} className={cn("h-8 rounded-md px-3 text-sm font-semibold", tab === k.id ? "bg-white shadow-sm" : "text-sub")}>
                {t(k.label)} <span className="tnum text-xs font-normal text-sub">{rfis.filter((r) => r.status === k.id).length}</span>
              </button>
            ))}
          </div>
          <div className="relative md:ml-auto md:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sub" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search by cable ID, crew or reason…")} className="h-10 pl-9" />
          </div>
        </div>
        {list.length === 0 ? (
          <EmptyState
            icon={<MessageSquareWarning />}
            title={tab === "pending" ? t("No requests waiting") : t("Nothing here yet")}
            text={t("When a crew asks to change a cable's data, the request shows up here.")}
          />
        ) : (
          <RfiReviewList p={p} list={list} />
        )}
      </div>
    </>
  );
};

export default RfiPage;
