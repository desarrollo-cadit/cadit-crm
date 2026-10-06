// Captures the student portal for design review. Usage:
//   node .impeccable/review/shoot.mjs <prefix> [light|dark] [prox]
// "prox" rewrites /api/portal/me in the browser only (no DB writes) so the
// demo course shows class 7 of 12 with an upcoming class in the agenda.
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const prefix = process.argv[2] ?? "shot";
const theme = process.argv[3] ?? "light";
const prox = process.argv.includes("prox");
const out = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
await ctx.addCookies([{ name: "tema", value: theme, url: BASE }]);
const page = await ctx.newPage();

if (prox) {
  await page.route("**/api/portal/me", async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    const c = json.courses?.[0];
    if (c) {
      c.status = "en_curso";
      c.completedClasses = 6;
      c.approval = "pendiente";
      const t = new Date(Date.now() + 26 * 3600 * 1000);
      t.setUTCHours(21, 30, 0, 0);
      const fin = new Date(t.getTime() + 2 * 3600 * 1000);
      json.nextClass = {
        enrollmentId: c.enrollmentId,
        cohortId: c.cohortId,
        cohortName: c.cohortName,
        courseName: c.courseName,
        number: 7,
        date: t.toISOString().slice(0, 10),
        startsAt: t.toISOString(),
        endsAt: fin.toISOString(),
        topic: "Familias paramétricas y tablas de planificación",
        classroom: c.classroom,
        teacherName: c.teacherName,
        meetingUrl: "https://example.test/sala",
        live: false,
      };
    }
    await route.fulfill({ response: res, json });
  });
}

await page.goto(`${BASE}/login`);
const res = await page.request.post(`${BASE}/api/auth/sign-in/email`, {
  data: { email: "alumno.demo@ejemplo.test", password: "demo-cianotipo-2026" },
  headers: { origin: BASE },
});
if (!res.ok()) throw new Error(`login ${res.status()}`);

async function shoot(path, name, viewport, full = true) {
  await page.setViewportSize(viewport);
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page
    .waitForFunction(() => !document.querySelector(".animate-pulse"), null, { timeout: 60000 })
    .catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}${prefix}-${name}.png`, fullPage: full });
}

await shoot("/portal", "inicio-desktop", { width: 1440, height: 900 });
const href = await page
  .locator('a[href^="/portal/cursadas/"]')
  .first()
  .getAttribute("href")
  .catch(() => null);
await shoot("/portal", "inicio-mobile", { width: 390, height: 844 });
if (!prox && href) {
  await shoot(href, "cursada-desktop", { width: 1440, height: 900 });
  await shoot(href, "cursada-mobile", { width: 390, height: 844 });
  await shoot("/portal/cuenta", "cuenta-desktop", { width: 1440, height: 900 });
  await shoot("/portal/certificados", "certificados-desktop", { width: 1440, height: 900 });
}
await browser.close();
console.log("ok", href);
