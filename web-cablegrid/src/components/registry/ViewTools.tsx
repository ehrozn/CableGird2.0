import { Bookmark, Check, Palette, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { NativeSelect } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { CableState } from "@/lib/derive";
import { RULE_OPS } from "@/lib/auto";
import { useFmt, useT } from "@/lib/i18n";
import { uid, natCmp } from "@/lib/ids";
import { useStore } from "@/lib/store";
import type { Cable, Column, CondFormat, Project, SavedView, Sheet } from "@/lib/types";
import { cn } from "@/lib/utils";

/* ------------------------------ saved views ------------------------------ */

export const ViewsMenu = ({
  p,
  sheet,
  current,
  apply,
}: {
  p: Project;
  sheet: Sheet;
  current: Omit<SavedView, "id" | "name" | "sheetId">;
  apply: (v: SavedView) => void;
}) => {
  const t = useT();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const views = (p.views ?? []).filter((v) => v.sheetId === sheet.id);
  const st = useStore.getState();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" title={t("Saved views")}>
            <Bookmark className="h-4 w-4" />
            <span className="hidden lg:inline">{t("Views")}</span>
            {views.length > 0 && <span className="tnum text-xs text-sub">{views.length}</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>{t("Saved views")}</DropdownMenuLabel>
          {views.length === 0 && <div className="px-2 pb-2 text-xs text-sub">{t("Save filters, grouping and sort to come back in one click.")}</div>}
          {views.map((v) => (
            <DropdownMenuItem key={v.id} onClick={() => apply(v)} className="group justify-between">
              <span className="truncate">{v.name}</span>
              <button
                className="grid h-6 w-6 place-items-center rounded text-sub opacity-0 hover:text-bad group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  st.deleteView(p.id, v.id);
                }}
                aria-label={t("Delete")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setName("");
              setNaming(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> {t("Save current view…")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={naming} onOpenChange={setNaming}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("Save view")}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              st.saveView(p.id, { ...current, name: name.trim(), sheetId: sheet.id });
              toast.success(t("View saved"));
              setNaming(false);
            }}
          >
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. Floor 2 · not tested")} />
            <DialogFooter>
              <Button type="submit" disabled={!name.trim()}>
                {t("Save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

/* ------------------------------ grouping ------------------------------ */

export interface GroupStat {
  value: string;
  n: number;
  done: number;
  issue: number;
  sum: number;
}

export const groupStats = (rows: Cable[], colId: string, states: Map<string, CableState>, sumCol?: string): GroupStat[] => {
  const m = new Map<string, GroupStat>();
  for (const c of rows) {
    const v = colId === "__code" ? c.code : (c.values[colId] ?? "").trim();
    let g = m.get(v);
    if (!g) {
      g = { value: v, n: 0, done: 0, issue: 0, sum: 0 };
      m.set(v, g);
    }
    g.n++;
    const st = states.get(c.id);
    if (st === "complete") g.done++;
    if (st === "issue") g.issue++;
    if (sumCol) g.sum += Number(String(c.values[sumCol] ?? "").replace(",", ".")) || 0;
  }
  return [...m.values()].sort((a, b) => (a.value ? (b.value ? natCmp(a.value, b.value) : -1) : 1));
};

export const GroupStrip = ({
  stats,
  col,
  sumCol,
  active,
  onPick,
  onClose,
}: {
  stats: GroupStat[];
  col: Column;
  sumCol?: Column;
  active: string;
  onPick: (v: string) => void;
  onClose: () => void;
}) => {
  const t = useT();
  const f = useFmt();
  const total = stats.reduce((a, g) => ({ n: a.n + g.n, done: a.done + g.done, sum: a.sum + g.sum }), { n: 0, done: 0, sum: 0 });
  return (
    <div className="border-b bg-[#FAFBF9] px-3 py-2.5">
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="font-semibold uppercase tracking-wide text-sub">{t("Grouped by {c}", { c: col.name })}</span>
        <span className="text-sub">
          · {t("{n} groups", { n: f.num(stats.length) })} · {t("{n} cables", { n: f.num(total.n) })}
          {sumCol ? ` · Σ ${sumCol.name} ${f.num(Math.round(total.sum * 10) / 10)}` : ""}
        </span>
        <button onClick={onClose} className="ml-auto grid h-6 w-6 place-items-center rounded text-sub hover:bg-white hover:text-ink" aria-label={t("Close")}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {stats.slice(0, 200).map((g) => {
          const pct = g.n ? Math.round((g.done / g.n) * 100) : 0;
          const on = active === g.value;
          return (
            <button
              key={g.value || "∅"}
              onClick={() => onPick(on ? "" : g.value)}
              className={cn("w-40 shrink-0 rounded-lg border bg-white p-2.5 text-left transition hover:border-ink/30", on && "border-ink ring-2 ring-ink/10")}
            >
              <div className="flex items-center justify-between gap-1">
                <span className={cn("truncate text-[13px] font-semibold", g.value ? "text-ink" : "italic text-sub")}>{g.value || t("(empty)")}</span>
                {on && <Check className="h-3.5 w-3.5 shrink-0 text-ink" />}
              </div>
              <div className="mt-1 flex items-baseline gap-1.5 text-xs text-sub">
                <span className="tnum font-bold text-ink">{f.num(g.n)}</span>
                {g.issue > 0 && <span className="text-bad">· {g.issue} !</span>}
                {sumCol && <span className="tnum truncate">· Σ {f.num(Math.round(g.sum * 10) / 10)}</span>}
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-ok" style={{ width: `${pct}%` }} />
              </div>
              <div className="tnum mt-1 text-[11px] text-sub">{t("{n}% complete", { n: pct })}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* ------------------------------ conditional formatting ------------------------------ */

const SWATCHES = ["#E5384B", "#FF5A1F", "#F5C400", "#1F9D63", "#2563EB", "#8B5CF6", "#22C3C3", "#0B1F33"];

export const FormatsDialog = ({ p, open, onOpenChange }: { p: Project; open: boolean; onOpenChange: (o: boolean) => void }) => {
  const t = useT();
  const [list, setList] = useState<CondFormat[]>([]);
  useEffect(() => {
    if (open) setList(structuredClone(p.formats ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const cols = useMemo(() => {
    const m = new Map<string, Column>();
    for (const s of p.sheets) for (const c of s.columns) if (!m.has(c.id)) m.set(c.id, c);
    return [...m.values()];
  }, [p.sheets]);
  const upd = (i: number, patch: Partial<CondFormat>) => setList((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-brand" /> {t("Row colours")}
          </DialogTitle>
          <DialogDescription>{t("Colour rows that match a condition. The first matching rule wins.")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {list.map((x, i) => {
            const needs = RULE_OPS.find((o) => o.op === x.when.op)?.needsValue ?? true;
            return (
              <div key={x.id} className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-white p-2" style={{ boxShadow: `inset 4px 0 0 ${x.color}` }}>
                <NativeSelect className="h-9 w-40" value={x.when.field} onChange={(v) => upd(i, { when: { ...x.when, field: v } })}>
                  <option value="__code">{t("Cable ID")}</option>
                  {cols.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect className="h-9 w-40" value={x.when.op} onChange={(v) => upd(i, { when: { ...x.when, op: v as CondFormat["when"]["op"] } })}>
                  {RULE_OPS.map((o) => (
                    <option key={o.op} value={o.op}>
                      {t(o.label)}
                    </option>
                  ))}
                </NativeSelect>
                {needs && <Input className="h-9 w-32 flex-1" value={x.when.value} onChange={(e) => upd(i, { when: { ...x.when, value: e.target.value } })} placeholder={t("Value")} />}
                <div className="flex gap-1">
                  {SWATCHES.map((c) => (
                    <button key={c} type="button" onClick={() => upd(i, { color: c })} className={cn("h-6 w-6 rounded-full border-2", x.color === c ? "border-ink" : "border-transparent")} style={{ background: c }} aria-label={c} />
                  ))}
                </div>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-bad hover:text-bad" onClick={() => setList(list.filter((_, j) => j !== i))} aria-label={t("Delete")}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          <Button
            variant="outline"
            className="w-full border-dashed"
            onClick={() => setList([...list, { id: uid(), name: "", color: SWATCHES[list.length % SWATCHES.length], when: { field: cols[0]?.id ?? "__code", op: "empty", value: "" } }])}
          >
            <Plus /> {t("Add colour rule")}
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("Cancel")}
          </Button>
          <Button
            onClick={() => {
              useStore.getState().setFormats(p.id, list);
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
