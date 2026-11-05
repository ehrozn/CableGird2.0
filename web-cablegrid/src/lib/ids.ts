export const uid = (): string =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
  ).replace(/-/g, "").slice(0, 16);

export const token = (): string => {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const arr = new Uint32Array(10);
  crypto.getRandomValues(arr);
  for (const n of arr) out += chars[n % chars.length];
  return out;
};

export const nowIso = (): string => new Date().toISOString();

export const todayStr = (): string => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

/** Cyrillic / Greek letters that look exactly like Latin ones (С-01 typed on a Russian keyboard is C-01). */
const LOOKALIKE: Record<string, string> = {
  А: "A", В: "B", Е: "E", Ё: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", Х: "X", У: "Y", І: "I", Ј: "J", Ѕ: "S",
  Α: "A", Β: "B", Ε: "E", Ζ: "Z", Η: "H", Ι: "I", Κ: "K", Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Υ: "Y", Χ: "X",
};
const LOOKALIKE_RE = new RegExp(`[${Object.keys(LOOKALIKE).join("")}]`, "g");

/**
 * Comparison key for cable IDs — the single rule used everywhere (registry, import, crew/client portals, reports, RFI).
 * Case, spaces, dashes, dots, slashes, underscores and look-alike Cyrillic letters don't matter:
 * "c-01", "C 01", "C.01", "С01" (Cyrillic С) → "C01". Never stored — only used to compare.
 */
const normCache = new Map<string, string>();
export const normCode = (code: string): string => {
  const src = code ?? "";
  const hit = normCache.get(src);
  if (hit !== undefined) return hit;
  const up = src.normalize("NFKC").toUpperCase().replace(LOOKALIKE_RE, (c) => LOOKALIKE[c] ?? c);
  const k = up.replace(/[^\p{L}\p{N}]+/gu, "") || up.trim();
  // memoised: the same IDs are compared again on every render / search keystroke
  if (normCache.size > 200_000) normCache.clear();
  normCache.set(src, k);
  return k;
};

/** Natural sort ("C-2" before "C-10"); one shared collator is ~20× faster than localeCompare with options. */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
export const natCmp = (a: string, b: string): number => collator.compare(a, b);

/** Tidy an ID the user typed for storage: trimmed, single spaces, upper case. */
export const cleanCode = (code: string): string => (code ?? "").trim().replace(/\s+/g, " ").toUpperCase();

/** Does a cable ID contain the query, ignoring case and formatting? */
export const codeMatches = (code: string, q: string): boolean => {
  const k = normCode(q);
  return !!k && normCode(code).includes(k);
};

/** Free-text match: plain case-insensitive substring, or the same ignoring spaces/dashes/dots. */
export const textMatches = (hay: string | undefined, q: string): boolean => {
  if (!hay) return false;
  const l = q.trim().toLowerCase();
  if (!l) return true;
  if (hay.length >= l.length && hay.toLowerCase().includes(l)) return true;
  const k = normCode(q);
  return k.length > 1 && normCode(hay).includes(k);
};

const lev = (a: string, b: string, max: number): number => {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
};

/** "Did you mean…": closest existing IDs to a query that found nothing (typos, swapped digits, missing zeros). */
export const closestCodes = (codes: string[], q: string, n = 5): string[] => {
  const k = normCode(q);
  if (k.length < 2) return [];
  const max = k.length <= 4 ? 1 : 2;
  const kz = k.replace(/(^|\D)0+(?=\d)/g, "$1");
  const scored: { c: string; d: number }[] = [];
  for (const c of codes) {
    const ck = normCode(c);
    const d = ck.replace(/(^|\D)0+(?=\d)/g, "$1") === kz ? 0 : lev(k, ck, max);
    if (d <= max) scored.push({ c, d });
  }
  return scored
    .sort((a, b) => a.d - b.d || natCmp(a.c, b.c))
    .slice(0, n)
    .map((x) => x.c);
};
