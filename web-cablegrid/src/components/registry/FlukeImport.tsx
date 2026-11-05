import { CheckCircle2, FileUp, Gauge, Loader2, XCircle } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Field, NativeSelect } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { notifyGate } from "@/components/registry/RegistryTable";
import { useFmt, useT } from "@/lib/i18n";
import { normCode, todayStr } from "@/lib/ids";
import { parseSpreadsheet, type ParsedSheet } from "@/lib/importers";
import { type CellEdit, useStore } from "@/lib/store";
import type { Cable, Column, Project, Sheet } from "@/lib/types";
import { cn } from "@/lib/utils";

const NEW = "__new";
const NONE = "";

export interface FlukeRow {
  id: string;
  pass: boolean | null;
  result: string;
  date: string;
  length: string;
  margin: string;
}

const find = (headers: string[], re: RegExp) => headers.findIndex((h) => re.test(h));

/** Fluke LinkWare / DSX exports: "Cable ID", "Summary"/"Result" (PASS/FAIL), "Date/Time", "Length", "Headroom". */
export const readFluke = (sh: ParsedSheet): { rows: FlukeRow[]; idCol: number; resCol: number } => {
  const h = sh.headers;
  let idCol = find(h, /cable\s*id|^id$|link\s*(id|name)|cable\s*name|^name$/i);
  if (idCol < 0) idCol = find(h, /\bid\b|label|name/i);
  const resCol = find(h, /summary|result|status|pass|verdict|итог|результат|resultado/i);
  const dateCol = find(h, /date|time|дата|fecha/i);
  const lenCol = find(h, /length|длина|longitud/i);
  const marCol = find(h, /headroom|margin|запас|margen/i);
  const rows: FlukeRow[] = [];
  if (idCol < 0) return { rows, idCol, resCol };
  for (const r of sh.rows) {
    const id = (r[idCol] ?? "").trim();
    if (!id) continue;
    const res = resCol >= 0 ? (r[resCol] ?? "").trim() : "";
    const pass = /pass|ok|годен|прош|correcto|aprob/i.test(res) ? true : /fail|fallo|не\s*годен|брак/i.test(res) ? false : null;
    rows.push({ id, pass, result: res.toUpperCase(), date: dateCol >= 0 ? toIsoDate(r[dateCol] ?? "") : "", length: lenCol >= 0 ? (r[lenCol] ?? "").replace(/[^\d.,-]/g, "").replace(",", ".") : "", margin: marCol >= 0 ? (r[marCol] ?? "").trim() : "" });
  }
  return { rows, idCol, resCol };
};

/** LinkWare XML: one element per test with CableID / Result children or attributes. */
const parseFlukeXml = (text: string): ParsedSheet => {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const rows: string[][] = [];
  const pick = (el: Element, re: RegExp) => {
    for (const a of Array.from(el.attributes)) if (re.test(a.name)) return a.value;
    for (const c of Array.from(el.children)) if (re.test(c.tagName) && !c.children.length) return c.textContent ?? "";
    return "";
  };
  for (const el of Array.from(doc.getElementsByTagName("*"))) {
    const id = pick(el, /^(cable_?id|cableid|id|name)$/i);
    const res = pick(el, /^(result|summary|status)$/i);
    if (id && res) rows.push([id, res, pick(el, /date|time/i), pick(el, /length/i), pick(el, /headroom|margin/i)]);
  }
  return { name: "XML", headers: ["Cable ID", "Result", "Date", "Length", "Headroom"], rows, rawRows: rows, kind: "table" };
};

const toIsoDate = (v: string): string => {
  const s = v.trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    let [a, b] = [Number(m[1]), Number(m[2])];
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    if (s.includes(".") || a > 12) [a, b] = [b, a]; // d.m.y or d/m/y
    return `${y}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

const mark = (col: Column, date: string) => (col.type === "checkbox" ? "yes" : col.type === "date" ? date : col.type === "number" ? "1" : "✓");

export const FlukeImport = ({ p, sheet, cables, open, onOpenChange }: { p: Project; sheet: Sheet; cables: Cable[]; open: boolean; onOpenChange: (o: boolean) => void }) => {
  const t = useT();
  const f = useFmt();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<FlukeRow[] | null>(null);
  const [resTo, setResTo] = useState(NEW);
  const [stageTo, setStageTo] = useState(NONE);
  const [lenTo, setLenTo] = useState(NONE);
  const [dateTo, setDateTo] = useState(NONE);

  const textCols = sheet.columns.filter((c) => !c.locked && !c.formula && !c.progress && (c.type === "text" || c.type === "select"));
  const stageCols = sheet.columns.filter((c) => c.progress && !c.locked);
  const numCols = sheet.columns.filter((c) => !c.locked && !c.formula && c.type === "number");
  const dateCols = sheet.columns.filter((c) => !c.locked && !c.formula && c.type === "date" && !c.progress);

  const reset = () => {
    setRows(null);
    setFileName("");
  };

  const load = async (file: File) => {
    setBusy(true);
    try {
      if (/\.flw$/i.test(file.name)) {
        const { readFlw } = await import("@/lib/flw");
        const res = await readFlw(await file.arrayBuffer(), cables.map((c) => c.code));
        if (!res.rows.length) {
          toast.error(t("No cables of this sheet were found in this LinkWare file."), { description: t("In LinkWare PC use File › Export to File › Autotest Summary (CSV) and import that file.") });
          return;
        }
        const withVerdict = res.rows.filter((x) => x.pass !== null).length;
        if (withVerdict < res.rows.length)
          toast.warning(t("{n} cables found without a PASS / FAIL verdict.", { n: res.rows.length - withVerdict }), { description: t("For full results export a CSV from LinkWare PC.") });
        setRows([...res.rows, ...res.unknown.map((id) => ({ id, pass: null, result: "", date: "", length: "", margin: "" }))]);
        finishLoad(file.name);
        return;
      }
      let sh: ParsedSheet | undefined;
      if (/\.xml$/i.test(file.name)) sh = parseFlukeXml(await file.text());
      else sh = (await parseSpreadsheet(file)).sheets.find((s) => s.rows.length);
      if (!sh) throw new Error("empty");
      const r = readFluke(sh);
      if (r.idCol < 0 || !r.rows.length) {
        toast.error(t("No “Cable ID” column found in this file."));
        return;
      }
      setRows(r.rows);
      finishLoad(file.name);
    } catch {
      toast.error(t("Could not read this file."));
    } finally {
      setBusy(false);
    }
  };

  const finishLoad = (name: string) => {
    setFileName(name);
    const guessRes = textCols.find((c) => /test|result|fluke|тест|результат|prueba/i.test(c.name));
    setResTo(guessRes?.id ?? NEW);
    const guessStage = stageCols.find((c) => /test|cert|тест|сертиф|prueba/i.test(c.name));
    setStageTo(guessStage?.id ?? NONE);
    setLenTo(numCols.find((c) => /length|длин|longitud/i.test(c.name))?.id ?? NONE);
    setDateTo(NONE);
  };

  // match file IDs to cables of this sheet (case and separators ignored); the last test of a cable wins
  const match = useMemo(() => {
    if (!rows) return null;
    const byNorm = new Map(cables.map((c) => [normCode(c.code), c] as const));
    const hits = new Map<string, { cable: Cable; row: FlukeRow }>();
    const missing: string[] = [];
    for (const r of rows) {
      const c = byNorm.get(normCode(r.id));
      if (c) hits.set(c.id, { cable: c, row: r });
      else missing.push(r.id);
    }
    const list = [...hits.values()];
    return { list, missing, pass: list.filter((x) => x.row.pass === true).length, fail: list.filter((x) => x.row.pass === false).length };
  }, [rows, cables]);

  const apply = () => {
    if (!match) return;
    const st = useStore.getState();
    let resId = resTo;
    if (resId === NEW) resId = st.addColumn(p.id, sheet.id, { name: t("Test result"), type: "select", options: ["PASS", "FAIL"] });
    const proj = useStore.getState().projects.find((x) => x.id === p.id);
    const findCol = (id: string) => proj?.sheets.flatMap((s) => s.columns).find((c) => c.id === id);
    const stage = stageTo ? findCol(stageTo) : undefined;
    const edits: CellEdit[] = [];
    for (const { cable, row } of match.list) {
      if (resId && row.result) edits.push({ cableId: cable.id, colId: resId, value: row.result });
      if (lenTo && row.length) edits.push({ cableId: cable.id, colId: lenTo, value: row.length });
      if (dateTo && row.date) edits.push({ cableId: cable.id, colId: dateTo, value: row.date });
      if (stage && row.pass === true && !cable.values[stage.id]?.trim()) edits.push({ cableId: cable.id, colId: stage.id, value: mark(stage, row.date || todayStr()) });
    }
    st.setCells(p.id, edits, `Fluke · ${fileName}`);
    notifyGate(t);
    toast.success(t("Test results: {n} cables updated", { n: match.list.length }), {
      description: match.fail ? t("{n} failed — filter by “FAIL” to retest.", { n: match.fail }) : undefined,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-brand" /> {t("Import Fluke test results")}
          </DialogTitle>
          <DialogDescription>{t("Open a LinkWare project (.flw) or its CSV, Excel or XML export. Results are matched to cables of this sheet by Cable ID.")}</DialogDescription>
        </DialogHeader>

        <input
          ref={fileRef}
          type="file"
          accept=".flw,.csv,.txt,.xlsx,.xls,.xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void load(file);
          }}
        />

        {!match ? (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-[#FAFBF9] text-sub transition hover:border-brand hover:text-ink"
          >
            {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <FileUp className="h-6 w-6" />}
            <span className="text-sm font-semibold">{t("Choose a LinkWare export")}</span>
            <span className="text-xs">FLW · CSV · XLSX · XML</span>
          </button>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <Stat icon={<CheckCircle2 className="h-4 w-4 text-ok" />} n={f.num(match.pass)} label={t("PASS")} />
              <Stat icon={<XCircle className="h-4 w-4 text-bad" />} n={f.num(match.fail)} label={t("FAIL")} tone={match.fail ? "bad" : undefined} />
              <Stat n={f.num(match.missing.length)} label={t("Not on this sheet")} />
            </div>
            {match.missing.length > 0 && (
              <p className="truncate text-xs text-sub">
                {t("Not found")}: <span className="font-mono">{match.missing.slice(0, 10).join(", ")}{match.missing.length > 10 ? "…" : ""}</span>
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("Write result to")}>
                <NativeSelect value={resTo} onChange={setResTo}>
                  <option value={NEW}>{t("New column “Test result”")}</option>
                  <option value={NONE}>{t("Don't write")}</option>
                  {textCols.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t("Mark stage done on PASS")}>
                <NativeSelect value={stageTo} onChange={setStageTo}>
                  <option value={NONE}>{t("Don't mark")}</option>
                  {stageCols.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t("Measured length to")}>
                <NativeSelect value={lenTo} onChange={setLenTo}>
                  <option value={NONE}>{t("Don't write")}</option>
                  {numCols.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t("Test date to")}>
                <NativeSelect value={dateTo} onChange={setDateTo}>
                  <option value={NONE}>{t("Don't write")}</option>
                  {dateCols.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
          </div>
        )}

        <DialogFooter>
          {match && (
            <Button variant="ghost" onClick={reset}>
              {t("Another file")}
            </Button>
          )}
          <Button onClick={apply} disabled={!match || !match.list.length}>
            {t("Apply to {n} cables", { n: match?.list.length ?? 0 })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Stat = ({ icon, n, label, tone }: { icon?: React.ReactNode; n: string; label: string; tone?: "bad" }) => (
  <div className={cn("rounded-lg border bg-white p-3", tone === "bad" && "border-bad/30 bg-bad-soft")}>
    <div className="flex items-center gap-1.5 text-xs font-semibold text-sub">
      {icon}
      {label}
    </div>
    <div className="tnum mt-1 text-2xl font-bold text-ink">{n}</div>
  </div>
);
