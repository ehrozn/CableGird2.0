import { Copy, ExternalLink, HardHat, Info, Link2, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2, Building2, KeyRound, CalendarClock } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge, EmptyState, Field, NativeSelect, PageHeader, useProject } from "@/components/common";
import { PeoplePicker } from "@/components/dialogs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { canDelete } from "@/lib/cloud";
import { useFmt, useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { ClientSettings, LinkType, PortalLink, Project } from "@/lib/types";
import { cn } from "@/lib/utils";

export const linkUrl = (l: PortalLink) => `${window.location.origin}/l/${l.token}`;

const LinkDialog = ({ p, open, onOpenChange, link, type }: { p: Project; open: boolean; onOpenChange: (o: boolean) => void; link?: PortalLink; type: LinkType }) => {
  const t = useT();
  const { addLink, updateLink } = useStore.getState();
  const [name, setName] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [pin, setPin] = useState("");
  const [exp, setExp] = useState("");
  const [client, setClient] = useState<ClientSettings>({ columnIds: [], showStats: true, showIssues: false, allowMessages: true });
  const kind = link?.type ?? type;

  useEffect(() => {
    if (!open) return;
    setName(link?.name ?? "");
    setMembers(link?.memberIds ?? []);
    setPin(link?.pin ?? "");
    setExp(link?.expiresAt ?? "");
    const sh = p.sheets[0];
    setClient(link?.client ?? { sheetId: sh?.id, columnIds: sh?.columns.slice(0, 5).map((c) => c.id) ?? [], showStats: true, showIssues: false, allowMessages: true });
  }, [open, link, p.sheets]);

  const sheet = p.sheets.find((s) => s.id === client.sheetId) ?? p.sheets[0];

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const data = {
      name: name.trim(),
      type: kind,
      memberIds: kind === "crew" ? members : [],
      active: link?.active ?? true,
      pin: pin.trim() || undefined,
      expiresAt: exp || undefined,
      client: kind === "client" ? { ...client, sheetId: sheet?.id } : undefined,
    };
    if (link) updateLink(p.id, link.id, data);
    else addLink(p.id, data);
    toast.success(link ? t("Link saved") : t("Link created"));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{link ? t("Edit link") : kind === "crew" ? t("New crew link") : t("New client link")}</DialogTitle>
          <DialogDescription>
            {kind === "crew" ? t("Crew members open it to see their tasks and send daily reports.") : t("Your client sees progress and the columns you choose, and can ask questions.")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <Field label={kind === "crew" ? t("Crew name") : t("Name")}>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "crew" ? t("e.g. Crew 1, Fiber team") : t("e.g. TechInvest LLC")} />
          </Field>
          {kind === "crew" && (
            <Field label={t("Members")}>
              <PeoplePicker p={p} value={members} onChange={setMembers} />
            </Field>
          )}
          {kind === "client" && (
            <div className="space-y-4 rounded-lg border bg-[#FAFBF9] p-4">
              {p.sheets.length > 1 && (
                <Field label={t("Sheet to show")}>
                  <NativeSelect value={sheet?.id ?? ""} onChange={(v) => setClient({ ...client, sheetId: v, columnIds: p.sheets.find((s) => s.id === v)?.columns.slice(0, 5).map((c) => c.id) ?? [] })}>
                    {p.sheets.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              )}
              {sheet ? (
                <Field label={t("Visible columns")}>
                  <div className="flex flex-wrap gap-1.5">
                    {sheet.columns.map((c) => {
                      const on = client.columnIds.includes(c.id);
                      return (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => setClient({ ...client, columnIds: on ? client.columnIds.filter((x) => x !== c.id) : [...client.columnIds, c.id] })}
                          className={cn("h-8 rounded-full border px-3 text-[13px] font-medium", on ? "border-cat bg-cat-soft text-cat" : "bg-white text-sub")}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              ) : (
                <div className="text-sm text-sub">{t("Set up the registry first to choose columns.")}</div>
              )}
              {(
                [
                  ["showStats", t("Show progress by stage")],
                  ["showIssues", t("Show issue status on cables")],
                  ["allowMessages", t("Allow questions and messages")],
                ] as const
              ).map(([k, l]) => (
                <label key={k} className="flex items-center justify-between gap-3 text-sm">
                  {l}
                  <Switch checked={client[k]} onCheckedChange={(v) => setClient({ ...client, [k]: v })} />
                </label>
              ))}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("PIN (optional)")} hint={t("Asked when the link is opened")}>
              <Input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="1234" className="font-mono" />
            </Field>
            <Field label={t("Expires (optional)")}>
              <Input type="date" value={exp} onChange={(e) => setExp(e.target.value)} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              {link ? t("Save") : t("Create link")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const Links = () => {
  const p = useProject()!;
  const t = useT();
  const f = useFmt();
  const { updateLink, deleteLink, regenerateLink } = useStore.getState();
  const [dlg, setDlg] = useState<{ open: boolean; type: LinkType; link?: PortalLink }>({ open: false, type: "crew" });
  const today = new Date().toISOString().slice(0, 10);

  const copy = (l: PortalLink) => {
    navigator.clipboard?.writeText(linkUrl(l));
    toast.success(t("Link copied"), { description: linkUrl(l) });
  };

  const group = (type: LinkType) => {
    const list = p.links.filter((l) => l.type === type);
    return (
      <section className="panel overflow-hidden">
        <header className="flex items-center justify-between gap-2 border-b px-5 py-3">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            {type === "crew" ? <HardHat className="h-4 w-4 text-brand" /> : <Building2 className="h-4 w-4 text-cat" />}
            {type === "crew" ? t("Crew links") : t("Client links")}
          </h2>
          <Button size="sm" variant="outline" onClick={() => setDlg({ open: true, type })}>
            <Plus className="h-4 w-4" /> {t("New")}
          </Button>
        </header>
        {list.length === 0 ? (
          <EmptyState
            icon={<Link2 />}
            title={type === "crew" ? t("No crew links") : t("No client links")}
            text={type === "crew" ? t("Create one per crew, or assign a task to someone — a personal link is created automatically.") : t("Share read-only progress with your client.")}
            className="py-10"
          />
        ) : (
          <ul className="divide-y">
            {list.map((l) => {
              const expired = l.expiresAt && l.expiresAt < today;
              const reports = p.reports.filter((r) => r.linkId === l.id).length;
              return (
                <li key={l.id} className={cn("flex flex-col gap-3 px-4 py-3.5 md:flex-row md:items-center md:px-5", !l.active && "opacity-60")}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{l.name}</span>
                      {l.auto && <Badge t="gray">{t("Personal")}</Badge>}
                      {!l.active && <Badge t="gray">{t("Disabled")}</Badge>}
                      {expired && <Badge t="red">{t("Expired")}</Badge>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-sub">
                      <span className="max-w-[260px] truncate font-mono">/l/{l.token}</span>
                      {type === "crew" && <span>{l.memberIds.map((id) => p.employees.find((e) => e.id === id)?.name).filter(Boolean).join(", ") || t("No members")}</span>}
                      {type === "crew" && <span>{t("{n} reports", { n: reports })}</span>}
                      {l.pin && (
                        <span className="inline-flex items-center gap-1">
                          <KeyRound className="h-3 w-3" /> PIN
                        </span>
                      )}
                      {l.expiresAt && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="h-3 w-3" /> {f.date(l.expiresAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Switch checked={l.active} onCheckedChange={(v) => updateLink(p.id, l.id, { active: v })} aria-label={t("Active")} />
                    <Button size="sm" variant="outline" onClick={() => copy(l)}>
                      <Copy className="h-4 w-4" /> {t("Copy")}
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a href={`/l/${l.token}`} target="_blank" rel="noreferrer" aria-label={t("Open")}>
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="grid h-9 w-9 place-items-center rounded-md border bg-white hover:border-ink/30" aria-label={t("More")}>
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setDlg({ open: true, type, link: l })}>
                          <Pencil className="mr-2 h-4 w-4" /> {t("Edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            regenerateLink(p.id, l.id);
                            toast(t("New address generated — the old one no longer works"));
                          }}
                        >
                          <RefreshCw className="mr-2 h-4 w-4" /> {t("Generate new address")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className={canDelete(p) ? "" : "hidden"} />
                        <DropdownMenuItem className={canDelete(p) ? "text-bad focus:text-bad" : "hidden"} onClick={() => confirm(t("Delete this link?")) && deleteLink(p.id, l.id)}>
                          <Trash2 className="mr-2 h-4 w-4" /> {t("Delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  };

  return (
    <>
      <PageHeader title={t("Links")} subtitle={t("Share links with crews and clients — no accounts needed.")} />
      <div className="mb-5 flex gap-3 rounded-xl border border-fiber/50 bg-fiber-soft p-4 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-fiber-deep" />
        <span className="text-ink/80">
          {t("Data is stored on this device for now, so links open in this browser. To use them on crew phones and client computers, connect cloud sync.")}
        </span>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        {group("crew")}
        {group("client")}
      </div>
      <LinkDialog p={p} open={dlg.open} onOpenChange={(o) => setDlg({ ...dlg, open: o })} link={dlg.link} type={dlg.type} />
    </>
  );
};

export default Links;
