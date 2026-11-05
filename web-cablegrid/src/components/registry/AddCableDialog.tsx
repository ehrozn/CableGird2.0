import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Field, NativeSelect } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { inList, sheetList } from "@/lib/auto";
import { normCode } from "@/lib/ids";
import { expandMask, fiberColor, MASK_LIMIT, TEMPLATES, TIA598 } from "@/lib/tia";
import { useFmt, useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { Project, Sheet } from "@/lib/types";

import { CellEditor } from "./CellEditor";
import { readOnlyCol } from "./RegistryTable";

export const AddCableDialog = ({ p, sheet, open, onOpenChange }: { p: Project; sheet: Sheet; open: boolean; onOpenChange: (o: boolean) => void }) => {
  const t = useT();
  const addCable = useStore((s) => s.addCable);
  const importRows = useStore((s) => s.importRows);
  const [code, setCode] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [prefix, setPrefix] = useState("C-");
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(48);
  const [pad, setPad] = useState(4);
  const [suffix, setSuffix] = useState("");

  const list = sheetList(sheet);
  // IDs already on this sheet; an ID from another sheet is added here as the same cable
  const existing = useMemo(() => new Set(p.cables.filter((c) => inList(c, list)).map((c) => normCode(c.code))), [p.cables, list]);
  const dup = code.trim() && existing.has(normCode(code));

  const rangeCodes = useMemo(() => {
    const out: string[] = [];
    const a = Math.max(0, Math.min(from, to));
    const b = Math.min(a + 20000, Math.max(from, to));
    for (let i = a; i <= b; i++) out.push(`${prefix}${String(i).padStart(pad, "0")}${suffix}`);
    return out;
  }, [prefix, from, to, pad, suffix]);
  const rangeDups = rangeCodes.filter((c) => existing.has(normCode(c))).length;

  const single = (e: React.FormEvent) => {
    e.preventDefault();
    const id = addCable(p.id, code, values, undefined, list);
    if (!id) return toast.error(t("A cable with this ID already exists"));
    toast.success(t("Cable {code} added", { code: code.trim() }));
    setCode("");
    setValues({});
  };
  const range = () => {
    const rows = rangeCodes.filter((c) => !existing.has(normCode(c))).map((c) => ({ code: c, values: { ...values }, lists: [list] }));
    const r = importRows(p.id, rows, t("Range {a} – {b}", { a: rangeCodes[0], b: rangeCodes[rangeCodes.length - 1] }));
    toast.success(t("{n} cables created", { n: r.created }));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("Add cables")}</DialogTitle>
          <DialogDescription>{t("Add one cable, or generate a whole numbered range at once.")}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="one">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="one">{t("Single cable")}</TabsTrigger>
            <TabsTrigger value="range">{t("Numbered range")}</TabsTrigger>
            <TabsTrigger value="mask">{t("By mask")}</TabsTrigger>
          </TabsList>
          <TabsContent value="one">
            <form onSubmit={single} className="space-y-3 pt-2">
              <Field label={t("Cable ID")}>
                <Input autoFocus value={code} onChange={(e) => setCode(e.target.value)} className="font-mono" placeholder="C-0001" />
                {dup && <span className="mt-1 block text-xs font-semibold text-bad">{t("A cable with this ID already exists")}</span>}
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                {sheet.columns.filter((c) => !readOnlyCol(c)).map((c) => (
                  <Field key={c.id} label={c.name}>
                    <CellEditor col={c} value={values[c.id] ?? ""} onChange={(v) => setValues({ ...values, [c.id]: v })} />
                  </Field>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  {t("Close")}
                </Button>
                <Button type="submit" disabled={!code.trim() || !!dup}>
                  {t("Add & next")}
                </Button>
              </div>
            </form>
          </TabsContent>
          <TabsContent value="range">
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Field label={t("Prefix")}>
                  <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} className="font-mono" />
                </Field>
                <Field label={t("From")}>
                  <Input type="number" min={0} value={from} onChange={(e) => setFrom(Number(e.target.value))} />
                </Field>
                <Field label={t("To")}>
                  <Input type="number" min={0} value={to} onChange={(e) => setTo(Number(e.target.value))} />
                </Field>
                <Field label={t("Digits")}>
                  <Input type="number" min={1} max={8} value={pad} onChange={(e) => setPad(Number(e.target.value))} />
                </Field>
                <Field label={t("Suffix")}>
                  <Input value={suffix} onChange={(e) => setSuffix(e.target.value)} className="font-mono" />
                </Field>
              </div>
              <div className="rounded-lg border bg-muted/60 p-3 text-sm">
                <div className="font-mono font-semibold text-ink">
                  {rangeCodes[0]} … {rangeCodes[rangeCodes.length - 1]}
                </div>
                <div className="mt-1 text-sub">
                  {t("{n} cables", { n: rangeCodes.length })}
                  {rangeDups > 0 && <span className="text-bad"> · {t("{n} already exist and will be skipped", { n: rangeDups })}</span>}
                </div>
              </div>
              {sheet.columns.length > 0 && (
                <details className="rounded-lg border bg-white p-3">
                  <summary className="cursor-pointer text-sm font-semibold">{t("Fill the same values for all (optional)")}</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {sheet.columns.filter((c) => !readOnlyCol(c)).map((c) => (
                      <Field key={c.id} label={c.name}>
                        <CellEditor col={c} value={values[c.id] ?? ""} onChange={(v) => setValues({ ...values, [c.id]: v })} />
                      </Field>
                    ))}
                  </div>
                </details>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  {t("Cancel")}
                </Button>
                <Button onClick={range} disabled={rangeCodes.length - rangeDups <= 0}>
                  {t("Create {n} cables", { n: rangeCodes.length - rangeDups })}
                </Button>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="mask">
            <MaskGenerator p={p} sheet={sheet} existing={existing} list={list} onDone={() => onOpenChange(false)} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

/** IDs from a mask like DC1-R[01-04]-P[01-24]; each [ ] group can also fill a column. */
const MaskGenerator = ({ p, sheet, existing, list, onDone }: { p: Project; sheet: Sheet; existing: Set<string>; list: string; onDone: () => void }) => {
  const t = useT();
  const f = useFmt();
  const importRows = useStore((s) => s.importRows);
  const [mask, setMask] = useState("R[01-04]-PP[1-2]-[01-24]");
  const [map, setMap] = useState<Record<number, string>>({});
  const [colorCol, setColorCol] = useState("");
  const [colorGroup, setColorGroup] = useState(0);
  const res = useMemo(() => expandMask(mask), [mask]);
  const cols = sheet.columns.filter((c) => !readOnlyCol(c) && !c.progress);
  const fresh = res.codes.filter((c) => !existing.has(normCode(c)));
  const create = () => {
    const rows = res.codes.map((code, i) => {
      const values: Record<string, string> = {};
      for (const [g, colId] of Object.entries(map)) if (colId) values[colId] = res.parts[i][Number(g)] ?? "";
      if (colorCol) {
        const n = parseInt(res.parts[i][colorGroup] ?? "", 10);
        if (n > 0) values[colorCol] = fiberColor(n);
      }
      return { code, values, lists: [list] };
    });
    const r = importRows(p.id, rows, t("Mask {m}", { m: mask }));
    toast.success(t("{n} cables created", { n: r.created }));
    onDone();
  };
  return (
    <div className="space-y-3 pt-2">
      <Field label={t("Mask")} hint={t("[01-24] numbers · [A-D] letters · [x,y] list. Groups combine.")}>
        <Input value={mask} onChange={(e) => setMask(e.target.value)} className="font-mono" spellCheck={false} />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {TEMPLATES.map((x) => (
          <button key={x.id} type="button" onClick={() => setMask(x.mask)} className="rounded-full border bg-white px-2.5 py-1 text-xs font-medium hover:border-brand" title={t(x.hint)}>
            <span className="font-semibold">{t(x.name)}</span> <span className="font-mono text-sub">{x.mask}</span>
          </button>
        ))}
      </div>
      <div className="rounded-lg border bg-muted/60 p-3 text-sm">
        {res.error ? (
          <div className="font-semibold text-bad">{t(res.error)}</div>
        ) : res.total > MASK_LIMIT ? (
          <div className="font-semibold text-bad">{t("{n} cables — too many (max {m})", { n: f.num(res.total), m: f.num(MASK_LIMIT) })}</div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1 font-mono text-[12.5px] font-semibold text-ink">
              {res.codes.slice(0, 6).map((c) => (
                <span key={c} className="rounded bg-white px-1.5 py-0.5">
                  {c}
                </span>
              ))}
              {res.codes.length > 6 && <span className="px-1 text-sub">… {res.codes[res.codes.length - 1]}</span>}
            </div>
            <div className="mt-1.5 text-sub">
              {t("{n} cables", { n: f.num(res.codes.length) })}
              {res.codes.length - fresh.length > 0 && <span className="text-bad"> · {t("{n} already exist and will be skipped", { n: res.codes.length - fresh.length })}</span>}
            </div>
          </>
        )}
      </div>
      {res.groups > 0 && cols.length > 0 && !res.error && (
        <div className="space-y-1.5 rounded-lg border bg-white p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-sub">{t("Fill columns from the groups (optional)")}</div>
          {Array.from({ length: res.groups }, (_, g) => (
            <div key={g} className="flex items-center gap-2 text-sm">
              <span className="w-28 shrink-0 truncate font-mono text-xs text-sub">
                {t("Group {n}", { n: g + 1 })}: {res.parts[0]?.[g]}…
              </span>
              <NativeSelect className="h-8" value={map[g] ?? ""} onChange={(v) => setMap({ ...map, [g]: v })}>
                <option value="">—</option>
                {cols.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 border-t pt-2 text-sm">
            <span className="inline-flex gap-0.5">
              {TIA598.slice(0, 6).map((c) => (
                <span key={c.name} className="h-3 w-3 rounded-full border border-black/10" style={{ background: c.hex }} />
              ))}
            </span>
            <span className="text-xs text-sub">{t("TIA-598 colour of group")}</span>
            <NativeSelect className="h-8 w-20" value={String(colorGroup)} onChange={(v) => setColorGroup(Number(v))}>
              {Array.from({ length: res.groups }, (_, g) => (
                <option key={g} value={g}>
                  {g + 1}
                </option>
              ))}
            </NativeSelect>
            <span className="text-xs text-sub">→</span>
            <NativeSelect className="h-8 flex-1" value={colorCol} onChange={setColorCol}>
              <option value="">—</option>
              {cols.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <Button onClick={create} disabled={!fresh.length || !!res.error || res.total > MASK_LIMIT}>
          {t("Create {n} cables", { n: f.num(fresh.length) })}
        </Button>
      </div>
    </div>
  );
};
