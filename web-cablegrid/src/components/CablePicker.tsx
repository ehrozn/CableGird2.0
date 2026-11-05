// Finding and picking cables from the registry — the same tool everywhere:
// search by ID or any value, paste a list, type a range (C-001..C-040), filter by status, list or any column.
import { Check, ChevronDown, ListFilter, Plus, Search, X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { searchCables } from "@/lib/cable-search";
import { cableState, lastAction, openIssueMap, uniqueColumns } from "@/lib/derive";
import { useT } from "@/lib/i18n";
import { cleanCode, closestCodes, natCmp, normCode, textMatches } from "@/lib/ids";
import type { Cable, Column, Project } from "@/lib/types";
import { cn } from "@/lib/utils";

type ColFilter = { colId: string; values: string[] };
const STATE_DOT: Record<string, string> = { issue: "bg-bad", none: "bg-[#9AA6A0]", progress: "bg-cat", complete: "bg-ok" };
const PAGE = 120;

/* ------------------------------------------------------------------ column value filter */

const ValueFilter = ({ col, cables, f, onChange, onRemove }: { col: Column; cables: Cable[]; f: ColFilter; onChange: (v: string[]) => void; onRemove: () => void }) => {
  const t = useT();
  const [open, setOpen] = useState(!f.values.length);
  const [q, setQ] = useState("");
  const values = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cables) {
      const v = (c.values[col.id] ?? "").trim();
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => (a[0] ? (b[0] ? natCmp(a[0], b[0]) : -1) : 1));
  }, [cables, col.id]);
  const shown = q ? values.filter(([v]) => textMatches(v, q)) : values;
  const label = f.values.length === 0 ? t("any") : f.values.length === 1 ? f.values[0] || t("(empty)") : t("{n} values", { n: f.values.length });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <span className={cn("inline-flex h-8 items-center rounded-full border text-[13px]", f.values.length ? "border-cat bg-cat-soft text-cat" : "bg-white")}>
        <PopoverTrigger asChild>
          <button type="button" className="inline-flex h-full max-w-[240px] items-center gap-1 pl-3 pr-1.5 font-semibold">
            <span className="truncate">{col.name}:</span>
            <span className="truncate font-normal">{label}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
          </button>
        </PopoverTrigger>
        <button type="button" onClick={onRemove} className="mr-1 grid h-6 w-6 place-items-center rounded-full hover:bg-black/5" aria-label={t("Remove filter")}>
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="border-b p-2">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Find a value…")} className="h-8 w-full rounded-md border px-2 text-sm outline-none focus:border-cat" />
        </div>
        <div className="scrollbar-thin max-h-64 overflow-y-auto py-1">
          {shown.length === 0 && <div className="px-3 py-4 text-center text-sm text-sub">{t("Nothing found")}</div>}
          {shown.map(([v, n]) => {
            const on = f.values.includes(v);
            return (
              <button
                key={v || "__empty"}
                type="button"
                onClick={() => onChange(on ? f.values.filter((x) => x !== v) : [...f.values, v])}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
              >
                <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded border", on ? "border-cat bg-cat text-white" : "bg-white")}>{on && <Check className="h-3 w-3" strokeWidth={3} />}</span>
                <span className={cn("flex-1 truncate", !v && "italic text-sub")}>{v || t("(empty)")}</span>
                <span className="tnum text-xs text-sub">{n}</span>
              </button>
            );
          })}
        </div>
        {f.values.length > 0 && (
          <div className="flex justify-between border-t px-3 py-2 text-[13px]">
            <button type="button" className="text-sub hover:text-ink" onClick={() => onChange([])}>
              {t("Clear")}
            </button>
            <button type="button" className="font-semibold text-cat" onClick={() => setOpen(false)}>
              {t("Done")}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

/* ------------------------------------------------------------------ browser */

export interface CableBrowserProps {
  p: Project;
  /** selected cable IDs (as stored) */
  value: string[];
  onChange: (codes: string[]) => void;
  single?: boolean;
  /** limit to these cables (e.g. what a client may see) */
  cables?: Cable[];
  columns?: Column[];
  autoFocus?: boolean;
  /** rendered under the list when pasted IDs are not in the registry */
  renderMissing?: (missing: string[], clear: () => void) => ReactNode;
  listClassName?: string;
  initialQuery?: string;
}

/** Search + filters + a checklist of cables. Works inline or inside the picker dialog. */
export const CableBrowser = ({ p, value, onChange, single, cables: only, columns, autoFocus, renderMissing, listClassName, initialQuery }: CableBrowserProps) => {
  const t = useT();
  const all = only ?? p.cables;
  const cols = useMemo(() => (columns ?? uniqueColumns(p)).filter((c) => !c.formula), [columns, p]);
  const dataCols = useMemo(() => cols.filter((c) => !c.progress), [cols]);
  const filterable = useMemo(() => cols.filter((c) => all.some((cab) => (cab.values[c.id] ?? "").trim())), [cols, all]);
  const issues = useMemo(() => openIssueMap(p.issues), [p.issues]);
  const lists = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of p.sheets) {
      const id = s.listId ?? "main";
      if (!m.has(id)) m.set(id, s.name);
    }
    return [...m.entries()];
  }, [p.sheets]);

  const [q, setQ] = useState(initialQuery ?? "");
  const [state, setState] = useState("");
  const [list, setList] = useState("");
  const [filters, setFilters] = useState<ColFilter[]>([]);
  const [onlySel, setOnlySel] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const sel = useMemo(() => new Set(value.map(normCode)), [value]);
  const known = useMemo(() => new Set(all.map((c) => normCode(c.code))), [all]);

  const filtered = useMemo(
    () =>
      all.filter((c) => {
        if (onlySel && !sel.has(normCode(c.code))) return false;
        if (list && !(c.lists ?? ["main"]).includes(list)) return false;
        if (state) {
          if (state.startsWith("done:")) {
            if (!c.done[state.slice(5)]) return false;
          } else if (state.startsWith("todo:")) {
            if (c.done[state.slice(5)]) return false;
          } else if (cableState(c, p.actions, issues) !== state) return false;
        }
        for (const f of filters) if (f.values.length && !f.values.includes((c.values[f.colId] ?? "").trim())) return false;
        return true;
      }),
    [all, onlySel, sel, list, state, filters, p.actions, issues],
  );
  const res = useMemo(() => searchCables(filtered, q, known), [filtered, q, known]);
  useEffect(() => setLimit(PAGE), [q, state, list, filters, onlySel]);
  const hits = res.hits;
  const near = useMemo(
    () => (res.query.kind === "text" && !hits.length ? closestCodes(all.map((c) => c.code), res.query.text) : []),
    [res.query, hits.length, all],
  );
  const allHitsOn = hits.length > 0 && hits.every((c) => sel.has(normCode(c.code)));

  const toggle = (code: string) => {
    const k = normCode(code);
    if (single) return onChange(sel.has(k) ? [] : [code]);
    onChange(sel.has(k) ? value.filter((x) => normCode(x) !== k) : [...value, code]);
  };
  const addMany = (codes: string[]) => {
    const have = new Set(sel);
    const out = [...value];
    for (const c of codes) {
      const k = normCode(c);
      if (!have.has(k)) {
        have.add(k);
        out.push(c);
      }
    }
    onChange(out);
  };
  const removeMany = (codes: string[]) => {
    const drop = new Set(codes.map(normCode));
    onChange(value.filter((x) => !drop.has(normCode(x))));
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && q) {
      e.stopPropagation();
      setQ("");
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (single) {
      if (hits[0]) onChange([hits[0].code]);
      return;
    }
    if (res.query.kind === "list" || res.query.kind === "range") {
      addMany(hits.map((c) => c.code));
      if (!res.missing.length) setQ("");
    } else if (hits.length === 1 || (hits[0] && normCode(hits[0].code) === normCode(q))) {
      addMany([hits[0].code]);
      setQ("");
    }
  };
  const active = !!(state || list || filters.some((f) => f.values.length) || onlySel);

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sub" />
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder={t("ID, any value, a list of IDs or a range C-001..C-040")}
          className="h-10 w-full rounded-lg border bg-white pl-9 pr-9 font-mono text-sm outline-none transition focus:border-cat focus:ring-2 focus:ring-cat/15"
          aria-label={t("Find cables")}
        />
        {q && (
          <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded hover:bg-muted" aria-label={t("Clear")}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={state}
          onChange={(e) => setState(e.target.value)}
          className={cn("h-8 max-w-[220px] rounded-full border px-3 text-[13px] font-semibold", state ? "border-cat bg-cat-soft text-cat" : "bg-white")}
          aria-label={t("Status")}
        >
          <option value="">{t("Any status")}</option>
          <option value="none">{t("Not started")}</option>
          <option value="progress">{t("In progress")}</option>
          <option value="complete">{t("Complete")}</option>
          <option value="issue">{t("Issue")}</option>
          {p.actions.map((a) => (
            <optgroup key={a.id} label={t(a.name)}>
              <option value={`done:${a.id}`}>{t("{s}: done", { s: t(a.name) })}</option>
              <option value={`todo:${a.id}`}>{t("{s}: not done", { s: t(a.name) })}</option>
            </optgroup>
          ))}
        </select>
        {lists.length > 1 && (
          <select
            value={list}
            onChange={(e) => setList(e.target.value)}
            className={cn("h-8 max-w-[200px] rounded-full border px-3 text-[13px] font-semibold", list ? "border-cat bg-cat-soft text-cat" : "bg-white")}
            aria-label={t("Cable list")}
          >
            <option value="">{t("All lists")}</option>
            {lists.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}
        {filters.map((f, i) => {
          const col = cols.find((c) => c.id === f.colId);
          return col ? (
            <ValueFilter
              key={f.colId}
              col={col}
              cables={all}
              f={f}
              onChange={(values) => setFilters(filters.map((x, j) => (j === i ? { ...x, values } : x)))}
              onRemove={() => setFilters(filters.filter((_, j) => j !== i))}
            />
          ) : null;
        })}
        {filterable.some((c) => !filters.some((f) => f.colId === c.id)) && (
          <label className="relative inline-flex h-8 cursor-pointer items-center gap-1 rounded-full border border-dashed bg-white px-3 text-[13px] font-semibold text-sub hover:border-ink/40 hover:text-ink">
            <ListFilter className="h-3.5 w-3.5" /> {t("Filter by column")}
            <select
              value=""
              onChange={(e) => e.target.value && setFilters([...filters, { colId: e.target.value, values: [] }])}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label={t("Filter by column")}
            >
              <option value="">{t("Filter by column")}</option>
              {filterable
                .filter((c) => !filters.some((f) => f.colId === c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        {!single && value.length > 0 && (
          <button
            type="button"
            onClick={() => setOnlySel(!onlySel)}
            className={cn("h-8 rounded-full border px-3 text-[13px] font-semibold", onlySel ? "border-brand bg-brand-soft text-brand-deep" : "bg-white text-sub hover:text-ink")}
          >
            {t("Selected only")} ({value.length})
          </button>
        )}
        {active && (
          <button
            type="button"
            onClick={() => {
              setState("");
              setList("");
              setFilters([]);
              setOnlySel(false);
            }}
            className="h-8 px-2 text-[13px] text-sub hover:text-ink"
          >
            {t("Reset filters")}
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-white">
        <div className="flex items-center justify-between gap-2 border-b bg-[#F6F8F5] px-3 py-2 text-[13px]">
          <span className="text-sub">
            {res.query.kind === "range" && <b className="mr-1 font-mono text-ink">{res.query.label}</b>}
            {t("{n} found", { n: hits.length })}
            {res.missing.length > 0 && <span className="ml-1 text-bad">· {t("{n} not in the registry", { n: res.missing.length })}</span>}
          </span>
          {!single && hits.length > 0 && (
            <button type="button" className="font-semibold text-cat hover:underline" onClick={() => (allHitsOn ? removeMany(hits.map((c) => c.code)) : addMany(hits.map((c) => c.code)))}>
              {allHitsOn ? t("Unselect these {n}", { n: hits.length }) : t("Select all {n}", { n: hits.length })}
            </button>
          )}
        </div>
        <div className={cn("scrollbar-thin min-h-0 flex-1 overflow-y-auto", listClassName ?? "max-h-[46dvh]")}>
          {hits.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-sub">
              {all.length === 0 ? t("The registry is empty") : t("No cables match")}
              {near.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                  <span>{t("Did you mean")}</span>
                  {near.map((c) => (
                    <button key={c} type="button" onClick={() => setQ(c)} className="rounded-full border bg-white px-2.5 py-0.5 font-mono text-xs font-semibold text-ink hover:border-cat hover:text-cat">
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            hits.slice(0, limit).map((c) => {
              const on = sel.has(normCode(c.code));
              const st = cableState(c, p.actions, issues);
              const la = lastAction(c, p.actions);
              const info = dataCols
                .map((col) => c.values[col.id])
                .filter(Boolean)
                .slice(0, 4)
                .join(" · ");
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.code)}
                  className={cn("flex w-full items-center gap-3 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted", on && "bg-brand-soft/60 hover:bg-brand-soft")}
                >
                  <span className={cn("grid h-5 w-5 shrink-0 place-items-center border", single ? "rounded-full" : "rounded", on ? "border-brand bg-brand text-white" : "bg-white")}>
                    {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                  <span className="w-32 shrink-0 truncate font-mono font-semibold">{c.code}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-sub">{info}</span>
                  <span className="hidden shrink-0 items-center gap-1.5 text-xs text-sub sm:inline-flex">
                    <span className={cn("h-2 w-2 rounded-full", STATE_DOT[st])} />
                    {la ? t(la.name) : t("Not started")}
                  </span>
                </button>
              );
            })
          )}
          {hits.length > limit && (
            <button type="button" onClick={() => setLimit(limit + PAGE * 2)} className="w-full py-2.5 text-[13px] font-semibold text-cat hover:bg-muted">
              {t("Show more ({n} left)", { n: hits.length - limit })}
            </button>
          )}
        </div>
      </div>
      {res.missing.length > 0 &&
        (renderMissing ? (
          renderMissing(res.missing, () => setQ(""))
        ) : (
          <p className="text-[13px] text-bad">{t("Not in the registry: {ids}", { ids: res.missing.slice(0, 8).join(", ") + (res.missing.length > 8 ? "…" : "") })}</p>
        ))}
    </div>
  );
};

/* ------------------------------------------------------------------ dialog */

export const CablePickerDialog = ({
  open,
  onOpenChange,
  p,
  value,
  onApply,
  single,
  title,
  cables,
  initialQuery,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  p: Project;
  value: string[];
  onApply: (codes: string[]) => void;
  single?: boolean;
  title?: string;
  cables?: Cable[];
  initialQuery?: string;
}) => {
  const t = useT();
  const [draft, setDraft] = useState<string[]>(value);
  useEffect(() => {
    if (open) setDraft(value);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] max-w-3xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle>{title ?? (single ? t("Choose a cable") : t("Choose cables"))}</DialogTitle>
          <DialogDescription>{t("Search, paste a list of IDs or type a range. Narrow down with filters.")}</DialogDescription>
        </DialogHeader>
        <CableBrowser
          p={p}
          value={draft}
          cables={cables}
          single={single}
          autoFocus
          initialQuery={initialQuery}
          onChange={(codes) => {
            if (single) {
              onApply(codes);
              onOpenChange(false);
            } else setDraft(codes);
          }}
        />
        {!single && (
          <DialogFooter className="items-center gap-2 sm:justify-between">
            <span className="text-sm text-sub">
              {t("{n} selected", { n: draft.length })}
              {draft.length > 0 && (
                <button type="button" onClick={() => setDraft([])} className="ml-2 font-semibold text-sub underline-offset-2 hover:text-ink hover:underline">
                  {t("Clear")}
                </button>
              )}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("Cancel")}
              </Button>
              <Button
                onClick={() => {
                  onApply(draft);
                  onOpenChange(false);
                }}
              >
                {t("Done")}
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

/* ------------------------------------------------------------------ field */

/** Inline field: chips of chosen cables, type-ahead search, paste a list or a range, and a "Browse" button. */
export const CableSelectField = ({
  p,
  value,
  onChange,
  single,
  allowUnknown = true,
  cables,
  placeholder,
}: {
  p: Project;
  value: string[];
  onChange: (codes: string[]) => void;
  single?: boolean;
  /** keep IDs that are not in the registry (shown dashed) */
  allowUnknown?: boolean;
  cables?: Cable[];
  placeholder?: string;
}) => {
  const t = useT();
  const all = cables ?? p.cables;
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const [hi, setHi] = useState(0);
  const [browse, setBrowse] = useState(false);
  const [browseQ, setBrowseQ] = useState("");
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const known = useMemo(() => new Map(all.map((c) => [normCode(c.code), c])), [all]);
  const knownSet = useMemo(() => new Set(known.keys()), [known]);
  const sel = useMemo(() => new Set(value.map(normCode)), [value]);
  const res = useMemo(() => (q.trim() ? searchCables(all, q, knownSet) : null), [all, q, knownSet]);
  const sugg = useMemo(() => (res ? res.hits.filter((c) => !sel.has(normCode(c.code))) : []), [res, sel]);
  const bulk = res && (res.query.kind === "list" || res.query.kind === "range");
  useEffect(() => setHi(0), [q]);

  const add = (codes: string[]) => {
    if (single) {
      onChange(codes.slice(0, 1));
      setQ("");
      return;
    }
    const out = [...value];
    const have = new Set(sel);
    for (const c of codes) {
      const k = normCode(c);
      if (k && !have.has(k)) {
        have.add(k);
        out.push(c);
      }
    }
    onChange(out);
    setQ("");
  };
  const commit = () => {
    if (!res) return;
    if (bulk) {
      add([...res.hits.map((c) => c.code), ...(allowUnknown ? res.missing.map(cleanCode) : [])]);
      return;
    }
    const pick = sugg[hi];
    if (pick) return add([pick.code]);
    const exact = known.get(normCode(q));
    if (exact) return add([exact.code]);
    if (allowUnknown && q.trim()) add([cleanCode(q)]);
  };
  const remove = (code: string) => onChange(value.filter((x) => x !== code));
  const SHOW = 14;
  const chips = expanded ? value : value.slice(0, SHOW);
  const open = focus && !!res;

  return (
    <div className="relative">
      <div
        className={cn("flex min-h-10 flex-wrap items-center gap-1 rounded-md border bg-white px-1.5 py-1 transition", focus && "border-cat ring-2 ring-cat/15")}
        onClick={() => inputRef.current?.focus()}
      >
        {chips.map((c) => {
          const real = known.has(normCode(c));
          return (
            <span
              key={c}
              title={real ? undefined : t("Not in the registry")}
              className={cn(
                "inline-flex items-center gap-0.5 rounded-md border py-0.5 pl-1.5 pr-0.5 font-mono text-[12px] font-semibold",
                real ? "border-cat/25 bg-cat-soft text-cat" : "border-dashed border-sub/50 bg-white text-sub",
              )}
            >
              {c}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(c);
                }}
                className="rounded p-0.5 hover:bg-black/5"
                aria-label={t("Remove")}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        {value.length > SHOW && (
          <button type="button" onClick={(e) => (e.stopPropagation(), setExpanded(!expanded))} className="rounded-md px-1.5 py-0.5 text-[12px] font-semibold text-cat hover:bg-cat-soft">
            {expanded ? t("Show less") : t("+{n} more", { n: value.length - SHOW })}
          </button>
        )}
        {!(single && value.length) && (
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setFocus(true)}
            onBlur={() => setTimeout(() => setFocus(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHi((h) => Math.min(h + 1, Math.min(sugg.length, 8) - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHi((h) => Math.max(0, h - 1));
              } else if (e.key === "Enter" || (e.key === "," && !bulk && q.trim())) {
                e.preventDefault();
                commit();
              } else if (e.key === "Backspace" && !q && value.length) remove(value[value.length - 1]);
              else if (e.key === "Escape" && q) {
                e.stopPropagation();
                setQ("");
              }
            }}
            className="h-7 min-w-[140px] flex-1 bg-transparent px-1 font-mono text-[13px] outline-none placeholder:font-sans"
            placeholder={value.length ? "" : (placeholder ?? t("Type an ID, paste a list or a range"))}
            aria-label={t("Find cables")}
          />
        )}
        <div className="ml-auto flex items-center gap-0.5">
          {value.length > 1 && !single && (
            <button type="button" onClick={(e) => (e.stopPropagation(), onChange([]))} className="rounded px-1.5 py-1 text-[12px] text-sub hover:bg-muted hover:text-ink">
              {t("Clear")}
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setBrowseQ("");
              setBrowse(true);
            }}
            className="inline-flex h-7 items-center gap-1 rounded-md border bg-[#F6F8F5] px-2 text-[12px] font-semibold text-ink hover:border-cat hover:text-cat"
            title={t("Find in the registry with filters")}
          >
            <ListFilter className="h-3.5 w-3.5" /> {t("Browse")}
          </button>
        </div>
      </div>
      {open && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg border bg-white shadow-lg">
          {bulk ? (
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={commit} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted">
              <Plus className="h-4 w-4 text-cat" />
              <span className="font-semibold">{t("Add {n} cables", { n: res.hits.length + (allowUnknown ? res.missing.length : 0) })}</span>
              {res.missing.length > 0 && <span className="text-xs text-bad">{t("{n} not in the registry", { n: res.missing.length })}</span>}
            </button>
          ) : sugg.length ? (
            <>
              {sugg.slice(0, 8).map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => add([c.code])}
                  className={cn("flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm", i === hi && "bg-cat-soft")}
                >
                  <span className="w-28 shrink-0 truncate font-mono font-semibold">{c.code}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-sub">{Object.values(c.values).filter(Boolean).slice(0, 3).join(" · ")}</span>
                </button>
              ))}
              {sugg.length > 8 && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setBrowseQ(q);
                    setBrowse(true);
                  }}
                  className="w-full border-t px-3 py-2 text-left text-[13px] font-semibold text-cat hover:bg-muted"
                >
                  {t("Show all {n} in the list", { n: sugg.length })}
                </button>
              )}
            </>
          ) : (
            <div className="px-3 py-2.5 text-[13px] text-sub">
              {allowUnknown && q.trim() ? t("Not in the registry — Enter adds “{id}” anyway", { id: cleanCode(q) }) : t("No cables match")}
            </div>
          )}
        </div>
      )}
      <CablePickerDialog open={browse} onOpenChange={setBrowse} p={p} cables={cables} single={single} value={value} initialQuery={browseQ} onApply={(codes) => onChange(codes)} />
    </div>
  );
};
