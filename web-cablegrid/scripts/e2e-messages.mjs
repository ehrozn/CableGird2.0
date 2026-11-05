// End-to-end check of the Messages feature: client asks, manager replies in tabs, resolves.
// Run: node scripts/e2e-messages.mjs  (needs global playwright and /tmp/imp/it.csv)
import { chromium } from "/usr/local/lib/node_modules/playwright/index.mjs";
import { readFileSync, mkdirSync } from "fs";
const url = process.env.URL ?? "https://jkuptl1m2h2ksrbt1wft1-web-cablegrid.rork.live";
const out = "/tmp/e2e-msg"; mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const pg = await ctx.newPage();
const log = (...a) => console.log(...a);
pg.on("pageerror", (e) => log("pageerror:", e.message));
pg.on("console", (m) => { if (m.type() === "error") log("console:", m.text().slice(0, 200)); });
const shot = (n, p = pg) => p.screenshot({ path: `${out}/${n}.png` });

await pg.goto(url); await pg.waitForTimeout(1500);
await pg.getByRole("button", { name: /New project|Create first project/ }).first().click();
await pg.locator("[role=dialog] input").first().fill("Msg test");
await pg.getByRole("button", { name: /Create project/ }).click(); await pg.waitForTimeout(1500);
const pid = pg.url().match(/\/p\/([^/]+)/)[1];
await pg.getByRole("button", { name: /Import/ }).first().click(); await pg.waitForTimeout(600);
await pg.locator("input[type=file]").last().setInputFiles({ name: "it.csv", mimeType: "text/csv", buffer: readFileSync("/tmp/imp/it.csv") });
await pg.waitForTimeout(3000);
for (const n of [/Review import/, /^Import \d/]) { await pg.locator("[role=dialog] button").filter({ hasText: n }).last().click(); await pg.waitForTimeout(2500); }
await pg.keyboard.press("Escape");

// client link
await pg.goto(`${url}/p/${pid}/links`); await pg.waitForTimeout(1200);
await pg.locator("section").filter({ hasText: "Client links" }).getByRole("button", { name: "New" }).click();
await pg.locator("[role=dialog] input").first().fill("TechInvest");
await pg.getByRole("button", { name: "Create link" }).click(); await pg.waitForTimeout(800);
const token = (await pg.locator("span.font-mono", { hasText: "/l/" }).first().innerText()).replace("/l/", "").trim();
log("token", token);

// client asks two questions
const cl = await ctx.newPage();
cl.on("pageerror", (e) => log("client pageerror:", e.message));
await cl.goto(`${url}/l/${token}`); await cl.waitForTimeout(2000);
async function ask(subject, body, codes) {
  const nb = cl.getByRole("button", { name: /New question/ }).first();
  if (await nb.isEnabled()) { await nb.click(); await cl.waitForTimeout(300); }
  const nameInput = cl.getByPlaceholder("Your name");
  if (await nameInput.count()) await nameInput.first().fill("Anna (TechInvest)");
  await cl.getByPlaceholder("e.g. Rack B-04 — patch panel labels").fill(subject);
  await cl.getByPlaceholder("Describe the question in detail…").fill(body);
  for (const c of codes) { const i = cl.getByPlaceholder("Cable ID + Enter"); await i.fill(c); await i.press("Enter"); }
  await cl.getByRole("button", { name: /^Send$/ }).last().click(); await cl.waitForTimeout(600);
}
await cl.locator("#conversations").scrollIntoViewIfNeeded();
await ask("Rack A — panel 01 labels", "Are panel 01 labels final? We need them for the as-built.", ["idf 1-13 01 12", "IDF1-1301 08"]);
await shot("1-client-asked", cl);
await ask("Schedule for floor 1", "When will floor 1 be tested?", []);
log("client threads:", await cl.locator("#conversations").innerText().then((s) => s.slice(0, 300).replace(/\n/g, " | ")));

// manager
await pg.goto(`${url}/p/${pid}/messages`); await pg.waitForTimeout(1500);
log("nav:", (await pg.locator("nav, aside").first().innerText()).replace(/\n/g, " | ").slice(0, 300));
await shot("2-manager-list");
await pg.getByText("Rack A — panel 01 labels").first().click(); await pg.waitForTimeout(500);
await pg.getByText("Schedule for floor 1").first().click(); await pg.waitForTimeout(500);
await pg.getByText("Rack A — panel 01 labels").first().click(); await pg.waitForTimeout(500);
const box = pg.getByPlaceholder(/Reply to|Write a message/).first();
await box.fill("Yes, labels are final. See attached cables."); await box.press("Enter"); await pg.waitForTimeout(500);
await shot("3-manager-replied");
await pg.getByRole("button", { name: /^Resolve$/ }).first().click(); await pg.waitForTimeout(600);
await shot("4-manager-resolved");
log("url:", pg.url());

await cl.reload(); await cl.waitForTimeout(2000);
await cl.locator("#conversations").scrollIntoViewIfNeeded();
await cl.getByText("Rack A — panel 01 labels").first().click(); await cl.waitForTimeout(500);
log("client view:", (await cl.locator("#conversations").innerText()).replace(/\n/g, " | ").slice(0, 600));
await shot("5-client-resolved", cl);
await b.close();
