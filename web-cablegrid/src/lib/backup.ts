import * as XLSX from "xlsx";

import { inList, sheetList } from "./auto";
import { cablePct, cableState, openIssueMap } from "./derive";
import type { Project, Sheet } from "./types";

const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

const safe = (s: string) => s.replace(/[^\p{L}\p{N}\-_ ]/gu, "").trim().replace(/\s+/g, "_") || "project";

export const exportBackup = (p: Project) => {
  const payload = { format: "cablegrid-backup", version: 1, exportedAt: new Date().toISOString(), project: { ...p, cloud: undefined } };
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  download(new Blob([JSON.stringify(payload)], { type: "application/json" }), `${safe(p.name)}_${stamp}.cablegrid.json`);
};

export const readBackup = async (file: File): Promise<Project> => {
  const text = await file.text();
  const data = JSON.parse(text);
  const p = (data?.format === "cablegrid-backup" ? data.project : data) as Project;
  if (!p || typeof p !== "object" || !Array.isArray(p.cables) || !Array.isArray(p.sheets) || !p.name) throw new Error("invalid");
  // fill fields that older backups may miss
  return {
    ...p,
    actions: p.actions ?? [],
    employees: p.employees ?? [],
    tasks: p.tasks ?? [],
    links: p.links ?? [],
    reports: p.reports ?? [],
    issues: p.issues ?? [],
    messages: p.messages ?? [],
    threads: p.threads ?? [],
    threadSeq: p.threadSeq ?? p.threads?.length ?? 0,
    materials: p.materials ?? [],
    activity: p.activity ?? [],
    reportSeq: p.reportSeq ?? p.reports?.length ?? 0,
    idPattern: p.idPattern ?? "",
    books: p.books ?? [],
    rules: p.rules ?? [],
    views: p.views ?? [],
    formats: p.formats ?? [],
    // revision snapshots live in this device's storage only; their list would point at nothing
    revisions: [],
    cloud: undefined,
  };
};

const STATE_LABEL = { none: "Not started", progress: "In progress", complete: "Complete", issue: "Issue" };

export const exportRegistryXlsx = (p: Project, cableIds?: Set<string>) => {
  const wb = XLSX.utils.book_new();
  const issues = openIssueMap(p.issues);
  const cables = cableIds ? p.cables.filter((c) => cableIds.has(c.id)) : p.cables;
  const sheets = p.sheets.length ? p.sheets : [{ id: "_", name: "Cables", columns: [] }];
  const used = new Set<string>();
  for (const s of sheets) {
    const root = ((p.books?.length ?? 0) > 1 && s.bookId ? `${p.books.find((b) => b.id === s.bookId)?.name ?? ""} ${s.name}` : s.name).slice(0, 31).replace(/[\\/?*[\]:]/g, " ").trim() || "Sheet";
    let base = root;
    for (let i = 2; used.has(base.toLowerCase()); i++) base = `${root.slice(0, 26)} (${i})`;
    used.add(base.toLowerCase());
    const list = sheetList(s);
    const mine = cables.filter((c) => inList(c, list));
    const header = ["ID", ...s.columns.map((c) => c.name), "Progress %", "Status"];
    const rows = mine.map((c) => [
      c.code,
      ...s.columns.map((col) => c.values[col.id] ?? ""),
      cablePct(c, p.actions),
      STATE_LABEL[cableState(c, p.actions, issues)],
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws["!cols"] = header.map((h) => ({ wch: Math.max(10, Math.min(36, h.length + 4)) }));
    XLSX.utils.book_append_sheet(wb, ws, base);
  }
  const hist: (string | number)[][] = [["Cable", "Date", "Event", "Action", "By", "Employee", "Repeat reason", "Note"]];
  for (const c of cables)
    for (const h of c.history)
      hist.push([c.code, h.at.slice(0, 16).replace("T", " "), h.kind, h.actionName ?? "", h.by, h.employee ?? "", h.reason ?? "", h.note ?? ""]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hist), "History");
  XLSX.writeFile(wb, `${safe(p.name)}_registry.xlsx`);
};

export const exportRowsXlsx = (name: string, header: string[], rows: (string | number)[][]) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), "Data");
  XLSX.writeFile(wb, `${safe(name)}.xlsx`);
};
