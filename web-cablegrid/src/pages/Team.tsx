import { Mail, MoreHorizontal, Pencil, Phone, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge, EmptyState, Field, NativeSelect, PageHeader, useProject } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { canDelete } from "@/lib/cloud";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { Access, Employee, Project, Role } from "@/lib/types";
import { cn } from "@/lib/utils";

export const ROLE_LABEL: Record<Role, string> = {
  manager: "Manager",
  foreman: "Foreman",
  technician: "Technician",
  inspector: "Inspector",
  subcontractor: "Subcontractor",
};
const ACCESS_LABEL: Record<Access, string> = {
  registry: "Edit cable values",
  tasks: "See tasks",
  reports: "Send reports",
  issues: "Report issues",
};
const ROLE_DEFAULT: Record<Role, Access[]> = {
  manager: ["registry", "tasks", "reports", "issues"],
  foreman: ["registry", "tasks", "reports", "issues"],
  technician: ["tasks", "reports", "issues"],
  inspector: ["tasks", "issues"],
  subcontractor: ["tasks", "reports"],
};

const PersonDialog = ({ p, open, onOpenChange, emp }: { p: Project; open: boolean; onOpenChange: (o: boolean) => void; emp?: Employee }) => {
  const t = useT();
  const { addEmployee, updateEmployee } = useStore.getState();
  const [d, setD] = useState<Omit<Employee, "id" | "createdAt">>({ name: "", role: "technician", access: ROLE_DEFAULT.technician, active: true });
  useEffect(() => {
    if (open) setD(emp ? { ...emp } : { name: "", role: "technician", access: ROLE_DEFAULT.technician, active: true, crew: "", phone: "", email: "" });
  }, [open, emp]);
  const crews = [...new Set(p.employees.map((e) => e.crew).filter(Boolean))] as string[];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{emp ? t("Edit person") : t("Add person")}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!d.name.trim()) return;
            if (emp) updateEmployee(p.id, emp.id, { ...d, name: d.name.trim() });
            else addEmployee(p.id, { ...d, name: d.name.trim() });
            toast.success(t("Saved"));
            onOpenChange(false);
          }}
        >
          <Field label={t("Full name")}>
            <Input autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("Role")}>
              <NativeSelect value={d.role} onChange={(v) => setD({ ...d, role: v as Role, access: ROLE_DEFAULT[v as Role] })}>
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {t(ROLE_LABEL[r])}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t("Crew")}>
              <Input value={d.crew ?? ""} onChange={(e) => setD({ ...d, crew: e.target.value })} list="crew-list" placeholder={t("e.g. Crew 1")} />
              <datalist id="crew-list">
                {crews.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label={t("Phone")}>
              <Input value={d.phone ?? ""} onChange={(e) => setD({ ...d, phone: e.target.value })} type="tel" />
            </Field>
            <Field label={t("Email")}>
              <Input value={d.email ?? ""} onChange={(e) => setD({ ...d, email: e.target.value })} type="email" />
            </Field>
          </div>
          <Field label={t("Access on their link")}>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(ACCESS_LABEL) as Access[]).map((a) => {
                const on = d.access.includes(a);
                return (
                  <label key={a} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm", on && "border-brand/50 bg-brand-soft/50")}>
                    <input type="checkbox" checked={on} onChange={() => setD({ ...d, access: on ? d.access.filter((x) => x !== a) : [...d.access, a] })} className="h-4 w-4 accent-[#FF5A1F]" />
                    {t(ACCESS_LABEL[a])}
                  </label>
                );
              })}
            </div>
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={!d.name.trim()}>
              {t("Save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const Team = () => {
  const p = useProject()!;
  const t = useT();
  const { updateEmployee, deleteEmployee } = useStore.getState();
  const [dlg, setDlg] = useState<{ open: boolean; emp?: Employee }>({ open: false });

  return (
    <>
      <PageHeader
        title={t("Team")}
        subtitle={t("People on this project, their roles and what they can do through their link.")}
        actions={
          <Button onClick={() => setDlg({ open: true })}>
            <UserPlus className="h-4 w-4" /> {t("Add person")}
          </Button>
        }
      />
      {p.employees.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<Users />}
            title={t("No people yet")}
            text={t("Add technicians, foremen and inspectors. You can also add people right when assigning a task.")}
            action={
              <Button onClick={() => setDlg({ open: true })}>
                <Plus className="h-4 w-4" /> {t("Add person")}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {p.employees.map((e) => {
            const open = p.tasks.filter((x) => x.status !== "done" && x.assigneeIds.includes(e.id)).length;
            const reports = p.reports.filter((r) => r.submittedBy === e.id || r.workerIds.includes(e.id)).length;
            const link = p.links.find((l) => l.type === "crew" && l.memberIds.includes(e.id));
            return (
              <div key={e.id} className={cn("panel flex flex-col p-4", !e.active && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-white">
                    {e.name
                      .split(/\s+/)
                      .map((x) => x[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{e.name}</div>
                    <div className="text-[13px] text-sub">
                      {t(ROLE_LABEL[e.role])}
                      {e.crew && ` · ${e.crew}`}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="grid h-8 w-8 place-items-center rounded-md hover:bg-[#EEF1EC]" aria-label={t("More")}>
                      <MoreHorizontal className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setDlg({ open: true, emp: e })}>
                        <Pencil className="mr-2 h-4 w-4" /> {t("Edit")}
                      </DropdownMenuItem>
                      <DropdownMenuItem className={canDelete(p) ? "text-bad focus:text-bad" : "hidden"} onClick={() => confirm(t("Remove {n} from the project?", { n: e.name })) && deleteEmployee(p.id, e.id)}>
                        <Trash2 className="mr-2 h-4 w-4" /> {t("Remove")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {e.access.map((a) => (
                    <Badge key={a} t="gray">
                      {t(ACCESS_LABEL[a])}
                    </Badge>
                  ))}
                </div>
                <div className="mt-3 space-y-1 text-[13px] text-sub">
                  {e.phone && (
                    <a href={`tel:${e.phone}`} className="flex items-center gap-2 hover:text-ink">
                      <Phone className="h-3.5 w-3.5" /> {e.phone}
                    </a>
                  )}
                  {e.email && (
                    <a href={`mailto:${e.email}`} className="flex items-center gap-2 truncate hover:text-ink">
                      <Mail className="h-3.5 w-3.5" /> {e.email}
                    </a>
                  )}
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3 text-[13px]">
                  <span className="text-sub">
                    {t("{n} open tasks", { n: open })} · {t("{n} reports", { n: reports })}
                  </span>
                  <label className="flex items-center gap-2 text-sub">
                    {link ? <span className="text-ok">{t("Has link")}</span> : null}
                    <Switch checked={e.active} onCheckedChange={(v) => updateEmployee(p.id, e.id, { active: v })} aria-label={t("Active")} />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <PersonDialog p={p} open={dlg.open} onOpenChange={(o) => setDlg({ ...dlg, open: o })} emp={dlg.emp} />
    </>
  );
};

export default Team;
