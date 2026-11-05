import * as XLSX from "xlsx";

export interface ParsedSheet {
  name: string;
  /** Header labels (from headerRow), unique. */
  headers: string[];
  /** Data rows as the cell text shows in Excel. */
  rows: string[][];
  /** Same rows with typed values: ISO dates, plain numbers — used only when the user picks a non-text type. */
  rawRows: string[][];
  kind: "table" | "detected";
  hidden?: boolean;
  /** Full sheet grid, so the header row can be changed. */
  grid?: string[][];
  rawGrid?: string[][];
  /** Excel row number (1-based) of each grid row — empty rows are not stored. */
  rowNums?: number[];
  headerRow?: number;
}

export interface ParseResult {
  fileName: string;
  sheets: ParsedSheet[];
  note?: string;
}

const cell = (v: unknown): string => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
};

const pad = (n: number) => String(n).padStart(2, "0");

const uniqueHeaders = (hs: string[]): string[] => {
  const seen = new Map<string, number>();
  return hs.map((h, i) => {
    const base = h.replace(/\s+/g, " ").trim() || `Column ${i + 1}`;
    const k = base.toLowerCase();
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return n > 1 ? `${base} (${n})` : base;
  });
};

/** Pick the header row: the first rows with the most text labels followed by data. */
export const findHeaderRow = (grid: string[][]): number => {
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(30, grid.length); i++) {
    const r = grid[i] ?? [];
    const filled = r.filter((x) => x !== "");
    const textual = filled.filter((x) => isNaN(Number(x.replace(",", "."))) && x.length < 60);
    const next = (grid[i + 1] ?? []).filter((x) => x !== "").length;
    const score = filled.length + textual.length * 1.5 + (next ? 1 : 0) - i * 0.05;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
};

/** Cut a sheet grid at a header row (0-based). */
export const sliceAtHeader = (sh: ParsedSheet, headerRow: number): ParsedSheet => {
  const grid = sh.grid ?? [sh.headers, ...sh.rows];
  const rawGrid = sh.rawGrid ?? [sh.headers, ...sh.rawRows];
  const h = Math.max(0, Math.min(headerRow, Math.max(0, grid.length - 1)));
  const width = Math.max(0, ...grid.map((r) => r.length));
  const headers = uniqueHeaders(Array.from({ length: width }, (_, i) => grid[h]?.[i] ?? ""));
  const keepRow: number[] = [];
  for (let r = h + 1; r < grid.length; r++) if (grid[r].some((x) => x !== "")) keepRow.push(r);
  const rows = keepRow.map((r) => Array.from({ length: width }, (_, i) => grid[r][i] ?? ""));
  const rawRows = keepRow.map((r) => Array.from({ length: width }, (_, i) => rawGrid[r]?.[i] ?? grid[r][i] ?? ""));
  // drop columns with neither a header nor any data
  const keep = headers.map((_, i) => (grid[h]?.[i] ?? "") !== "" || rows.some((r) => r[i] !== ""));
  return {
    ...sh,
    headerRow: h,
    headers: headers.filter((_, i) => keep[i]),
    rows: rows.map((r) => r.filter((_, i) => keep[i])),
    rawRows: rawRows.map((r) => r.filter((_, i) => keep[i])),
  };
};

const MAX_COLS = 500;

/** Shown text and underlying value of one cell. */
const readCell = (ce: XLSX.CellObject): [string, string] => {
  let text = ce.w != null ? String(ce.w) : "";
  if (!text) {
    try {
      text = XLSX.utils.format_cell(ce);
    } catch {
      text = cell(ce.v);
    }
  }
  let rv = cell(ce.v);
  if (ce.t === "n" && typeof ce.v === "number" && ce.z && XLSX.SSF.is_date(ce.z as string)) {
    const d = XLSX.SSF.parse_date_code(ce.v);
    if (d) rv = `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  } else if (ce.t === "d" && ce.v instanceof Date) rv = `${ce.v.getFullYear()}-${pad(ce.v.getMonth() + 1)}-${pad(ce.v.getDate())}`;
  else if (ce.t === "b") rv = ce.v ? "TRUE" : "FALSE";
  return [text.replace(/\s+/g, " ").trim(), rv];
};

/**
 * Read one worksheet by walking only the cells that really exist.
 * (Excel files often declare a used range of A1:XFD1048576 because of formatting — scanning that range froze the browser.)
 */
const readSheet = (ws: XLSX.WorkSheet | undefined): { grid: string[][]; rawGrid: string[][]; rowNums: number[] } => {
  const rows = new Map<number, { t: string[]; r: string[] }>();
  let maxC = -1;
  let minC = Infinity;
  if (ws) {
    for (const key in ws) {
      if (key.charCodeAt(0) === 33) continue; // "!ref", "!merges", …
      const ce = ws[key] as XLSX.CellObject;
      if (!ce || ce.v == null || ce.t === "z") continue;
      const { r, c } = XLSX.utils.decode_cell(key);
      if (c >= MAX_COLS) continue;
      const [text, rv] = readCell(ce);
      if (!text && !rv) continue;
      let row = rows.get(r);
      if (!row) {
        row = { t: [], r: [] };
        rows.set(r, row);
      }
      row.t[c] = text;
      row.r[c] = rv;
      if (c > maxC) maxC = c;
      if (c < minC) minC = c;
    }
    // merged cells: copy the top-left value into every existing row of the block (group headers, racks spanning rows)
    for (const m of (ws["!merges"] ?? []) as XLSX.Range[]) {
      const top = rows.get(m.s.r);
      const v = top?.t[m.s.c];
      if (!top || !v) continue;
      const rv = top.r[m.s.c] ?? v;
      const lastC = Math.min(m.e.c, maxC, MAX_COLS - 1);
      const lastR = Math.min(m.e.r, m.s.r + 5000);
      for (let r = m.s.r; r <= lastR; r++) {
        const row = rows.get(r);
        if (!row) continue;
        for (let c = m.s.c; c <= lastC; c++)
          if (!row.t[c]) {
            row.t[c] = v;
            row.r[c] = rv;
          }
      }
    }
  }
  if (maxC < 0) return { grid: [], rawGrid: [], rowNums: [] };
  const width = maxC - minC + 1;
  const rowNums = [...rows.keys()].sort((x, y) => x - y);
  const grid: string[][] = new Array(rowNums.length);
  const rawGrid: string[][] = new Array(rowNums.length);
  rowNums.forEach((r, i) => {
    const row = rows.get(r)!;
    const g = new Array<string>(width);
    const rg = new Array<string>(width);
    for (let c = 0; c < width; c++) {
      g[c] = row.t[c + minC] ?? "";
      rg[c] = row.r[c + minC] ?? "";
    }
    grid[i] = g;
    rawGrid[i] = rg;
  });
  return { grid, rawGrid, rowNums: rowNums.map((r) => r + 1) };
};

/** Decode a text file: BOM-aware UTF-8 / UTF-16, falling back to Windows-1252 for old Excel CSV exports. */
export const decodeText = (buf: ArrayBuffer): string => {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  const body = b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? b.subarray(3) : b;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    try {
      return new TextDecoder("windows-1252").decode(body);
    } catch {
      return new TextDecoder("utf-8").decode(body);
    }
  }
};

/** Split CSV / TSV text into rows. Detects the delimiter, honours quotes (with "" escapes and line breaks inside). */
export const parseDelimited = (text: string): string[][] => {
  const sample = text.slice(0, 20000).split(/\r?\n/).filter((l) => l.trim()).slice(0, 30);
  const count = (l: string, d: string) => {
    let n = 0;
    let q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (!q && ch === d) n++;
    }
    return n;
  };
  let delim = ",";
  let best = -1;
  for (const d of [",", ";", "\t", "|"]) {
    const counts = sample.map((l) => count(l, d));
    const max = Math.max(0, ...counts);
    if (!max) continue;
    // a real delimiter appears the same number of times on most lines
    const steady = counts.filter((c) => c === max).length / Math.max(1, counts.length);
    const score = steady * 1000 + max;
    if (score > best) {
      best = score;
      delim = d;
    }
  }
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") q = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
};

export type ParseProgress = (done: number, total: number, sheet: string) => void;

/** Parse every sheet of a workbook. Runs in a Web Worker when possible (see xlsx.worker.ts). */
export const parseSpreadsheetBuffer = (buf: ArrayBuffer, fileName: string, onProgress?: ParseProgress): ParseResult => {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const plain = ext === "csv" || ext === "tsv" || ext === "txt";
  // CSV / TSV: decode and split ourselves — handles UTF-8/UTF-16/Windows-1252, BOM, and , ; tab | delimiters; every value stays text
  // cellDates off: dates stay serial numbers with their format, so we can read both the shown text and the real date
  const wb = plain
    ? (() => {
        const book = XLSX.utils.book_new();
        const base = fileName.replace(/\.[^.]+$/, "");
        const inParens = base.match(/\(([^()]*[A-Za-zА-Яа-я][^()]*)\)\s*$/)?.[1];
        const name = (inParens || base || "Sheet1").replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Sheet1";
        XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(parseDelimited(decodeText(buf))), name);
        return book;
      })()
    : XLSX.read(buf, { type: "array", cellNF: true, cellText: true, cellDates: false, dense: false, cellStyles: false, cellHTML: false, cellFormula: false });
  const sheets: ParsedSheet[] = [];
  const total = wb.SheetNames.length;
  wb.SheetNames.forEach((name, si) => {
    onProgress?.(si, total, name);
    const meta = wb.Workbook?.Sheets?.[si];
    const hidden = !!meta?.Hidden;
    const { grid, rawGrid, rowNums } = readSheet(wb.Sheets[name]);
    const base: ParsedSheet = { name, headers: [], rows: [], rawRows: [], kind: "table", hidden, grid, rawGrid, rowNums };
    sheets.push(grid.length ? sliceAtHeader(base, findHeaderRow(grid)) : { ...base, headerRow: 0 });
    delete wb.Sheets[name]; // free memory as we go
  });
  onProgress?.(total, total, "");
  return { fileName, sheets };
};

/** Read a spreadsheet off the main thread so big workbooks don't freeze the page; falls back to in-page parsing. */
export const parseSpreadsheet = async (file: File, onProgress?: ParseProgress): Promise<ParseResult> => {
  const buf = await file.arrayBuffer();
  if (typeof Worker !== "undefined") {
    try {
      return await new Promise<ParseResult>((resolve, reject) => {
        const w = new Worker(new URL("./xlsx.worker.ts", import.meta.url), { type: "module" });
        // if the worker never starts (blocked, unsupported, failed to load) fall back to parsing in the page
        const watchdog = setTimeout(() => {
          w.terminate();
          reject(new Error("worker did not start"));
        }, 8000);
        w.onmessage = (e: MessageEvent) => {
          clearTimeout(watchdog);
          const m = e.data as { type: "start" } | { type: "progress"; done: number; total: number; sheet: string } | { type: "done"; result: ParseResult } | { type: "error"; message: string };
          if (m.type === "start") return;
          if (m.type === "progress") onProgress?.(m.done, m.total, m.sheet);
          else {
            w.terminate();
            if (m.type === "done") resolve(m.result);
            else reject(new Error(m.message));
          }
        };
        w.onerror = (e) => {
          clearTimeout(watchdog);
          w.terminate();
          reject(e instanceof ErrorEvent ? new Error(e.message) : new Error("worker"));
        };
        w.postMessage({ buf: buf.slice(0), fileName: file.name });
      });
    } catch (e) {
      console.warn("Worker parse failed, parsing in page", e);
      return parseSpreadsheetBuffer(buf, file.name, onProgress);
    }
  }
  return parseSpreadsheetBuffer(buf, file.name, onProgress);
};

/* ---------------- value conversion (the user picks the type; default is text) ---------------- */

export type ImportType = "text" | "number" | "date" | "checkbox" | "select";

const YES = ["yes", "y", "да", "д", "sí", "si", "s", "x", "✓", "✔", "true", "verdadero", "1", "ok", "done", "+", "v"];
const NO = ["no", "n", "нет", "н", "false", "falso", "0", "-", "—", "–"];

const toIsoDate = (text: string, raw: string): string | null => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const s = text.trim();
  let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})/);
  if (m) {
    let a = +m[1];
    let b = +m[2];
    let y = +m[3];
    if (y < 100) y += 2000;
    // dot / dash → day first (EU/RU); slash → month first unless impossible
    if (s.includes("/") && a <= 12 && b <= 31 && !(b <= 12 && a > 12)) [a, b] = [b, a];
    if (b > 12 && a <= 12) [a, b] = [b, a];
    const d = a;
    const mo = b;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
  if (/^\d{5}(\.\d+)?$/.test(raw)) {
    const d = XLSX.SSF.parse_date_code(Number(raw));
    if (d && d.y > 1950 && d.y < 2200) return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  }
  return null;
};

/**
 * Convert one cell to the chosen column type.
 * Returns the value to store and whether the conversion failed (then the original text is kept).
 */
export const convertValue = (text: string, raw: string, type: ImportType): { v: string; bad: boolean } => {
  const t = (text ?? "").trim();
  if (!t) return { v: "", bad: false };
  if (type === "text" || type === "select") return { v: t, bad: false };
  if (type === "number") {
    if (raw !== "" && !isNaN(Number(raw)) && /^-?[\d.eE+-]+$/.test(raw)) return { v: String(Number(raw)), bad: false };
    const n = t.replace(/[\s\u00a0']/g, "").replace(/(\d),(\d{1,2})$/, "$1.$2").replace(/,/g, "");
    const m = n.match(/^-?\d+(\.\d+)?/);
    if (m && m[0].length >= n.replace(/[a-zа-я]+\.?$/i, "").length) return { v: String(Number(m[0])), bad: false };
    return { v: t, bad: true };
  }
  if (type === "date") {
    const d = toIsoDate(t, raw);
    return d ? { v: d, bad: false } : { v: t, bad: true };
  }
  // checkbox
  const l = t.toLowerCase();
  if (YES.includes(l)) return { v: "yes", bad: false };
  if (NO.includes(l)) return { v: "no", bad: false };
  if (toIsoDate(t, raw)) return { v: "yes", bad: false };
  return { v: "yes", bad: true };
};

/** A gentle hint for the type selector — never applied automatically. */
export const suggestType = (texts: string[], raws: string[]): ImportType | null => {
  const idx = texts.map((x, i) => (x.trim() ? i : -1)).filter((i) => i >= 0).slice(0, 200);
  if (idx.length < 2) return null;
  const all = (type: ImportType) => idx.every((i) => !convertValue(texts[i], raws[i] ?? "", type).bad);
  const uniq = new Set(idx.map((i) => texts[i].trim().toLowerCase()));
  if ([...uniq].every((x) => YES.includes(x) || NO.includes(x))) return "checkbox";
  if (idx.every((i) => /^\d{4}-\d{2}-\d{2}$/.test(raws[i] ?? "")) || (all("date") && idx.some((i) => /[./-]/.test(texts[i])))) return "date";
  if (idx.every((i) => /^-?[\d\s\u00a0',.]+$/.test(texts[i].trim()) && !/^0\d/.test(texts[i].trim())) && all("number")) return "number";
  if (uniq.size <= Math.max(3, Math.min(25, idx.length / 4))) return "select";
  return null;
};

/** Default cable-ID heuristic: letters + digits with optional separators, e.g. C-0412, DC1-A12-024, F.12.3 */
export const DEFAULT_ID_RE = /\b[A-Z]{1,6}[-_.]?\d{1,4}(?:[-_./][A-Z0-9]{1,6}){0,4}\b/gi;

export const buildIdRegex = (prefix: string): RegExp => {
  const p = prefix.trim();
  if (!p) return new RegExp(DEFAULT_ID_RE.source, "gi");
  const esc = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${esc}[A-Z0-9\\-_./]*\\d[A-Z0-9\\-_./]*`, "gi");
};

const linesToSheet = (name: string, lines: string[][], re: RegExp): ParsedSheet => {
  const rows: string[][] = [];
  const seen = new Set<string>();
  for (const cells of lines) {
    const joined = cells.join(" ");
    const ids = joined.match(re);
    if (!ids) continue;
    for (const id of ids) {
      const k = id.toUpperCase();
      if (seen.has(k)) continue;
      seen.add(k);
      const rest = cells.map((c) => c.replace(id, "").trim()).filter(Boolean);
      rows.push([id, ...rest]);
    }
  }
  const width = Math.max(1, ...rows.map((r) => r.length));
  const headers = ["Detected ID", ...Array.from({ length: width - 1 }, (_, i) => `Field ${i + 1}`)];
  const out = rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
  return { name, headers, rows: out, rawRows: out, kind: "detected" };
};

export const parsePdf = async (file: File, prefix: string): Promise<ParseResult> => {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const lines: string[][] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string; w: number }[]>();
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3);
      const arr = rows.get(y) ?? [];
      arr.push({ x: it.transform[4], s: it.str.trim(), w: it.width });
      rows.set(y, arr);
    }
    const ys = [...rows.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const items = rows.get(y)!.sort((a, b) => a.x - b.x);
      const cells: string[] = [];
      let cur = "";
      let lastEnd = -1e9;
      for (const it of items) {
        if (it.x - lastEnd > 8 && cur) {
          cells.push(cur.trim());
          cur = "";
        }
        cur += (cur ? " " : "") + it.s;
        lastEnd = it.x + it.w;
      }
      if (cur) cells.push(cur.trim());
      lines.push(cells);
    }
  }
  const sheet = linesToSheet("PDF", lines, buildIdRegex(prefix));
  return {
    fileName: file.name,
    sheets: sheet.rows.length ? [sheet] : [],
    note: `${doc.numPages} page(s) scanned`,
  };
};

export const parseDxf = async (file: File, prefix: string): Promise<ParseResult> => {
  const text = await file.text();
  const raw = text.split(/\r?\n/);
  const texts: string[][] = [];
  let entity = "";
  let layer = "";
  for (let i = 0; i < raw.length - 1; i += 2) {
    const code = raw[i].trim();
    const val = raw[i + 1]?.trim() ?? "";
    if (code === "0") {
      entity = val;
      layer = "";
    } else if (code === "8") layer = val;
    else if ((code === "1" || code === "3") && ["TEXT", "MTEXT", "ATTRIB", "ATTDEF", "MULTILEADER", "DIMENSION"].includes(entity)) {
      const clean = val
        .replace(/\\P/g, " ")
        .replace(/\\[A-Za-z][^;]*;/g, "")
        .replace(/[{}]/g, "")
        .trim();
      if (clean) texts.push([...clean.split(/\s{2,}|\t/), layer ? `Layer: ${layer}` : ""].filter(Boolean));
    }
  }
  const sheet = linesToSheet("Drawing", texts, buildIdRegex(prefix));
  return { fileName: file.name, sheets: sheet.rows.length ? [sheet] : [], note: `${texts.length} text labels read` };
};

export const parseTextLike = async (file: File, prefix: string): Promise<ParseResult> => {
  const text = await file.text();
  const lines = text.split(/\r?\n/).map((l) => l.split(/\t|;|\s{2,}/).map((x) => x.trim()).filter(Boolean));
  const sheet = linesToSheet("Text", lines, buildIdRegex(prefix));
  return { fileName: file.name, sheets: sheet.rows.length ? [sheet] : [] };
};

export const parseJsonData = async (file: File): Promise<ParseResult> => {
  const data = JSON.parse(await file.text());
  const arr: Record<string, unknown>[] = Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : Array.isArray(data?.data) ? data.data : [];
  if (!arr.length) return { fileName: file.name, sheets: [] };
  const headers = [...new Set(arr.slice(0, 500).flatMap((o) => Object.keys(o ?? {})))];
  return {
    fileName: file.name,
    sheets: [(() => {
      const rows = arr.map((o) => headers.map((h) => cell(o?.[h])));
      return { name: "JSON", headers, rows, rawRows: rows, kind: "table" as const };
    })()],
  };
};

export type FileKind = "spreadsheet" | "pdf" | "dxf" | "dwg" | "json" | "text";

export const fileKind = (name: string): FileKind => {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (["xlsx", "xls", "xlsm", "xlsb", "ods", "csv", "tsv"].includes(ext)) return "spreadsheet";
  if (ext === "pdf") return "pdf";
  if (ext === "dxf") return "dxf";
  if (ext === "dwg") return "dwg";
  if (ext === "json") return "json";
  return "text";
};

export const parseFile = async (file: File, prefix: string, onProgress?: ParseProgress): Promise<ParseResult> => {
  const k = fileKind(file.name);
  if (k === "spreadsheet") return parseSpreadsheet(file, onProgress);
  if (k === "pdf") return parsePdf(file, prefix);
  if (k === "dxf") return parseDxf(file, prefix);
  if (k === "json") return parseJsonData(file);
  if (k === "dwg") throw new Error("dwg");
  return parseTextLike(file, prefix);
};

/** Guess which column holds the cable ID: header name, IDs already in the project, uniqueness and "letters+digits" shape. */
export const guessIdColumn = (sheet: ParsedSheet, known?: Set<string>, norm: (x: string) => string = (x) => x.toUpperCase()): number => {
  const HDR = /^(cable\s*)?(id|tag|label|no\.?|number|#|ref)$|cable\s*(id|tag|no|number|label|ref)|id\s*cable|^id\b|детект|id\s*кабел|номер\s*кабел|маркировк|^кабель$|^№|etiqueta|identificador|n[º°]\s*cable/i;
  let best = 0;
  let bestScore = -Infinity;
  sheet.headers.forEach((h, i) => {
    const vals = sheet.rows.slice(0, 300).map((r) => r[i] ?? "").filter(Boolean);
    if (!vals.length) return;
    const uniq = new Set(vals.map(norm)).size / vals.length;
    const idLike = vals.filter((v) => /[A-Za-zА-Яа-я]/.test(v) && /\d/.test(v) && v.length <= 32).length / vals.length;
    const hits = known?.size ? vals.filter((v) => known.has(norm(v))).length / vals.length : 0;
    const score = (HDR.test(h.trim()) ? 3 : 0) + hits * 5 + uniq * 2 + idLike * 2 + (vals.length / Math.max(1, sheet.rows.length)) - i * 0.02;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
};

export const guessType = (vals: string[]): "number" | "date" | "text" => {
  const v = vals.filter(Boolean).slice(0, 100);
  if (!v.length) return "text";
  if (v.every((x) => /^-?\d+([.,]\d+)?$/.test(x))) return "number";
  if (v.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))) return "date";
  return "text";
};
