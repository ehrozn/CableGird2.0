/**
 * Registry automation: "if → then" rules, computed (formula) columns, stage order and data checks.
 * Everything here is pure — the store calls it while writing cables.
 */
import { isFilled } from "./derive";
import { normCode } from "./ids";
import type { Cable, Column, Project, Rule, RuleCond, Sheet, StageFlow } from "./types";

/* ------------------------------------------------------------------ */
/*  Cable lists & books                                                */
/* ------------------------------------------------------------------ */

export const MAIN_LIST = "main";
export const sheetList = (s: Pick<Sheet, "listId">) => s.listId ?? MAIN_LIST;
export const cableLists = (c: Pick<Cable, "lists">) => c.lists ?? [MAIN_LIST];
export const inList = (c: Pick<Cable, "lists">, list: string) => (c.lists ? c.lists.includes(list) : list === MAIN_LIST);

/** List new cables go to when no sheet is given (crew reports, task links…): the first sheet's list. */
export const defaultList = (p: Pick<Project, "sheets">) => (p.sheets[0] ? sheetList(p.sheets[0]) : MAIN_LIST);

/** Other sheets that show the same cables (linked by Cable ID). */
export const linkedSheets = (p: Pick<Project, "sheets">, sheet: Sheet) => p.sheets.filter((s) => s.id !== sheet.id && sheetList(s) === sheetList(sheet));

/** Cables that are on no sheet at all. */
export const orphanCables = (p: Pick<Project, "sheets" | "cables">) => {
  const lists = new Set(p.sheets.map(sheetList));
  return p.cables.filter((c) => !cableLists(c).some((l) => lists.has(l)));
};

/* ------------------------------------------------------------------ */
/*  Rules                                                              */
/* ------------------------------------------------------------------ */

export const RULE_OPS: { op: RuleCond["op"]; label: string; needsValue: boolean }[] = [
  { op: "ends", label: "ends with", needsValue: true },
  { op: "starts", label: "starts with", needsValue: true },
  { op: "contains", label: "contains", needsValue: true },
  { op: "not_contains", label: "does not contain", needsValue: true },
  { op: "equals", label: "is", needsValue: true },
  { op: "not_equals", label: "is not", needsValue: true },
  { op: "empty", label: "is empty", needsValue: false },
  { op: "filled", label: "is filled", needsValue: false },
  { op: "regex", label: "matches pattern", needsValue: true },
];

const fieldValue = (c: Cable, field: string) => (field === "__code" ? c.code : c.values[field] ?? "");

/** `a|b|c` in a condition means "any of". Text compare ignores case and outer spaces. */
const condTest = (cond: RuleCond): ((v: string) => boolean) => {
  const alts = cond.value
    .split("|")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  switch (cond.op) {
    case "empty":
      return (v) => !v.trim();
    case "filled":
      return (v) => !!v.trim();
    case "ends":
      return (v) => alts.some((a) => v.trim().toLowerCase().endsWith(a));
    case "starts":
      return (v) => alts.some((a) => v.trim().toLowerCase().startsWith(a));
    case "contains":
      return (v) => alts.some((a) => v.toLowerCase().includes(a));
    case "not_contains":
      return (v) => !alts.some((a) => v.toLowerCase().includes(a));
    case "equals":
      return (v) => alts.some((a) => v.trim().toLowerCase() === a);
    case "not_equals":
      return (v) => !alts.some((a) => v.trim().toLowerCase() === a);
    case "regex": {
      try {
        const re = new RegExp(cond.value.trim(), "i");
        return (v) => re.test(v);
      } catch {
        return () => false;
      }
    }
  }
};

/** Placeholders `{ID}` / `{Column name}` in a rule value or formula text. */
const fillTemplate = (tpl: string, c: Cable, byName: Map<string, string>) =>
  tpl.replace(/\{([^{}]+)\}/g, (_, n: string) => {
    const k = n.trim().toLowerCase();
    if (k === "id") return c.code;
    const id = byName.get(k);
    return id ? c.values[id] ?? "" : "";
  });

interface CompiledRule {
  rule: Rule;
  test: (c: Cable) => boolean;
}

const compileRule = (r: Rule): CompiledRule => {
  const tests = r.when.map((w) => ({ field: w.field, t: condTest(w) }));
  return {
    rule: r,
    test: (c) => {
      if (!tests.length) return false;
      return r.match === "any" ? tests.some((x) => x.t(fieldValue(c, x.field))) : tests.every((x) => x.t(fieldValue(c, x.field)));
    },
  };
};

/** Test for a single condition (conditional formatting). */
export const matchCond = (cond: RuleCond): ((c: Cable) => boolean) => {
  const t = condTest(cond);
  return (c) => t(fieldValue(c, cond.field));
};

/* ------------------------------------------------------------------ */
/*  Formulas                                                           */
/* ------------------------------------------------------------------ */

type Tok = { t: "num"; v: number } | { t: "str"; v: string } | { t: "ref"; v: string } | { t: "id"; v: string } | { t: "op"; v: string };

const tokenize = (src: string): Tok[] => {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (ch === "{") {
      const j = src.indexOf("}", i);
      if (j < 0) throw new Error("Missing }");
      out.push({ t: "ref", v: src.slice(i + 1, j).trim() });
      i = j + 1;
    } else if (ch === '"' || ch === "'") {
      const j = src.indexOf(ch, i + 1);
      if (j < 0) throw new Error("Missing quote");
      out.push({ t: "str", v: src.slice(i + 1, j) });
      i = j + 1;
    } else if (/[0-9.]/.test(ch)) {
      const m = /^[0-9]*\.?[0-9]+/.exec(src.slice(i))!;
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ t: "id", v: m[0].toUpperCase() });
      i += m[0].length;
    } else {
      const two = src.slice(i, i + 2);
      if (["<=", ">=", "<>", "!="].includes(two)) {
        out.push({ t: "op", v: two === "!=" ? "<>" : two });
        i += 2;
      } else if ("+-*/&(),<>=".includes(ch)) {
        out.push({ t: "op", v: ch });
        i++;
      } else throw new Error(`Unexpected “${ch}”`);
    }
  }
  return out;
};

type Val = string | number | boolean;
type Node = (ctx: { c: Cable; get: (name: string) => string; pct: () => number }) => Val;

const num = (v: Val) => (typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : Number(String(v).replace(",", ".")) || 0);
const str = (v: Val) => (typeof v === "number" ? (Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000)) : typeof v === "boolean" ? (v ? "yes" : "") : v);
const truthy = (v: Val) => (typeof v === "boolean" ? v : typeof v === "number" ? v !== 0 : isFilled("checkbox", v));
const numeric = (v: Val) => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v.replace(",", "."))));

const FUNCS: Record<string, (args: Val[], ctx: Parameters<Node>[0]) => Val> = {
  IF: (a) => (truthy(a[0]) ? a[1] ?? "" : a[2] ?? ""),
  ROUND: (a) => {
    const f = 10 ** num(a[1] ?? 0);
    return Math.round(num(a[0]) * f) / f;
  },
  CEIL: (a) => Math.ceil(num(a[0])),
  FLOOR: (a) => Math.floor(num(a[0])),
  ABS: (a) => Math.abs(num(a[0])),
  MIN: (a) => Math.min(...a.map(num)),
  MAX: (a) => Math.max(...a.map(num)),
  SUM: (a) => a.reduce<number>((s, x) => s + num(x), 0),
  UPPER: (a) => str(a[0] ?? "").toUpperCase(),
  LOWER: (a) => str(a[0] ?? "").toLowerCase(),
  TRIM: (a) => str(a[0] ?? "").trim(),
  LEFT: (a) => str(a[0] ?? "").slice(0, num(a[1] ?? 1)),
  RIGHT: (a) => {
    const s = str(a[0] ?? "");
    return s.slice(Math.max(0, s.length - num(a[1] ?? 1)));
  },
  MID: (a) => str(a[0] ?? "").substr(Math.max(0, num(a[1] ?? 1) - 1), num(a[2] ?? 1)),
  LEN: (a) => str(a[0] ?? "").length,
  CONCAT: (a) => a.map(str).join(""),
  CONTAINS: (a) => str(a[0] ?? "").toLowerCase().includes(str(a[1] ?? "").toLowerCase()),
  EMPTY: (a) => !str(a[0] ?? "").trim(),
  AND: (a) => a.every(truthy),
  OR: (a) => a.some(truthy),
  NOT: (a) => !truthy(a[0] ?? ""),
  TODAY: () => new Date().toISOString().slice(0, 10),
  /** whole days from a date to today (or to a second date) */
  DAYS: (a) => {
    const d1 = Date.parse(str(a[0] ?? "").slice(0, 10));
    const d2 = a[1] !== undefined ? Date.parse(str(a[1]).slice(0, 10)) : Date.now();
    if (isNaN(d1) || isNaN(d2)) return "";
    return Math.floor((d2 - d1) / 86_400_000);
  },
  /** % of work stages done for this cable */
  PROGRESS: (_a, ctx) => ctx.pct(),
};

/** Parse a formula into an evaluator. Throws with a readable message on a syntax error. */
export const compileFormula = (src: string): Node => {
  const toks = tokenize(src.replace(/^=/, ""));
  let i = 0;
  const peek = () => toks[i];
  const isOp = (v: string) => peek()?.t === "op" && peek()!.v === v;
  const eat = (v: string) => {
    if (!isOp(v)) throw new Error(`Expected “${v}”`);
    i++;
  };
  const primary = (): Node => {
    const tk = toks[i++];
    if (!tk) throw new Error("Unexpected end");
    if (tk.t === "num") return () => tk.v;
    if (tk.t === "str") return () => tk.v;
    if (tk.t === "ref") {
      const name = tk.v;
      return (ctx) => {
        const v = ctx.get(name);
        return numeric(v) ? Number(v.replace(",", ".")) : v;
      };
    }
    if (tk.t === "id") {
      if (tk.v === "TRUE") return () => true;
      if (tk.v === "FALSE") return () => false;
      const fn = FUNCS[tk.v];
      if (!fn) throw new Error(`Unknown function ${tk.v}`);
      eat("(");
      const args: Node[] = [];
      if (!isOp(")")) {
        args.push(expr());
        while (isOp(",")) {
          i++;
          args.push(expr());
        }
      }
      eat(")");
      return (ctx) => fn(args.map((a) => a(ctx)), ctx);
    }
    if (tk.v === "(") {
      const e = expr();
      eat(")");
      return e;
    }
    if (tk.v === "-") {
      const e = primary();
      return (ctx) => -num(e(ctx));
    }
    throw new Error(`Unexpected “${tk.v}”`);
  };
  const term = (): Node => {
    let l = primary();
    while (isOp("*") || isOp("/")) {
      const op = toks[i++].v;
      const a = l;
      const b = primary();
      l = op === "*" ? (ctx) => num(a(ctx)) * num(b(ctx)) : (ctx) => {
        const d = num(b(ctx));
        return d === 0 ? "" : num(a(ctx)) / d;
      };
    }
    return l;
  };
  const sum = (): Node => {
    let l = term();
    while (isOp("+") || isOp("-")) {
      const op = toks[i++].v;
      const a = l;
      const b = term();
      l = op === "+" ? (ctx) => num(a(ctx)) + num(b(ctx)) : (ctx) => num(a(ctx)) - num(b(ctx));
    }
    return l;
  };
  const concat = (): Node => {
    let l = sum();
    while (isOp("&")) {
      i++;
      const a = l;
      const b = sum();
      l = (ctx) => str(a(ctx)) + str(b(ctx));
    }
    return l;
  };
  const expr = (): Node => {
    const l = concat();
    const tk = peek();
    if (tk?.t === "op" && ["=", "<>", "<", ">", "<=", ">="].includes(tk.v)) {
      i++;
      const r = concat();
      return (ctx) => {
        const a = l(ctx);
        const b = r(ctx);
        const both = numeric(a) && numeric(b);
        const x = both ? num(a) : str(a).toLowerCase();
        const y = both ? num(b) : str(b).toLowerCase();
        switch (tk.v) {
          case "=":
            return x === y;
          case "<>":
            return x !== y;
          case "<":
            return x < y;
          case ">":
            return x > y;
          case "<=":
            return x <= y;
          default:
            return x >= y;
        }
      };
    }
    return l;
  };
  const root = expr();
  if (i < toks.length) throw new Error(`Unexpected “${(toks[i] as { v: unknown }).v}”`);
  return root;
};

/** Returns an error message or null. */
export const formulaError = (src: string): string | null => {
  try {
    compileFormula(src);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Error";
  }
};

/* ------------------------------------------------------------------ */
/*  Auto pass: rules + formulas, run on each written cable             */
/* ------------------------------------------------------------------ */

export interface AutoCtx {
  rules: CompiledRule[];
  formulas: { col: Column; fn: Node }[];
  byName: Map<string, string>;
  names: Map<string, string>;
  prog: Column[];
}

/** Precompile once per store write. Null when the project has nothing to automate. */
export const buildAuto = (p: Project): AutoCtx | null => {
  const rules = (p.rules ?? []).filter((r) => r.enabled && r.when.length && r.then.length).map(compileRule);
  const cols = new Map<string, Column>();
  for (const s of p.sheets) for (const c of s.columns) if (!cols.has(c.id)) cols.set(c.id, c);
  const formulas: AutoCtx["formulas"] = [];
  for (const c of cols.values())
    if (c.formula?.trim()) {
      try {
        formulas.push({ col: c, fn: compileFormula(c.formula) });
      } catch {
        /* broken formula — shown in the column editor */
      }
    }
  if (!rules.length && !formulas.length) return null;
  const byName = new Map<string, string>();
  const names = new Map<string, string>();
  for (const c of cols.values()) {
    byName.set(c.name.trim().toLowerCase(), c.id);
    names.set(c.id, c.name);
  }
  return { rules, formulas, byName, names, prog: [...cols.values()].filter((c) => c.progress) };
};

export interface AutoChange {
  colId: string;
  column: string;
  from: string;
  to: string;
  rule?: string;
}

/**
 * Apply rules (in order) then formulas to one mutable cable.
 * `skip` = columns the user just typed by hand — a rule never overrides them in the same edit.
 */
export const runAuto = (ctx: AutoCtx, c: Cable, skip?: Set<string>): AutoChange[] => {
  const out: AutoChange[] = [];
  for (const { rule, test } of ctx.rules) {
    if (!test(c)) continue;
    for (const s of rule.then) {
      if (!ctx.names.has(s.colId) || skip?.has(s.colId)) continue;
      const from = c.values[s.colId] ?? "";
      if (from.trim() && !rule.overwrite) continue;
      const to = fillTemplate(s.value, c, ctx.byName).trim();
      if (from === to) continue;
      c.values[s.colId] = to;
      out.push({ colId: s.colId, column: ctx.names.get(s.colId)!, from, to, rule: rule.name });
    }
  }
  if (ctx.formulas.length) {
    const weight = ctx.prog.length || 1;
    const pct = () => Math.round((ctx.prog.filter((col) => isFilled(col.type, c.values[col.id])).length / weight) * 100);
    const get = (name: string) => {
      const k = name.trim().toLowerCase();
      if (k === "id") return c.code;
      const id = ctx.byName.get(k);
      return id ? c.values[id] ?? "" : "";
    };
    for (const { col, fn } of ctx.formulas) {
      let v = "";
      try {
        v = str(fn({ c, get, pct }));
      } catch {
        v = "#ERR";
      }
      if ((c.values[col.id] ?? "") !== v) c.values[col.id] = v;
    }
  }
  return out;
};

/** How many cables a rule would change right now (preview before "apply to all"). */
export const previewRule = (p: Project, rule: Rule): { matches: number; changes: number } => {
  const cr = compileRule(rule);
  const byName = new Map<string, string>();
  for (const s of p.sheets) for (const c of s.columns) byName.set(c.name.trim().toLowerCase(), c.id);
  let matches = 0;
  let changes = 0;
  for (const c of p.cables) {
    if (!cr.test(c)) continue;
    matches++;
    if (rule.then.some((s) => {
      const from = c.values[s.colId] ?? "";
      if (from.trim() && !rule.overwrite) return false;
      return from !== fillTemplate(s.value, c, byName).trim();
    }))
      changes++;
  }
  return { matches, changes };
};

/* ------------------------------------------------------------------ */
/*  Stage order                                                        */
/* ------------------------------------------------------------------ */

/** Stage ids in the order of the flow (stages missing from the saved order go last, in column order). */
export const flowOrder = (p: Pick<Project, "sheets" | "stageFlow">): string[] => {
  const prog: string[] = [];
  for (const s of p.sheets) for (const c of s.columns) if (c.progress && !prog.includes(c.id)) prog.push(c.id);
  const saved = (p.stageFlow?.order ?? []).filter((id) => prog.includes(id));
  return [...saved, ...prog.filter((id) => !saved.includes(id))];
};

/**
 * Can stage `colId` be set (on) or cleared (off) for a cable with these values?
 * Returns the id of the stage that blocks it, or null.
 */
export const stageBlocker = (
  flow: StageFlow | undefined,
  order: string[],
  types: Map<string, Column["type"]>,
  values: Record<string, string>,
  colId: string,
  on: boolean,
): string | null => {
  if (!flow || (!flow.requirePrevious && !flow.lockEarlier)) return null;
  const i = order.indexOf(colId);
  if (i < 0) return null;
  if (on && flow.requirePrevious) {
    for (let k = 0; k < i; k++) if (!isFilled(types.get(order[k]) ?? "text", values[order[k]])) return order[k];
  }
  if (!on && flow.lockEarlier) {
    for (let k = order.length - 1; k > i; k--) if (isFilled(types.get(order[k]) ?? "text", values[order[k]])) return order[k];
  }
  return null;
};

export interface Gate {
  active: boolean;
  order: string[];
  types: Map<string, Column["type"]>;
  names: Map<string, string>;
  block: (values: Record<string, string>, colId: string, on: boolean) => string | null;
}

export const buildGate = (p: Pick<Project, "sheets" | "stageFlow">): Gate => {
  const order = flowOrder(p);
  const types = new Map<string, Column["type"]>();
  const names = new Map<string, string>();
  for (const s of p.sheets)
    for (const c of s.columns) {
      types.set(c.id, c.type);
      names.set(c.id, c.name);
    }
  const flow = p.stageFlow;
  const active = !!flow && (flow.requirePrevious || flow.lockEarlier);
  return { active, order, types, names, block: (values, colId, on) => (active ? stageBlocker(flow, order, types, values, colId, on) : null) };
};

/* ------------------------------------------------------------------ */
/*  Data checks                                                        */
/* ------------------------------------------------------------------ */

export type ProblemKind = "duplicate_id" | "required" | "unique" | "option" | "prefix" | "formula" | "orphan";

export interface Problem {
  kind: ProblemKind;
  cableId: string;
  code: string;
  colId?: string;
  column?: string;
  value?: string;
}

/** Scan the whole registry for broken data. Capped to keep the panel fast. */
export const findProblems = (p: Project, cap = 2000): Problem[] => {
  const out: Problem[] = [];
  const push = (x: Problem) => out.length < cap && out.push(x);
  const cols = new Map<string, Column>();
  for (const s of p.sheets) for (const c of s.columns) if (!cols.has(c.id)) cols.set(c.id, c);
  const all = [...cols.values()];
  const ids = new Map<string, Cable>();
  const uniq = all.filter((c) => c.unique);
  const seen = new Map<string, Map<string, Cable>>(uniq.map((c) => [c.id, new Map()]));
  const prefix = p.idPattern?.trim();
  const listCols = new Map<string, Set<string>>();
  for (const s of p.sheets) for (const c of s.columns) {
    const set = listCols.get(sheetList(s)) ?? new Set<string>();
    set.add(c.id);
    listCols.set(sheetList(s), set);
  }
  for (const cab of p.cables) {
    const k = normCode(cab.code);
    const dup = ids.get(k);
    if (dup) push({ kind: "duplicate_id", cableId: cab.id, code: cab.code, value: dup.code });
    else ids.set(k, cab);
    if (prefix && !normCode(cab.code).startsWith(normCode(prefix))) push({ kind: "prefix", cableId: cab.id, code: cab.code, value: prefix });
    // columns that apply to this cable = columns of the sheets it is on
    const mine = new Set<string>();
    for (const l of cableLists(cab)) for (const id of listCols.get(l) ?? []) mine.add(id);
    for (const col of all) {
      if (!mine.has(col.id)) continue;
      const v = (cab.values[col.id] ?? "").trim();
      if (col.required && !col.progress && !col.formula && !v) push({ kind: "required", cableId: cab.id, code: cab.code, colId: col.id, column: col.name });
      if (col.type === "select" && v && col.options?.length && !col.options.some((o) => o.trim().toLowerCase() === v.toLowerCase()))
        push({ kind: "option", cableId: cab.id, code: cab.code, colId: col.id, column: col.name, value: v });
      if (col.formula && v === "#ERR") push({ kind: "formula", cableId: cab.id, code: cab.code, colId: col.id, column: col.name });
      if (col.unique && v) {
        const m = seen.get(col.id)!;
        const key = normCode(v) || v.toLowerCase();
        const other = m.get(key);
        if (other) push({ kind: "unique", cableId: cab.id, code: cab.code, colId: col.id, column: col.name, value: `${v} · ${other.code}` });
        else m.set(key, cab);
      }
    }
  }
  for (const c of orphanCables(p)) push({ kind: "orphan", cableId: c.id, code: c.code });
  return out;
};
