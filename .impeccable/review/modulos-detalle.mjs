// One-off: course detail of a specialization (modules), via response rewrite.
import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const out = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const b = await chromium.launch();
const page = await (await b.newContext({ reducedMotion: "reduce" })).newPage();
await page.route("**/api/portal/me/cursadas/*", async (route) => {
  const res = await route.fetch(); const j = await res.json(); const c = j.course;
  const m = (n, x) => ({ enrollmentId: c.enrollmentId + "-m" + n, cohortName: "Módulo " + n, courseName: c.courseName, teacherName: c.teacherName, startDate: c.startDate, endDate: c.endDate, position: n, sinCronograma: false, otraCamada: false, camadaName: null, attendancePct: 90, minAttendancePct: 75, totalClasses: 12, completedClasses: 12, approval: "aprobado", approvalReasons: [], assessments: [], certificate: null, ...x });
  c.courseName = "Especialización BIM en Revit";
  c.modules = [m(1, { certificate: { code: "CADIT-M1", issuedAt: c.startDate, revokedAt: null } }), m(2, { approval: "pendiente", completedClasses: 2, attendancePct: 50, otraCamada: true, camadaName: "Camada 9" }), m(3, { approval: "sin_datos", sinCronograma: true, totalClasses: 0, completedClasses: 0, attendancePct: null })];
  await route.fulfill({ response: res, json: j });
});
await page.goto(`${BASE}/login`);
await page.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email: "alumno.demo@ejemplo.test", password: "demo-cianotipo-2026" }, headers: { origin: BASE } });
await page.goto(`${BASE}/portal`, { waitUntil: "networkidle" });
const href = await page.locator('a[href^="/portal/cursadas/"]').first().getAttribute("href");
for (const [vp, w, h] of [["desktop", 1440, 900], ["mobile", 390, 844]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(BASE + href, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !document.querySelector(".animate-pulse"), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}estado-modulos-detalle-${vp}.png`, fullPage: true });
}
await b.close(); console.log("ok");
