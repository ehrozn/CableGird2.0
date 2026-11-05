/**
 * Reader for Fluke LinkWare PC project files (.flw).
 *
 * The format is closed. Modern LinkWare saves a SQLite database; older versions use a
 * proprietary binary. Neither layout is documented, so the reader does not depend on table
 * names: it walks every row (or the raw bytes), collects the texts it holds — including texts
 * inside compressed blobs — and pairs a known Cable ID with the PASS / FAIL verdict next to it.
 */
import type { FlukeRow } from "@/components/registry/FlukeImport";

import { normCode } from "./ids";

export interface FlwResult {
  rows: FlukeRow[];
  /** "sqlite" | "binary" — how the file was read */
  mode: "sqlite" | "binary";
  /** IDs found in an id-like column that are not cables of the sheet */
  unknown: string[];
}

const VERDICT = /^(pass|fail)\*?$/i;
const VERDICT_IN = /\b(?:test\s*summary|summary|result|status)\s*[:=]?\s*(pass|fail)\b/i;
const ID_NAME = /cable.?id|circuit.?id|link.?id|^id$|^name$|cable.?name|label/i;
const RES_NAME = /result|summary|status|verdict|pass/i;
const DATE_NAME = /date|time/i;
const LEN_NAME = /length/i;
const MAR_NAME = /headroom|margin/i;

const latin = new TextDecoder("latin1");
const utf16 = new TextDecoder("utf-16le");

/** Printable runs of 1-byte and UTF-16LE text inside binary data. */
const stringsOf = (b: Uint8Array, min = 3): string[] => {
  const out: string[] = [];
  const s1 = latin.decode(b);
  for (const m of s1.matchAll(/[\x20-\x7E\xA0-\xFF]{3,}/g)) if (m[0].trim().length >= min) out.push(m[0].trim());
  if (b.length > 1) {
    for (const off of [0, 1]) {
      const even = b.subarray(off, off + ((b.length - off) & ~1));
      const s2 = utf16.decode(even);
      for (const m of s2.matchAll(/[\x20-\x7E\u00A0-\u04FF]{3,}/g)) if (m[0].trim().length >= min) out.push(m[0].trim());
    }
  }
  return out;
};

const inflate = async (b: Uint8Array): Promise<Uint8Array | null> => {
  const zlib = b.length > 2 && b[0] === 0x78 && [0x01, 0x5e, 0x9c, 0xda].includes(b[1]);
  const gzip = b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;
  if ((!zlib && !gzip) || typeof DecompressionStream === "undefined") return null;
  try {
    const ds = new DecompressionStream(gzip ? "gzip" : "deflate");
    const buf = await new Response(new Blob([b as BlobPart]).stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
};

/** Fluke dates: ISO text, "MM/DD/YYYY hh:mm", unix seconds/ms, or OLE day numbers. */
const toDate = (v: unknown): string => {
  if (v == null || v === "") return "";
  if (typeof v === "number") {
    if (v > 1e12) return new Date(v).toISOString().slice(0, 10);
    if (v > 1e9) return new Date(v * 1000).toISOString().slice(0, 10);
    if (v > 30000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 864e5).toISOString().slice(0, 10);
    return "";
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) {
    let [a, b] = [Number(m[1]), Number(m[2])];
    if (s.includes(".") || a > 12) [a, b] = [b, a];
    return `${m[3]}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
  }
  return "";
};

const num = (v: unknown) => {
  if (v == null || v === "") return "";
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? String(Math.round(n * 10) / 10) : "";
};

const verdictOf = (texts: string[]): "PASS" | "FAIL" | null => {
  for (const s of texts) {
    if (VERDICT.test(s)) return s.toUpperCase().startsWith("P") ? "PASS" : "FAIL";
    const m = s.match(VERDICT_IN);
    if (m) return m[1].toUpperCase() as "PASS" | "FAIL";
  }
  return null;
};

/** A known cable for a text: the whole text, or what follows "Cable ID:". */
const codeIn = (s: string, known: Map<string, string>) => {
  const hit = known.get(normCode(s));
  if (hit) return hit;
  const m = s.match(/(?:cable|circuit|link)\s*id\s*[:=]\s*(.+)/i);
  return m ? known.get(normCode(m[1].trim())) : undefined;
};

const isSqlite = (b: Uint8Array) => latin.decode(b.subarray(0, 15)) === "SQLite format 3";

/* ------------------------------ SQLite ------------------------------ */

const readSqlite = async (bytes: Uint8Array, known: Map<string, string>): Promise<FlwResult> => {
  const [{ default: init }, { default: wasmUrl }] = await Promise.all([import("sql.js"), import("sql.js/dist/sql-wasm.wasm?url")]);
  const SQL = await init({ locateFile: () => wasmUrl });
  const db = new SQL.Database(bytes);
  const found = new Map<string, FlukeRow>();
  const unknown = new Set<string>();
  try {
    const tables = (db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")[0]?.values ?? []).map((r) => String(r[0]));
    for (const table of tables) {
      const q = `"${table.replace(/"/g, '""')}"`;
      const stmt = db.prepare(`SELECT * FROM ${q} LIMIT 200000`);
      const cols = stmt.getColumnNames();
      const idIdx = [/cable.?id|circuit.?id|link.?id/i, ID_NAME].map((re) => cols.findIndex((c) => re.test(c))).find((i) => i >= 0) ?? -1;
      const resIdx = cols.findIndex((c) => RES_NAME.test(c));
      const dateIdx = cols.findIndex((c) => DATE_NAME.test(c));
      const lenIdx = cols.findIndex((c) => LEN_NAME.test(c));
      const marIdx = cols.findIndex((c) => MAR_NAME.test(c));
      try {
        while (stmt.step()) {
          const row = stmt.get();
          // every text of the row, including texts stored in (compressed) blobs
          const texts: string[] = [];
          for (const v of row) {
            if (typeof v === "string") texts.push(v.trim());
            else if (v instanceof Uint8Array && v.length) {
              texts.push(...stringsOf(v));
              const inner = await inflate(v);
              if (inner) texts.push(...stringsOf(inner));
            }
          }
          const idText = idIdx >= 0 && typeof row[idIdx] === "string" ? (row[idIdx] as string).trim() : "";
          let code = idText ? known.get(normCode(idText)) : undefined;
          if (!code) for (const s of texts) if ((code = codeIn(s, known))) break;
          if (!code) {
            if (idText && /cable.?id|circuit.?id/i.test(cols[idIdx]) && /^[\w .\-/]{2,40}$/.test(idText)) unknown.add(idText);
            continue;
          }
          let pass: boolean | null = null;
          let result = "";
          const rv = resIdx >= 0 ? row[resIdx] : null;
          if (typeof rv === "string" && /pass|fail/i.test(rv)) {
            pass = /pass/i.test(rv);
            result = pass ? "PASS" : "FAIL";
          } else if (typeof rv === "number" && /pass/i.test(cols[resIdx])) {
            pass = rv !== 0;
            result = pass ? "PASS" : "FAIL";
          } else {
            const v = verdictOf(texts);
            if (v) {
              pass = v === "PASS";
              result = v;
            }
          }
          const prev = found.get(code);
          // keep the record with a verdict; a later record of the same cable (re-test) wins
          if (prev && prev.pass !== null && pass === null) continue;
          let date = dateIdx >= 0 ? toDate(row[dateIdx]) : "";
          if (!date) for (const s of texts) if ((date = toDate(s.match(/\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}/)?.[0] ?? ""))) break;
          found.set(code, { id: code, pass, result, date, length: lenIdx >= 0 ? num(row[lenIdx]) : "", margin: marIdx >= 0 ? num(row[marIdx]) : "" });
        }
      } finally {
        stmt.free();
      }
    }
  } finally {
    db.close();
  }
  for (const id of unknown) if (found.has(id)) unknown.delete(id);
  return { rows: [...found.values()], mode: "sqlite", unknown: [...unknown] };
};

/* ------------------------------ binary (older LinkWare) ------------------------------ */

const readBinary = async (bytes: Uint8Array, known: Map<string, string>): Promise<FlwResult> => {
  // the texts appear in record order: Cable ID … Test Summary: PASS … next Cable ID …
  let texts = stringsOf(bytes);
  // compressed chunks inside the file
  for (let i = 0; i < bytes.length - 2 && texts.length < 2_000_000; i++) {
    if (bytes[i] === 0x78 && (bytes[i + 1] === 0x9c || bytes[i + 1] === 0xda)) {
      const inner = await inflate(bytes.subarray(i));
      if (inner && inner.length > 32) texts = texts.concat(stringsOf(inner));
    }
  }
  const found = new Map<string, FlukeRow>();
  let cur: FlukeRow | null = null;
  for (const s of texts) {
    const code = codeIn(s, known);
    if (code) {
      cur = found.get(code) ?? { id: code, pass: null, result: "", date: "", length: "", margin: "" };
      found.set(code, cur);
      continue;
    }
    if (!cur) continue;
    if (cur.pass === null) {
      const v = verdictOf([s]);
      if (v) {
        cur.pass = v === "PASS";
        cur.result = v;
        continue;
      }
    }
    if (!cur.date) cur.date = toDate(s.match(/\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}/)?.[0] ?? "");
  }
  return { rows: [...found.values()], mode: "binary", unknown: [] };
};

/** Read a .flw file and match its records to the given cable IDs. */
export const readFlw = async (buf: ArrayBuffer, codes: string[]): Promise<FlwResult> => {
  const bytes = new Uint8Array(buf);
  const known = new Map(codes.map((c) => [normCode(c), c] as const));
  if (isSqlite(bytes)) return readSqlite(bytes, known);
  return readBinary(bytes, known);
};
