import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, EyeOff, FileSpreadsheet, FileUp, Info, Layers, Loader2, Lock, Sparkles, Upload, Wand2 } from "lucide-react";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Field, NativeSelect } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { MAIN_LIST, sheetList } from "@/lib/auto";
import { uniqueColumns } from "@/lib/derive";
import { useT } from "@/lib/i18n";
import { normCode, natCmp } from "@/lib/ids";
import { convertValue, fileKind, guessIdColumn, type ImportType, parseFile, type ParsedSheet, type ParseResult, sliceAtHeader, suggestType } from "@/lib/importers";
import { type ImportOptions, useStore } from "@/lib/store";
import type { Column, Project } from "@/lib/types";
import { cn } from "@/lib/utils";

import { ProgressToggle, TYPE_LABEL } from "./ColumnDraftEditor";

/* ------------------------------------------------------------------ */

interface ColCfg {
  keep: boolean;
  /** "new" or an existing project column id */
  target: string;
  /** name of the new column */
  name: string;
  type: ImportType;
  progress: boolean;
}

interface SheetCfg {
  target: string; // "new" | registry sheet id
  newName: string;
  idCol: number;
  cols: ColCfg[];
}

interface Prefs {
  cols: Record<string, Omit<ColCfg, "target"> & { targetName?: string }>;
  sheets: Record<string, { targetName?: string; idHeader?: string }>;
}

const nn = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const prefsKey = (pid: string) => `cablegrid-import-map:${pid}`;
const loadPrefs = (pid: string): Prefs => {
  try {
    const x = JSON.parse(localStorage.getItem(prefsKey(pid)) ?? "");
    return { cols: x.cols ?? {}, sheets: x.sheets ?? {} };
  } catch {
    return { cols: {}, sheets: {} };
  }
};

const TYPES: ImportType[] = ["text", "number", "date", "select", "checkbox"];

/** Build the default configuration of one file sheet. Default type is always Text — the user decides. */
const autoSheet = (s: ParsedSheet, p: Project, prefs: Prefs, all: Column[], forceTarget?: string, forceId?: number): SheetCfg => {
  const sp = prefs.sheets[nn(s.name)];
  const bySheetName = p.sheets.find((x) => nn(x.name) === nn(s.name) || (sp?.targetName && nn(x.name) === nn(sp.targetName)));
  const target = forceTarget ?? (bySheetName ? bySheetName.id : "new");
  const known = new Set(p.cables.map((c) => normCode(c.code)));
  let idCol = forceId ?? -1;
  if (idCol < 0 && sp?.idHeader) idCol = s.headers.findIndex((h) => nn(h) === nn(sp.idHeader!));
  if (idCol < 0) idCol = guessIdColumn(s, known, normCode);
  const cols = s.headers.map((h, j): ColCfg => {
    const pref = prefs.cols[nn(h)];
    const hasData = s.rows.some((r) => (r[j] ?? "").trim());
    const want = pref?.targetName ?? pref?.name ?? h;
    const match = all.find((c) => nn(c.name) === nn(want)) ?? all.find((c) => nn(c.name) === nn(h));
    if (match) return { keep: pref ? pref.keep : hasData, target: match.id, name: match.name, type: match.type as ImportType, progress: !!match.progress };
    return { keep: pref ? pref.keep : hasData, target: "new", name: pref?.name ?? h, type: pref?.type ?? "text", progress: pref?.progress ?? false };
  });
  return { target, newName: s.name, idCol, cols };
};

type Step = "file" | "sheets" | "config" | "review" | "run" | "done";

/* ------------------------------------------------------------------ */

export const ImportWizard = ({
  p,
  open,
  onOpenChange,
  onDone,
  bookId,
}: {
  p: Project;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone?: (sheetId: string) => void;
  /** book that new sheets go to */
  bookId?: string;
}) => {
  const t = useT();
  const { addSheet, addColumn, updateColumn, importRows } = useStore.getState();
  const fileRef = useRef<HTMLInputElement>(null);
  const moreRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<File[]>([]);
  const [step, setStep] = useState<Step>("file");
  const [prefix, setPrefix] = useState("");
  const [busy, setBusy] = useState(false);
  const [readInfo, setReadInfo] = useState<{ done: number; total: number; sheet: string } | null>(null);
  const [drag, setDrag] = useState(false);
  const [res, setRes] = useState<ParseResult | null>(null);
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [sel, setSel] = useState<number[]>([]);
  const [cfg, setCfg] = useState<Record<number, SheetCfg>>({});
  const [active, setActive] = useState(0);
  const [opts, setOpts] = useState<Required<ImportOptions>>({ mode: "all", clearEmpty: false });
  const [remember, setRemember] = useState(true);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState({ created: 0, updated: 0, unchanged: 0, skipped: 0, sheets: 0, cols: 0 });
  const [usedPrefs, setUsedPrefs] = useState(false);

  const allCols = useMemo(() => uniqueColumns(p), [p]);
  const colById = useMemo(() => new Map(allCols.map((c) => [c.id, c])), [allCols]);
  const colByName = useMemo(() => new Map(allCols.map((c) => [nn(c.name), c])), [allCols]);

  const reset = () => {
    setStep("file");
    setRes(null);
    setSheets([]);
    setSel([]);
    setCfg({});
    setActive(0);
    setProgress(0);
  };

  /** Read one or more files; every sheet of every file shows up as its own sheet. `append` adds to the files already read. */
  const onFile = async (list?: FileList | File[] | null, append = false) => {
    const picked = Array.from(list ?? []);
    if (!picked.length) return;
    if (picked.some((f) => fileKind(f.name) === "dwg")) {
      toast.error(t("DWG is a closed binary format. In AutoCAD use “Save As → DXF” and upload the DXF file."));
      return;
    }
    const files = append ? [...filesRef.current, ...picked.filter((f) => !filesRef.current.some((x) => x.name === f.name && x.size === f.size))] : picked;
    setBusy(true);
    try {
      setReadInfo(null);
      const all: ParsedSheet[] = [];
      const used = new Set<string>();
      for (const [fi, file] of files.entries()) {
        const one = await parseFile(file, prefix, (done, total, sheet) => setReadInfo({ done, total, sheet: files.length > 1 ? `${file.name} (${fi + 1}/${files.length}) · ${sheet}` : sheet }));
        for (const sh of one.sheets) {
          let name = sh.name;
          for (let k = 2; used.has(name.toLowerCase()); k++) name = `${sh.name} (${k})`;
          used.add(name.toLowerCase());
          all.push({ ...sh, name });
        }
      }
      filesRef.current = files;
      const r: ParseResult = { fileName: files.map((f) => f.name).join(", "), sheets: all };
      if (!r.sheets.length || r.sheets.every((s) => !s.rows.length)) {
        toast.error(t("No cable data found in this file. Try setting the ID prefix (e.g. “C-”)."));
        return;
      }
      const prefs = loadPrefs(p.id);
      setUsedPrefs(Object.keys(prefs.cols).length > 0);
      setRes(r);
      setSheets(r.sheets);
      const pick = r.sheets.map((s, i) => (s.rows.length && !s.hidden ? i : -1)).filter((i) => i >= 0);
      setSel(pick.length ? pick : r.sheets.map((s, i) => (s.rows.length ? i : -1)).filter((i) => i >= 0));
      const c: Record<number, SheetCfg> = {};
      r.sheets.forEach((s, i) => {
        if (s.rows.length) c[i] = autoSheet(s, p, prefs, allCols);
      });
      setCfg(c);
      setActive(pick[0] ?? 0);
      setStep(r.sheets.length > 1 ? "sheets" : "config");
      if (append) toast.success(t("{n} sheets in the file", { n: r.sheets.length }));
    } catch (e) {
      console.error(e);
      toast.error(t("Could not read this file"));
    } finally {
      setBusy(false);
    }
  };

  /** Type that will really be stored: an existing / shared column keeps its own type. */
  const effective = (c: ColCfg): { type: ImportType; progress: boolean; locked: Column | null } => {
    const ex = c.target !== "new" ? colById.get(c.target) : colByName.get(nn(c.name));
    if (ex) return { type: ex.type as ImportType, progress: !!ex.progress, locked: ex };
    return { type: c.type, progress: c.progress, locked: null };
  };

  const changeHeaderRow = (i: number, row: number) => {
    const orig = res!.sheets[i];
    const s = sliceAtHeader(orig, row);
    setSheets((xs) => xs.map((x, k) => (k === i ? s : x)));
    setCfg((x) => ({ ...x, [i]: autoSheet(s, p, loadPrefs(p.id), allCols, x[i]?.target) }));
  };

  const dCfg = useDeferredValue(cfg);
  /* -------- merged preview: one cable per normalised ID across every selected sheet -------- */
  const plan = useMemo(() => {
    if (!res || (step !== "review" && step !== "config")) return null;
    type M = { code: string; values: Record<string, string>; sheets: Set<number> };
    const merged = new Map<string, M>();
    const conflicts: { code: string; column: string; a: string; b: string }[] = [];
    let conflictN = 0;
    const per: Record<number, { rows: number; noId: number; dups: number; bad: Record<number, number> }> = {};
    for (const i of sel) {
      const s = sheets[i];
      const c = dCfg[i];
      if (!s || !c) continue;
      const st = { rows: 0, noId: 0, dups: 0, bad: {} as Record<number, number> };
      per[i] = st;
      const seen = new Set<string>();
      const eff = c.cols.map((cc) => effective(cc));
      const keys = c.cols.map((cc) => (cc.target !== "new" ? cc.target : colByName.get(nn(cc.name))?.id ?? `new:${nn(cc.name)}`));
      s.rows.forEach((r, ri) => {
        const code = (r[c.idCol] ?? "").trim();
        if (!code) {
          st.noId++;
          return;
        }
        st.rows++;
        const k = normCode(code);
        if (seen.has(k)) st.dups++;
        seen.add(k);
        let m = merged.get(k);
        if (!m) {
          m = { code, values: {}, sheets: new Set() };
          merged.set(k, m);
        }
        m.sheets.add(i);
        c.cols.forEach((cc, j) => {
          if (j === c.idCol || !cc.keep || !cc.name.trim()) return;
          const { v, bad } = convertValue(r[j] ?? "", s.rawRows[ri]?.[j] ?? "", eff[j].type);
          if (bad) st.bad[j] = (st.bad[j] ?? 0) + 1;
          const key = keys[j];
          const prev = m!.values[key];
          if (prev !== undefined && prev !== "" && v !== "" && prev !== v) {
            conflictN++;
            if (conflicts.length < 12) conflicts.push({ code: m!.code, column: cc.name, a: prev, b: v });
            return; // first value wins
          }
          if (prev === undefined || prev === "") m!.values[key] = v;
        });
      });
    }
    const index = new Map(p.cables.map((c) => [normCode(c.code), c]));
    let neu = 0;
    let upd = 0;
    let same = 0;
    let multi = 0;
    for (const [k, m] of merged) {
      if (m.sheets.size > 1) multi++;
      const ex = index.get(k);
      if (!ex) {
        neu++;
        continue;
      }
      const changed = Object.entries(m.values).some(([key, v]) => {
        if (v === "" && !opts.clearEmpty) return false;
        if (key.startsWith("new:")) return v !== "";
        return (ex.values[key] ?? "") !== v;
      });
      if (changed) upd++;
      else same++;
    }
    return { merged, conflicts, conflictN, per, neu, upd, same, multi };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res, sheets, sel, dCfg, step, p.cables, opts.clearEmpty, colById, colByName]);

  const newCols = useMemo(() => {
    const out = new Map<string, { name: string; type: ImportType; progress: boolean }>();
    for (const i of sel)
      cfg[i]?.cols.forEach((c, j) => {
        if (j === cfg[i].idCol || !c.keep || !c.name.trim() || c.target !== "new" || colByName.has(nn(c.name))) return;
        if (!out.has(nn(c.name))) out.set(nn(c.name), { name: c.name.trim(), type: c.type, progress: c.progress });
      });
    return [...out.values()];
  }, [sel, cfg, colByName]);

  /* ------------------------------------ run ------------------------------------ */
  const run = async () => {
    if (!res || !plan) return;
    setStep("run");
    await new Promise((ok) => setTimeout(ok, 30));
    // 1. sheets + columns
    const realKey = new Map<string, string>(); // plan key → real column id
    let firstSheet = "";
    const selectVals = new Map<string, Set<string>>();
    const listOf = new Map<number, string>(); // file sheet → cable list of its target sheet
    let fresh = p.sheets.length === 0;
    for (const i of sel) {
      const s = sheets[i];
      const c = cfg[i];
      let sheetId = c.target;
      // a new sheet keeps its own cable list (the very first sheet of a project uses the main list)
      if (sheetId === "new") {
        sheetId = addSheet(p.id, c.newName.trim() || s.name, [], { bookId, listId: fresh ? undefined : "new" });
        fresh = false;
      }
      const tgtSheet = useStore.getState().projects.find((x) => x.id === p.id)?.sheets.find((x) => x.id === sheetId);
      listOf.set(i, tgtSheet ? sheetList(tgtSheet) : MAIN_LIST);
      firstSheet ||= sheetId;
      c.cols.forEach((cc, j) => {
        if (j === c.idCol || !cc.keep || !cc.name.trim()) return;
        const ex = cc.target !== "new" ? colById.get(cc.target) : colByName.get(nn(cc.name));
        const key = ex ? ex.id : `new:${nn(cc.name)}`;
        let id: string;
        if (ex) id = addColumn(p.id, sheetId, { name: ex.name, type: ex.type, options: ex.options, progress: ex.progress });
        else {
          const optList = cc.type === "select" ? [...new Set(s.rows.map((r) => (r[j] ?? "").trim()).filter(Boolean))].sort((a, b) => natCmp(a, b)).slice(0, 100) : undefined;
          id = addColumn(p.id, sheetId, { name: cc.name.trim(), type: cc.type, progress: cc.progress, options: optList });
        }
        realKey.set(key, id);
        const typ = ex ? ex.type : cc.type;
        if (typ === "select") {
          const set = selectVals.get(id) ?? new Set<string>();
          s.rows.forEach((r) => (r[j] ?? "").trim() && set.add((r[j] ?? "").trim()));
          selectVals.set(id, set);
        }
      });
    }
    // extend dropdown options of existing select columns with values from the file
    for (const [id, vals] of selectVals) {
      const col = useStore.getState().projects.find((x) => x.id === p.id)?.sheets.flatMap((x) => x.columns).find((x) => x.id === id);
      if (!col) continue;
      const have = new Set((col.options ?? []).map(nn));
      const add = [...vals].filter((v) => !have.has(nn(v)));
      if (add.length && (col.options?.length ?? 0) + add.length <= 200) updateColumn(p.id, firstSheet, id, { options: [...(col.options ?? []), ...add] });
    }
    // 2. rows (already merged by ID across sheets)
    const rows = [...plan.merged.values()].map((m) => {
      const values: Record<string, string> = {};
      for (const [k, v] of Object.entries(m.values)) {
        const id = realKey.get(k);
        if (id) values[id] = v;
      }
      return { code: m.code, values, lists: [...new Set([...m.sheets].map((i) => listOf.get(i) ?? MAIN_LIST))] };
    });
    const total = rows.length || 1;
    const sum = { created: 0, updated: 0, unchanged: 0, skipped: 0 };
    const CHUNK = 5000;
    for (let k = 0; k < rows.length; k += CHUNK) {
      const r = importRows(p.id, rows.slice(k, k + CHUNK), res.fileName, opts);
      sum.created += r.created;
      sum.updated += r.updated;
      sum.unchanged += r.unchanged;
      sum.skipped += r.skipped;
      setProgress(Math.round((Math.min(k + CHUNK, rows.length) / total) * 100));
      await new Promise((ok) => setTimeout(ok, 16));
    }
    // 3. remember the mapping for the next import of a similar file
    if (remember) {
      const prefs = loadPrefs(p.id);
      for (const i of sel) {
        const s = sheets[i];
        const c = cfg[i];
        const tgt = p.sheets.find((x) => x.id === c.target);
        prefs.sheets[nn(s.name)] = { targetName: tgt?.name ?? c.newName, idHeader: s.headers[c.idCol] };
        c.cols.forEach((cc, j) => {
          if (j === c.idCol) return;
          const ex = cc.target !== "new" ? colById.get(cc.target) : undefined;
          prefs.cols[nn(s.headers[j])] = { keep: cc.keep, name: cc.name, type: cc.type, progress: cc.progress, targetName: ex?.name };
        });
      }
      try {
        localStorage.setItem(prefsKey(p.id), JSON.stringify(prefs));
      } catch {
        /* storage full — not critical */
      }
    }
    setSummary({ ...sum, sheets: sel.length, cols: newCols.length });
    setStep("done");
    if (firstSheet) onDone?.(firstSheet);
  };

  /* ------------------------------------ UI ------------------------------------ */
  const stepsUi: { k: Step; label: string }[] = [
    { k: "file", label: t("File") },
    { k: "sheets", label: t("Sheets") },
    { k: "config", label: t("Columns") },
    { k: "review", label: t("Review") },
  ];
  const stepIdx = ["file", "sheets", "config", "review", "run", "done"].indexOf(step);

  const cur = cfg[active];
  const curSheet = sheets[active];
  const setCur = (patch: Partial<SheetCfg>) => setCfg((x) => ({ ...x, [active]: { ...x[active], ...patch } }));
  const setCol = (j: number, patch: Partial<ColCfg>) => setCfg((x) => ({ ...x, [active]: { ...x[active], cols: x[active].cols.map((c, k) => (k === j ? { ...c, ...patch } : c)) } }));
  const setAllCols = (f: (c: ColCfg, j: number) => Partial<ColCfg>) =>
    setCfg((x) => ({ ...x, [active]: { ...x[active], cols: x[active].cols.map((c, j) => (j === x[active].idCol ? c : { ...c, ...f(c, j) })) } }));

  const hints = useMemo(() => {
    if (!curSheet) return [] as (ImportType | null)[];
    return curSheet.headers.map((_, j) =>
      suggestType(
        curSheet.rows.slice(0, 300).map((r) => r[j] ?? ""),
        curSheet.rawRows.slice(0, 300).map((r) => r[j] ?? ""),
      ),
    );
  }, [curSheet]);

  const keptCount = cur ? cur.cols.filter((c, j) => c.keep && j !== cur.idCol).length : 0;
  const selIdx = sel.indexOf(active);
  const missingNames = sel.some((i) => cfg[i]?.cols.some((c, j) => j !== cfg[i].idCol && c.keep && !c.name.trim()));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (step === "run") return;
        onOpenChange(o);
        if (!o) setTimeout(reset, 300);
      }}
    >
      <DialogContent className={cn("max-w-3xl", (step === "config" || step === "review") && "max-w-[1180px]")}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5 text-brand" /> {t("Import into registry")}
          </DialogTitle>
          <DialogDescription>
            {step === "file" && t("Excel (.xlsx, .xls), CSV, PDF, AutoCAD DXF, JSON or text. Nothing is saved until you confirm.")}
            {step === "sheets" && t("{file}: choose which sheets to import.", { file: res?.fileName ?? "" })}
            {step === "config" && t("Tick the columns to keep and choose each column's format. Everything is imported as text unless you choose otherwise.")}
            {step === "review" && t("Check the result before anything is saved. The same ID on different sheets is one cable.")}
            {step === "run" && t("Importing…")}
            {step === "done" && t("Import finished")}
          </DialogDescription>
        </DialogHeader>

        {stepIdx < 4 && res && (
          <ol className="flex flex-wrap items-center gap-1.5 text-xs">
            {stepsUi
              .filter((s) => s.k !== "sheets" || res.sheets.length > 1)
              .map((s, i) => {
                const idx = ["file", "sheets", "config", "review"].indexOf(s.k);
                return (
                  <li key={s.k} className="flex items-center gap-1.5">
                    {i > 0 && <span className="h-px w-5 bg-border" />}
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 font-semibold",
                        idx === stepIdx ? "bg-ink text-white" : idx < stepIdx ? "bg-ok-soft text-ok" : "bg-muted text-sub",
                      )}
                    >
                      {idx < stepIdx && <CheckCircle2 className="h-3 w-3" />}
                      {s.label}
                    </span>
                  </li>
                );
              })}
          </ol>
        )}

        <input
          ref={moreRef}
          type="file"
          hidden
          multiple
          accept=".xlsx,.xls,.xlsm,.xlsb,.ods,.csv,.tsv"
          onChange={(e) => {
            onFile(e.target.files, true);
            e.target.value = "";
          }}
        />
        {/* ------------------------------- file ------------------------------- */}
        {step === "file" && (
          <div className="space-y-4">
            <input
              ref={fileRef}
              type="file"
              hidden
              multiple
              accept=".xlsx,.xls,.xlsm,.xlsb,.ods,.csv,.tsv,.pdf,.dxf,.dwg,.json,.txt"
              onChange={(e) => {
                onFile(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                onFile(e.dataTransfer.files);
              }}
              className={cn(
                "flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed bg-muted/40 px-6 py-12 text-center transition hover:border-brand hover:bg-brand-soft/40",
                drag && "border-brand bg-brand-soft/60",
              )}
            >
              {busy ? <Loader2 className="h-8 w-8 animate-spin text-brand" /> : <Upload className="h-8 w-8 text-brand" />}
              <div className="mt-3 font-bold text-ink">{busy ? t("Reading file…") : t("Drop files here or click to choose")}</div>
              {busy && readInfo && readInfo.total > 0 && (
                <div className="mt-3 w-full max-w-sm">
                  <Progress value={(readInfo.done / readInfo.total) * 100} className="h-1.5" />
                  <div className="tnum mt-1.5 truncate text-xs text-sub">
                    {t("Sheet {n} of {m}", { n: Math.min(readInfo.done + 1, readInfo.total), m: readInfo.total })}
                    {readInfo.sheet ? ` · ${readInfo.sheet}` : ""}
                  </div>
                </div>
              )}
              <div className="mt-1 text-sm text-sub">XLSX · XLS · CSV · PDF · DXF · JSON</div>
              <div className="mt-2 max-w-md text-xs text-sub">{t("You can pick several files at once — each one becomes its own sheet. Excel files bring all their tabs.")}</div>
            </button>
            <Field label={t("Cable ID prefix (for PDF / drawings, optional)")} hint={t("Helps the system find cable labels in drawings and PDFs, e.g. “C-”, “DC1-”, “FO-”. Leave empty for automatic detection.")}>
              <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} className="max-w-xs font-mono" placeholder="C-" />
            </Field>
          </div>
        )}

        {/* ------------------------------- sheets ------------------------------- */}
        {step === "sheets" && res && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-ink">{t("{n} sheets in the file", { n: sheets.length })}</span>
              <span className="text-sub">· {t("{n} selected", { n: sel.length })}</span>
              <div className="ml-auto flex gap-1">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => moreRef.current?.click()}>
                  {busy ? <Loader2 className="animate-spin" /> : <Upload />} {t("Add more files")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSel(sheets.map((s, i) => (s.rows.length ? i : -1)).filter((i) => i >= 0))}>
                  {t("Select all")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSel([])}>
                  {t("Select none")}
                </Button>
              </div>
            </div>
            <div className="max-h-[56vh] space-y-1.5 overflow-y-auto pr-1 scrollbar-thin">
              {sheets.map((s, i) => {
                const empty = !s.rows.length;
                const on = sel.includes(i);
                const c = cfg[i];
                const into = c && c.target !== "new" ? p.sheets.find((x) => x.id === c.target)?.name : null;
                return (
                  <div
                    key={i}
                    role="checkbox"
                    aria-checked={on}
                    aria-disabled={empty}
                    tabIndex={empty ? -1 : 0}
                    onClick={() => !empty && setSel(on ? sel.filter((x) => x !== i) : [...sel, i].sort((a, b) => a - b))}
                    onKeyDown={(e) => {
                      if (empty || (e.key !== " " && e.key !== "Enter")) return;
                      e.preventDefault();
                      setSel(on ? sel.filter((x) => x !== i) : [...sel, i].sort((a, b) => a - b));
                    }}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border bg-white p-3 transition",
                      empty ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-brand/50",
                      on && "border-brand/60 bg-brand-soft/30",
                    )}
                  >
                    <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded border", on ? "border-brand bg-brand text-white" : "bg-white")}>
                      {on && <CheckCircle2 className="h-3.5 w-3.5" />}
                    </span>
                    <FileSpreadsheet className="h-4 w-4 shrink-0 text-sub" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink">{s.name}</span>
                        {s.hidden && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-sub">
                            <EyeOff className="h-3 w-3" /> {t("Hidden in Excel")}
                          </span>
                        )}
                        {empty && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-sub">{t("Empty")}</span>}
                        {into && <span className="rounded-full bg-cat-soft px-2 py-0.5 text-[11px] font-semibold text-cat">→ {into}</span>}
                      </div>
                      {!empty && (
                        <div className="truncate text-xs text-sub">
                          {t("{n} rows", { n: s.rows.length })} · {t("{n} columns", { n: s.headers.length })} · {s.headers.slice(0, 6).join(", ")}
                          {s.headers.length > 6 ? "…" : ""}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between pt-1">
              <Button variant="outline" onClick={reset}>
                <ArrowLeft /> {t("Back")}
              </Button>
              <Button
                disabled={!sel.length}
                onClick={() => {
                  setActive(sel[0]);
                  setStep("config");
                }}
              >
                {t("Next")} <ArrowRight />
              </Button>
            </div>
          </div>
        )}

        {/* ------------------------------- config ------------------------------- */}
        {step === "config" && res && cur && curSheet && (
          <div className="space-y-4">
            {usedPrefs && (
              <div className="flex items-center gap-2 rounded-lg border border-cat/30 bg-cat-soft/50 px-3 py-2 text-[13px] text-cat">
                <Wand2 className="h-4 w-4 shrink-0" />
                {t("Settings from your previous import were applied to matching columns.")}
              </div>
            )}
            {sel.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {sel.map((i) => {
                  const st = plan?.per[i];
                  return (
                    <button
                      key={i}
                      onClick={() => setActive(i)}
                      className={cn(
                        "inline-flex items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition",
                        i === active ? "border-ink bg-ink text-white" : "bg-white text-ink hover:border-ink/40",
                      )}
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      {sheets[i].name}
                      <span className={cn("tnum text-[11px] font-medium", i === active ? "text-white/70" : "text-sub")}>{st?.rows ?? 0}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {res && sheets.length === 1 && /\.(csv|tsv|txt)$/i.test(res.fileName) && (
              <div className="flex flex-wrap items-start gap-2 rounded-xl border border-ok/25 bg-ok/5 px-3 py-2 text-[13px] text-ink">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">
                    {t("File read: {n} rows, {c} columns. Check the columns below, then press “Review import”.", { n: (sheets[active]?.rows.length ?? 0).toLocaleString(), c: sheets[active]?.headers.length ?? 0 })}
                  </div>
                  <div className="text-xs text-sub">{t("This CSV holds one tab only — Google Sheets and Excel save just the open tab to CSV. Add the other tabs' files, or download the whole workbook as Excel (.xlsx): File → Download → Microsoft Excel.")}</div>
                </div>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => moreRef.current?.click()}>
                  {busy ? <Loader2 className="animate-spin" /> : <Upload />} {t("Add more files")}
                </Button>
              </div>
            )}

            <div className="grid gap-3 rounded-xl border bg-muted/30 p-3 md:grid-cols-4">
              <Field label={t("Import into")}>
                <NativeSelect
                  value={cur.target}
                  onChange={(v) => setCur({ target: v })}
                >
                  <option value="new">{t("+ New sheet")}</option>
                  {p.sheets.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              {cur.target === "new" ? (
                <Field label={t("New sheet name")}>
                  <Input value={cur.newName} onChange={(e) => setCur({ newName: e.target.value })} />
                </Field>
              ) : (
                <div />
              )}
              <Field label={t("Header row")} hint={t("Row in Excel with the column names")}>
                <Input
                  type="number"
                  min={1}
                  value={curSheet.rowNums?.[curSheet.headerRow ?? 0] ?? (curSheet.headerRow ?? 0) + 1}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (n < 1) return;
                    const nums = res.sheets[active]?.rowNums;
                    if (!nums) return changeHeaderRow(active, n - 1);
                    const idx = nums.findIndex((x) => x >= n);
                    changeHeaderRow(active, idx < 0 ? nums.length - 1 : idx);
                  }}
                  className="tnum"
                  disabled={!res.sheets[active]?.grid}
                />
              </Field>
              <Field label={t("Which column is the cable ID?")}>
                <NativeSelect value={String(cur.idCol)} onChange={(v) => setCur({ idCol: Number(v) })} className="font-semibold">
                  {curSheet.headers.map((h, j) => (
                    <option key={j} value={j}>
                      {h}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>

            {plan?.per[active] && (
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-muted px-2.5 py-1 font-semibold text-ink">{t("{n} cables on this sheet", { n: plan.per[active].rows })}</span>
                {plan.per[active].dups > 0 && <span className="rounded-full bg-fiber-soft px-2.5 py-1 font-semibold text-fiber-deep">{t("{n} repeated IDs in file (merged)", { n: plan.per[active].dups })}</span>}
                {plan.per[active].noId > 0 && <span className="rounded-full bg-bad-soft px-2.5 py-1 font-semibold text-bad">{t("{n} rows without ID (skipped)", { n: plan.per[active].noId })}</span>}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[13px] font-semibold text-ink">{t("{n} of {m} columns kept", { n: keptCount, m: curSheet.headers.length - 1 })}</span>
              <Button size="sm" variant="outline" onClick={() => setAllCols(() => ({ keep: true }))}>
                {t("Select all")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAllCols(() => ({ keep: false }))}>
                {t("Select none")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAllCols((_, j) => ({ keep: curSheet.rows.some((r) => (r[j] ?? "").trim()) }))}>
                {t("Only columns with data")}
              </Button>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setAllCols((c) => (c.target === "new" ? { type: "text" } : {}))}>
                {t("All formats → Text")}
              </Button>
            </div>

            <div className="overflow-x-auto rounded-xl border bg-white scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/70 text-left text-xs text-sub">
                  <tr>
                    <th className="w-10 px-3 py-2">
                      <Checkbox
                        aria-label={t("Select all")}
                        checked={keptCount === curSheet.headers.length - 1 ? true : keptCount === 0 ? false : "indeterminate"}
                        onCheckedChange={(v) => setAllCols(() => ({ keep: v === true }))}
                      />
                    </th>
                    <th className="px-2 py-2 font-semibold">{t("File column")}</th>
                    <th className="px-2 py-2 font-semibold">{t("Sample")}</th>
                    <th className="px-2 py-2 font-semibold">{t("Goes to")}</th>
                    <th className="px-2 py-2 font-semibold">{t("Format")}</th>
                    <th className="px-2 py-2 font-semibold">{t("Progress")}</th>
                  </tr>
                </thead>
                <tbody>
                  {curSheet.headers.map((h, j) => {
                    const c = cur.cols[j];
                    const sample = curSheet.rows
                      .map((r) => r[j])
                      .filter(Boolean)
                      .slice(0, 3);
                    if (j === cur.idCol)
                      return (
                        <tr key={j} className="border-t bg-brand-soft/40">
                          <td className="px-3 py-2">
                            <Checkbox checked disabled aria-label={h} />
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 font-semibold">{h}</td>
                          <td className="max-w-[220px] truncate px-2 py-2 font-mono text-xs text-sub">{sample.join(" · ") || "—"}</td>
                          <td colSpan={3} className="px-2 py-2">
                            <span className="rounded-full bg-brand px-2.5 py-1 text-xs font-bold text-white">{t("Cable ID")}</span>
                            <span className="ml-2 text-xs text-sub">{t("Matched ignoring case, spaces and dashes")}</span>
                          </td>
                        </tr>
                      );
                    const eff = effective(c);
                    const bad = plan?.per[active]?.bad[j] ?? 0;
                    const hint = hints[j];
                    return (
                      <tr key={j} className={cn("border-t align-top transition", !c.keep && "bg-muted/30 text-sub")}>
                        <td className="px-3 py-2.5">
                          <Checkbox checked={c.keep} onCheckedChange={(v) => setCol(j, { keep: v === true })} aria-label={h} />
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5">
                          <button type="button" className={cn("text-left font-medium", c.keep ? "text-ink" : "text-sub line-through decoration-sub/40")} onClick={() => setCol(j, { keep: !c.keep })}>
                            {h}
                          </button>
                        </td>
                        <td className="max-w-[220px] px-2 py-2.5">
                          <div className="truncate font-mono text-xs text-sub">{sample.join(" · ") || "—"}</div>
                        </td>
                        <td className="px-2 py-1.5">
                          <div className={cn("flex min-w-[220px] flex-col gap-1", !c.keep && "pointer-events-none opacity-40")}>
                            <NativeSelect
                              className="h-8 text-xs"
                              value={c.target}
                              onChange={(v) => {
                                const ex = colById.get(v);
                                setCol(j, ex ? { target: v, name: ex.name, type: ex.type as ImportType, progress: !!ex.progress } : { target: "new", name: h });
                              }}
                            >
                              <option value="new">{t("+ New column")}</option>
                              {allCols.length > 0 && (
                                <optgroup label={t("Existing columns")}>
                                  {allCols.map((col) => (
                                    <option key={col.id} value={col.id}>
                                      {col.name}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </NativeSelect>
                            {c.target === "new" && <Input className="h-8 text-xs" value={c.name} placeholder={t("Column name")} onChange={(e) => setCol(j, { name: e.target.value })} />}
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <div className={cn("flex min-w-[170px] flex-col gap-1", !c.keep && "pointer-events-none opacity-40")}>
                            <NativeSelect className="h-8 text-xs" value={eff.type} disabled={!!eff.locked} onChange={(v) => setCol(j, { type: v as ImportType })}>
                              {TYPES.map((k) => (
                                <option key={k} value={k}>
                                  {t(TYPE_LABEL[k])}
                                </option>
                              ))}
                            </NativeSelect>
                            {eff.locked ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-sub">
                                <Lock className="h-3 w-3" /> {t("Format of “{name}”", { name: eff.locked.name })}
                              </span>
                            ) : hint && hint !== c.type ? (
                              <button type="button" onClick={() => setCol(j, { type: hint })} className="inline-flex items-center gap-1 text-left text-[11px] font-semibold text-cat hover:underline">
                                <Sparkles className="h-3 w-3" /> {t("Looks like: {type}", { type: t(TYPE_LABEL[hint]) })}
                              </button>
                            ) : null}
                            {c.keep && bad > 0 && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-bad">
                                <AlertTriangle className="h-3 w-3" /> {t("{n} values don't fit — kept as written", { n: bad })}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <div className={cn(!c.keep && "pointer-events-none opacity-40", eff.locked && "pointer-events-none opacity-60")}>
                            <ProgressToggle on={eff.progress} onChange={(v) => setCol(j, { progress: v })} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* live preview of what will land in the registry */}
            {keptCount > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-sub">{t("Preview")}</div>
                <div className="overflow-x-auto rounded-xl border bg-white scrollbar-thin">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/60 text-left text-sub">
                      <tr>
                        <th className="whitespace-nowrap px-3 py-1.5 font-semibold">{t("Cable ID")}</th>
                        {cur.cols.map((c, j) =>
                          j !== cur.idCol && c.keep ? (
                            <th key={j} className="whitespace-nowrap px-3 py-1.5 font-semibold">
                              {c.name || curSheet.headers[j]}
                              {effective(c).progress && <span className="ml-1 text-cat">●</span>}
                            </th>
                          ) : null,
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {curSheet.rows
                        .map((r, ri) => ({ r, ri }))
                        .filter(({ r }) => (r[cur.idCol] ?? "").trim())
                        .slice(0, 5)
                        .map(({ r, ri }) => (
                          <tr key={ri} className="border-t">
                            <td className="whitespace-nowrap px-3 py-1.5 font-mono font-semibold">{r[cur.idCol]}</td>
                            {cur.cols.map((c, j) => {
                              if (j === cur.idCol || !c.keep) return null;
                              const { v, bad } = convertValue(r[j] ?? "", curSheet.rawRows[ri]?.[j] ?? "", effective(c).type);
                              return (
                                <td key={j} className={cn("max-w-[180px] truncate whitespace-nowrap px-3 py-1.5", bad && "bg-bad-soft text-bad")}>
                                  {v || <span className="text-sub/50">—</span>}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-between gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (selIdx > 0) setActive(sel[selIdx - 1]);
                  else if (res.sheets.length > 1) setStep("sheets");
                  else reset();
                }}
              >
                <ArrowLeft /> {selIdx > 0 ? sheets[sel[selIdx - 1]].name : t("Back")}
              </Button>
              {selIdx < sel.length - 1 ? (
                <Button onClick={() => setActive(sel[selIdx + 1])}>
                  {t("Next sheet: {name}", { name: sheets[sel[selIdx + 1]].name })} <ArrowRight />
                </Button>
              ) : (
                <Button disabled={missingNames} onClick={() => setStep("review")}>
                  {t("Review import")} <ArrowRight />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------- review ------------------------------- */}
        {step === "review" && res && plan && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {[
                { n: opts.mode === "update" ? 0 : plan.neu, l: t("New cables"), c: "text-ok", muted: opts.mode === "update" },
                { n: opts.mode === "new" ? 0 : plan.upd, l: t("Will be updated"), c: "text-cat", muted: opts.mode === "new" },
                { n: plan.same, l: t("Already up to date"), c: "text-sub" },
                { n: plan.conflictN, l: t("Conflicting values"), c: plan.conflictN ? "text-fiber-deep" : "text-sub" },
              ].map((x) => (
                <div key={x.l} className={cn("rounded-xl border bg-white p-3", x.muted && "opacity-50")}>
                  <div className={cn("tnum text-2xl font-extrabold", x.c)}>{x.n.toLocaleString()}</div>
                  <div className="text-xs font-medium text-sub">{x.l}</div>
                </div>
              ))}
            </div>

            {plan.multi > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-cat/30 bg-cat-soft/50 px-3 py-2 text-[13px] text-cat">
                <Layers className="mt-0.5 h-4 w-4 shrink-0" />
                {t("{n} cables appear on several sheets — each becomes one cable with all its data.", { n: plan.multi })}
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border bg-white p-3">
                <div className="mb-2 text-[13px] font-bold text-ink">{t("What to do")}</div>
                {(
                  [
                    ["all", t("Add new cables and update existing ones")],
                    ["update", t("Only update cables already in the registry")],
                    ["new", t("Only add new cables, don't touch existing")],
                  ] as const
                ).map(([k, l]) => (
                  <label key={k} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
                    <input type="radio" name="imp-mode" className="accent-[#FF5A1F]" checked={opts.mode === k} onChange={() => setOpts({ ...opts, mode: k })} />
                    {l}
                  </label>
                ))}
                <div className="mt-2 space-y-1.5 border-t pt-2">
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <Checkbox className="mt-0.5" checked={opts.clearEmpty} onCheckedChange={(v) => setOpts({ ...opts, clearEmpty: v === true })} />
                    <span>
                      {t("Empty cells clear existing values")}
                      <span className="block text-xs text-sub">{t("Off: empty cells in the file leave the registry as it is.")}</span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <Checkbox className="mt-0.5" checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
                    <span>
                      {t("Remember these column settings")}
                      <span className="block text-xs text-sub">{t("Next time a file with the same columns is set up automatically.")}</span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border bg-white p-3 text-[13px]">
                <div>
                  <div className="mb-1 font-bold text-ink">{t("Sheets")}</div>
                  <ul className="space-y-0.5">
                    {sel.map((i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <span className="font-medium">{sheets[i].name}</span>
                        <ArrowRight className="h-3 w-3 text-sub" />
                        <span className={cfg[i].target === "new" ? "font-semibold text-ok" : "text-ink"}>
                          {cfg[i].target === "new" ? t("new sheet “{name}”", { name: cfg[i].newName }) : p.sheets.find((x) => x.id === cfg[i].target)?.name}
                        </span>
                        <span className="tnum ml-auto text-sub">{plan.per[i]?.rows ?? 0}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {newCols.length > 0 && (
                  <div>
                    <div className="mb-1 font-bold text-ink">{t("New columns ({n})", { n: newCols.length })}</div>
                    <div className="flex flex-wrap gap-1">
                      {newCols.map((c) => (
                        <span key={c.name} className={cn("rounded-full border px-2 py-0.5 text-xs", c.progress && "border-cat/40 bg-cat-soft text-cat")}>
                          {c.name} · {t(TYPE_LABEL[c.type])}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {plan.conflicts.length > 0 && (
              <div className="rounded-xl border border-fiber/50 bg-fiber-soft/40 p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold text-fiber-deep">
                  <AlertTriangle className="h-4 w-4" /> {t("Same cable, different values — the first value is kept")}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <tbody>
                      {plan.conflicts.map((c, k) => (
                        <tr key={k} className="border-t border-fiber/30 first:border-0">
                          <td className="whitespace-nowrap py-1 pr-3 font-mono font-semibold">{c.code}</td>
                          <td className="whitespace-nowrap py-1 pr-3 text-sub">{c.column}</td>
                          <td className="py-1 pr-3 font-semibold text-ink">{c.a}</td>
                          <td className="py-1 text-sub line-through">{c.b}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {plan.conflictN > plan.conflicts.length && <div className="pt-1 text-xs text-sub">{t("…and {n} more", { n: plan.conflictN - plan.conflicts.length })}</div>}
                </div>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("config")}>
                <ArrowLeft /> {t("Back")}
              </Button>
              <Button onClick={run} disabled={!plan.merged.size}>
                {t("Import {n} cables", { n: plan.merged.size.toLocaleString() })}
              </Button>
            </div>
          </div>
        )}

        {step === "run" && (
          <div className="space-y-3 py-8 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand" />
            <Progress value={progress} className="h-2" />
            <div className="tnum text-sm font-semibold">{progress}%</div>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4 py-4 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-ok" />
            <div className="text-lg font-bold">{t("{a} cables created, {b} updated", { a: summary.created, b: summary.updated })}</div>
            <div className="flex flex-wrap justify-center gap-2 text-xs">
              {summary.unchanged > 0 && <span className="rounded-full bg-muted px-2.5 py-1 font-semibold text-sub">{t("{n} already up to date", { n: summary.unchanged })}</span>}
              {summary.skipped > 0 && <span className="rounded-full bg-muted px-2.5 py-1 font-semibold text-sub">{t("{n} skipped", { n: summary.skipped })}</span>}
              {summary.cols > 0 && <span className="rounded-full bg-cat-soft px-2.5 py-1 font-semibold text-cat">{t("New columns ({n})", { n: summary.cols })}</span>}
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-sub">
              <AlertTriangle className="h-4 w-4 text-fiber-deep" />
              {t("Each imported change is recorded in the cable history.")}
            </div>
            <Button
              onClick={() => {
                onOpenChange(false);
                setTimeout(reset, 300);
              }}
            >
              {t("Open registry")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
