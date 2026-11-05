import { Link2Off, Loader2, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { LanguageSwitcher } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { joinProject, renameMe } from "@/lib/cloud";
import { CloudError } from "@/lib/cloud-api";
import { useT } from "@/lib/i18n";
import { getMe } from "@/lib/me";
import { Blocker } from "@/pages/portal/PortalShell";

/** Manager share link: /join/:pid/:token */
const Join = () => {
  const t = useT();
  const nav = useNavigate();
  const { pid = "", token = "" } = useParams();
  const [name, setName] = useState(getMe().name);
  const [state, setState] = useState<"idle" | "loading" | "bad" | "offline">("idle");

  const go = async () => {
    if (!name.trim()) return;
    renameMe(name);
    setState("loading");
    try {
      const p = await joinProject(pid, token);
      nav(`/p/${p.id}`, { replace: true });
    } catch (e) {
      setState(e instanceof CloudError && e.status >= 400 && e.status < 500 ? "bad" : "offline");
    }
  };

  if (state === "bad")
    return <Blocker icon={<Link2Off />} title={t("Link not valid")} text={t("This link was replaced or the project was deleted. Ask the project manager for a new one.")} />;

  return (
    <div className="blueprint grid min-h-dvh place-items-center p-6">
      <form
        className="panel rise w-full max-w-sm p-8 text-center"
        onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}
      >
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-brand-soft text-brand">
          <Users className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-extrabold text-ink">{t("You are invited to a project")}</h1>
        <p className="mt-2 text-sm text-sub">{t("Enter your name. The team sees it next to every change you make.")}</p>
        <Input
          autoFocus
          value={name}
          placeholder={t("e.g. Anna Petrova")}
          onChange={(e) => setName(e.target.value)}
          className="mt-5 h-12 text-center text-base"
          aria-label={t("Your name")}
        />
        {state === "offline" && <p className="mt-2 text-sm text-bad">{t("No connection. Try again.")}</p>}
        <Button type="submit" className="mt-4 w-full" size="lg" disabled={!name.trim() || state === "loading"}>
          {state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {state === "loading" ? t("Opening the project…") : t("Join project")}
        </Button>
        <div className="mt-6 flex justify-center">
          <LanguageSwitcher />
        </div>
      </form>
    </div>
  );
};

export default Join;
