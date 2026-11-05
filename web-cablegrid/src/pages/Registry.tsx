import { AlertTriangle, ArrowLeft, ArrowRight, BookOpen, Columns3, Download, Link2, ListMinus, ListOrdered, MoreHorizontal, Palette, Pencil, Wrench, GitCompareArrows, Gauge, Tag, LayoutGrid, Plus, Redo2, Search, Trash2, Undo2, Upload, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { NativeSelect, PageHeader, useProject } from "@/components/common";
import { AddCableDialog } from "@/components/registry/AddCableDialog";
import { ColumnManager } from "@/components/registry/ColumnManager";
import { ImportWizard } from "@/components/registry/ImportWizard";
import { NewSheetDialog } from "@/components/registry/NewSheetDialog";
import { ProblemsPanel } from "@/components/registry/ProblemsPanel";
import { RelationsDialog } from "@/components/registry/RelationsDialog";
import { RulesDialog } from "@/components/registry/RulesDialog";
import { StageFlowDialog } from "@/components/registry/StageFlowDialog";
import { RevisionsDialog } from "@/components/registry/RevisionsDialog";
import { FlukeImport } from "@/components/registry/FlukeImport";
import { LabelsDialog, PortMapDialog } from "@/components/registry/PortTools";
import { FormatsDialog, GroupStrip, groupStats, ViewsMenu } from "@/components/registry/ViewTools";
import { notifyGate, RegistryTable, type SortKey } from "@/components/registry/RegistryTable";
import { SetupWizard } from "@/components/registry/SetupWizard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { codeParts, parseCableQuery, parseCodes } from "@/lib/cable-search";
import { findProblems, inList, linkedSheets, orphanCables, sheetList, type Problem } from "@/lib/auto";
import { exportRegistryXlsx } from "@/lib/backup";
import { cableState, openIssueMap, sheetStages, type CableState } from "@/lib/derive";
import { canDelete } from "@/lib/cloud";
import { useFmt, useT } from "@/lib/i18n";
import { closestCodes, normCode, textMatches, natCmp } from "@/lib/ids";
import { sheetDeleteImpact, useStore } from "@/lib/store";
import { editCells, redoStep, undoStep, useUndo } from "@/lib/undo";
import type { Cable, Project } from "@/lib/types";
import { cn } from "@/lib/utils";

const NameDialog = ({
  open,
  onOpenChange,
  title,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  initial: string;
  onSave: (v: string) => void;
}) => {
  const t = useT();
  const [v, setV] = useState(initial);
  useEffect(() => setV(initial), [initial, open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!v.trim()) return;
            onSave(v.trim());
            onOpenChange(false);
          }}
          className="space-y-4"
        >
          <Input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder={t("e.g. Fiber backbone")} />
          <DialogFooter>
            <Button type="submit" disabled={!v.trim()}>
              {t("Save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const BulkBar = ({ p, ids, sheetId, clear }: { p: Project; ids: string[]; sheetId: string; clear: () => void }) => {
  const t = useT();
  const { bulkAction, deleteCables, removeFromList } = useStore.getState();
  const [removeAsk, setRemoveAsk] = useState(false);
  const sheet = p.sheets.find((s) => s.id === sheetId)!;
  const [col, setCol] = useState("");
  const [val, setVal] = useState("");
  const [confirm, setConfirm] = useState(false);
  const dcols = sheet.columns;
  const c = dcols.find((x) => x.id === col);
  const markable = new Set(sheet.columns.filter((x) => x.progress && (x.type === "checkbox" || x.type === "date")).map((x) => x.id));
  const stages = sheetStages(p, sheet).filter((a) => markable.has(a.id));
  return (
    <div className="rise sticky bottom-3 z-30 mx-auto mt-3 flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-ink/10 bg-ink px-3 py-2.5 text-white shadow-2xl md:w-fit">
      <span className="px-1 text-sm font-semibold">{t("{n} selected", { n: ids.length })}</span>
      <span className="mx-1 hidden h-5 w-px bg-white/20 md:block" />
      {stages.length > 0 && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="secondary" className="h-8">
            {t("Mark stage")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {stages.map((a) => (
            <DropdownMenuItem
              key={a.id}
              onClick={() => {
                bulkAction(p.id, ids, a.id, true);
                notifyGate(t);
                toast.success(t("“{a}” marked on {n} cables", { a: t(a.name), n: ids.length }));
              }}
            >
              <span className="mr-2 h-2.5 w-2.5 rounded-full" style={{ background: a.color }} />
              {t(a.name)}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {stages.map((a) => (
            <DropdownMenuItem key={`u${a.id}`} onClick={() => {
              bulkAction(p.id, ids, a.id, false);
              notifyGate(t);
            }} className="text-sub">
              {t("Clear")} · {t(a.name)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      )}
      {dcols.length > 0 && (
        <div className="flex items-center gap-1.5">
          <select value={col} onChange={(e) => setCol(e.target.value)} className="h-8 rounded-md bg-white/10 px-2 text-sm text-white outline-none [&>option]:text-ink" aria-label={t("Column")}>
            <option value="">{t("Set value…")}</option>
            {dcols.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          {c && (
            <>
              {c.type === "select" ? (
                <select value={val} onChange={(e) => setVal(e.target.value)} className="h-8 rounded-md bg-white/10 px-2 text-sm text-white outline-none [&>option]:text-ink">
                  <option value="">—</option>
                  {(c.options ?? []).map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={val}
                  onChange={(e) => setVal(e.target.value)}
                  type={c.type === "number" ? "number" : c.type === "date" ? "date" : "text"}
                  className="h-8 w-32 rounded-md bg-white/10 px-2 text-sm text-white outline-none placeholder:text-white/40"
                  placeholder={t("Value")}
                />
              )}
              <Button
                size="sm"
                className="h-8"
                onClick={() => {
                  editCells(p.id, ids.map((id) => ({ cableId: id, colId: c.id, value: val.trim() })), "Bulk edit");
                  toast.success(t("Updated {n} cables", { n: ids.length }));
                  setVal("");
                  setCol("");
                }}
              >
                {t("Apply")}
              </Button>
            </>
          )}
        </div>
      )}
      <Button size="sm" variant="ghost" className="h-8 text-white hover:bg-white/10 hover:text-white" onClick={() => exportRegistryXlsx(p, new Set(ids))}>
        <Download className="h-4 w-4" /> {t("Export")}
      </Button>
      {linkedSheets(p, sheet).length > 0 || p.sheets.some((x) => sheetList(x) !== sheetList(sheet)) ? (
        <Button size="sm" variant="ghost" className="h-8 text-white hover:bg-white/10 hover:text-white" onClick={() => setRemoveAsk(true)} title={t("Remove from this sheet")}>
          <ListMinus className="h-4 w-4" /> {t("Remove from sheet")}
        </Button>
      ) : null}
      {canDelete(p) && (
        <Button size="sm" variant="ghost" className="h-8 text-[#FF8A8F] hover:bg-white/10 hover:text-[#FF8A8F]" onClick={() => setConfirm(true)}>
          <Trash2 className="h-4 w-4" /> {t("Delete")}
        </Button>
      )}
      <button onClick={clear} className="ml-auto grid h-8 w-8 place-items-center rounded-md hover:bg-white/10" aria-label={t("Clear selection")}>
        <X className="h-4 w-4" />
      </button>
      <AlertDialog open={removeAsk} onOpenChange={setRemoveAsk}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Remove {n} cables from “{s}”?", { n: ids.length, s: sheet.name })}</AlertDialogTitle>
            <AlertDialogDescription>
              {linkedSheets(p, sheet).length > 0
                ? t("This sheet shares its cables with {s}: they will be removed there too.", { s: linkedSheets(p, sheet).map((x) => x.name).join(", ") })
                : t("Cables stay on other sheets. A cable that is on no other sheet is deleted.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                removeFromList(p.id, ids, sheetList(sheet));
                clear();
              }}
            >
              {t("Remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Delete {n} cables?", { n: ids.length })}</AlertDialogTitle>
            <AlertDialogDescription>{t("Their values and history will be removed from every sheet. Make a backup first if unsure.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-bad hover:bg-bad/90"
              onClick={() => {
                deleteCables(p.id, ids);
                clear();
              }}
            >
              {t("Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const Registry = () => {
  const p = useProject()!;
  const t = useT();
  const canUndo = useUndo((u) => u.undo.length > 0);
  const canRedo = useUndo((u) => u.redo.length > 0);
  const f = useFmt();
  const [sp, setSp] = useSearchParams();
  const { renameSheet, deleteSheet, moveSheet, addBook, renameBook, deleteBook, moveBook, moveSheetToBook, addToList } = useStore.getState();

  const books = p.books ?? [];
  const urlSheet = p.sheets.find((s) => s.id === sp.get("s"));
  const urlBook = books.find((b) => b.id === sp.get("b"));
  const sheet = urlSheet ?? (urlBook ? p.sheets.find((s) => s.bookId === urlBook.id) : undefined) ?? (urlBook ? undefined : p.sheets[0]);
  const sheetId = sheet?.id;
  const bookId = sheet?.bookId ?? urlBook?.id ?? books[0]?.id;
  const book = books.find((b) => b.id === bookId);
  const bookSheets = p.sheets.filter((s) => (s.bookId ?? books[0]?.id) === bookId);
  const list = sheet ? sheetList(sheet) : "";
  const setSheet = (id: string) => {
    const n = new URLSearchParams(sp);
    n.set("s", id);
    n.delete("b");
    setSp(n, { replace: true });
  };
  const setBook = (id: string) => {
    const n = new URLSearchParams(sp);
    const first = p.sheets.find((s) => s.bookId === id);
    if (first) n.set("s", first.id);
    else n.delete("s");
    n.set("b", id);
    setSp(n, { replace: true });
  };

  const [q, setQ] = useState(sp.get("q") ?? "");
  const [stateF, setStateF] = useState<string>(sp.get("state") ?? "");
  const [colF, setColF] = useState(sp.get("col") ?? "");
  const [valF, setValF] = useState(sp.get("val") ?? "");
  const prevSheet = useRef(sheetId);
  const [sort, setSort] = useState<SortKey>(null);
  const [groupBy, setGroupBy] = useState(sp.get("g") ?? "");
  const [formatsOpen, setFormatsOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [colsOpen, setColsOpen] = useState(false);
  const [nameDlg, setNameDlg] = useState<null | "rename">(null);
  const [delSheet, setDelSheet] = useState(false);
  const [setupNew, setSetupNew] = useState(false);
  const [newSheet, setNewSheet] = useState<null | "copy" | "pick">(null);
  const [bookDlg, setBookDlg] = useState<null | "new" | "rename">(null);
  const [delBook, setDelBook] = useState(false);
  const [relOpen, setRelOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);
  const [tool, setTool] = useState<"" | "revisions" | "fluke" | "labels" | "ports">("");
  const [checksOpen, setChecksOpen] = useState(false);
  const [problems, setProblems] = useState<Problem[]>([]);
  // data checks run in the background, shortly after the data settles
  useEffect(() => {
    const h = setTimeout(() => setProblems(findProblems(p)), checksOpen ? 0 : 700);
    return () => clearTimeout(h);
  }, [p, checksOpen]);
  const orphans = useMemo(() => orphanCables(p), [p]);

  useEffect(() => {
    if (prevSheet.current === sheetId) return;
    prevSheet.current = sheetId;
    setColF("");
    setValF("");
    setSort(null);
    setGroupBy("");
  }, [sheetId]);

  const issues = useMemo(() => openIssueMap(p.issues), [p.issues]);
  // per-cable caches keyed by the (immutable) cable object: after an edit only the changed cable is recomputed
  const stateCache = useRef({ actions: p.actions, issues, map: new WeakMap<Cable, CableState>() });
  const listCables = useMemo(() => p.cables.filter((c) => inList(c, list)), [p.cables, list]);
  const states = useMemo(() => {
    const sc = stateCache.current;
    if (sc.actions !== p.actions || sc.issues !== issues) stateCache.current = { actions: p.actions, issues, map: new WeakMap() };
    const cache = stateCache.current.map;
    const m = new Map<string, CableState>();
    for (const c of listCables) {
      let st = cache.get(c);
      if (st === undefined) {
        st = cableState(c, p.actions, issues);
        cache.set(c, st);
      }
      m.set(c.id, st);
    }
    return m;
  }, [listCables, p.actions, issues]);
  const hayCache = useRef({ cols: null as unknown, map: new WeakMap<Cable, { low: string; norm: string[] }>() });

  const filterCol = sheet?.columns.find((c) => c.id === colF);
  const distinct = useMemo(() => {
    if (!colF) return [];
    const m = new Map<string, number>();
    for (const c of listCables) {
      const v = c.values[colF];
      if (v) m.set(v, (m.get(v) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => natCmp(a[0], b[0]));
  }, [listCables, colF]);

  // a pasted list of IDs (comma / semicolon / line separated) filters to exactly those cables
  const idList = useMemo(() => {
    if (!/[,;\n]/.test(q)) return null;
    const keys = new Set(listCables.map((c) => normCode(c.code)));
    const codes = parseCodes(q, keys);
    if (codes.length < 2) return null;
    return { keys: new Set(codes.map(normCode)), missing: codes.filter((c) => !keys.has(normCode(c))), total: codes.length };
  }, [q, listCables]);
  // a range like C-001..C-040 (also "C-001 - C-040", "C-001 to C-040") filters to IDs inside it
  const idRange = useMemo(() => {
    if (idList) return null;
    const r = parseCableQuery(q);
    return r.kind === "range" ? r : null;
  }, [q, idList]);
  const rows = useMemo(() => {
    if (!sheet) return [];
    const qq = q.trim();
    const ids = sheet.columns.map((c) => c.id);
    if (hayCache.current.cols !== sheet.columns) hayCache.current = { cols: sheet.columns, map: new WeakMap() };
    const hc = hayCache.current.map;
    const low = qq.toLowerCase();
    const nq = normCode(qq);
    const hay = (c: Cable) => {
      let h = hc.get(c);
      if (!h) {
        const vals = [c.code, ...ids.map((id) => c.values[id] ?? "")].filter(Boolean);
        h = { low: vals.join("\u0001").toLowerCase(), norm: vals.map(normCode) };
        hc.set(c, h);
      }
      return h;
    };
    let out = listCables.filter((c) => {
      if (stateF && states.get(c.id) !== stateF) return false;
      if (colF && valF && (c.values[colF] ?? "") !== valF) return false;
      if (idList) return idList.keys.has(normCode(c.code));
      if (idRange) {
        const cp = codeParts(c.code);
        return !!cp && cp[0] === idRange.prefix && cp[1] >= idRange.from && cp[1] <= idRange.to;
      }
      if (!qq) return true;
      const h = hay(c);
      if (h.low.includes(low)) return true;
      return nq.length > 1 && h.norm.some((x) => x.includes(nq));
    });
    if (sort) {
      const order: Record<CableState, number> = { issue: 0, none: 1, progress: 2, complete: 3 };
      const get = (c: (typeof out)[number]): string | number => {
        if (sort.key === "__code") return c.code;
        if (sort.key === "__state") return order[states.get(c.id) ?? "none"];
        if (sort.key.startsWith("__a:")) return c.done[sort.key.slice(4)] ?? "";
        const col = sheet.columns.find((x) => x.id === sort.key);
        const v = c.values[sort.key] ?? "";
        return col?.type === "number" ? Number(v) || 0 : v;
      };
      out = [...out].sort((a, b) => {
        const x = get(a);
        const y = get(b);
        const r = typeof x === "number" && typeof y === "number" ? x - y : natCmp(String(x), String(y));
        return r * sort.dir;
      });
    } else if (groupBy) {
      out = [...out].sort((a, b) => natCmp(a.values[groupBy] ?? "\uffff", b.values[groupBy] ?? "\uffff") || natCmp(a.code, b.code));
    } else {
      out = [...out].sort((a, b) => natCmp(a.code, b.code));
    }
    return out;
  }, [listCables, sheet, q, stateF, colF, valF, sort, states, idList, idRange, groupBy]);
  const groupCol = sheet?.columns.find((c) => c.id === groupBy);
  const sumCol = sheet?.columns.find((c) => c.type === "number" && /length|длин|longitud|метр/i.test(c.name)) ?? sheet?.columns.find((c) => c.type === "number");
  // totals per group, computed on the rows without the group's own value filter
  const groupRows = useMemo(() => {
    if (!groupCol) return [];
    if (colF !== groupCol.id || !valF) return rows;
    return listCables.filter((c) => !stateF || states.get(c.id) === stateF);
  }, [groupCol, rows, colF, valF, listCables, stateF, states]);
  const groups = useMemo(() => (groupCol ? groupStats(groupRows, groupCol.id, states, sumCol?.id) : []), [groupCol, groupRows, states, sumCol]);

  const counts = useMemo(() => {
    const c = { none: 0, progress: 0, complete: 0, issue: 0 };
    for (const s of states.values()) c[s]++;
    return c;
  }, [states]);

  const bookDialogs = (
    <>
    <NameDialog
      open={bookDlg !== null}
      onOpenChange={(o) => !o && setBookDlg(null)}
      title={bookDlg === "new" ? t("New book") : t("Rename book")}
      initial={bookDlg === "rename" ? (book?.name ?? "") : ""}
      onSave={(v) => {
        if (bookDlg === "new") setBook(addBook(p.id, v));
        else if (book) renameBook(p.id, book.id, v);
      }}
    />
    <AlertDialog open={delBook} onOpenChange={setDelBook}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("Delete book “{n}”?", { n: book?.name ?? "" })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("Its {n} sheets will be deleted.", { n: bookSheets.length })}{" "}
            {(() => {
              const n = delBook ? sheetDeleteImpact(p, bookSheets.map((s) => s.id)) : 0;
              return n ? t("{n} cables are on no other sheet and will be deleted.", { n: f.num(n) }) : t("All cables stay on other sheets.");
            })()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-bad hover:bg-bad/90"
            onClick={() => {
              if (!book) return;
              deleteBook(p.id, book.id);
              const rest = books.find((b) => b.id !== book.id);
              if (rest) setBook(rest.id);
            }}
          >
            {t("Delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );

  const bookBar = (
    <>
    {/* books */}
    <div className="flex items-center gap-1 overflow-x-auto border-b bg-ink px-2 py-1.5 scrollbar-thin">
      <BookOpen className="mx-1.5 h-4 w-4 shrink-0 text-white/50" />
      {books.map((b) => (
        <button
          key={b.id}
          onClick={() => setBook(b.id)}
          onDoubleClick={() => b.id === bookId && setBookDlg("rename")}
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold transition",
            b.id === bookId ? "bg-white text-ink" : "text-white/70 hover:bg-white/10 hover:text-white",
          )}
        >
          {b.name}
          <span className={cn("tnum text-[11px] font-normal", b.id === bookId ? "text-sub" : "text-white/40")}>{p.sheets.filter((s) => s.bookId === b.id).length}</span>
        </button>
      ))}
      <button onClick={() => setBookDlg("new")} className="flex h-8 shrink-0 items-center gap-1 rounded-md px-2.5 text-[13px] font-medium text-white/60 hover:bg-white/10 hover:text-white">
        <Plus className="h-3.5 w-3.5" /> {t("New book")}
      </button>
      {book && (
        <DropdownMenu>
          <DropdownMenuTrigger className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-md text-white/60 hover:bg-white/10 hover:text-white" aria-label={t("Book options")}>
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setBookDlg("rename")}>
              <Pencil className="mr-2 h-4 w-4" /> {t("Rename book")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => moveBook(p.id, book.id, -1)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> {t("Move left")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => moveBook(p.id, book.id, 1)}>
              <ArrowRight className="mr-2 h-4 w-4" /> {t("Move right")}
            </DropdownMenuItem>
            <DropdownMenuSeparator className={canDelete(p) ? "" : "hidden"} />
            <DropdownMenuItem className={canDelete(p) ? "text-bad focus:text-bad" : "hidden"} disabled={books.length < 2} onClick={() => setDelBook(true)}>
              <Trash2 className="mr-2 h-4 w-4" /> {t("Delete book")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
    </>
  );

  // an empty book (other books have sheets)
  if (!sheet && p.sheets.length > 0 && !setupNew) {
    return (
      <>
        <ImportWizard p={p} open={importOpen} onOpenChange={setImportOpen} onDone={(id) => setSheet(id)} bookId={bookId} />
        <PageHeader title={t("Cable registry")} subtitle={<>{p.name} · {book?.name}</>} />
        <div className="panel overflow-hidden">
          {bookBar}
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <div className="cable-line mb-5 h-1 w-40 rounded-full" />
            <div className="text-base font-bold text-ink">{t("This book has no sheets yet")}</div>
            <p className="mt-1 max-w-md text-sm text-sub">{t("A sheet can show the same cables as another sheet (linked by Cable ID) or keep its own list.")}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button onClick={() => setNewSheet("copy")}>
                <Plus className="h-4 w-4" /> {t("New sheet")}
              </Button>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" /> {t("Import")}
              </Button>
            </div>
          </div>
        </div>
        <NewSheetDialog p={p} open={newSheet !== null} onOpenChange={(o) => !o && setNewSheet(null)} bookId={bookId} initialMode={newSheet ?? "copy"} onCreated={setSheet} />
        {bookDialogs}
      </>
    );
  }

  // no sheets yet → setup
  if (!sheet || setupNew) {
    return (
      <>
        {/* first child in both branches, so the same wizard instance survives the empty → filled switch */}
        <ImportWizard p={p} open={importOpen} onOpenChange={setImportOpen} onDone={(id) => setSheet(id)} bookId={bookId} />
        {setupNew && (
          <button onClick={() => setSetupNew(false)} className="mb-1 inline-flex items-center gap-1 text-sm font-medium text-cat hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> {t("Back to registry")}
          </button>
        )}
        <SetupWizard
          key={setupNew ? "new" : "first"}
          p={p}
          startBuild={setupNew}
          onCreated={(id) => {
            setSetupNew(false);
            setSheet(id);
          }}
          onImport={() => {
            if (setupNew) {
              setSetupNew(false);
              return;
            }
            setImportOpen(true);
          }}
        />
      </>
    );
  }

  const chip = (v: string, label: string, n: number, dotCls: string) => (
    <button
      key={v}
      onClick={() => setStateF(stateF === v ? "" : v)}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition",
        stateF === v ? "border-ink bg-ink text-white" : "bg-white text-ink hover:border-ink/40",
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", dotCls)} />
      {label}
      <span className={cn("tnum text-xs", stateF === v ? "text-white/70" : "text-sub")}>{f.num(n)}</span>
    </button>
  );

  return (
    <>
      <ImportWizard p={p} open={importOpen} onOpenChange={setImportOpen} onDone={(id) => setSheet(id)} bookId={bookId} />
      <PageHeader
        title={t("Cable registry")}
        subtitle={
          <>
            {p.name} · {t("{n} cables total", { n: f.num(p.cables.length) })}
            {book && books.length > 1 ? ` · ${book.name}` : ""}
          </>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)} className="border-cat/40 text-cat hover:bg-cat-soft hover:text-cat">
              <Upload className="h-4 w-4" /> {t("Import")}
            </Button>
            <Button variant="outline" onClick={() => exportRegistryXlsx(p)} disabled={!p.cables.length}>
              <Download className="h-4 w-4" /> {t("Export Excel")}
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> {t("Add cable")}
            </Button>
          </>
        }
      />

      <div className="panel overflow-hidden">
        {bookBar}
        {/* sheet tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b bg-[#FAFBF9] px-3 pt-3 scrollbar-thin" role="tablist">
          {bookSheets.map((s) => (
            <div key={s.id} className="relative shrink-0">
              <button
                role="tab"
                aria-selected={s.id === sheet.id}
                onClick={() => setSheet(s.id)}
                onDoubleClick={() => s.id === sheet.id && setNameDlg("rename")}
                className={cn(
                  "flex h-10 items-center gap-2 rounded-t-lg border border-b-0 px-4 text-sm font-semibold transition",
                  s.id === sheet.id ? "border-brand/50 bg-white text-brand-deep shadow-[0_2px_0_0_#fff]" : "border-transparent text-sub hover:bg-white/70 hover:text-ink",
                )}
              >
                {s.id === sheet.id && <span className="h-2 w-2 rounded-full bg-brand" />}
                {s.name}
                {linkedSheets(p, s).length > 0 && (
                  <span title={t("Same cables as {s}", { s: linkedSheets(p, s).map((x) => x.name).join(", ") })}>
                    <Link2 className="h-3.5 w-3.5 text-cat" />
                  </span>
                )}
                <span className="tnum text-xs font-normal text-sub">{s.columns.length}</span>
              </button>
            </div>
          ))}
          <button
            onClick={() => setNewSheet("copy")}
            className="mb-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sub transition hover:bg-white hover:text-brand"
            aria-label={t("New sheet")}
            title={t("New sheet")}
          >
            <Plus className="h-4 w-4" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger className="mb-1 ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sub hover:bg-white hover:text-ink" aria-label={t("Sheet options")}>
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setNameDlg("rename")}>
                <Pencil className="mr-2 h-4 w-4" /> {t("Rename sheet")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setColsOpen(true)}>
                <Columns3 className="mr-2 h-4 w-4" /> {t("Manage columns")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setNewSheet("pick")}>
                <Plus className="mr-2 h-4 w-4" /> {t("New sheet with suggested columns")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRelOpen(true)}>
                <Link2 className="mr-2 h-4 w-4" /> {t("Sheet relations")}
              </DropdownMenuItem>
              {books.length > 1 &&
                books
                  .filter((b) => b.id !== bookId)
                  .map((b) => (
                    <DropdownMenuItem key={b.id} onClick={() => moveSheetToBook(p.id, sheet.id, b.id)}>
                      <BookOpen className="mr-2 h-4 w-4" /> {t("Move to “{b}”", { b: b.name })}
                    </DropdownMenuItem>
                  ))}
              <DropdownMenuItem onClick={() => moveSheet(p.id, sheet.id, -1)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> {t("Move left")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => moveSheet(p.id, sheet.id, 1)}>
                <ArrowRight className="mr-2 h-4 w-4" /> {t("Move right")}
              </DropdownMenuItem>
              <DropdownMenuSeparator className={canDelete(p) ? "" : "hidden"} />
              <DropdownMenuItem className={canDelete(p) ? "text-bad focus:text-bad" : "hidden"} onClick={() => setDelSheet(true)}>
                <Trash2 className="mr-2 h-4 w-4" /> {t("Delete sheet")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* toolbar */}
        <div className="flex flex-col gap-3 border-b p-3 md:p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="relative md:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sub" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onPaste={(e) => {
                  const txt = e.clipboardData.getData("text");
                  if (!/[\r\n\t]/.test(txt.trim())) return;
                  e.preventDefault();
                  setQ(txt.split(/[\r\n\t]+/).map((x) => x.trim()).filter(Boolean).join(", "));
                }}
                placeholder={t("ID, value, list or range C-001..C-040")}
                title={t("Paste a list of IDs (one per line or comma-separated) to see exactly those cables.")}
                className="h-10 pl-9 font-mono text-[13px]"
              />
              {q && (
                <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-sub hover:text-ink" aria-label={t("Clear")}>
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {sheet.columns.length > 0 && (
              <div className="flex gap-2">
                <NativeSelect value={colF} onChange={(v) => { setColF(v); setValF(""); }} className="md:w-44" aria-label={t("Filter by column")}>
                  <option value="">{t("Filter by column…")}</option>
                  {sheet.columns.filter((c) => c.type !== "checkbox").map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
                {filterCol && (
                  <NativeSelect value={valF} onChange={setValF} className="md:w-48" aria-label={filterCol.name}>
                    <option value="">{t("Any value")}</option>
                    {distinct.map(([v, n]) => (
                      <option key={v} value={v}>
                        {v} ({n})
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </div>
            )}
            <div className="flex gap-1 md:ml-auto">
              <Button variant="ghost" size="icon" disabled={!canUndo} onClick={() => undoStep(p.id)} title={`${t("Undo")} (Ctrl+Z)`} aria-label={t("Undo")}>
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" disabled={!canRedo} onClick={() => redoStep(p.id)} title={`${t("Redo")} (Ctrl+Shift+Z)`} aria-label={t("Redo")}>
                <Redo2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {sheet.columns.length > 0 && (
                <NativeSelect value={groupBy} onChange={setGroupBy} className="h-10 w-auto max-w-[170px]" aria-label={t("Group by")}>
                  <option value="">{t("Group by…")}</option>
                  {sheet.columns.filter((c) => c.type !== "checkbox" && c.type !== "date").map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
              <ViewsMenu
                p={p}
                sheet={sheet}
                current={{ q, state: stateF, colF, valF, groupBy, sort }}
                apply={(v) => {
                  setQ(v.q);
                  setStateF(v.state);
                  setColF(v.colF);
                  setValF(v.valF);
                  setGroupBy(v.groupBy);
                  setSort(v.sort as SortKey);
                }}
              />
              <Button variant="outline" size="icon" onClick={() => setFormatsOpen(true)} title={t("Row colours")} aria-label={t("Row colours")} className={cn((p.formats ?? []).length > 0 && "border-brand/50 text-brand-deep")}>
                <Palette className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={() => setColsOpen(true)}>
                <Columns3 className="h-4 w-4" /> {t("Columns")}
              </Button>
              <Button variant="outline" size="icon" onClick={() => setRelOpen(true)} title={t("Sheet relations")} aria-label={t("Sheet relations")}>
                <Link2 className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => setRulesOpen(true)} title={t("Rules")} aria-label={t("Rules")} className={cn((p.rules ?? []).some((x) => x.enabled) && "border-brand/50 text-brand-deep")}>
                <Wand2 className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => setFlowOpen(true)} title={t("Stage order")} aria-label={t("Stage order")} className={cn((p.stageFlow?.requirePrevious || p.stageFlow?.lockEarlier) && "border-cat/50 text-cat")}>
                <ListOrdered className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={() => setChecksOpen(true)} title={t("Data checks")} className={cn(problems.length > 0 && "border-bad/40 text-bad hover:text-bad")}>
                <AlertTriangle className="h-4 w-4" />
                <span className="tnum">{problems.length >= 2000 ? "2000+" : f.num(problems.length)}</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" title={t("Tools")} aria-label={t("Tools")}>
                    <Wrench className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuItem onClick={() => setTool("revisions")}>
                    <GitCompareArrows className="mr-2 h-4 w-4" /> {t("Revisions")}
                    {(p.revisions ?? []).length > 0 && <span className="tnum ml-auto text-xs text-sub">{(p.revisions ?? []).length}</span>}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setTool("fluke")}>
                    <Gauge className="mr-2 h-4 w-4" /> {t("Import Fluke test results")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTool("labels")}>
                    <Tag className="mr-2 h-4 w-4" /> {t("Print labels")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTool("ports")}>
                    <LayoutGrid className="mr-2 h-4 w-4" /> {t("Patch panel map")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {orphans.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-fiber/50 bg-fiber-soft px-3 py-2 text-[13px]">
              <span className="font-semibold text-fiber-deep">{t("{n} cables are on no sheet", { n: f.num(orphans.length) })}</span>
              <button
                className="ml-auto font-semibold text-ink hover:underline"
                onClick={() => {
                  addToList(p.id, orphans.map((c) => c.id), list);
                  toast.success(t("{n} cables added to “{s}”", { n: orphans.length, s: sheet.name }));
                }}
              >
                {t("Add to this sheet")}
              </button>
            </div>
          )}
          {idRange && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-cat/30 bg-cat-soft/50 px-3 py-2 text-[13px]">
              <span className="font-semibold text-cat">{t("Range {r}: {n} cables", { r: idRange.label, n: rows.length })}</span>
            </div>
          )}
          {idList && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-cat/30 bg-cat-soft/50 px-3 py-2 text-[13px]">
              <span className="font-semibold text-cat">{t("ID list: {n} found of {m}", { n: idList.total - idList.missing.length, m: idList.total })}</span>
              {idList.missing.length > 0 && (
                <span className="min-w-0 truncate text-sub">
                  {t("Not in registry: {ids}", { ids: idList.missing.slice(0, 8).join(", ") + (idList.missing.length > 8 ? "…" : "") })}
                </span>
              )}
              {idList.missing.length > 0 && (
                <button className="ml-auto font-semibold text-cat hover:underline" onClick={() => navigator.clipboard?.writeText(idList.missing.join("\n")).then(() => toast.success(t("Copied")))}>
                  {t("Copy missing IDs")}
                </button>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {chip("issue", t("Issue"), counts.issue, "bg-bad")}
            {chip("none", t("Not started"), counts.none, "bg-[#9AA6A0]")}
            {chip("progress", t("In progress"), counts.progress, "bg-cat")}
            {chip("complete", t("Complete"), counts.complete, "bg-ok")}
            {(stateF || q || valF) && (
              <button
                onClick={() => {
                  setStateF("");
                  setQ("");
                  setValF("");
                  setColF("");
                }}
                className="h-8 px-2 text-[13px] font-medium text-cat hover:underline"
              >
                {t("Reset filters")}
              </button>
            )}
            <span className="ml-auto self-center text-[13px] text-sub">{t("Showing {n} of {m}", { n: f.num(rows.length), m: f.num(listCables.length) })}</span>
          </div>
        </div>

        {groupCol && groups.length > 0 && (
          <GroupStrip
            stats={groups}
            col={groupCol}
            sumCol={sumCol}
            active={colF === groupCol.id ? valF : ""}
            onPick={(v) => {
              setColF(v || colF === groupCol.id ? groupCol.id : colF);
              setValF(v);
            }}
            onClose={() => setGroupBy("")}
          />
        )}
        {listCables.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <div className="cable-line mb-5 h-1 w-40 rounded-full" />
            <div className="text-base font-bold text-ink">{t("No cables yet")}</div>
            <p className="mt-1 max-w-md text-sm text-sub">{t("Add cables one by one, generate a numbered range, or import a spreadsheet, PDF or DXF drawing.")}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" /> {t("Add cable")}
              </Button>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" /> {t("Import")}
              </Button>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-sub">
            {t("No cables match these filters.")}
            {!idList && q.trim() && (() => {
              const near = closestCodes(listCables.map((c) => c.code), q);
              return near.length ? (
                <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                  <span>{t("Did you mean")}</span>
                  {near.map((c) => (
                    <button key={c} onClick={() => setQ(c)} className="rounded-full border bg-white px-2.5 py-0.5 font-mono text-xs font-semibold text-ink hover:border-brand hover:text-brand-deep">
                      {c}
                    </button>
                  ))}
                </div>
              ) : null;
            })()}
          </div>
        ) : (
          <RegistryTable p={p} sheet={sheet} rows={rows} states={states} selected={selected} setSelected={setSelected} sort={sort} setSort={setSort} />
        )}
      </div>

      {selected.size > 0 && <BulkBar p={p} ids={[...selected]} sheetId={sheet.id} clear={() => setSelected(new Set())} />}

      <AddCableDialog p={p} sheet={sheet} open={addOpen} onOpenChange={setAddOpen} />
      <NewSheetDialog p={p} open={newSheet !== null} onOpenChange={(o) => !o && setNewSheet(null)} bookId={bookId} from={sheet} initialMode={newSheet ?? "copy"} onCreated={setSheet} />
      <RelationsDialog p={p} open={relOpen} onOpenChange={setRelOpen} current={sheet} />
      <RulesDialog p={p} open={rulesOpen} onOpenChange={setRulesOpen} />
      <FormatsDialog p={p} open={formatsOpen} onOpenChange={setFormatsOpen} />
      <RevisionsDialog p={p} open={tool === "revisions"} onOpenChange={(o) => !o && setTool("")} />
      {sheet && (
        <>
          {tool === "fluke" && <FlukeImport p={p} sheet={sheet} cables={listCables} open={tool === "fluke"} onOpenChange={(o) => !o && setTool("")} />}
          {tool === "labels" && <LabelsDialog p={p} sheet={sheet} cables={selected.size ? rows.filter((c) => selected.has(c.id)) : rows} open={tool === "labels"} onOpenChange={(o) => !o && setTool("")} />}
          {tool === "ports" && <PortMapDialog p={p} sheet={sheet} cables={listCables} states={states} open={tool === "ports"} onOpenChange={(o) => !o && setTool("")} />}
        </>
      )}
      <StageFlowDialog p={p} open={flowOpen} onOpenChange={setFlowOpen} />
      <ProblemsPanel
        p={p}
        problems={problems}
        open={checksOpen}
        onOpenChange={setChecksOpen}
        onShow={(codes) => {
          setQ(codes.slice(0, 2000).join(", "));
          setChecksOpen(false);
        }}
        onAdoptOrphans={() => {
          addToList(p.id, orphans.map((c) => c.id), list);
          toast.success(t("{n} cables added to “{s}”", { n: orphans.length, s: sheet.name }));
        }}
      />
      {bookDialogs}
      <ColumnManager p={p} sheet={sheet} open={colsOpen} onOpenChange={setColsOpen} />
      <NameDialog
        open={nameDlg !== null}
        onOpenChange={(o) => !o && setNameDlg(null)}
        title={t("Rename sheet")}
        initial={sheet.name}
        onSave={(v) => renameSheet(p.id, sheet.id, v)}
      />
      <AlertDialog open={delSheet} onOpenChange={setDelSheet}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Delete sheet “{n}”?", { n: sheet.name })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Values stored only in this sheet's columns will be removed.")}{" "}
              {(() => {
                const n = delSheet ? sheetDeleteImpact(p, [sheet.id]) : 0;
                return n ? t("{n} cables are on no other sheet and will be deleted.", { n: f.num(n) }) : t("All cables stay on other sheets.");
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-bad hover:bg-bad/90" onClick={() => deleteSheet(p.id, sheet.id)}>
              {t("Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default Registry;
