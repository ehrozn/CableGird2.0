/** Excel-like series detection for the fill handle and Ctrl+D. */

const NUM = /^-?\d+(?:[.,]\d+)?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** text + last number (+ optional tail), e.g. "IDF 1-13 01 12", "C-009", "W2-IT-000514", "P12A" */
const TAIL = /^(.*?)(\d+)(\D*)$/;

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const days = (a: string, b: string) => Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000);

/**
 * Continue `src` (top → bottom) by `n` values.
 * - one value: numbers and dates are copied, text ending in a number counts up (C-009 → C-010, keeps zero padding)
 * - two+ values with a steady step: the step continues (2, 4 → 6, 8; 01, 03 → 05)
 * - anything else repeats the pattern
 * `copy` forces plain repetition.
 */
export const fillSeries = (src: string[], n: number, copy = false): string[] => {
  const out: string[] = [];
  const cycle = () => {
    for (let i = 0; i < n; i++) out.push(src[i % src.length] ?? "");
    return out;
  };
  if (!src.length || copy) return cycle();
  const vals = src.map((x) => x.trim());

  if (vals.every((v) => DATE.test(v))) {
    if (vals.length === 1) return cycle();
    const step = days(vals[0], vals[1]);
    if (vals.every((v, i) => i === 0 || days(vals[i - 1], v) === step)) {
      const last = vals[vals.length - 1];
      for (let i = 1; i <= n; i++) out.push(addDays(last, step * i));
      return out;
    }
    return cycle();
  }

  if (vals.every((v) => NUM.test(v))) {
    if (vals.length === 1) return cycle();
    const nums = vals.map((v) => Number(v.replace(",", ".")));
    const step = nums[1] - nums[0];
    const steady = nums.every((x, i) => i === 0 || Math.abs(x - nums[i - 1] - step) < 1e-9);
    if (!steady) return cycle();
    const dec = Math.max(...vals.map((v) => (v.split(/[.,]/)[1] ?? "").length));
    const comma = vals.some((v) => v.includes(","));
    const pad = vals.every((v) => /^0\d/.test(v)) ? vals[0].length : 0;
    const last = nums[nums.length - 1];
    for (let i = 1; i <= n; i++) {
      let s = (last + step * i).toFixed(dec);
      if (pad && !s.startsWith("-")) s = s.padStart(pad, "0");
      out.push(comma ? s.replace(".", ",") : s);
    }
    return out;
  }

  const parts = vals.map((v) => v.match(TAIL));
  if (parts.every(Boolean) && parts.every((m) => m![1] === parts[0]![1] && m![3] === parts[0]![3])) {
    const [, head, , tail] = parts[0]!;
    const nums = parts.map((m) => Number(m![2]));
    const width = parts[parts.length - 1]![2].length;
    const padded = parts.some((m) => m![2].length > 1 && m![2].startsWith("0"));
    const step = nums.length > 1 ? nums[1] - nums[0] : 1;
    const steady = nums.every((x, i) => i === 0 || x - nums[i - 1] === step);
    // a single value counts up only when the number is at the very end (C-009 → C-010), so "Cat6A" is copied, not turned into "Cat7A"
    if (nums.length === 1 && tail) return cycle();
    if (steady && step !== 0) {
      const last = nums[nums.length - 1];
      for (let i = 1; i <= n; i++) {
        const k = last + step * i;
        const s = k < 0 ? String(k) : padded ? String(k).padStart(width, "0") : String(k);
        out.push(head + s + tail);
      }
      return out;
    }
  }
  return cycle();
};

/** Parse clipboard text (Excel / Google Sheets copy) into a 2D grid. */
export const parseClipboard = (text: string): string[][] => {
  const t = text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  if (!t) return [];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"' && t[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") q = true;
    else if (ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows;
};

/** 2D grid → clipboard text Excel understands. */
export const toClipboard = (grid: string[][]): string =>
  grid.map((r) => r.map((c) => (/[\t\n"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join("\t")).join("\n");
