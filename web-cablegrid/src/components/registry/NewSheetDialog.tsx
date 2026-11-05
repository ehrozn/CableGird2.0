import { Link2, ListPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Field, NativeSelect } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { inList, sheetList } from "@/lib/auto";
import { useFmt, useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { TEMPLATES } from "@/lib/tia";
import type { Project, Sheet } from "@/lib/types";
import { cn } from "@/lib/utils";

import { ColumnDraftEditor } from "./ColumnDraftEditor";
import type { ColDraft } from "./suggestions";

type ColMode = "empty" | "copy" | "pick";

/** Sheet label with its book, for selects: "Book › Sheet". */
export const sheetLabel = (p: Project, s: Sheet) => {
  const b = (p.books ?? []).find((x) => x.id === s.bookId);
  return (p.books ?? []).length > 1 && b ? `${b.name} › ${s.name}` : s.name;
};

export const NewSheetDialog = ({
  p,
  open,
  onOpenChange,
  bookId,
  from,
  initialMode = "copy",
  onCreated,
}: {
  p: Project;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  bookId?: string;
  /** sheet the user is on: default source of cables and columns */
  from?: Sheet;
  initialMode?: ColMode;
  onCreated: (sheetId: string) => void;
}) => {
  const t = useT();
  const f = useFmt();
  const [name, setName] = useState("");
  const [book, setBook] = useState(bookId ?? "");
  const [cables, setCables] = useState<"link" | "new">("link");
  const [src, setSrc] = useState(from?.id ?? p.sheets[0]?.id ?? "");
  const [mode, setMode] = useState<ColMode>(initialMode);
  const [lookup, setLookup] = useState(false);
  const [cols, setCols] = useState<ColDraft[]>([]);

  useEffect(() => {
    if (!open) return;
    setName("");
    setBook(bookId ?? p.books?.[0]?.id ?? "");
    setCables(p.sheets.length ? "link" : "new");
    setSrc(from?.id ?? p.sheets[0]?.id ?? "");
    setMode(p.sheets.length ? initialMode : "pick");
    setLookup(false);
    setCols([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const source = p.sheets.find((s) => s.id === src);
  const srcCount = useMemo(() => (source ? p.cables.filter((c) => inList(c, sheetList(source))).length : 0), [p.cables, source]);
  const shared = useMemo(() => {
    const seen = new Set<string>();
    const out: ColDraft[] = [];
    for (const s of p.sheets)
      for (const c of s.columns) {
        const k = c.name.trim().toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ name: c.name, type: c.type, options: c.options, progress: c.progress });
      }
    return out;
  }, [p.sheets]);

  const create = () => {
    const st = useStore.getState();
    let bid = book;
    if (bid === "__new") bid = st.addBook(p.id, t("Book {n}", { n: (p.books?.length ?? 0) + 1 }));
    const drafts: ColDraft[] =
      mode === "copy" && source ? source.columns.map((c) => ({ name: c.name, type: c.type, options: c.options, progress: c.progress })) : mode === "pick" ? cols : [];
    const id = st.addSheet(p.id, name.trim(), drafts, { bookId: bid || undefined, listId: cables === "new" || !source ? "new" : sheetList(source) });
    if (mode === "copy" && lookup) {
      const sh = useStore.getState().projects.find((x) => x.id === p.id)?.sheets.find((s) => s.id === id);
      for (const c of sh?.columns ?? []) if (!c.progress) st.updateColumn(p.id, id, c.id, { locked: true });
    }
    onOpenChange(false);
    onCreated(id);
  };

  const card = (on: boolean, onClick: () => void, icon: React.ReactNode, title: string, sub: string) => (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex flex-1 items-start gap-3 rounded-xl border bg-white p-3 text-left transition", on ? "border-brand ring-2 ring-brand/20" : "hover:border-ink/30")}
    >
      <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg", on ? "bg-brand text-white" : "bg-muted text-sub")}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-sub">{sub}</span>
      </span>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("New sheet")}</DialogTitle>
          <DialogDescription>{t("A sheet can show the same cables as another sheet (linked by Cable ID) or keep its own list.")}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
            <Field label={t("Sheet name")}>
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. Fiber backbone")} />
            </Field>
            <Field label={t("Book")}>
              <NativeSelect value={book} onChange={setBook}>
                {(p.books ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
                <option value="__new">{t("+ New book")}</option>
              </NativeSelect>
            </Field>
          </div>

          {p.sheets.length > 0 && (
            <div>
              <div className="mb-1.5 text-[13px] font-semibold text-ink">{t("Cables on this sheet")}</div>
              <div className="flex flex-col gap-2 sm:flex-row">
                {card(cables === "link", () => setCables("link"), <Link2 className="h-4 w-4" />, t("Same cables as another sheet"), t("Rows are linked by Cable ID: adding or deleting a cable shows on both sheets."))}
                {card(cables === "new", () => setCables("new"), <ListPlus className="h-4 w-4" />, t("New cable list"), t("Starts empty. An ID that already exists elsewhere is still the same cable."))}
              </div>
            </div>
          )}

          {p.sheets.length > 0 && (cables === "link" || mode === "copy") && (
            <Field label={cables === "link" ? t("Link to sheet") : t("Copy columns from")} hint={cables === "link" && source ? t("{n} cables", { n: f.num(srcCount) }) : undefined}>
              <NativeSelect value={src} onChange={setSrc}>
                {p.sheets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {sheetLabel(p, s)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}

          <div>
            <div className="mb-1.5 text-[13px] font-semibold text-ink">{t("Columns")}</div>
            <div className="inline-flex rounded-lg border bg-muted/60 p-0.5">
              {(
                [
                  ["copy", t("Copy columns")],
                  ["pick", t("Choose columns")],
                  ["empty", t("Start empty")],
                ] as const
              )
                .filter(([k]) => k !== "copy" || p.sheets.length > 0)
                .map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setMode(k)}
                    className={cn("h-8 rounded-md px-3 text-[13px] font-semibold transition", mode === k ? "bg-white text-ink shadow-sm" : "text-sub hover:text-ink")}
                  >
                    {l}
                  </button>
                ))}
            </div>
            {mode === "copy" && source && (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {source.columns.map((c) => (
                    <span key={c.id} className={cn("rounded-full border bg-white px-2.5 py-0.5 text-xs font-medium", c.progress ? "border-cat/40 text-cat" : "text-ink")}>
                      {c.name}
                    </span>
                  ))}
                  {!source.columns.length && <span className="text-xs text-sub">{t("This sheet has no columns yet.")}</span>}
                </div>
                <label className="flex items-start gap-2 text-[13px] text-ink">
                  <input type="checkbox" className="mt-0.5 accent-[#FF5A1F]" checked={lookup} onChange={(e) => setLookup(e.target.checked)} />
                  <span>
                    {t("Read-only here (lookup)")}
                    <span className="block text-xs text-sub">{t("Copied columns are the same columns: values stay in sync. Lookup columns can be edited only on the source sheet.")}</span>
                  </span>
                </label>
              </div>
            )}
            {mode === "pick" && (
              <div className="mt-3 space-y-3">
                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-sub">{t("Templates")}</div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {TEMPLATES.map((x) => (
                      <button
                        key={x.id}
                        type="button"
                        onClick={() => {
                          setCols(x.columns.map((c) => ({ ...c, name: t(c.name) })));
                          if (!name.trim()) setName(t(x.name));
                        }}
                        className="rounded-lg border bg-white px-3 py-2 text-left transition hover:border-brand"
                      >
                        <span className="block text-[13px] font-semibold text-ink">{t(x.name)}</span>
                        <span className="block text-xs text-sub">{t(x.hint)}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <ColumnDraftEditor kind={p.kind} cols={cols} setCols={setCols} shared={shared} />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              {t("Create sheet")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
