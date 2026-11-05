import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect } from "react";
import { BrowserRouter, Route, Routes, useNavigate } from "react-router-dom";

import { ProjectLayout } from "@/components/ProjectLayout";
import { ErrorBoundary, StorageGuard } from "@/components/Safety";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";

import { onCloudLost, startCloud } from "@/lib/cloud";
import { translate } from "@/lib/i18n";
import { refreshFromOtherTabs, useStore } from "@/lib/store";

import Board from "./pages/Board";
import TakePage from "./pages/board/TakePage";
import TvPage from "./pages/board/TvPage";
import CableDetail from "./pages/CableDetail";
import Dashboard from "./pages/Dashboard";
import Issues from "./pages/Issues";
import Join from "./pages/Join";
import RfiPage from "./pages/Rfi";
import Links from "./pages/Links";
import Messages from "./pages/Messages";
import NotFound from "./pages/NotFound";
import ClientPortal from "./pages/portal/ClientPortal";
import CrewPortal from "./pages/portal/CrewPortal";
import { usePortal } from "./pages/portal/PortalShell";
import ProjectMap from "./pages/ProjectMap";
import Projects from "./pages/Projects";
import Registry from "./pages/Registry";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Tasks from "./pages/Tasks";
import Team from "./pages/Team";

const queryClient = new QueryClient();

/** Waits for IndexedDB and re-reads it when the tab regains focus (links opened in other tabs). */
const Hydration = ({ children }: { children: ReactNode }) => {
  const hydrated = useStore((s) => s.hydrated);
  const lang = useStore((s) => s.lang);
  const navigate = useNavigate();
  // a crew sent a report from their phone: tell the managers right away
  useEffect(() => {
    const on = (e: Event) => {
      const { pid, reports } = (e as CustomEvent<{ pid: string; reports: { number: number; linkName: string }[] }>).detail;
      if (window.location.pathname.startsWith("/l/")) return;
      const st = useStore.getState();
      const p = st.projects.find((x) => x.id === pid);
      if (!p) return;
      const tr = (k: string, v?: Record<string, string | number>) => translate(st.lang, k, v);
      for (const r of reports.slice(0, 3))
        toast.info(tr("New report #{n} from {crew}", { n: r.number, crew: r.linkName }), {
          description: p.name,
          action: { label: tr("Open"), onClick: () => navigate(`/p/${pid}/reports`) },
        });
    };
    window.addEventListener("cablegrid-report", on);
    return () => window.removeEventListener("cablegrid-report", on);
  }, [navigate]);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => {
    if (!hydrated) return;
    startCloud();
    const tr = (k: string, v?: Record<string, string | number>) => translate(useStore.getState().lang, k, v);
    onCloudLost((name, reason) =>
      toast.error(reason === "deleted" ? tr("Project “{n}” was deleted by its owner", { n: name }) : tr("Your access to “{n}” was revoked", { n: name })),
    );
    const nd = () => toast.error(tr("Only the project owner can delete"));
    window.addEventListener("cablegrid-nodelete", nd);
    return () => window.removeEventListener("cablegrid-nodelete", nd);
  }, [hydrated]);
  useEffect(() => {
    const re = () => {
      if (document.visibilityState === "visible") void refreshFromOtherTabs();
    };
    window.addEventListener("focus", re);
    document.addEventListener("visibilitychange", re);
    return () => {
      window.removeEventListener("focus", re);
      document.removeEventListener("visibilitychange", re);
    };
  }, []);
  if (!hydrated)
    return (
      <div className="blueprint grid h-dvh place-items-center">
        <img
          src="/logo-128.png"
          alt=""
          className="h-12 w-12 animate-pulse rounded-xl"
        />
      </div>
    );
  return <>{children}</>;
};

const Portal = () => {
  const { link } = usePortal();
  return link?.type === "client" ? <ClientPortal /> : <CrewPortal />;
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster position="bottom-right" />
        <StorageGuard />
        <BrowserRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Hydration>
            <Routes>
              <Route path="/" element={<Projects />} />
              <Route path="/p/:pid" element={<ProjectLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="registry" element={<Registry />} />
                <Route path="registry/cable/:cid" element={<CableDetail />} />
                <Route path="messages" element={<Messages />} />
                <Route path="tasks" element={<Tasks />} />
                <Route path="board" element={<Board />} />
                <Route path="reports" element={<Reports />} />
                <Route path="issues" element={<Issues />} />
                <Route path="rfi" element={<RfiPage />} />
                <Route path="links" element={<Links />} />
                <Route path="team" element={<Team />} />
                <Route path="map" element={<ProjectMap />} />
                <Route path="settings" element={<Settings />} />
              </Route>
              <Route path="/l/:token" element={<Portal />} />
              <Route path="/tv/:token" element={<TvPage />} />
              <Route path="/take/:token" element={<TakePage />} />
              <Route path="/join/:pid/:token" element={<Join />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Hydration>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
