import { Check, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { RfiChanges, RfiStatusBadge } from "@/components/rfi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normCode } from "@/lib/ids";
import { useFmt, useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { Project, Rfi } from "@/lib/types";

/** Manager review cards for RFIs: changes from → to, reason, approve / reject with a comment. */
export const RfiReviewList = ({ p, list }: { p: Project; list: Rfi[] }) => {
  const t = useT();
  const f = useFmt();
  const approveRfi = useStore((s) => s.approveRfi);
  const rejectRfi = useStore((s) => s.rejectRfi);
  const [comments, setComments] = useState<Record<string, string>>({});
  return (
          <div className="divide-y">
    {list.map((r) => {
      const cable = p.cables.find((c) => c.id === r.cableId) ?? p.cables.find((c) => normCode(c.code) === normCode(r.code));
      return (
        <article key={r.id} className="grid gap-4 p-4 md:p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-bold">RFI #{r.number}</span>
              {cable ? (
                <Link to={`/p/${p.id}/registry/cable/${cable.id}`} className="font-mono text-sm font-bold text-cat hover:underline">
                  {cable.code}
                </Link>
              ) : (
                <span className="font-mono text-sm font-bold text-sub line-through">{r.code}</span>
              )}
              <RfiStatusBadge s={r.status} />
            </div>
            <div className="text-[13px] text-sub">
              {r.linkName} · {r.submittedByName} · {f.dateTime(r.createdAt)}
            </div>
            <div className="rounded-lg border-l-[3px] border-brand bg-brand-soft/40 px-3 py-2 text-sm">
              <span className="font-semibold">{t("Reason")}:</span> {r.reason}
            </div>
            <RfiChanges changes={r.changes} />
          </div>
          <div className="flex flex-col gap-2">
            {r.status === "pending" ? (
              <>
                <Input
                  value={comments[r.id] ?? ""}
                  onChange={(e) => setComments({ ...comments, [r.id]: e.target.value })}
                  placeholder={t("Comment for the crew (optional)")}
                  className="h-10"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="border-bad/40 text-bad hover:bg-bad-soft"
                    onClick={() => {
                      rejectRfi(p.id, r.id, comments[r.id]?.trim() ?? "");
                      toast(t("RFI #{n} rejected", { n: r.number }));
                    }}
                  >
                    <X className="h-4 w-4" /> {t("Reject")}
                  </Button>
                  <Button
                    className="bg-ok hover:bg-ok/90"
                    onClick={() => {
                      const err = approveRfi(p.id, r.id, comments[r.id]?.trim() ?? "");
                      if (err) toast.error(t(err));
                      else toast.success(t("RFI #{n} approved — registry updated", { n: r.number }));
                    }}
                  >
                    <Check className="h-4 w-4" /> {t("Approve")}
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-lg bg-[#F6F8F5] p-3 text-sm">
                <div className="text-xs text-sub">{f.dateTime(r.reviewedAt)}</div>
                {r.managerComment ? <div className="mt-1">{r.managerComment}</div> : <div className="mt-1 text-sub">{t("No comment")}</div>}
              </div>
            )}
          </div>
        </article>
      );
    })}
  </div>
  );
};
