import { ArrowRight, FileSpreadsheet, LayoutPanelTop, Sparkles } from "lucide-react";
import { useState } from "react";

import { Field } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { Project } from "@/lib/types";

import { ColumnDraftEditor } from "./ColumnDraftEditor";
import type { ColDraft } from "./suggestions";

export const SetupWizard = ({
  p,
  onImport,
  onCreated,
  startBuild = false,
}: {
  p: Project;
  onImport: () => void;
  onCreated?: (sheetId: string) => void;
  startBuild?: boolean;
}) => {
  const t = useT();
  const addSheet = useStore((s) => s.addSheet);
  const [mode, setMode] = useState<"choose" | "build">(startBuild ? "build" : "choose");
  const [name, setName] = useState("");
  const [cols, setCols] = useState<ColDraft[]>([]);

  if (mode === "choose")
    return (
      <div className="mx-auto max-w-4xl py-6">
        <div className="mb-8 text-center">
          <div className="cable-line mx-auto mb-4 h-1 w-20 rounded-full" />
          <h1 className="text-2xl font-extrabold text-ink md:text-3xl">{t("Set up the cable registry")}</h1>
          <p className="mx-auto mt-2 max-w-xl text-sub">
            {t("The registry is empty. Design your own sheets and columns, or bring in an existing file — you can always change it later.")}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <button onClick={() => setMode("build")} className="panel group p-6 text-left transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lg">
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-brand-soft text-brand">
              <LayoutPanelTop />
            </div>
            <div className="text-lg font-bold text-ink">{t("Build from scratch")}</div>
            <p className="mt-1 text-sm text-sub">{t("Name your first sheet and choose exactly which columns it needs.")}</p>
            <div className="mt-4 flex items-center gap-1 text-sm font-semibold text-brand-deep">
              {t("Start")} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </div>
          </button>
          <button onClick={onImport} className="panel group p-6 text-left transition hover:-translate-y-0.5 hover:border-cat hover:shadow-lg">
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-cat-soft text-cat">
              <FileSpreadsheet />
            </div>
            <div className="text-lg font-bold text-ink">{t("Import a file")}</div>
            <p className="mt-1 text-sm text-sub">{t("Excel, CSV, PDF, DXF drawings or JSON. Pick the sheets and columns you want.")}</p>
            <div className="mt-4 flex items-center gap-1 text-sm font-semibold text-cat">
              {t("Choose file")} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </div>
          </button>
        </div>
        <div className="mt-6 flex items-start gap-3 rounded-xl border bg-white/70 p-4 text-sm text-sub">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-fiber-deep" />
          <span>
            {t("Tip: use several sheets for different views of the same cables — e.g. one for work progress and one for IDF rack/panel/port details. Every sheet shares the same cable IDs.")}
          </span>
        </div>
      </div>
    );

  const shared: ColDraft[] = [];
  for (const s of p.sheets)
    for (const c of s.columns)
      if (!shared.some((x) => x.name.toLowerCase() === c.name.toLowerCase())) shared.push({ name: c.name, type: c.type, options: c.options, progress: c.progress });

  const create = () => {
    const clean = cols.filter((c) => c.name.trim()).map((c) => ({ ...c, name: c.name.trim(), options: c.options?.map((o) => o.trim()).filter(Boolean) }));
    const id = addSheet(p.id, name.trim() || t("Sheet {n}", { n: p.sheets.length + 1 }), clean);
    onCreated?.(id);
  };

  return (
    <div className="mx-auto max-w-2xl py-4">
      <h1 className="text-2xl font-extrabold text-ink">{p.sheets.length ? t("New sheet") : t("Your first sheet")}</h1>
      <p className="mb-6 mt-1 text-sub">{t("Add the columns your crews and client need. Order them the way you read them.")}</p>
      <div className="panel space-y-5 p-5">
        <Field label={t("Sheet name")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. Progress, IDF, Fiber")} autoFocus />
        </Field>
        <ColumnDraftEditor kind={p.kind} cols={cols} setCols={setCols} shared={shared} />
      </div>
      <div className="mt-5 flex justify-between gap-2">
        <Button variant="outline" onClick={() => (startBuild ? onImport() : setMode("choose"))}>
          {t("Back")}
        </Button>
        <Button onClick={create}>
          {t("Create registry")} <ArrowRight />
        </Button>
      </div>
    </div>
  );
};
