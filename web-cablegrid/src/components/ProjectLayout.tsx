import { parseCableQuery, searchCables } from "@/lib/cable-search";
import { normCode, textMatches } from "@/lib/ids";
import {
  AlertTriangle,
  Bell,
  CheckSquare,
  ChevronsUpDown,
  Database,
  FileText,
  FolderKanban,
  LayoutGrid,
  Link2,
  Menu,
  MonitorPlay,
  MessageSquare,
  MessageSquareWarning,
  MessagesSquare,
  Network,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CloudBar } from "@/components/CloudShare";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { lastPost } from "@/components/threads";
import { projectStats, threadUnread } from "@/lib/derive";
import { useFmt, useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";

import { LanguageSwitcher, Logo, useProject } from "./common";

const NAV = [
  { to: "", label: "Dashboard", icon: LayoutGrid, end: true },
  { to: "registry", label: "Cable registry", icon: Database },
  { to: "messages", label: "Messages", icon: MessagesSquare },
  { to: "tasks", label: "Tasks", icon: CheckSquare },
  { to: "board", label: "Work board", icon: MonitorPlay },
  { to: "reports", label: "Reports", icon: FileText },
  { to: "rfi", label: "RFI requests", icon: MessageSquareWarning },
  { to: "issues", label: "Issues", icon: AlertTriangle },
  { to: "links", label: "Links", icon: Link2 },
  { to: "team", label: "Team", icon: Users },
  { to: "map", label: "Project map", icon: Network },
];

const SidebarBody = ({ p, onNav }: { p: Project; onNav?: () => void }) => {
  const t = useT();
  const projects = useStore((s) => s.projects);
  const navigate = useNavigate();
  const stats = useMemo(() => projectStats(p), [p]);
  const counts: Record<string, number> = {
    "": stats.pendingReports,
    messages: stats.unreadMessages,
    issues: stats.openIssues,
    tasks: stats.overdueTasks,
    rfi: (p.rfis ?? []).filter((r) => r.status === "pending").length,
  };
  return (
    <div className="flex h-full flex-col">
      <Link to="/" className="px-5 pb-5 pt-5" onClick={onNav}>
        <Logo />
      </Link>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Project">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to ? `/p/${p.id}/${n.to}` : `/p/${p.id}`}
            end={n.end}
            onClick={onNav}
            className={({ isActive }) =>
              cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14.5px] font-medium text-ink/80 transition hover:bg-white hover:text-ink",
                isActive && "bg-brand-soft text-brand-deep hover:bg-brand-soft hover:text-brand-deep",
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute -left-3 top-1.5 h-[calc(100%-12px)] w-[3px] rounded-r bg-brand" />}
                <n.icon className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-brand" : "text-sub group-hover:text-ink")} />
                <span className="truncate">{t(n.label)}</span>
                {!!counts[n.to] && (
                  <span
                    className={cn(
                      "ml-auto grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold",
                      n.to === "issues" ? "bg-bad text-white" : "bg-brand text-white",
                    )}
                  >
                    {counts[n.to]}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-1 border-t p-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-lg border bg-white px-3 py-2.5 text-left transition hover:border-brand/50">
            <FolderKanban className="h-4 w-4 shrink-0 text-brand" />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] text-sub">{t("Project")}</span>
              <span className="block truncate text-sm font-semibold text-ink">{p.name}</span>
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-sub" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>{t("Switch project")}</DropdownMenuLabel>
            {projects.map((x) => (
              <DropdownMenuItem
                key={x.id}
                onClick={() => {
                  navigate(`/p/${x.id}`);
                  onNav?.();
                }}
                className={cn(x.id === p.id && "font-semibold text-brand-deep")}
              >
                <span className="truncate">{x.name}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/")}>{t("All projects")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <NavLink
          to={`/p/${p.id}/settings`}
          onClick={onNav}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink/80 hover:bg-white",
              isActive && "bg-brand-soft text-brand-deep",
            )
          }
        >
          <Settings className="h-4 w-4 text-sub" />
          {t("Settings & backup")}
        </NavLink>
      </div>
    </div>
  );
};

const GlobalSearch = ({ p, open, setOpen }: { p: Project; open: boolean; setOpen: (o: boolean) => void }) => {
  const t = useT();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const go = (to: string) => {
    setOpen(false);
    setQ("");
    navigate(to);
  };
  const qq = q.trim().toLowerCase();
  const cables = useMemo(() => {
    if (!qq) return [];
    const pq = parseCableQuery(q.trim());
    // a pasted list or a range (C-001..C-040) uses the shared cable search
    if (pq.kind === "range" || /[,;\n]/.test(q)) return searchCables(p.cables, q.trim()).hits.slice(0, 12);
    const out = [];
    for (const c of p.cables) {
      if (textMatches(c.code, qq) || Object.values(c.values).some((v) => textMatches(v, qq))) {
        out.push(c);
        if (out.length >= 12) break;
      }
    }
    return out;
  }, [p.cables, qq, q]);
  const tasks = qq ? p.tasks.filter((x) => x.title.toLowerCase().includes(qq)).slice(0, 6) : [];
  const convs = qq
    ? (p.threads ?? []).filter((x) => `#${x.number} ${x.subject} ${x.linkName} ${x.startedBy}`.toLowerCase().includes(qq) || x.cableCodes.some((c) => textMatches(c, qq))).slice(0, 6)
    : [];
  const people = qq ? p.employees.filter((x) => x.name.toLowerCase().includes(qq)).slice(0, 6) : [];
  const reports = qq
    ? p.reports
        .filter((r) => `#${r.number} ${r.linkName} ${r.submittedByName}`.toLowerCase().includes(qq) || r.cables.some((c) => textMatches(c.code, qq)))
        .slice(0, 6)
    : [];
  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput value={q} onValueChange={setQ} placeholder={t("Search cables, tasks, reports, people…")} />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>{t("Nothing found")}</CommandEmpty>
        {!qq && (
          <CommandGroup heading={t("Go to")}>
            {NAV.map((n) => (
              <CommandItem key={n.to} value={t(n.label)} onSelect={() => go(n.to ? `/p/${p.id}/${n.to}` : `/p/${p.id}`)}>
                <n.icon className="mr-2 text-sub" />
                {t(n.label)}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {cables.length > 0 && (
          <CommandGroup heading={t("Cables")}>
            {cables.map((c) => (
              <CommandItem key={c.id} value={`cable ${c.code} ${normCode(c.code)} ${c.id}`} onSelect={() => go(`/p/${p.id}/registry/cable/${c.id}`)}>
                <Database className="mr-2 text-cat" />
                <span className="font-mono font-semibold">{c.code}</span>
                <span className="ml-3 truncate text-xs text-sub">{Object.values(c.values).filter(Boolean).slice(0, 3).join(" · ")}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {tasks.length > 0 && (
          <CommandGroup heading={t("Tasks")}>
            {tasks.map((x) => (
              <CommandItem key={x.id} value={`task ${x.title} ${x.id}`} onSelect={() => go(`/p/${p.id}/tasks?open=${x.id}`)}>
                <CheckSquare className="mr-2 text-sub" />
                {x.title}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {reports.length > 0 && (
          <CommandGroup heading={t("Reports")}>
            {reports.map((r) => (
              <CommandItem key={r.id} value={`report ${r.number} ${r.id}`} onSelect={() => go(`/p/${p.id}/reports?open=${r.id}`)}>
                <FileText className="mr-2 text-sub" />#{r.number} · {r.linkName} · {r.submittedByName}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {convs.length > 0 && (
          <CommandGroup heading={t("Messages")}>
            {convs.map((x) => (
              <CommandItem key={x.id} value={`thread ${x.number} ${x.subject} ${x.id}`} onSelect={() => go(`/p/${p.id}/messages?t=${x.id}`)}>
                <MessagesSquare className="mr-2 text-sub" />#{x.number} · {x.subject}
                <span className="ml-3 truncate text-xs text-sub">{x.linkName}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {people.length > 0 && (
          <CommandGroup heading={t("Team")}>
            {people.map((x) => (
              <CommandItem key={x.id} value={`person ${x.name} ${x.id}`} onSelect={() => go(`/p/${p.id}/team`)}>
                <Users className="mr-2 text-sub" />
                {x.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
};

const Notifications = ({ p }: { p: Project }) => {
  const t = useT();
  const f = useFmt();
  const pending = p.reports.filter((r) => r.status === "pending");
  const unread = (p.threads ?? []).filter((x) => threadUnread(x, "manager"));
  const n = pending.length + unread.length;
  return (
    <Popover>
      <PopoverTrigger className="relative grid h-9 w-9 place-items-center rounded-lg border bg-white transition hover:border-brand/50" aria-label={t("Notifications")}>
        <Bell className="h-[18px] w-[18px] text-ink" />
        {n > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">{n}</span>}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-3 text-sm font-bold">{t("Notifications")}</div>
        <div className="max-h-80 overflow-y-auto">
          {n === 0 && <div className="px-4 py-8 text-center text-sm text-sub">{t("All caught up")}</div>}
          {pending.map((r) => (
            <Link key={r.id} to={`/p/${p.id}/reports?open=${r.id}`} className="flex gap-3 border-b px-4 py-3 text-sm hover:bg-muted">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              <span>
                <span className="font-semibold">{t("Report #{n} awaits review", { n: r.number })}</span>
                <span className="block text-xs text-sub">
                  {r.linkName} · {f.dateTime(r.submittedAt)}
                </span>
              </span>
            </Link>
          ))}
          {unread.map((x) => {
            const lp = lastPost(x);
            return (
              <Link key={x.id} to={`/p/${p.id}/messages?t=${x.id}`} className="flex gap-3 border-b px-4 py-3 text-sm hover:bg-muted">
                <MessageSquare className={cn("mt-0.5 h-4 w-4 shrink-0", x.priority === "urgent" || x.priority === "high" ? "text-bad" : "text-cat")} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">
                    #{x.number} {x.subject}
                  </span>
                  <span className="block truncate text-xs text-sub">
                    {lp.by}: {lp.text}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export const ProjectLayout = () => {
  const p = useProject();
  const t = useT();
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState(false);
  const loc = useLocation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch((x) => !x);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.querySelector("main")?.scrollTo({ top: 0 });
  }, [loc.pathname]);

  if (!p) return <Navigate to="/" replace />;

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="hidden w-[248px] shrink-0 border-r bg-sidebar lg:block">
        <SidebarBody p={p} />
      </aside>
      <Sheet open={mobileNav} onOpenChange={setMobileNav}>
        <SheetContent side="left" className="w-[280px] bg-sidebar p-0">
          <SheetTitle className="sr-only">{t("Navigation")}</SheetTitle>
          <SidebarBody p={p} onNav={() => setMobileNav(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-white/80 px-3 backdrop-blur md:gap-3 md:px-6">
          <button className="grid h-9 w-9 place-items-center rounded-lg border bg-white lg:hidden" onClick={() => setMobileNav(true)} aria-label={t("Menu")}>
            <Menu className="h-[18px] w-[18px]" />
          </button>
          <button
            onClick={() => setSearch(true)}
            className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-lg border bg-background/60 px-3 text-left text-sm text-sub transition hover:border-brand/50 md:max-w-[520px]"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="truncate">{t("Search cables, tasks, reports…")}</span>
            <kbd className="ml-auto hidden rounded border bg-white px-1.5 py-0.5 text-[10px] text-sub md:inline">⌘K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            <Notifications p={p} />
            <CloudBar p={p} />
          </div>
        </header>
        <main className="blueprint min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <div key={loc.pathname} className="rise mx-auto w-full max-w-[1480px] px-3 py-5 md:px-6 md:py-7">
            <Outlet />
          </div>
        </main>
      </div>
      <GlobalSearch p={p} open={search} setOpen={setSearch} />
    </div>
  );
};
