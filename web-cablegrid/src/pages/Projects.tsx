import { ArrowRight, Building2, Cable, FolderPlus, MapPin, Plus, Upload, Users } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { EmptyState, Field, LanguageSwitcher, Logo, NativeSelect, Ring } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { readBackup } from "@/lib/backup";
import { projectStats } from "@/lib/derive";
import { useFmt, useT } from "@/lib/i18n";
import { type NewProjectInput, useStore } from "@/lib/store";
import type { ProjectKind } from "@/lib/types";

export const KIND_LABEL: Record<ProjectKind, string> = {
  datacenter: "Data center",
  structured: "Structured cabling (LAN)",
  fiber: "Fiber / backbone",
  telecom: "Telecom",
  mixed: "Mixed / other",
};

export const NewProjectDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) => {
  const t = useT();
  const create = useStore((s) => s.createProject);
  const navigate = useNavigate();
  const [f, setF] = useState<NewProjectInput>({
    name: "",
    client: "",
    location: "",
    kind: "structured",
    description: "",
    units: "m",
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return;
    const id = create({ ...f, name: f.name.trim() });
    onOpenChange(false);
    navigate(`/p/${id}/registry`);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("New project")}</DialogTitle>
          <DialogDescription>{t("A new project starts empty. You will set up the cable registry next.")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label={t("Project name")}>
              <Input autoFocus required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
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
              {Object.entries(KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {t(v)}
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
          <Field label={t("Target end date")}>
            <Input type="date" value={f.endDate ?? ""} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t("Description")}>
              <Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            </Field>
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("Cancel")}
            </Button>
            <Button type="submit">
              {t("Create project")} <ArrowRight />
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const Projects = () => {
  const t = useT();
  const fm = useFmt();
  const all = useStore((s) => s.projects);
  // crew / client link devices keep their project only for the portal
  const projects = useMemo(() => all.filter((p) => p.cloud?.role !== "crew" && p.cloud?.role !== "client"), [all]);
  const restore = useStore((s) => s.restoreProject);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const onRestore = async (file?: File) => {
    if (!file) return;
    try {
      const p = await readBackup(file);
      const id = restore(p, false);
      toast.success(t("Project restored from backup"));
      navigate(`/p/${id}`);
    } catch {
      toast.error(t("This file is not a valid CableGrid backup"));
    }
  };

  return (
    <div className="blueprint min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 md:px-6">
        <Logo />
        <LanguageSwitcher />
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 md:px-6">
        <div className="mb-8 mt-4 flex flex-col gap-4 md:mt-8 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="cable-line mb-4 h-1 w-24 rounded-full" />
            <h1 className="text-3xl font-extrabold tracking-tight text-ink md:text-4xl">{t("Your projects")}</h1>
            <p className="mt-2 max-w-xl text-sub">
              {t("Cable registries, crew reports and client progress for low-voltage, telecom and data-center work.")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept=".json,.cablegrid" hidden onChange={(e) => onRestore(e.target.files?.[0])} />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload /> {t("Restore backup")}
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus /> {t("New project")}
            </Button>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="panel">
            <EmptyState
              icon={<FolderPlus />}
              title={t("No projects yet")}
              text={t("Create your first project. You decide which columns and sheets the cable registry has — or import an existing Excel file.")}
              action={
                <Button size="lg" onClick={() => setOpen(true)}>
                  <Plus /> {t("Create first project")}
                </Button>
              }
            />
            <div className="grid gap-px border-t bg-border sm:grid-cols-3">
              {[
                ["1", "Build your registry", "Custom columns and sheets, or import Excel, PDF and DXF drawings."],
                ["2", "Share crew links", "Foremen report work, cables and materials from their phone — no login."],
                ["3", "Approve and track", "Approved reports update the registry and every cable's history."],
              ].map(([n, h, d]) => (
                <div key={n} className="bg-white p-5">
                  <div className="mb-2 grid h-7 w-7 place-items-center rounded-full bg-ink font-mono text-xs font-bold text-white">{n}</div>
                  <div className="font-bold text-ink">{t(h)}</div>
                  <div className="mt-1 text-sm text-sub">{t(d)}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p, i) => {
              const s = projectStats(p);
              return (
                <Link
                  key={p.id}
                  to={`/p/${p.id}`}
                  style={{ animationDelay: `${i * 40}ms` }}
                  className="rise panel group flex flex-col p-5 transition hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-lg"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand">
                        {t(KIND_LABEL[p.kind])}
                        {p.cloud?.role === "editor" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-cat/10 px-2 py-0.5 text-[10px] text-cat">
                            <Users className="h-3 w-3" /> {t("Shared with you")}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-lg font-bold leading-snug text-ink">{p.name}</div>
                    </div>
                    <div className="relative shrink-0">
                      <Ring pct={s.pct} size={56} stroke={6} />
                      <span className="absolute inset-0 grid place-items-center text-xs font-bold">{s.pct}%</span>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-sub">
                    {p.client && (
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5" /> {p.client}
                      </div>
                    )}
                    {p.location && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5" /> {p.location}
                      </div>
                    )}
                  </div>
                  <div className="mt-auto flex items-center gap-4 border-t pt-3 text-sm" style={{ marginTop: 16 }}>
                    <span className="flex items-center gap-1.5 font-semibold text-ink">
                      <Cable className="h-4 w-4 text-cat" /> {fm.num(s.total)}
                    </span>
                    {s.pendingReports > 0 && <span className="font-semibold text-brand-deep">{t("{n} to review", { n: s.pendingReports })}</span>}
                    {s.openIssues > 0 && <span className="font-semibold text-bad">{t("{n} issues", { n: s.openIssues })}</span>}
                    <ArrowRight className="ml-auto h-4 w-4 text-sub transition group-hover:translate-x-0.5 group-hover:text-brand" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
      <NewProjectDialog open={open} onOpenChange={setOpen} />
    </div>
  );
};

export default Projects;
