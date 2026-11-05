import { LayoutGrid, Printer, Tag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Field, NativeSelect } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import type { CableState } from "@/lib/derive";
import { useFmt, useT } from "@/lib/i18n";
import { natCmp } from "@/lib/ids";
import type { Cable, Column, Project, Sheet } from "@/lib/types";
import { cn } from "@/lib/utils";

/* ------------------------------ labels ------------------------------ */

interface LabelSize {
  id: string;
  name: string;
  w: number; // mm
  h: number;
  id_pt: number;
}

/** Common TIA-606 label stocks: self-laminating wrap, flag and patch-panel strips. */
const SIZES: LabelSize[] = [
  { id: "wrap", name: "Self-laminating wrap · 25 × 38 mm", w: 38, h: 25, id_pt: 13 },
  { id: "flag", name: "Flag · 50 × 19 mm", w: 50, h: 19, id_pt: 14 },
  { id: "panel", name: "Patch panel strip · 12 × 9 mm", w: 12, h: 9, id_pt: 6 },
  { id: "avery", name: "Sheet label · 64 × 34 mm", w: 64, h: 34, id_pt: 18 },
];

/** Font size (pt) that fits an ID on one line of a label: bold monospace glyphs are ~0.65 em wide. */
const fitPt = (sz: LabelSize, text: string) => Math.max(5, Math.min(sz.id_pt, (sz.w - 3) / (Math.max(1, text.length) * 0.68 * 0.3528)));

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

const printHtml = (html: string) => {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1500);
  }, 250);
};

const guessCol = (cols: Column[], re: RegExp) => cols.find((c) => re.test(c.name))?.id ?? "";

export const LabelsDialog = ({ p, sheet, cables, open, onOpenChange }: { p: Project; sheet: Sheet; cables: Cable[]; open: boolean; onOpenChange: (o: boolean) => void }) => {
  const t = useT();
  const f = useFmt();
  const cols = sheet.columns.filter((c) => !c.progress);
  const [size, setSize] = useState("wrap");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [both, setBoth] = useState(true);
  useEffect(() => {
    if (!open) return;
    setA(guessCol(cols, /a[-\s]?end|from|origin|откуда|начало|origen|^a$/i));
    setB(guessCol(cols, /b[-\s]?end|to\b|dest|куда|конец|destino|^b$/i));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sheet.id]);
  const sz = SIZES.find((x) => x.id === size) ?? SIZES[0];
  const line2 = (c: Cable) => [a && c.values[a], b && c.values[b]].filter(Boolean).join(" → ");
  const labels = useMemo(() => {
    const out: { code: string; sub: string; end?: string }[] = [];
    for (const c of cables) {
      const sub = line2(c);
      if (both) {
        out.push({ code: c.code, sub, end: "A" }, { code: c.code, sub, end: "B" });
      } else out.push({ code: c.code, sub });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cables, a, b, both]);

  const print = () => {
    const small = sz.h < 12;
    const body = labels
      .map(
        (l) =>
          `<div class="l"><div class="id" style="font-size:${fitPt(sz, l.code).toFixed(1)}pt">${esc(l.code)}</div>${!small && l.sub ? `<div class="sub">${esc(l.sub)}</div>` : ""}${!small && l.end ? `<div class="end">${l.end}</div>` : ""}</div>`,
      )
      .join("");
    printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(p.name)} — labels</title><style>
@page{margin:8mm}
*{box-sizing:border-box}
body{margin:0;font-family:"JetBrains Mono",ui-monospace,Menlo,monospace;color:#000}
.wrap{display:flex;flex-wrap:wrap;gap:2mm}
.l{position:relative;width:${sz.w}mm;height:${sz.h}mm;border:0.2mm dashed #999;padding:1mm 1.5mm;display:flex;flex-direction:column;justify-content:center;overflow:hidden;break-inside:avoid}
.id{font-weight:700;font-size:${sz.id_pt}pt;line-height:1.05;white-space:nowrap}
.sub{font-size:${Math.max(5, sz.id_pt * 0.5)}pt;margin-top:0.6mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.end{position:absolute;right:1mm;top:0.6mm;font-size:6pt;font-weight:700}
</style></head><body><div class="wrap">${body}</div></body></html>`);
  };

  const preview = labels.slice(0, 12);
  const scale = 2.6; // px per mm in preview
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-brand" /> {t("Print labels")}
          </DialogTitle>
          <DialogDescription>{t("TIA-606 cable labels for {n} cables. Select rows first to print only those.", { n: f.num(cables.length) })}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("Label stock")}>
            <NativeSelect value={size} onChange={setSize}>
              {SIZES.map((s) => (
                <option key={s.id} value={s.id}>
                  {t(s.name)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <label className="flex items-center justify-between gap-3 self-end rounded-lg border bg-white px-3 py-2.5 text-sm">
            <span>{t("Two labels per cable (A and B ends)")}</span>
            <Switch checked={both} onCheckedChange={setBoth} />
          </label>
          <Field label={t("Second line: from")}>
            <NativeSelect value={a} onChange={setA}>
              <option value="">—</option>
              {cols.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("Second line: to")}>
            <NativeSelect value={b} onChange={setB}>
              <option value="">—</option>
              {cols.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <div className="max-h-64 overflow-auto rounded-lg bg-[#E4E8E1] p-3 scrollbar-thin">
          <div className="flex flex-wrap gap-1.5">
            {preview.map((l, i) => (
              <div
                key={i}
                className="relative flex flex-col justify-center overflow-hidden rounded-[3px] bg-white px-1.5 font-mono text-black shadow-sm"
                style={{ width: sz.w * scale, height: sz.h * scale }}
              >
                <div className="truncate font-bold leading-tight" style={{ fontSize: fitPt(sz, l.code) * 0.917 * (scale / 2.6) }}>
                  {l.code}
                </div>
                {sz.h >= 12 && l.sub && <div className="truncate text-[9px] leading-tight">{l.sub}</div>}
                {sz.h >= 12 && l.end && <div className="absolute right-1 top-0.5 text-[8px] font-bold">{l.end}</div>}
              </div>
            ))}
            {labels.length > preview.length && <div className="self-center px-2 text-xs text-sub">+{f.num(labels.length - preview.length)}</div>}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={print} disabled={!labels.length}>
            <Printer /> {t("Print {n} labels", { n: f.num(labels.length) })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ------------------------------ patch panel map ------------------------------ */

const portNum = (v: string): number | null => {
  const m = v.match(/(\d+)\s*$/) ?? v.match(/(\d+)/);
  return m ? Number(m[1]) : null;
};

const TONE: Record<CableState, string> = {
  none: "bg-white border-ink/25 text-ink",
  progress: "bg-cat text-white border-cat",
  complete: "bg-ok text-white border-ok",
  issue: "bg-bad text-white border-bad",
};

export const PortMapDialog = ({
  p,
  sheet,
  cables,
  states,
  open,
  onOpenChange,
}: {
  p: Project;
  sheet: Sheet;
  cables: Cable[];
  states: Map<string, CableState>;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) => {
  const t = useT();
  const f = useFmt();
  const nav = useNavigate();
  const cols = sheet.columns.filter((c) => !c.progress);
  const [panel, setPanel] = useState("");
  const [port, setPort] = useState("");
  useEffect(() => {
    if (!open) return;
    setPanel((x) => x || guessCol(cols, /patch\s*panel|патч|панел|^panel$|panel/i) || guessCol(cols, /rack|стойк|шкаф|bastidor|cabinet/i));
    setPort((x) => x || guessCol(cols, /port|порт|puerto|jack|розетк/i));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sheet.id]);

  const panels = useMemo(() => {
    if (!port) return [];
    const m = new Map<string, { ports: Map<number, Cable[]>; other: Cable[] }>();
    for (const c of cables) {
      const pv = (c.values[port] ?? "").trim();
      if (!pv) continue;
      const key = panel ? (c.values[panel] ?? "").trim() || "—" : sheet.name;
      let g = m.get(key);
      if (!g) m.set(key, (g = { ports: new Map(), other: [] }));
      const n = portNum(pv);
      if (n === null || n > 576) g.other.push(c);
      else {
        const arr = g.ports.get(n) ?? [];
        arr.push(c);
        g.ports.set(n, arr);
      }
    }
    return [...m.entries()]
      .sort((x, y) => natCmp(x[0], y[0]))
      .map(([name, g]) => {
        const max = Math.max(0, ...g.ports.keys());
        const size = Math.max(24, Math.ceil(max / 24) * 24);
        const used = g.ports.size;
        const dup = [...g.ports.values()].filter((x) => x.length > 1).length;
        return { name, ports: g.ports, other: g.other, size, used, dup };
      });
  }, [cables, panel, port, sheet.name]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-brand" /> {t("Patch panel map")}
          </DialogTitle>
          <DialogDescription>{t("Every port of every panel, coloured by cable status. Two cables on one port are flagged.")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-52">
            <Field label={t("Panel column")}>
              <NativeSelect value={panel} onChange={setPanel}>
                <option value="">{t("(whole sheet)")}</option>
                {cols.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <div className="w-52">
            <Field label={t("Port column")}>
              <NativeSelect value={port} onChange={setPort}>
                <option value="">—</option>
                {cols.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3 pb-2 text-xs text-sub">
            {(["none", "progress", "complete", "issue"] as const).map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className={cn("h-3 w-3 rounded-[3px] border", TONE[s])} />
                {t({ none: "Not started", progress: "In progress", complete: "Complete", issue: "Issue" }[s])}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-[3px] border border-dashed border-ink/25" /> {t("Free")}
            </span>
          </div>
        </div>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1 scrollbar-thin">
          {!port ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-sub">{t("Pick the column that holds the port number.")}</p>
          ) : panels.length === 0 ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-sub">{t("No cables have a port on this sheet yet.")}</p>
          ) : (
            panels.slice(0, 60).map((g) => (
              <section key={g.name} className="rounded-xl bg-ink p-3 text-white">
                <div className="mb-2 flex items-baseline gap-2 text-sm">
                  <span className="font-mono font-bold">{g.name}</span>
                  <span className="text-xs text-white/60">
                    {t("{a} of {b} ports used", { a: f.num(g.used), b: f.num(g.size) })}
                  </span>
                  {g.dup > 0 && <span className="rounded bg-bad px-1.5 text-xs font-semibold">{t("{n} double-booked", { n: g.dup })}</span>}
                </div>
                <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
                  {Array.from({ length: g.size }, (_, i) => {
                    const n = i + 1;
                    const list = g.ports.get(n);
                    const c = list?.[0];
                    const st = c ? (states.get(c.id) ?? "none") : null;
                    const dup = (list?.length ?? 0) > 1;
                    return (
                      <button
                        key={n}
                        disabled={!c}
                        onClick={() => c && nav(`/p/${p.id}/registry/cable/${c.id}`)}
                        title={list ? `${n}: ${list.map((x) => x.code).join(", ")}` : `${n}: ${t("Free")}`}
                        className={cn(
                          "flex aspect-square min-w-0 flex-col items-center justify-center rounded-[4px] border text-[9px] font-semibold leading-none transition",
                          st ? cn(TONE[st], "hover:-translate-y-px hover:shadow") : "border-dashed border-white/25 text-white/40",
                          dup && "ring-2 ring-bad ring-offset-1 ring-offset-ink",
                        )}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
                {g.other.length > 0 && (
                  <p className="mt-2 truncate text-xs text-white/60">
                    {t("Unreadable port")}: {g.other.slice(0, 8).map((c) => `${c.code} (${c.values[port]})`).join(", ")}
                  </p>
                )}
              </section>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
