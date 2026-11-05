import type { ColumnDraft } from "./types";

/* ------------------------------------------------------------------ */
/*  TIA-598 colour code                                                */
/* ------------------------------------------------------------------ */

/** TIA-598 fiber / tube colours, positions 1–12 (13–24 repeat with a black tracer). */
export const TIA598: { name: string; hex: string }[] = [
  { name: "Blue", hex: "#1F5FD6" },
  { name: "Orange", hex: "#F28C28" },
  { name: "Green", hex: "#1F9D63" },
  { name: "Brown", hex: "#8B5A2B" },
  { name: "Slate", hex: "#708090" },
  { name: "White", hex: "#FFFFFF" },
  { name: "Red", hex: "#E5384B" },
  { name: "Black", hex: "#1A1A1A" },
  { name: "Yellow", hex: "#F5C400" },
  { name: "Violet", hex: "#8B5CF6" },
  { name: "Rose", hex: "#F4A3B4" },
  { name: "Aqua", hex: "#22C3C3" },
];

/** TIA-598 jacket colours by fiber type. */
export const JACKETS: { name: string; hex: string; fiber: string }[] = [
  { name: "Orange", hex: "#F28C28", fiber: "OM1 / OM2" },
  { name: "Aqua", hex: "#22C3C3", fiber: "OM3 / OM4" },
  { name: "Lime", hex: "#9BD62F", fiber: "OM5" },
  { name: "Yellow", hex: "#F5C400", fiber: "OS1 / OS2" },
];

const SWATCH = new Map<string, string>([
  ...TIA598.map((c) => [c.name.toLowerCase(), c.hex] as [string, string]),
  ...JACKETS.map((c) => [c.name.toLowerCase(), c.hex] as [string, string]),
  ["grey", "#9AA6A0"],
  ["gray", "#9AA6A0"],
  ["purple", "#8B5CF6"],
  ["pink", "#F4A3B4"],
  ["om1", "#F28C28"],
  ["om2", "#F28C28"],
  ["om3", "#22C3C3"],
  ["om4", "#22C3C3"],
  ["om5", "#9BD62F"],
  ["os1", "#F5C400"],
  ["os2", "#F5C400"],
]);

/** Colour of a value like "Blue", "Aqua", "OM4" or "Blue/Black" (tracer) — or null. */
export const colorOf = (v: string | undefined): string | null => {
  if (!v) return null;
  const k = v.trim().toLowerCase();
  if (k.length > 16) return null;
  return SWATCH.get(k) ?? SWATCH.get(k.split(/[\s/-]/)[0]) ?? null;
};

/** TIA-598 colour of fiber position n (1-based): 13 → "Blue/Black". */
export const fiberColor = (n: number) => {
  const c = TIA598[(n - 1) % 12];
  return n > 12 ? `${c.name}/Black` : c.name;
};

/* ------------------------------------------------------------------ */
/*  Sheet templates                                                    */
/* ------------------------------------------------------------------ */

export interface SheetTemplate {
  id: string;
  name: string;
  hint: string;
  /** a good ID mask for the generator */
  mask: string;
  columns: ColumnDraft[];
}

const STAGES: ColumnDraft[] = [
  { name: "Pulled", type: "date", progress: true },
  { name: "Terminated", type: "date", progress: true },
  { name: "Tested", type: "date", progress: true },
];

export const TEMPLATES: SheetTemplate[] = [
  {
    id: "tia568-h",
    name: "TIA-568 horizontal (copper)",
    hint: "Telecom room → work area outlet, Cat 6A, max 90 m",
    mask: "1A-[A-B][01-48]",
    columns: [
      { name: "From (TR)", type: "text" },
      { name: "Patch panel", type: "text", required: true },
      { name: "Port", type: "text", required: true },
      { name: "To (outlet)", type: "text", unique: true },
      { name: "Room", type: "text" },
      { name: "Category", type: "select", options: ["Cat 6", "Cat 6A", "Cat 8"] },
      { name: "Length, m", type: "number" },
      ...STAGES,
    ],
  },
  {
    id: "tia568-b",
    name: "TIA-568 backbone (fiber)",
    hint: "Between telecom rooms and the equipment room",
    mask: "FO-[01-12]",
    columns: [
      { name: "From", type: "text", required: true },
      { name: "To", type: "text", required: true },
      { name: "Fiber type", type: "select", options: ["OM3", "OM4", "OM5", "OS2"] },
      { name: "Fiber count", type: "select", options: ["6", "12", "24", "48", "96", "144"] },
      { name: "Jacket", type: "select", options: JACKETS.map((j) => j.name) },
      { name: "Length, m", type: "number" },
      ...STAGES,
    ],
  },
  {
    id: "tia942",
    name: "TIA-942 data center",
    hint: "Cabinet / panel / port on both ends (grid locations)",
    mask: "[AA-AD][01-12]-PP[1-2]-[01-24]",
    columns: [
      { name: "Source cabinet", type: "text", required: true },
      { name: "Source panel", type: "text" },
      { name: "Source port", type: "text", unique: true },
      { name: "Dest cabinet", type: "text", required: true },
      { name: "Dest panel", type: "text" },
      { name: "Dest port", type: "text", unique: true },
      { name: "Media", type: "select", options: ["Cat 6A", "OM4", "OS2", "DAC", "AOC"] },
      { name: "Length, m", type: "number" },
      ...STAGES,
    ],
  },
  {
    id: "fiber-strands",
    name: "Fiber strands (TIA-598)",
    hint: "One row per strand with its colour",
    mask: "FO-01.[01-12]",
    columns: [
      { name: "Cable", type: "text", required: true },
      { name: "Strand", type: "number" },
      { name: "Color", type: "select", options: TIA598.map((c) => c.name) },
      { name: "Port", type: "text", unique: true },
      { name: "Loss, dB", type: "number" },
      { name: "Spliced", type: "date", progress: true },
      { name: "Tested", type: "date", progress: true },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  ID masks                                                           */
/* ------------------------------------------------------------------ */

/**
 * A mask is text with [ ] groups:
 *  [01-24]  numbers, zero-padded to the width of the first bound
 *  [A-D]    letters, [AA-AD] letter pairs
 *  [x,y,z]  a list
 * Groups combine: R[1-2]-P[01-24] → R1-P01 … R2-P24.
 */
const letters = (a: string, b: string): string[] | null => {
  if (!/^[A-Z]+$/i.test(a) || !/^[A-Z]+$/i.test(b) || a.length !== b.length) return null;
  const up = a === a.toUpperCase();
  const toN = (s: string) => [...s.toUpperCase()].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
  const toS = (n: number, len: number) => {
    let out = "";
    for (let i = 0; i < len; i++) {
      out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out;
  };
  const x = toN(a);
  const y = toN(b);
  if (y < x || y - x > 5000) return null;
  const out: string[] = [];
  for (let n = x; n <= y; n++) {
    const s = toS(n, a.length);
    out.push(up ? s : s.toLowerCase());
  }
  return out;
};

const expandGroup = (body: string): string[] | null => {
  if (body.includes(",")) {
    const xs = body.split(",").map((x) => x.trim()).filter(Boolean);
    return xs.length ? xs : null;
  }
  const m = body.match(/^\s*([A-Za-z]+|\d+)\s*-\s*([A-Za-z]+|\d+)\s*(?:step\s*(\d+))?\s*$/);
  if (!m) return null;
  const [, a, b, st] = m;
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    const x = Number(a);
    const y = Number(b);
    const step = Math.max(1, Number(st) || 1);
    const pad = a.length > 1 && a.startsWith("0") ? a.length : b.length === a.length ? a.length : 0;
    const out: string[] = [];
    const dir = y >= x ? 1 : -1;
    for (let n = x; dir > 0 ? n <= y : n >= y; n += step * dir) {
      out.push(pad ? String(n).padStart(pad, "0") : String(n));
      if (out.length > 20000) return null;
    }
    return out;
  }
  return letters(a, b);
};

export interface MaskResult {
  codes: string[];
  /** per code: the value of each group */
  parts: string[][];
  groups: number;
  error: string | null;
  total: number;
}

export const MASK_LIMIT = 20000;

export const expandMask = (mask: string): MaskResult => {
  const segs: (string | string[])[] = [];
  let i = 0;
  let lit = "";
  while (i < mask.length) {
    const ch = mask[i];
    if (ch === "[") {
      const j = mask.indexOf("]", i);
      if (j < 0) return { codes: [], parts: [], groups: 0, error: "Missing “]”", total: 0 };
      const vals = expandGroup(mask.slice(i + 1, j));
      if (!vals) return { codes: [], parts: [], groups: 0, error: `Cannot read “[${mask.slice(i + 1, j)}]”`, total: 0 };
      if (lit) segs.push(lit);
      lit = "";
      segs.push(vals);
      i = j + 1;
      continue;
    }
    lit += ch;
    i++;
  }
  if (lit) segs.push(lit);
  const groups = segs.filter((s) => Array.isArray(s)) as string[][];
  const total = groups.reduce((n, g) => n * g.length, 1);
  if (!mask.trim()) return { codes: [], parts: [], groups: 0, error: null, total: 0 };
  if (total > MASK_LIMIT) return { codes: [], parts: [], groups: groups.length, error: null, total };
  let acc: { code: string; parts: string[] }[] = [{ code: "", parts: [] }];
  for (const s of segs) {
    if (typeof s === "string") acc = acc.map((x) => ({ code: x.code + s, parts: x.parts }));
    else {
      const next: typeof acc = [];
      for (const x of acc) for (const v of s) next.push({ code: x.code + v, parts: [...x.parts, v] });
      acc = next;
    }
  }
  return { codes: acc.map((x) => x.code), parts: acc.map((x) => x.parts), groups: groups.length, error: null, total };
};
