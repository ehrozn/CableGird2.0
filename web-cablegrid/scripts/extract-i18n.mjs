// Extracts translation keys (t("...") calls and label constants) into scripts/i18n-keys.json
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../src", import.meta.url).pathname;
// Strings translated indirectly (label maps, suggestions, stage names)
const EXTRA = ["Added to registry","All","Approve and track","Approved reports update the registry and every cable's history.","Build your registry","Bulk edit","Cable ties","Cable type","Certification ID","Coax","Color","Conduit (m)","Connector","Copper backbone","Custom columns and sheets, or import Excel, PDF and DXF drawings.","Dashboard","Data center","Detected ID","Device / host","Drawing ref","Drawing","Dropdown list","Edit cable values","Edited","Employee","End location","Event","Fail","Fiber / backbone","Fiber MM","Fiber SM","Fiber optic","Fiber pigtails","Field side termination","Floor","Foreman","Foremen report work, cables and materials from their phone — no login.","History","IDF / MDF","Imported","Inspector","Issue reported","Jacket","Keystone jacks","Labeled","Labels","Language","Length","Marginal","Mixed / other","Number","Outlet / faceplate","Panel","Pass","Patch cords","Pathway","Port","Power","Project created","Pulled","Rack","Report issues","Resolved","Room","Row / cabinet","Screws","See tasks","Send reports","Share crew links","Splice sleeves","Start location","Strands / pairs","Structured cabling (LAN)","Structured cabling","Subcontractor","Technician","Telecom","Terminated","Test date","Test result","Tested","Text","U position","Velcro straps","RJ45 connectors","Date","Checkbox","Manager","Sheet {n}","Work stage (crew marks it with a date)","Pull","Test","Not done","Reassigned","Released","All places on this task are already taken","This task is blocked right now","This task belongs to a crew — it can't be taken by QR","This task is already done","This task no longer exists","Your crew link is not active — ask your foreman","On the TV now","Scheduled","Expired","Hidden","News","Important","Safety","Good news","Hard hats, vests and safety boots on site at all times","Safety briefing at 7:30 at the site office","Material delivery today — keep the loading area free","Power shutdown on this floor — check before you start","Daily reports are due by 17:00","Great work, team — milestone reached!","Emergency","Foreman","Project manager","Safety officer","Warehouse / materials","Other","Own role","Own name","Lunch","Break","Briefing","Electrician on call","Site guard","General contractor","Client representative","First aid","IT / network admin"];
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (!p.includes("/ui")) walk(p); } else if (/\.tsx?$/.test(f) && !f.includes("i18n-dict")) files.push(p); } };
walk(root);
const keys = new Set();
const re = /\bt\(\s*"((?:[^"\\]|\\.)*)"/g;
for (const f of files) { const s = readFileSync(f, "utf8"); let m; while ((m = re.exec(s))) keys.add(m[1]); }
for (const k of EXTRA) keys.add(k);
// board labels: label maps in src/lib/board.ts are translated where shown
{ const b = readFileSync(join(root, "lib/board.ts"), "utf8"); const lre = /\blabel: "((?:[^"\\]|\\.)*)"/g; let m; while ((m = lre.exec(b))) keys.add(m[1]);
  for (const blk of b.matchAll(/(?:STAGE_LABEL|STAGE_STATE_LABEL)[^=]*=\s*\{([^}]*)\}/g)) for (const v of blk[1].matchAll(/:\s*"([^"]+)"/g)) keys.add(v[1]);
  keys.add("Reason not given"); }
writeFileSync(new URL("./i18n-keys.json", import.meta.url), JSON.stringify([...keys].sort(), null, 0));
console.log(keys.size);
