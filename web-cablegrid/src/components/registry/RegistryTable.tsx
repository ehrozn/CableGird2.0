import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowRight, ArrowUp, ChevronRight, History, Link2, Lock, Sigma } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { CableStateBadge } from "@/components/common";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildGate, type Gate, matchCond } from "@/lib/auto";
import { colorOf } from "@/lib/tia";
import type { CableState } from "@/lib/derive";
import { fillSeries, parseClipboard, toClipboard } from "@/lib/fill";
import { useFmt, useT } from "@/lib/i18n";
import { convertValue } from "@/lib/importers";
import { gateReport, useStore } from "@/lib/store";
import type { Cable, Column, Project, Sheet, WorkAction } from "@/lib/types";
import { editCells, redoStep, undoStep } from "@/lib/undo";
import { cn } from "@/lib/utils";

export type SortKey = { key: string; dir: 1 | -1 } | null;

const ROW_H = 44;
const ID_W = 200;
const colWidth = (c: Column) => c.width ?? (c.type === "number" ? 110 : c.type === "date" ? 140 : c.type === "checkbox" ? 100 : 170);

type Move = "down" | "up" | "right" | "left" | null;

/** Read-only on this sheet: a lookup of another sheet's column, or a computed column. */
export const readOnlyCol = (c: Column) => !!c.locked || !!c.formula?.trim();

/** Toast after a write when the stage order refused some marks. */
export const notifyGate = (t: (k: string, v?: Record<string, string | number>) => string) => {
  if (!gateReport.blocked) return;
  toast.warning(t("Stage order: {n} change(s) skipped", { n: gateReport.blocked }), {
    description: gateReport.needs ? t("“{a}” needs “{b}” first.", { a: gateReport.stage, b: gateReport.needs }) : undefined,
  });
  gateReport.blocked = 0;
};

/** Normalise a typed / pasted value to the column type (keeps the text when it does not fit). */
const fitValue = (col: Column, raw: string): string => {
  const v = raw.trim();
  if (!v) return "";
  if (col.type === "number" || col.type === "date" || col.type === "checkbox") return convertValue(v, v, col.type).v;
  return v;
};

const InlineEditor = ({
  col,
  initial,
  seed,
  listId,
  onDone,
}: {
  col: Column;
  initial: string;
  seed?: string;
  listId?: string;
  onDone: (v: string | null, move: Move) => void;
}) => {
  const [v, setV] = useState(seed ?? initial);
  const done = useRef(false);
  const finish = (val: string | null, move: Move) => {
    if (done.current) return;
    done.current = true;
    onDone(val, move);
  };
  const keys = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      finish(v, e.shiftKey ? "up" : "down");
    } else if (e.key === "Tab") {
      e.preventDefault();
      finish(v, e.shiftKey ? "left" : "right");
    } else if (e.key === "Escape") finish(null, null);
  };
  const common = "h-full w-full bg-white px-2.5 text-sm outline-none ring-2 ring-inset ring-cat";
  if (col.type === "select")
    return (
      <select autoFocus className={common} value={v} onChange={(e) => finish(e.target.value, null)} onBlur={() => finish(v, null)} onKeyDown={keys}>
        <option value="">—</option>
        {(col.options ?? []).map((o) => o.trim()).filter(Boolean).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        {v && !(col.options ?? []).map((o) => o.trim()).includes(v) && <option value={v}>{v}</option>}
      </select>
    );
  return (
    <input
      autoFocus
      className={common}
      type={col.type === "number" ? "number" : col.type === "date" ? "date" : "text"}
      value={v}
      list={listId}
      autoComplete="off"
      onFocus={(e) => {
        // typed-in seed: caret at the end; F2 / double-click: select all
        if (seed === undefined) e.currentTarget.select?.();
      }}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => finish(v, null)}
      onKeyDown={keys}
    />
  );
};

interface RowProps {
  p: Project;
  r: number;
  cable: Cable;
  columns: Column[];
  stageById: Map<string, WorkAction>;
  state: CableState;
  selected: boolean;
  toggleSel: (id: string) => void;
  grid: string;
  top: number;
  /** [c0, c1] of the selected range on this row, or null */
  rangeC: string | null;
  activeC: number;
  editC: number;
  editSeed?: string;
  handleC: number;
  fillC: string | null;
  units: string;
  onEditDone: (r: number, c: number, v: string | null, move: Move) => void;
  onToggle: (r: number, c: number, on: boolean) => void;
  listFor: (col: Column) => string | undefined;
  gate: Gate;
  /** conditional formatting colour */
  tint?: string;
}

const Row = memo(function Row(props: RowProps) {
  const { p, r, cable, columns, stageById, state, selected, toggleSel, grid, top, rangeC, activeC, editC, editSeed, handleC, fillC, units, onEditDone, onToggle, listFor, gate, tint } = props;
  const f = useFmt();
  const t = useT();
  const issue = state === "issue";
  const [c0, c1] = rangeC ? rangeC.split(":").map(Number) : [-1, -2];
  const [f0, f1] = fillC ? fillC.split(":").map(Number) : [-1, -2];
  return (
    <div
      role="row"
      className={cn(
        "group absolute left-0 grid min-w-full border-b text-sm transition-colors",
        issue ? "bg-bad-soft/70 hover:bg-bad-soft" : selected ? "bg-brand-soft/50" : "bg-white hover:bg-[#F7F9F5]",
      )}
      style={{ transform: `translateY(${top}px)`, gridTemplateColumns: grid, height: ROW_H, ...(tint && !issue && !selected ? { background: `${tint}1F` } : null) }}
    >
      <div
        className={cn("sticky left-0 z-10 flex items-center gap-2.5 border-r px-3", issue ? "bg-bad-soft" : selected ? "bg-brand-soft" : "bg-white group-hover:bg-[#F7F9F5]")}
        style={tint ? { boxShadow: `inset 4px 0 0 ${tint}` } : undefined}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={() => toggleSel(cable.id)}
          className="h-4 w-4 shrink-0 cursor-pointer accent-[#FF5A1F]"
          aria-label={cable.code}
        />
        <Link to={`/p/${p.id}/registry/cable/${cable.id}`} className={cn("truncate font-mono text-[13px] font-semibold hover:underline", issue ? "text-bad" : "text-cat")}>
          {cable.code}
        </Link>
      </div>
      {columns.map((c, ci) => {
        const v = cable.values[c.id] ?? "";
        const stage = c.progress ? stageById.get(c.id) : undefined;
        const inRange = ci >= c0 && ci <= c1;
        const inFill = ci >= f0 && ci <= f1;
        const active = ci === activeC;
        const cellCls = cn(
          "relative flex min-w-0 select-none items-center px-3",
          inRange && !active && "bg-cat/[0.08]",
          inFill && "bg-cat/[0.05] outline-dashed outline-1 -outline-offset-1 outline-cat/60",
          active && "z-[1] bg-white outline outline-2 -outline-offset-2 outline-cat",
        );
        const handle = ci === handleC && (
          <span
            data-fill-handle
            title={t("Drag to fill · double-click to fill down")}
            className="absolute -bottom-[4px] -right-[4px] z-[2] h-[9px] w-[9px] cursor-crosshair rounded-[2px] border-[1.5px] border-white bg-cat shadow"
          />
        );
        if (ci === editC)
          return (
            <div key={c.id} className="relative" data-r={r} data-c={ci}>
              <InlineEditor col={c} initial={v} seed={editSeed} listId={listFor(c)} onDone={(nv, move) => onEditDone(r, ci, nv, move)} />
            </div>
          );
        if (c.type === "checkbox") {
          const checked = v === "yes" || v === "true" || v === "1";
          const blocker = c.progress && gate.active ? gate.block(cable.values, c.id, !checked) : null;
          const ro = readOnlyCol(c) || !!blocker;
          return (
            <div key={c.id} className={cellCls} data-r={r} data-c={ci} style={{ scrollMarginLeft: ID_W }} title={blocker ? t("Needs “{b}” first", { b: gate.names.get(blocker) ?? "" }) : undefined}>
              <input
                type="checkbox"
                className={cn("h-4 w-4", ro ? "cursor-not-allowed opacity-35" : "cursor-pointer")}
                style={{ accentColor: stage?.color ?? "#1F9D63" }}
                checked={checked}
                disabled={ro}
                onChange={(e) => onToggle(r, ci, e.target.checked)}
                aria-label={c.name}
              />
              {blocker && <Lock className="ml-1.5 h-3 w-3 text-sub/60" />}
              {handle}
            </div>
          );
        }
        return (
          <div
            key={c.id}
            className={cn(cellCls, "cursor-cell text-ink/90", c.type === "number" && "tnum", readOnlyCol(c) && !active && !inRange && "bg-[#F7F8F5] text-ink/70", v === "#ERR" && "text-bad")}
            data-r={r}
            data-c={ci}
            title={v}
            style={{ scrollMarginLeft: ID_W }}
          >
            <span className="truncate">
              {stage && v ? <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: stage.color }} /> : null}
              {!stage && c.type !== "number" && c.type !== "date" && colorOf(v) ? (
                <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full border border-black/15 align-middle" style={{ background: colorOf(v)! }} />
              ) : null}
              {v ? (c.type === "date" ? f.date(v) : v) : <span className="text-sub/40">—</span>}
              {v && c.type === "number" && /length|длин|longitud/i.test(c.name) ? ` ${units}` : ""}
            </span>
            {handle}
          </div>
        );
      })}
      <div className="flex items-center px-3">
        <CableStateBadge state={state} />
      </div>
      <Link to={`/p/${p.id}/registry/cable/${cable.id}`} className="flex items-center justify-center text-sub hover:text-brand" aria-label={t("Open")}>
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
});

interface Range {
  /** active (anchor) cell */
  r: number;
  c: number;
  /** other corner */
  r2: number;
  c2: number;
}

const norm = (s: Range) => ({ r0: Math.min(s.r, s.r2), r1: Math.max(s.r, s.r2), c0: Math.min(s.c, s.c2), c1: Math.max(s.c, s.c2) });

export const RegistryTable = ({
  p,
  sheet,
  rows,
  states,
  selected,
  setSelected,
  sort,
  setSort,
}: {
  p: Project;
  sheet: Sheet;
  rows: Cable[];
  states: Map<string, CableState>;
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  sort: SortKey;
  setSort: (s: SortKey) => void;
}) => {
  const t = useT();
  const parentRef = useRef<HTMLDivElement>(null);
  const cols = sheet.columns;
  const [range, setRange] = useState<Range | null>(null);
  const [editing, setEditing] = useState<{ r: number; c: number; seed?: string } | null>(null);
  const [fillTo, setFillTo] = useState<number | null>(null);
  const drag = useRef<"select" | "fill" | null>(null);
  const [hist, setHist] = useState<{ cable: Cable; col: Column } | null>(null);
  const stageById = useMemo(() => new Map(p.actions.map((a) => [a.id, a] as const)), [p.actions]);
  const gate = useMemo(() => buildGate(p), [p.sheets, p.stageFlow]); // eslint-disable-line react-hooks/exhaustive-deps
  const fmts = useMemo(() => (p.formats ?? []).filter((x) => x.when.field).map((x) => ({ color: x.color, test: matchCond(x.when) })), [p.formats]);
  const linked = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of p.sheets) if (s.id !== sheet.id) for (const c of s.columns) m.set(c.id, (m.get(c.id) ?? 0) + 1);
    return m;
  }, [p.sheets, sheet.id]);
  const grid = [`${ID_W}px`, ...cols.map((c) => `${colWidth(c)}px`), "140px", "44px"].join(" ");

  const v = useVirtualizer({ count: rows.length, getScrollElement: () => parentRef.current, estimateSize: () => ROW_H, overscan: 12 });

  // keep the selection inside the table when rows / columns change
  useEffect(() => {
    setRange((s) => {
      if (!s) return s;
      const maxR = rows.length - 1;
      const maxC = cols.length - 1;
      if (maxR < 0 || maxC < 0) return null;
      const cl = (x: number, m: number) => Math.max(0, Math.min(x, m));
      return { r: cl(s.r, maxR), c: cl(s.c, maxC), r2: cl(s.r2, maxR), c2: cl(s.c2, maxC) };
    });
  }, [rows.length, cols.length]);

  /* ---------- autocomplete lists: distinct values of the column across the project, most used first ---------- */
  const lists = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of cols) {
      if (c.type !== "text" && c.type !== "number") continue;
      const cnt = new Map<string, number>();
      for (const cab of p.cables) {
        const x = cab.values[c.id];
        if (x) cnt.set(x, (cnt.get(x) ?? 0) + 1);
      }
      if (cnt.size) m.set(c.id, [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 300).map(([x]) => x));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, editing === null]);
  const listFor = useCallback((c: Column) => (lists.has(c.id) ? `cg-list-${c.id}` : undefined), [lists]);

  const toggleSel = useCallback(
    (id: string) => {
      const n = new Set(selected);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      setSelected(n);
    },
    [selected, setSelected],
  );
  const allSel = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const focusGrid = () => parentRef.current?.focus({ preventScroll: true });

  const reveal = useCallback(
    (r: number, c: number) => {
      v.scrollToIndex(r, { align: "auto" });
      requestAnimationFrame(() => parentRef.current?.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" }));
    },
    [v],
  );

  const moveTo = (r: number, c: number, extend = false) => {
    const R = Math.max(0, Math.min(r, rows.length - 1));
    const C = Math.max(0, Math.min(c, cols.length - 1));
    setRange((s) => (extend && s ? { ...s, r2: R, c2: C } : { r: R, c: C, r2: R, c2: C }));
    reveal(R, C);
  };

  /* ---------- writing ---------- */
  const write = (edits: { r: number; c: number; value: string }[], label: string) => {
    const list = edits
      .filter((e) => rows[e.r] && cols[e.c] && !readOnlyCol(cols[e.c]))
      .map((e) => ({ cableId: rows[e.r].id, colId: cols[e.c].id, value: fitValue(cols[e.c], e.value) }));
    const ch = editCells(p.id, list, label);
    notifyGate(t);
    return ch;
  };

  const onEditDone = useCallback(
    (r: number, c: number, val: string | null, move: Move) => {
      setEditing(null);
      if (val !== null) write([{ r, c, value: val }], "Edit");
      if (move) {
        const d = { down: [1, 0], up: [-1, 0], right: [0, 1], left: [0, -1] }[move];
        moveTo(r + d[0], c + d[1]);
      }
      focusGrid();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, cols, p.id],
  );

  const onToggle = useCallback(
    (r: number, c: number, on: boolean) => {
      write([{ r, c, value: on ? "yes" : "no" }], "Edit");
      setRange({ r, c, r2: r, c2: c });
      focusGrid();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, cols, p.id],
  );

  const doFill = (rTo: number, copy: boolean) => {
    if (!range) return;
    const { r0, r1, c0, c1 } = norm(range);
    if (rTo <= r1) return;
    const n = rTo - r1;
    const edits: { r: number; c: number; value: string }[] = [];
    for (let c = c0; c <= c1; c++) {
      const src: string[] = [];
      for (let r = r0; r <= r1; r++) src.push(rows[r].values[cols[c].id] ?? "");
      const out = fillSeries(src, n, copy || cols[c].type === "checkbox" || cols[c].type === "select");
      out.forEach((val, i) => edits.push({ r: r1 + 1 + i, c, value: val }));
    }
    const ch = write(edits, "Fill");
    setRange({ r: r0, c: c0, r2: rTo, c2: c1 });
    if (ch.length)
      toast.success(t("Filled {n} cells", { n: ch.length }), {
        action: { label: t("Undo"), onClick: () => undoStep(p.id) },
      });
  };

  /* ---------- mouse ---------- */
  const cellAt = (el: EventTarget | null): [number, number] | null => {
    const cell = (el as HTMLElement | null)?.closest?.("[data-c]") as HTMLElement | null;
    if (!cell) return null;
    return [Number(cell.dataset.r), Number(cell.dataset.c)];
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("input,select,a,button")) return;
    if (target.closest("[data-fill-handle]")) {
      e.preventDefault();
      drag.current = "fill";
      setFillTo(range ? norm(range).r1 : null);
      return;
    }
    const at = cellAt(target);
    if (!at) return;
    e.preventDefault();
    focusGrid();
    if (editing) setEditing(null);
    if (e.shiftKey && range) setRange({ ...range, r2: at[0], c2: at[1] });
    else setRange({ r: at[0], c: at[1], r2: at[0], c2: at[1] });
    drag.current = "select";
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag.current) return;
    const el = parentRef.current;
    if (el) {
      const b = el.getBoundingClientRect();
      if (e.clientY > b.bottom - 36) el.scrollTop += 24;
      else if (e.clientY < b.top + 60) el.scrollTop -= 24;
    }
    const at = cellAt(document.elementFromPoint(e.clientX, e.clientY));
    if (!at) return;
    if (drag.current === "select") setRange((s) => (s ? { ...s, r2: at[0], c2: at[1] } : s));
    else if (range) setFillTo(Math.max(norm(range).r1, at[0]));
  };

  useEffect(() => {
    const up = (e: MouseEvent) => {
      if (drag.current === "fill" && fillTo !== null) doFill(fillTo, e.altKey);
      drag.current = null;
      setFillTo(null);
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  });

  const onDoubleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-fill-handle]") && range) {
      // fill down through the empty cells right below the selection
      const { r1, c0, c1 } = norm(range);
      let end = r1;
      while (end + 1 < rows.length) {
        const next = rows[end + 1];
        let empty = true;
        for (let c = c0; c <= c1; c++) if (next.values[cols[c].id]) empty = false;
        if (!empty) break;
        end++;
      }
      if (end > r1) doFill(end, e.altKey);
      return;
    }
    if (target.closest("input,select,a,button")) return;
    const at = cellAt(target);
    if (at && cols[at[1]].type !== "checkbox" && !readOnlyCol(cols[at[1]])) setEditing({ r: at[0], c: at[1] });
  };

  /* ---------- keyboard ---------- */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing || !range) return;
    const mod = e.ctrlKey || e.metaKey;
    const { r0, r1, c0, c1 } = norm(range);
    const k = e.key;
    const arrows: Record<string, [number, number]> = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] };
    if (arrows[k]) {
      e.preventDefault();
      const [dr, dc] = arrows[k];
      const base = e.shiftKey ? { r: range.r2, c: range.c2 } : { r: range.r, c: range.c };
      const jump = mod ? (dr ? (dr > 0 ? rows.length : -rows.length) : dc > 0 ? cols.length : -cols.length) : 0;
      moveTo(base.r + (jump && dr ? jump : dr), base.c + (jump && dc ? jump : dc), e.shiftKey);
      return;
    }
    if (k === "Tab") {
      e.preventDefault();
      moveTo(range.r, range.c + (e.shiftKey ? -1 : 1));
      return;
    }
    if (k === "Home" || k === "End") {
      e.preventDefault();
      moveTo(mod ? (k === "Home" ? 0 : rows.length - 1) : range.r, k === "Home" ? 0 : cols.length - 1, e.shiftKey);
      return;
    }
    if (k === "PageDown" || k === "PageUp") {
      e.preventDefault();
      const page = Math.max(1, Math.floor((parentRef.current?.clientHeight ?? 400) / ROW_H) - 2);
      moveTo(range.r + (k === "PageDown" ? page : -page), range.c, e.shiftKey);
      return;
    }
    if (k === "Escape") {
      setRange({ r: range.r, c: range.c, r2: range.r, c2: range.c });
      return;
    }
    if (mod && (k === "z" || k === "Z" || k === "я" || k === "Я")) {
      e.preventDefault();
      const s = e.shiftKey ? redoStep(p.id) : undoStep(p.id);
      if (!s) toast(e.shiftKey ? t("Nothing to redo") : t("Nothing to undo"));
      return;
    }
    if (mod && (k === "y" || k === "н")) {
      e.preventDefault();
      if (!redoStep(p.id)) toast(t("Nothing to redo"));
      return;
    }
    if (mod && (k === "a" || k === "ф")) {
      e.preventDefault();
      setRange({ r: 0, c: 0, r2: rows.length - 1, c2: cols.length - 1 });
      return;
    }
    if (mod && (k === "d" || k === "в")) {
      // Ctrl+D: copy the top row of the selection down
      e.preventDefault();
      if (r1 > r0) {
        const edits: { r: number; c: number; value: string }[] = [];
        for (let c = c0; c <= c1; c++) for (let r = r0 + 1; r <= r1; r++) edits.push({ r, c, value: rows[r0].values[cols[c].id] ?? "" });
        write(edits, "Fill down");
      }
      return;
    }
    if (k === "Delete" || k === "Backspace") {
      e.preventDefault();
      const edits: { r: number; c: number; value: string }[] = [];
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) edits.push({ r, c, value: "" });
      const ch = write(edits, "Clear");
      if (ch.length > 1) toast(t("Cleared {n} cells", { n: ch.length }), { action: { label: t("Undo"), onClick: () => undoStep(p.id) } });
      return;
    }
    const col = cols[range.c];
    if (!col) return;
    if (k === " " && col.type === "checkbox") {
      e.preventDefault();
      const cur = rows[range.r].values[col.id];
      const on = !(cur === "yes" || cur === "true" || cur === "1");
      const edits: { r: number; c: number; value: string }[] = [];
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (cols[c].type === "checkbox") edits.push({ r, c, value: on ? "yes" : "no" });
      write(edits, "Edit");
      return;
    }
    if (k === "Enter" || k === "F2") {
      e.preventDefault();
      if (col.type !== "checkbox" && !readOnlyCol(col)) setEditing({ r: range.r, c: range.c });
      return;
    }
    if (k.length === 1 && !mod && !e.altKey && col.type !== "checkbox" && !readOnlyCol(col)) {
      e.preventDefault();
      setRange({ r: range.r, c: range.c, r2: range.r, c2: range.c });
      setEditing({ r: range.r, c: range.c, seed: col.type === "select" || col.type === "date" ? undefined : k });
    }
  };

  /* ---------- clipboard ---------- */
  const selectionGrid = () => {
    if (!range) return [];
    const { r0, r1, c0, c1 } = norm(range);
    const g: string[][] = [];
    for (let r = r0; r <= r1; r++) {
      const line: string[] = [];
      for (let c = c0; c <= c1; c++) line.push(rows[r].values[cols[c].id] ?? "");
      g.push(line);
    }
    return g;
  };
  const onCopy = (e: React.ClipboardEvent) => {
    if (editing || !range) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", toClipboard(selectionGrid()));
    const { r0, r1, c0, c1 } = norm(range);
    const n = (r1 - r0 + 1) * (c1 - c0 + 1);
    if (n > 1) toast(t("Copied {n} cells", { n }));
  };
  const onCut = (e: React.ClipboardEvent) => {
    if (editing || !range) return;
    onCopy(e);
    const { r0, r1, c0, c1 } = norm(range);
    const edits: { r: number; c: number; value: string }[] = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) edits.push({ r, c, value: "" });
    write(edits, "Cut");
  };
  const onPaste = (e: React.ClipboardEvent) => {
    if (editing || !range) return;
    const g = parseClipboard(e.clipboardData.getData("text/plain"));
    if (!g.length) return;
    e.preventDefault();
    const { r0, r1, c0, c1 } = norm(range);
    const edits: { r: number; c: number; value: string }[] = [];
    let cut = false;
    if (g.length === 1 && g[0].length === 1) {
      // one value → whole selection
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) edits.push({ r, c, value: g[0][0] });
    } else {
      // a block repeats to fill a bigger selection when it divides evenly (like Excel)
      const H = (r1 - r0 + 1) % g.length === 0 && r1 > r0 ? r1 - r0 + 1 : g.length;
      const W = Math.max(...g.map((x) => x.length));
      const WW = (c1 - c0 + 1) % W === 0 && c1 > c0 ? c1 - c0 + 1 : W;
      for (let i = 0; i < H; i++)
        for (let j = 0; j < WW; j++) {
          const r = r0 + i;
          const c = c0 + j;
          if (r >= rows.length || c >= cols.length) {
            cut = true;
            continue;
          }
          edits.push({ r, c, value: g[i % g.length][j % W] ?? "" });
        }
      setRange({ r: r0, c: c0, r2: Math.min(rows.length - 1, r0 + H - 1), c2: Math.min(cols.length - 1, c0 + WW - 1) });
    }
    const ch = write(edits, "Paste");
    toast.success(t("Pasted {n} cells", { n: ch.length }), {
      description: cut ? t("Part of the copied block did not fit the table and was skipped.") : undefined,
      action: ch.length ? { label: t("Undo"), onClick: () => undoStep(p.id) } : undefined,
    });
  };

  const Head = ({ k, children, className }: { k: string; children: React.ReactNode; className?: string }) => (
    <button
      type="button"
      onClick={() => setSort(sort?.key === k ? (sort.dir === 1 ? { key: k, dir: -1 } : null) : { key: k, dir: 1 })}
      className={cn("flex items-center gap-1 truncate px-3 text-left font-semibold hover:text-ink", className)}
    >
      <span className="truncate">{children}</span>
      {sort?.key === k && (sort.dir === 1 ? <ArrowUp className="h-3 w-3 shrink-0 text-brand" /> : <ArrowDown className="h-3 w-3 shrink-0 text-brand" />)}
    </button>
  );

  const nr = range ? norm(range) : null;
  const sizeLabel = nr && (nr.r1 > nr.r0 || nr.c1 > nr.c0) ? `${nr.r1 - nr.r0 + 1} × ${nr.c1 - nr.c0 + 1}` : null;

  return (
    <div className="relative">
      <div
        ref={parentRef}
        tabIndex={0}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => {
          const at = cellAt(e.target);
          if (!at || !rows[at[0]] || !cols[at[1]]) return;
          e.preventDefault();
          setRange({ r: at[0], c: at[1], r2: at[0], c2: at[1] });
          setHist({ cable: rows[at[0]], col: cols[at[1]] });
        }}
        onKeyDown={onKeyDown}
        onCopy={onCopy}
        onCut={onCut}
        onPaste={onPaste}
        onFocus={() => !range && rows.length && cols.length && setRange({ r: 0, c: 0, r2: 0, c2: 0 })}
        className="relative h-[calc(100dvh-362px)] min-h-[380px] overflow-auto outline-none scrollbar-thin"
        role="grid"
        aria-label={sheet.name}
      >
        <div className="sticky top-0 z-20 grid min-w-full border-b bg-[#F5F7F3] text-[12.5px] text-sub" style={{ gridTemplateColumns: grid, height: 42, width: "max-content" }} role="row">
          <div className="sticky left-0 z-10 flex items-center gap-2.5 border-r bg-[#F5F7F3] px-3">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer accent-[#FF5A1F]"
              checked={allSel}
              onChange={() => setSelected(allSel ? new Set() : new Set(rows.map((r) => r.id)))}
              aria-label={t("Select all")}
            />
            <Head k="__code" className="px-0">
              {t("Cable ID")}
            </Head>
          </div>
          {cols.map((c, ci) => {
            const a = c.progress ? stageById.get(c.id) : undefined;
            const hl = nr && ci >= nr.c0 && ci <= nr.c1;
            return (
              <Head key={c.id} k={c.id} className={hl ? "bg-cat/[0.07] text-ink" : undefined}>
                {a && <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: a.color }} />}
                {c.formula ? <Sigma className="mr-1 inline h-3 w-3 text-fiber-deep" /> : c.locked ? <Lock className="mr-1 inline h-3 w-3" /> : linked.get(c.id) ? <Link2 className="mr-1 inline h-3 w-3 text-cat" /> : null}
                {c.name}
              </Head>
            );
          })}
          <Head k="__state">{t("Status")}</Head>
          <div />
        </div>
        <div className="relative" style={{ height: v.getTotalSize(), width: "max-content", minWidth: "100%" }}>
          {v.getVirtualItems().map((vi) => {
            const r = vi.index;
            const c = rows[r];
            const inR = nr && r >= nr.r0 && r <= nr.r1;
            const fillRow = fillTo !== null && nr && r > nr.r1 && r <= fillTo;
            return (
              <Row
                key={c.id}
                p={p}
                r={r}
                cable={c}
                columns={cols}
                stageById={stageById}
                state={states.get(c.id) ?? "none"}
                selected={selected.has(c.id)}
                toggleSel={toggleSel}
                grid={grid}
                top={vi.start}
                rangeC={inR ? `${nr.c0}:${nr.c1}` : null}
                activeC={range && range.r === r ? range.c : -1}
                editC={editing && editing.r === r ? editing.c : -1}
                editSeed={editing && editing.r === r ? editing.seed : undefined}
                handleC={nr && r === (fillTo ?? nr.r1) && !editing ? nr.c1 : -1}
                fillC={fillRow ? `${nr.c0}:${nr.c1}` : null}
                units={p.units}
                onEditDone={onEditDone}
                onToggle={onToggle}
                listFor={listFor}
                gate={gate}
                tint={fmts.length ? fmts.find((x) => x.test(c))?.color : undefined}
              />
            );
          })}
        </div>
        {[...lists.entries()].map(([id, vals]) =>
          editing && cols[editing.c]?.id === id ? (
            <datalist key={id} id={`cg-list-${id}`}>
              {vals.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          ) : null,
        )}
      </div>
      <div className="pointer-events-none flex h-8 items-center gap-3 border-t bg-[#F5F7F3] px-3 text-[11.5px] text-sub">
        {sizeLabel ? (
          <span className="tnum font-semibold text-cat">{t("{n} selected", { n: sizeLabel })}</span>
        ) : nr ? (
          <span className="tnum font-mono">
            {rows[nr.r0]?.code} · {cols[nr.c0]?.name}
          </span>
        ) : null}
        <span className="ml-auto hidden truncate md:inline">{t("Arrows move · Enter edits · drag the corner to fill · Ctrl+C / Ctrl+V with Excel · Ctrl+Z undo · right-click: cell history")}</span>
      </div>
      <CellHistory p={p} target={hist} onClose={() => setHist(null)} />
    </div>
  );
};

/** Every recorded change of one cell, newest first. */
const CellHistory = ({ p, target, onClose }: { p: Project; target: { cable: Cable; col: Column } | null; onClose: () => void }) => {
  const t = useT();
  const f = useFmt();
  // read the live cable so the list reflects edits made after opening
  const cable = target ? (p.cables.find((c) => c.id === target.cable.id) ?? target.cable) : null;
  const items = useMemo(() => {
    if (!cable || !target) return [];
    const out: { at: string; by: string; from: string; to: string; note?: string }[] = [];
    for (const h of cable.history)
      for (const ch of h.changes ?? []) if (ch.column === target.col.name) out.push({ at: h.at, by: h.employee || h.by, from: ch.from, to: ch.to, note: h.note });
    return out;
  }, [cable, target]);
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-brand" />
            <span className="font-mono">{cable?.code}</span> · {target?.col.name}
          </DialogTitle>
          <DialogDescription>
            {t("Now")}: <span className="font-semibold text-ink">{(cable && target && cable.values[target.col.id]) || "—"}</span>
          </DialogDescription>
        </DialogHeader>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-sub">{t("No changes recorded for this cell yet.")}</p>
        ) : (
          <ol className="max-h-[50vh] space-y-2 overflow-y-auto scrollbar-thin">
            {items.map((x, i) => (
              <li key={i} className="rounded-lg border bg-[#FAFBF9] px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sub line-through decoration-sub/50">{x.from || "∅"}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-sub" />
                  <span className="truncate font-semibold text-ink">{x.to || "∅"}</span>
                </div>
                <div className="mt-0.5 text-xs text-sub">
                  {f.dateTime(x.at)} · {t(x.by)}
                  {x.note ? ` · ${x.note}` : ""}
                </div>
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
};
