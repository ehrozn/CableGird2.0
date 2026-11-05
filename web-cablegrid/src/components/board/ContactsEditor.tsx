import { ArrowDown, ArrowUp, Pencil, Phone, Plus, Trash2, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CONTACT_ROLES, contactRole, sortContacts } from "@/lib/board";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { ContactRole, Project, SiteContact } from "@/lib/types";
import { cn } from "@/lib/utils";

import { CONTACT_ICON } from "./bits";

/** ideas for "own role" — plus every role this project already used */
const ROLE_IDEAS = ["Electrician on call", "Site guard", "General contractor", "Client representative", "First aid", "IT / network admin"];

type Draft = { role: ContactRole; label: string; name: string; phone: string; note: string };
const empty: Draft = { role: "foreman", label: "", name: "", phone: "", note: "" };

/** Manager: who to call — shown big on the TV and tappable on the QR page. */
export const ContactsEditor = ({ p, manager }: { p: Project; manager: boolean }) => {
  const t = useT();
  const addContact = useStore((s) => s.addContact);
  const updateContact = useStore((s) => s.updateContact);
  const removeContact = useStore((s) => s.removeContact);
  const moveContact = useStore((s) => s.moveContact);
  const [d, setD] = useState<Draft>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const raw = p.contacts ?? [];
  const list = useMemo(() => sortContacts(p.contacts), [p.contacts]);
  // team members with a phone — one tap fills the form
  const ideas = useMemo(() => {
    const used = raw.filter((c) => c.role === "other" && c.label?.trim()).map((c) => c.label!.trim());
    return [...new Set([...used, ...ROLE_IDEAS.map((x) => t(x))])].slice(0, 10);
  }, [raw, t]);
  const custom = d.role === "other";
  const team = useMemo(() => p.employees.filter((e) => e.active && e.phone?.trim()), [p.employees]);

  const reset = () => {
    setD(empty);
    setEditing(null);
    setOpen(false);
  };
  const save = () => {
    const name = d.name.trim();
    const phone = d.phone.trim();
    if (!name || !phone || (custom && !d.label.trim())) return;
    // a preset role speaks for itself; only "own role" keeps its text
    const v = { role: d.role, name, phone, label: custom ? d.label.trim() : undefined, note: d.note.trim() || undefined };
    if (editing) {
      updateContact(p.id, editing, v);
      toast.success(t("Contact updated"));
    } else {
      addContact(p.id, v);
      toast.success(t("Contact is on the TV"));
    }
    reset();
  };
  const edit = (c: SiteContact) => {
    // older contacts could carry a custom caption on a preset role — keep it as "own role"
    setD({ role: c.label?.trim() ? "other" : c.role, label: c.label ?? "", name: c.name, phone: c.phone, note: c.note ?? "" });
    setEditing(c.id);
    setOpen(true);
  };

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            <Phone className="h-4 w-4 text-brand" /> {t("Who to call")}
            {list.length > 0 && <span className="rounded-full bg-ink/[0.06] px-2 py-0.5 text-[11px] font-bold text-sub tnum">{list.length}</span>}
          </h2>
          <p className="mt-1 text-sm text-sub">{t("Names and phone numbers crews see on the TV. On the QR page they can call with one tap.")}</p>
        </div>
        {!open && (
          <Button size="sm" disabled={!manager} onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> {t("Add contact")}
          </Button>
        )}
      </div>

      {open && (
        <form
          className="rise mt-4 space-y-3 rounded-xl border border-brand/25 bg-brand-soft/25 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {CONTACT_ROLES.map((r) => {
              const I = CONTACT_ICON[r.id];
              const on = d.role === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setD({ ...d, role: r.id })}
                  className={cn(
                    "flex min-w-0 items-center justify-center gap-1.5 rounded-lg border-2 px-2 py-2 text-[13px] font-bold transition active:scale-[0.97]",
                    on ? "shadow-sm" : "border-transparent bg-white text-sub hover:text-ink",
                  )}
                  style={on ? { color: r.fg, background: r.bg, borderColor: r.fg } : undefined}
                >
                  <I className="h-4 w-4 shrink-0" /> <span className="truncate">{t(r.id === "other" ? "Own role" : r.label)}</span>
                </button>
              );
            })}
          </div>
          {custom && (
            <div className="rounded-lg bg-white/80 p-3">
              <Input
                autoFocus
                value={d.label}
                maxLength={60}
                onChange={(e) => setD({ ...d, label: e.target.value })}
                placeholder={t("Who is this? e.g. Electrician on call")}
                className="bg-white text-[15px] font-semibold"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ideas.map((x) => (
                  <button
                    key={x}
                    type="button"
                    onClick={() => setD({ ...d, label: x })}
                    className={cn(
                      "rounded-full border bg-white px-2.5 py-1 text-xs font-medium transition hover:border-brand/40",
                      d.label === x && "border-brand bg-brand-soft text-brand-deep",
                    )}
                  >
                    {x}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!editing && team.length > 0 && d.role !== "emergency" && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-sub">
                <Users className="h-3.5 w-3.5" /> {t("From the team")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {team.slice(0, 12).map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setD({ ...d, name: e.name, phone: e.phone ?? "" })}
                    className={cn(
                      "inline-flex max-w-full items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-xs font-medium transition hover:border-brand/40",
                      d.name === e.name && "border-brand bg-brand-soft text-brand-deep",
                    )}
                  >
                    <span className="truncate">{e.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              autoFocus={!custom}
              value={d.name}
              maxLength={80}
              onChange={(e) => setD({ ...d, name: e.target.value })}
              placeholder={d.role === "emergency" ? t("e.g. Emergency services") : t("Name")}
              className="bg-white text-[15px] font-semibold"
            />
            <Input
              value={d.phone}
              maxLength={40}
              inputMode="tel"
              type="tel"
              onChange={(e) => setD({ ...d, phone: e.target.value })}
              placeholder={d.role === "emergency" ? "112" : t("Phone")}
              className="bg-white font-mono text-[15px] font-semibold"
            />
          </div>
          <div>
            <Input value={d.note} maxLength={120} onChange={(e) => setD({ ...d, note: e.target.value })} placeholder={t("Note, e.g. 7:00–17:00 or room 210")} className="bg-white" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={reset}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={!d.name.trim() || !d.phone.trim() || (custom && !d.label.trim())}>
              {editing ? t("Save") : t("Show on the TV")}
            </Button>
          </div>
        </form>
      )}

      {list.length > 0 ? (
        <ul className="mt-4 divide-y rounded-xl border bg-white">
          {list.map((c) => {
            const r = contactRole(c);
            const I = CONTACT_ICON[c.role] ?? Phone;
            const i = raw.findIndex((x) => x.id === c.id);
            return (
              <li key={c.id} className={cn("flex items-center gap-3 px-3.5 py-3 transition", editing === c.id && "bg-brand-soft/30")}>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ color: r.fg, background: r.bg }}>
                  <I className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: r.fg }}>
                    {c.label || t(r.label)}
                  </div>
                  <div className="break-words text-sm font-semibold leading-snug text-ink">
                    {c.name} <span className="font-mono text-sub">· {c.phone}</span>
                  </div>
                  {c.note && <div className="break-words text-[12px] text-sub">{c.note}</div>}
                </div>
                <div className="flex shrink-0 items-center">
                  {c.role !== "emergency" && (
                    <>
                      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!manager || i <= 0} onClick={() => moveContact(p.id, c.id, -1)} aria-label={t("Move up")}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!manager || i >= raw.length - 1} onClick={() => moveContact(p.id, c.id, 1)} aria-label={t("Move down")}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!manager} onClick={() => edit(c)} aria-label={t("Edit")}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-sub hover:bg-bad-soft hover:text-bad"
                    disabled={!manager}
                    onClick={() => {
                      removeContact(p.id, c.id);
                      if (editing === c.id) reset();
                      toast(t("Contact removed"), { icon: <X className="h-4 w-4" /> });
                    }}
                    aria-label={t("Delete")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        !open && (
          <div className="mt-4 rounded-xl border border-dashed bg-white/60 px-4 py-6 text-center text-sm text-sub">
            {t("No contacts yet. Add the foreman, the manager and an emergency number — crews will see them on the TV.")}
          </div>
        )
      )}
    </section>
  );
};
