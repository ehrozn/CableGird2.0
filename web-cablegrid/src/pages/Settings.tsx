import { ArrowDown, ArrowUp, Database, Download, FileSpreadsheet, LogOut, Plus, RotateCcw, Save, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Field, LanguageSwitcher, NativeSelect, PageHeader, Section, useProject } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { exportBackup, exportRegistryXlsx, readBackup } from "@/lib/backup";
import { canDelete } from "@/lib/cloud";
import { uid } from "@/lib/ids";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { Project, ProjectKind, WorkAction } from "@/lib/types";

import { KIND_LABEL } from "./Projects";

const PALETTE = ["#2563EB", "#F5C400", "#1F9D63", "#8B5CF6", "#FF5A1F", "#0EA5E9", "#E5384B", "#0B1F33"];
const MATERIAL_SUGGEST = ["RJ45 connectors", "Keystone jacks", "Cable ties", "Velcro straps", "Labels", "Patch cords", "Fiber pigtails", "Splice sleeves", "Conduit (m)", "Screws"];

const General = ({ p }: { p: Project }) => {
  const t = useT();
  const update = useStore((s) => s.updateProject);
  const [f, setF] = useState(p);
  useEffect(() => setF(p), [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty =
    f.name !== p.name ||
    f.client !== p.client ||
    f.location !== p.location ||
    f.kind !== p.kind ||
    f.description !== p.description ||
    f.startDate !== p.startDate ||
    f.endDate !== p.endDate ||
    f.units !== p.units ||
    f.idPattern !== p.idPattern;
  return (
    <Section title={t("Project")}>
      <form
        className="grid gap-4 p-4 sm:grid-cols-2 md:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!f.name.trim()) return;
          update(p.id, {
            name: f.name.trim(),
            client: f.client,
            location: f.location,
            kind: f.kind,
            description: f.description,
            startDate: f.startDate || undefined,
            endDate: f.endDate || undefined,
            units: f.units,
            idPattern: f.idPattern.trim().toUpperCase(),
          });
          toast.success(t("Saved"));
        }}
      >
        <div className="sm:col-span-2">
          <Field label={t("Project name")}>
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          </Field>
        </div>
        <Field label={t("Client")}>
          <Input value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })} />
        </Field>
        <Field label={t("Location / building")}>
          <Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
        </Field>
        <Field label={t("Project type")}>
          <NativeSelect value={f.kind} onChange={(v) => setF({ ...f, kind: v as ProjectKind })}>
            {(Object.keys(KIND_LABEL) as ProjectKind[]).map((k) => (
              <option key={k} value={k}>
                {t(KIND_LABEL[k])}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t("Length units")}>
          <NativeSelect value={f.units} onChange={(v) => setF({ ...f, units: v as "m" | "ft" })}>
            <option value="m">{t("Meters")}</option>
            <option value="ft">{t("Feet")}</option>
          </NativeSelect>
        </Field>
        <Field label={t("Start date")}>
          <Input type="date" value={f.startDate ?? ""} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
        </Field>
        <Field label={t("Planned finish")}>
          <Input type="date" value={f.endDate ?? ""} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t("Cable ID prefix")} hint={t("Used to find cable IDs in PDF and drawing imports, e.g. C- or FO-. Leave empty to auto-detect.")}>
            <Input value={f.idPattern} onChange={(e) => setF({ ...f, idPattern: e.target.value })} className="font-mono" placeholder="C-" />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label={t("Description")}>
            <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={3} />
          </Field>
        </div>
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" disabled={!dirty}>
            <Save className="h-4 w-4" /> {t("Save changes")}
          </Button>
        </div>
      </form>
    </Section>
  );
};

const Stages = ({ p }: { p: Project }) => {
  const t = useT();
  const setActions = useStore((s) => s.setActions);
  const [list, setList] = useState<WorkAction[]>(p.actions);
  useEffect(() => setList(p.actions), [p.actions]);
  const total = list.reduce((a, x) => a + (Number(x.weight) || 0), 0);
  const dirty = JSON.stringify(list) !== JSON.stringify(p.actions);
  const patch = (i: number, v: Partial<WorkAction>) => setList(list.map((x, j) => (j === i ? { ...x, ...v } : x)));
  return (
    <Section
      title={t("Work stages")}
      action={<span className="text-xs text-sub">{t("Weights total {n}", { n: total })}</span>}
    >
      <div className="p-4 md:p-5">
        <p className="mb-3 text-sm text-sub">{t("Stages are the progress columns of your registry. The weight sets how much each stage counts toward readiness.")}</p>
        {list.length === 0 && (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-sub">{t("No stages yet. Turn on “Progress” for a column in the registry.")}</p>
        )}
        <div className="space-y-2">
          {list.map((a, i) => (
            <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-white p-2">
              <div className="flex gap-1">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => patch(i, { color: c })}
                    className="h-5 w-5 rounded-full ring-offset-2 transition"
                    style={{ background: c, boxShadow: a.color === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : undefined }}
                    aria-label={c}
                  />
                ))}
              </div>
              <span className="min-w-[140px] flex-1 truncate px-1 text-sm font-semibold text-ink">{a.name}</span>
              <div className="flex items-center gap-1">
                <Input type="number" min={0} value={a.weight} onChange={(e) => patch(i, { weight: Math.max(0, Number(e.target.value)) })} className="h-9 w-20" aria-label={t("Weight")} />
                <span className="text-xs text-sub">{total ? Math.round(((Number(a.weight) || 0) / total) * 100) : 0}%</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap justify-between gap-2">
          <span className="self-center text-xs text-sub">{t("To add or rename a stage, edit the columns in the registry.")}</span>
          <div className="flex gap-2">
            {dirty && (
              <Button type="button" variant="ghost" onClick={() => setList(p.actions)}>
                {t("Cancel")}
              </Button>
            )}
            <Button
              type="button"
              disabled={!dirty || list.some((a) => !a.name.trim())}
              onClick={() => {
                setActions(p.id, list.map((a) => ({ ...a, name: a.name.trim(), weight: Number(a.weight) || 0 })));
                toast.success(t("Saved"));
              }}
            >
              <Save className="h-4 w-4" /> {t("Save stages")}
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
};

const Materials = ({ p }: { p: Project }) => {
  const t = useT();
  const setMaterials = useStore((s) => s.setMaterials);
  const [v, setV] = useState("");
  const add = (name: string) => {
    const n = name.trim();
    if (!n || p.materials.some((m) => m.toLowerCase() === n.toLowerCase())) return;
    setMaterials(p.id, [...p.materials, n]);
  };
  const sugg = MATERIAL_SUGGEST.map((s) => t(s)).filter((s) => !p.materials.includes(s));
  return (
    <Section title={t("Materials")}>
      <div className="p-4 md:p-5">
        <p className="mb-3 text-sm text-sub">{t("Crews pick these in their reports. They can also type any other material.")}</p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add(v);
            setV("");
          }}
        >
          <Input value={v} onChange={(e) => setV(e.target.value)} placeholder={t("Material name")} />
          <Button type="submit" variant="outline" disabled={!v.trim()}>
            <Plus className="h-4 w-4" /> {t("Add")}
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {p.materials.map((m) => (
            <span key={m} className="inline-flex items-center gap-1 rounded-full border bg-white py-1 pl-3 pr-1 text-sm">
              {m}
              <button onClick={() => setMaterials(p.id, p.materials.filter((x) => x !== m))} className="grid h-5 w-5 place-items-center rounded-full hover:bg-muted" aria-label={t("Remove")}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        {sugg.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-sub">{t("Suggestions")}:</span>
            {sugg.map((s) => (
              <button key={s} onClick={() => add(s)} className="rounded-full border border-dashed px-2.5 py-0.5 text-xs text-sub hover:border-brand hover:text-brand">
                + {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
};

const DataSection = ({ p }: { p: Project }) => {
  const t = useT();
  const navigate = useNavigate();
  const { restoreProject } = useStore.getState();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"copy" | "replace">("copy");
  const onFile = async (f?: File) => {
    if (!f) return;
    try {
      const proj = await readBackup(f);
      if (mode === "replace") {
        if (!confirm(t("Replace this project with the backup? Current data will be lost."))) return;
        const id = restoreProject({ ...proj, id: p.id }, false, true);
        navigate(`/p/${id}`);
      } else {
        const id = restoreProject(proj, true);
        navigate(`/p/${id}`);
      }
      toast.success(t("Backup restored"));
    } catch {
      toast.error(t("This file is not a CableGrid backup"));
    }
  };
  return (
    <Section title={t("Backup & export")}>
      <div className="grid gap-3 p-4 sm:grid-cols-2 md:p-5">
        <button onClick={() => exportBackup(p)} className="flex items-start gap-3 rounded-lg border bg-white p-4 text-left transition hover:border-brand">
          <Database className="mt-0.5 h-5 w-5 text-brand" />
          <span>
            <span className="block font-semibold">{t("Download full backup")}</span>
            <span className="text-[13px] text-sub">{t("Everything: cables, history, reports, tasks, links. Keep it safe.")}</span>
          </span>
        </button>
        <button onClick={() => exportRegistryXlsx(p)} className="flex items-start gap-3 rounded-lg border bg-white p-4 text-left transition hover:border-brand">
          <FileSpreadsheet className="mt-0.5 h-5 w-5 text-ok" />
          <span>
            <span className="block font-semibold">{t("Export registry to Excel")}</span>
            <span className="text-[13px] text-sub">{t("One tab per sheet with stages and statuses.")}</span>
          </span>
        </button>
        <div className="rounded-lg border bg-white p-4 sm:col-span-2">
          <div className="flex items-start gap-3">
            <RotateCcw className="mt-0.5 h-5 w-5 text-cat" />
            <div className="flex-1">
              <div className="font-semibold">{t("Restore from backup")}</div>
              <div className="mt-2 flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={mode === "copy"} onChange={() => setMode("copy")} className="accent-[#FF5A1F]" />
                  {t("As a new project")}
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} className="accent-[#FF5A1F]" />
                  {t("Replace this project")}
                </label>
              </div>
              <Button variant="outline" className="mt-3" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" /> {t("Choose backup file")}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  onFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
};

const Settings = () => {
  const p = useProject()!;
  const t = useT();
  const navigate = useNavigate();
  const deleteProject = useStore((s) => s.deleteProject);
  const guest = !canDelete(p);
  return (
    <>
      <PageHeader
        title={t("Settings")}
        subtitle={t("Project details, work stages, materials and backups.")}
        actions={<LanguageSwitcher />}
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <General p={p} />
          <Materials p={p} />
        </div>
        <div className="space-y-4">
          <Stages p={p} />
          <DataSection p={p} />
          <section className="panel border-bad/40 p-4 md:p-5">
            <h2 className="font-bold text-bad">{t("Danger zone")}</h2>
            <p className="mt-1 text-sm text-sub">
              {guest
                ? t("Leaving removes this project from this device only. Everyone else keeps working on it, and you can join again with the link.")
                : p.cloud && !p.cloud.off
                  ? t("Deleting a project removes all its cables, reports and links for everyone, including invited managers and crews. Download a backup first.")
                  : t("Deleting a project removes all its cables, reports and links from this device. Download a backup first.")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => exportBackup(p)}>
                <Download className="h-4 w-4" /> {t("Download backup")}
              </Button>
              {guest ? (
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (!confirm(t("Leave “{n}”?", { n: p.name }))) return;
                    deleteProject(p.id);
                    navigate("/");
                  }}
                >
                  <LogOut className="h-4 w-4" /> {t("Leave project")}
                </Button>
              ) : (
              <Button
                variant="destructive"
                onClick={() => {
                  const name = prompt(t("Type the project name to delete it: {n}", { n: p.name }));
                  if (name?.trim() !== p.name) return;
                  deleteProject(p.id);
                  navigate("/");
                  toast.success(t("Project deleted"));
                }}
              >
                <Trash2 className="h-4 w-4" /> {t("Delete project")}
              </Button>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
};

export default Settings;
