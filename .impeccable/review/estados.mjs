// Renders student-portal states the demo data never reaches, by rewriting
// API responses in the browser only (no DB writes). Usage:
//   node .impeccable/review/estados.mjs [light|dark]
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const theme = process.argv[2] ?? "light";
const out = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const iso = (h) => new Date(Date.now() + h * 3600 * 1000).toISOString();
const clon = (o) => JSON.parse(JSON.stringify(o));

function curso(base, extra) {
  return { ...clon(base), ...extra };
}

function modulo(base, n, extra) {
  return {
    ...clon(base),
    enrollmentId: `${base.enrollmentId}-m${n}`,
    cohortName: `Módulo ${n}`,
    position: n,
    sinCronograma: false,
    otraCamada: false,
    camadaName: null,
    ...extra,
  };
}

const ESCENARIOS = {
  vivo(me) {
    const c = me.courses[0];
    Object.assign(c, { status: "en_curso", completedClasses: 6, approval: "pendiente" });
    me.nextClass = {
      enrollmentId: c.enrollmentId, cohortId: c.cohortId, cohortName: c.cohortName,
      courseName: c.courseName, number: 7, date: iso(0).slice(0, 10),
      startsAt: iso(-0.2), endsAt: iso(1.8), topic: "Vistas, cortes y plantillas de vista",
      classroom: c.classroom, teacherName: c.teacherName,
      meetingUrl: "https://example.test/sala", live: true,
    };
    return me;
  },
  varias(me) {
    const c = me.courses[0];
    Object.assign(c, { status: "en_curso", completedClasses: 6, approval: "pendiente" });
    me.courses = [
      c,
      curso(c, {
        enrollmentId: `${c.enrollmentId}-b`, courseName: "AutoCAD 2D Fundamentos para Arquitectura y Construcción",
        cohortName: "Camada 14", teacherName: "Laura Méndez", status: "en_curso",
        totalClasses: 20, completedClasses: 3, attendancePct: 100, attendedCount: 3, eligibleCount: 3,
        approval: "pendiente", assessments: [], license: null, certificate: null,
      }),
      curso(c, {
        enrollmentId: `${c.enrollmentId}-c`, courseName: "Navisworks", cohortName: "Camada 2",
        teacherName: null, status: "planificada", totalClasses: 0, completedClasses: 0,
        attendancePct: null, attendedCount: 0, eligibleCount: 0, approval: "sin_datos",
        approvalReasons: ["Todavía no empezó: no hay notas ni asistencia cargadas."],
        assessments: [], license: null, certificate: null, frequency: null, classroom: null,
      }),
    ];
    me.nextClass = null;
    return me;
  },
  modulos(me) {
    const c = me.courses[0];
    Object.assign(c, {
      courseName: "Especialización BIM en Revit", status: "en_curso", approval: "pendiente",
      totalClasses: 36, completedClasses: 14,
      modules: [
        modulo(c, 1, { approval: "aprobado", totalClasses: 12, completedClasses: 12, attendancePct: 92 }),
        modulo(c, 2, { approval: "pendiente", totalClasses: 12, completedClasses: 2, attendancePct: 50, minAttendancePct: 75, otraCamada: true, camadaName: "Camada 9" }),
        modulo(c, 3, { approval: "sin_datos", totalClasses: 0, completedClasses: 0, attendancePct: null, sinCronograma: true }),
      ],
    });
    me.nextClass = null;
    return me;
  },
  egresado(me) {
    for (const c of me.courses) {
      Object.assign(c, {
        status: "finalizada", approval: "aprobado",
        certificate: { code: "CADIT-2026-0042", issuedAt: iso(-24 * 20), revokedAt: null },
      });
    }
    me.nextClass = null;
    return me;
  },
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ reducedMotion: "reduce" });
await ctx.addCookies([{ name: "tema", value: theme, url: BASE }]);
const page = await ctx.newPage();
let escenario = null;

await page.route("**/api/portal/me", async (route) => {
  const res = await route.fetch();
  const json = await res.json();
  await route.fulfill({ response: res, json: escenario ? ESCENARIOS[escenario](json) : json });
});
await page.route("**/api/portal/me/certificados", async (route) => {
  const res = await route.fetch();
  const json = await res.json();
  json.certificates = [
    { code: "CADIT-2026-0042", issuedAt: iso(-24 * 20), revokedAt: null, courseName: "Revit Arquitectura", cohortName: "Camada 11" },
    { code: "CADIT-2025-0310", issuedAt: iso(-24 * 300), revokedAt: iso(-24 * 100), courseName: "AutoCAD 2D Fundamentos", cohortName: "Camada 6" },
  ];
  await route.fulfill({ response: res, json });
});

await page.goto(`${BASE}/login`);
const login = await page.request.post(`${BASE}/api/auth/sign-in/email`, {
  data: { email: "alumno.demo@ejemplo.test", password: "demo-cianotipo-2026" },
  headers: { origin: BASE },
});
if (!login.ok()) throw new Error(`login ${login.status()}`);

async function shoot(path, name) {
  for (const [vp, w, h] of [["desktop", 1440, 900], ["mobile", 390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => !document.querySelector(".animate-pulse"), null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}estado-${theme}-${name}-${vp}.png`, fullPage: true });
  }
}

for (const e of Object.keys(ESCENARIOS)) {
  escenario = e;
  await shoot("/portal", e);
}
escenario = null;
await shoot("/portal/certificados", "certificados");
await browser.close();
console.log("ok");
