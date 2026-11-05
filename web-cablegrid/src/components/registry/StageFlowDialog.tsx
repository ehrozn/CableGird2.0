import { ArrowDown, ArrowUp, ListOrdered } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { flowOrder } from "@/lib/auto";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { Project } from "@/lib/types";

export const StageFlowDialog = ({ p, open, onOpenChange }: { p: Project; open: boolean; onOpenChange: (o: boolean) => void }) => {
  const t = useT();
  const [order, setOrder] = useState<string[]>([]);
  const [req, setReq] = useState(false);
  const [lock, setLock] = useState(false);
  useEffect(() => {
    if (!open) return;
    setOrder(flowOrder(p));
    setReq(!!p.stageFlow?.requirePrevious);
    setLock(!!p.stageFlow?.lockEarlier);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const color = useMemo(() => new Map(p.actions.map((a) => [a.id, a.color])), [p.actions]);
  const name = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of p.sheets) for (const c of s.columns) if (!m.has(c.id)) m.set(c.id, c.name);
    return m;
  }, [p.sheets]);
  const move = (i: number, d: number) => {
    const n = [...order];
    const [x] = n.splice(i, 1);
    n.splice(i + d, 0, x);
    setOrder(n);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListOrdered className="h-5 w-5 text-cat" /> {t("Stage order")}
          </DialogTitle>
          <DialogDescription>{t("Stages are the progress columns. Put them in the order the work is done.")}</DialogDescription>
        </DialogHeader>
        {order.length === 0 ? (
          <p className="text-sm text-sub">{t("No progress columns yet. Turn on “Progress” for a column in Columns.")}</p>
        ) : (
          <ol className="space-y-1.5">
            {order.map((id, i) => (
              <li key={id} className="flex items-center gap-2 rounded-lg border bg-white px-2.5 py-1.5">
                <span className="tnum grid h-6 w-6 place-items-center rounded-full bg-muted text-xs font-bold text-ink">{i + 1}</span>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: color.get(id) ?? "#2563EB" }} />
                <span className="flex-1 truncate text-sm font-semibold text-ink">{t(name.get(id) ?? "")}</span>
                <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("Move up")}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label={t("Move down")}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ol>
        )}
        <div className="space-y-3 rounded-xl bg-muted/50 p-3">
          <label className="flex items-start justify-between gap-3">
            <span>
              <span className="block text-sm font-semibold text-ink">{t("Require the previous stage")}</span>
              <span className="block text-xs text-sub">{t("A stage can be marked only when every earlier stage is done.")}</span>
            </span>
            <Switch checked={req} onCheckedChange={setReq} />
          </label>
          <label className="flex items-start justify-between gap-3">
            <span>
              <span className="block text-sm font-semibold text-ink">{t("Protect earlier stages")}</span>
              <span className="block text-xs text-sub">{t("A stage cannot be cleared while a later stage is done.")}</span>
            </span>
            <Switch checked={lock} onCheckedChange={setLock} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("Cancel")}
          </Button>
          <Button
            onClick={() => {
              useStore.getState().setStageFlow(p.id, { order, requirePrevious: req, lockEarlier: lock });
              toast.success(t("Stage order saved"));
              onOpenChange(false);
            }}
          >
            {t("Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
