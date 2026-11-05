// One way to find cables everywhere: free text, a pasted list of IDs, or a range like "C-001..C-040".
import { natCmp, normCode } from "@/lib/ids";
import type { Cable } from "@/lib/types";

/** Split pasted text into cable IDs (commas, semicolons, tabs, new lines; spaces when every part looks like an ID). */
export const parseCodes = (s: string, known?: Set<string>): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (x: string) => {
    const v = x.trim();
    const k = normCode(v);
    if (!v || seen.has(k)) return;
    seen.add(k);
    out.push(v);
  };
  for (const chunk of s.split(/[,;\t\r\n]+/)) {
    const v = chunk.trim();
    if (!v) continue;
    const parts = v.split(/\s+/);
    if (parts.length === 1) push(v);
    else if (known) {
      if (known.has(normCode(v))) push(v);
      else if (parts.every((x) => known.has(normCode(x)))) parts.forEach(push);
      else push(v);
    } else if (parts.every((x) => /\d/.test(x) && /[a-z]/i.test(x))) parts.forEach(push);
    else push(v);
  }
  return out;
};

export type CableQuery =
  | { kind: "empty" }
  | { kind: "text"; text: string }
  | { kind: "list"; codes: string[] }
  | { kind: "range"; prefix: string; from: number; to: number; label: string };

const RANGE_SEP = /^(.+?)\s*(?:\.\.\.?|…|–|—|\s-\s|\s(?:to|до|a|hasta)\s)\s*(.+)$/i;

/** Split a cable ID into its non-numeric prefix (normalised) and trailing number: "C-0412" → ["C", 412]. */
export const codeParts = (code: string): [string, number] | null => {
  const n = normCode(code);
  const m = n.match(/^(.*?)(\d+)$/);
  return m ? [m[1], Number(m[2])] : null;
};

export const parseCableQuery = (raw: string, known?: Set<string>): CableQuery => {
  const q = raw.trim();
  if (!q) return { kind: "empty" };
  const r = q.match(RANGE_SEP);
  if (r) {
    const a = codeParts(r[1]);
    const b = /^\d+$/.test(r[2].trim()) && a ? ([a[0], Number(r[2].trim())] as [string, number]) : codeParts(r[2]);
    if (a && b && a[0] === b[0] && Math.abs(b[1] - a[1]) <= 5000) return { kind: "range", prefix: a[0], from: Math.min(a[1], b[1]), to: Math.max(a[1], b[1]), label: q };
  }
  if (/[,;\n\t]/.test(q)) {
    const codes = parseCodes(q, known);
    if (codes.length > 1) return { kind: "list", codes };
  } else if (known && /\s/.test(q)) {
    const parts = q.split(/\s+/);
    if (parts.length > 1 && parts.every((x) => known.has(normCode(x)))) return { kind: "list", codes: parts };
  }
  return { kind: "text", text: q };
};

export type Hay = { low: string; norm: string[] };
const hayCache = new WeakMap<Cable, Hay>();
export const cableHay = (c: Cable): Hay => {
  let h = hayCache.get(c);
  if (!h) {
    const vals = [c.code, ...Object.values(c.values)].filter(Boolean);
    h = { low: vals.join("\u0001").toLowerCase(), norm: vals.map(normCode) };
    hayCache.set(c, h);
  }
  return h;
};

export interface SearchResult {
  query: CableQuery;
  hits: Cable[];
  /** list queries: IDs that are not in the registry */
  missing: string[];
}

/** Run a query over cables (already filtered). Exact ID match comes first. */
export const searchCables = (cables: Cable[], raw: string, known?: Set<string>): SearchResult => {
  const query = parseCableQuery(raw, known);
  if (query.kind === "empty") return { query, hits: [...cables].sort((a, b) => natCmp(a.code, b.code)), missing: [] };
  if (query.kind === "list") {
    const by = new Map(cables.map((c) => [normCode(c.code), c]));
    const hits: Cable[] = [];
    const missing: string[] = [];
    for (const code of query.codes) {
      const c = by.get(normCode(code));
      if (c) hits.push(c);
      else missing.push(code);
    }
    return { query, hits, missing };
  }
  if (query.kind === "range") {
    const hits = cables
      .filter((c) => {
        const p = codeParts(c.code);
        return !!p && p[0] === query.prefix && p[1] >= query.from && p[1] <= query.to;
      })
      .sort((a, b) => natCmp(a.code, b.code));
    return { query, hits, missing: [] };
  }
  const low = query.text.toLowerCase();
  const nq = normCode(query.text);
  const exact: Cable[] = [];
  const starts: Cable[] = [];
  const rest: Cable[] = [];
  for (const c of cables) {
    const nc = normCode(c.code);
    if (nq && nc === nq) exact.push(c);
    else if (nq && nc.startsWith(nq)) starts.push(c);
    else {
      const h = cableHay(c);
      if (h.low.includes(low) || (nq.length > 1 && h.norm.some((x) => x.includes(nq)))) rest.push(c);
    }
  }
  starts.sort((a, b) => natCmp(a.code, b.code));
  rest.sort((a, b) => natCmp(a.code, b.code));
  return { query, hits: [...exact, ...starts, ...rest], missing: [] };
};
