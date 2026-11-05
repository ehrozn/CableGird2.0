/** Who is using this browser: a display name (asked when sharing / joining) and a stable client id. */
const KEY = "cablegrid-me";

type Me = { name: string; client: string };

const rand = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

let cache: Me | null = null;

export const getMe = (): Me => {
  if (cache) return cache;
  let me: Partial<Me> = {};
  try {
    me = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Me>;
  } catch {
    /* ignore */
  }
  cache = { name: typeof me.name === "string" ? me.name : "", client: typeof me.client === "string" && me.client ? me.client : rand() };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
  return cache;
};

export const setMyName = (name: string) => {
  cache = { ...getMe(), name: name.trim().slice(0, 60) };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
};

/** Crew / client portals act under the link (or the picked crew member), not the browser owner's name. */
const actors: { link: string | null; person: string | null } = { link: null, person: null };
export const setActor = (name: string | null, level: "link" | "person" = "link") => {
  actors[level] = name?.trim() || null;
};

/** Name written into history / activity ("Manager" until the user enters a name). */
export const who = () => actors.person ?? actors.link ?? (getMe().name || "Manager");

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";
