import { Link2, Lock, Pencil, Plus, Unlink } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { NativeSelect } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inList, sheetList } from "@/lib/auto";
import { useFmt, useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { Column, Project, Sheet } from "@/lib/types";
import { cn } from "@/lib/utils";

import { sheetLabel } from "./NewSheetDialog";

/** Relations between sheets: which sheets share cables (by Cable ID) and which columns are shared. */
export const RelationsDialog = ({ p, open, onOpenChange, current }: { p: Project; open: boolean; onOpenChange: (o: boolean) => void; current?: Sheet }) => {
  const t = useT();
  const f = useFmt();
  const st = useStore.getState();
  const [target, setTarget] = useState(current?.id ?? "");
  const [srcCol, setSrcCol] = useState("");
  const [lookup, setLookup] = useState(true);

  const groups = useMemo(() => {
    const m = new Map<string, Sheet[]>();
    for (const s of p.sheets) m.set(sheetList(s), [...(m.get(sheetList(s)) ?? []), s]);
    return [...m.entries()].map(([list, sheets]) => ({ list, sheets, n: p.cables.filter((c) => inList(c, list)).length }));
  }, [p.sheets, p.cables]);

  const shared = useMemo(() => {
    const m = new Map<string, { col: Column; on: { sheet: Sheet; col: Column }[] }>();
    for (const s of p.sheets)
      for (const c of s.columns) {
        const e = m.get(c.id) ?? { col: c, on: [] };
        e.on.push({ sheet: s, col: c });
        m.set(c.id, e);
      }
    return [...m.values()].filter((x) => x.on.length > 1);
  }, [p.sheets]);

  const tgt = p.sheets.find((s) => s.id === (target || current?.id));
  const candidates = useMemo(() => {
    if (!tgt) return [];
    const have = new Set(tgt.columns.map((c) => c.id));
    const names = new Set(tgt.columns.map((c) => c.name.trim().toLowerCase()));
    const out: { sheet: Sheet; col: Column }[] = [];
    const seen = new Set<string>();
    for (const s of p.sheets) {
      if (s.id === tgt.id) continue;
      for (const c of s.columns) {
        if (have.has(c.id) || seen.has(c.id) || names.has(c.name.trim().toLowerCase())) continue;
        seen.add(c.id);
        out.push({ sheet: s, col: c });
      }
    }
    return out;
  }, [p.sheets, tgt]);

  const add = () => {
    if (!tgt || !srcCol) return;
    const err = st.linkColumn(p.id, tgt.id, srcCol, lookup);
    if (err) toast.error(t(err));
    else {
      toast.success(t("Column linked"));
      setSrcCol("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-cat" /> {t("Sheet relations")}
          </DialogTitle>
          <DialogDescription>{t("Sheets in one group show the same cables. A shared column holds one value per cable on every sheet it is on.")}</DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-sub">{t("Cable lists")}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {groups.map((g, i) => (
              <div key={g.list} className="rounded-xl border bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{t("List {n}", { n: i + 1 })}</span>
                  <span className="tnum text-xs text-sub">{t("{n} cables", { n: f.num(g.n) })}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {g.sheets.map((s) => (
                    <span key={s.id} className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", s.id === current?.id ? "border-brand bg-brand-soft text-brand-deep" : "bg-muted/50 text-ink")}>
                      {sheetLabel(p, s)}
                    </span>
                  ))}
                </div>
                {g.sheets.length > 1 && <div className="mt-2 text-xs text-sub">{t("Linked by Cable ID")}</div>}
              </div>
            ))}
          </div>
          {current && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-[13px]">
              <span className="text-sub">{t("Move “{s}” to", { s: current.name })}</span>
              <NativeSelect
                className="h-8 w-auto"
                value={sheetList(current)}
                onChange={(v) => {
                  st.setSheetList(p.id, current.id, v, true);
                  toast.success(t("Sheet relation changed"));
                }}
              >
                {groups.map((g, i) => (
                  <option key={g.list} value={g.list}>
                    {t("List {n}", { n: i + 1 })}
                  </option>
                ))}
                <option value="new">{t("New cable list (copy current cables)")}</option>
              </NativeSelect>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-sub">{t("Shared columns")}</h3>
          {shared.length === 0 && <p className="text-sm text-sub">{t("No shared columns yet.")}</p>}
          <div className="divide-y rounded-xl border bg-white">
            {shared.map(({ col, on }) => (
              <div key={col.id} className="flex flex-col gap-2 p-3 md:flex-row md:items-center">
                <div className="min-w-[150px] font-semibold text-ink">{col.name}</div>
                <div className="flex flex-1 flex-wrap gap-1.5">
                  {on.map(({ sheet, col: c }) => (
                    <span key={sheet.id} className="inline-flex items-center gap-1 rounded-lg border bg-muted/40 py-0.5 pl-2 pr-0.5 text-xs">
                      <span className="font-medium text-ink">{sheetLabel(p, sheet)}</span>
                      <button
                        type="button"
                        title={c.locked ? t("Read-only here: click to allow editing") : t("Editable here: click to make read-only")}
                        onClick={() => st.updateColumn(p.id, sheet.id, col.id, { locked: !c.locked })}
                        className={cn("inline-flex h-6 items-center gap-1 rounded-md px-1.5 font-semibold", c.locked ? "text-sub hover:bg-white" : "text-ok hover:bg-white")}
                      >
                        {c.locked ? <Lock className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                        {c.locked ? t("Read-only") : t("Editable")}
                      </button>
                      <button
                        type="button"
                        title={t("Unlink: make a separate column on this sheet")}
                        onClick={() => {
                          const err = st.unlinkColumn(p.id, sheet.id, col.id, `${col.name} (${sheet.name})`);
                          if (err) toast.error(t(err));
                        }}
                        className="grid h-6 w-6 place-items-center rounded-md text-sub hover:bg-white hover:text-bad"
                        aria-label={t("Unlink")}
                      >
                        <Unlink className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {p.sheets.length > 1 && (
          <section className="space-y-2 rounded-xl border border-dashed bg-muted/30 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-sub">{t("Add a column from another sheet")}</h3>
            <div className="flex flex-col gap-2 md:flex-row">
              <NativeSelect value={tgt?.id ?? ""} onChange={(v) => { setTarget(v); setSrcCol(""); }} className="md:w-48" aria-label={t("Sheet")}>
                {p.sheets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {sheetLabel(p, s)}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect value={srcCol} onChange={setSrcCol} className="flex-1" aria-label={t("Column")}>
                <option value="">{t("Column…")}</option>
                {candidates.map(({ sheet, col }) => (
                  <option key={col.id} value={col.id}>
                    {sheetLabel(p, sheet)} › {col.name}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect value={lookup ? "ro" : "rw"} onChange={(v) => setLookup(v === "ro")} className="md:w-40" aria-label={t("Mode")}>
                <option value="ro">{t("Read-only")}</option>
                <option value="rw">{t("Editable")}</option>
              </NativeSelect>
              <Button onClick={add} disabled={!srcCol}>
                <Plus className="h-4 w-4" /> {t("Link")}
              </Button>
            </div>
            {tgt && sheetList(tgt) !== sheetList(p.sheets.find((s) => s.columns.some((c) => c.id === srcCol)) ?? tgt) && srcCol && (
              <p className="text-xs text-sub">{t("The sheets have different cable lists: values match by Cable ID.")}</p>
            )}
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
};
