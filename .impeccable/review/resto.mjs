// Captures the remaining student screens: offline library, course, topic,
// quiz, course tabs, guide. Usage: node .impeccable/review/resto.mjs [light|dark]
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const theme = process.argv[2] ?? "light";
const out = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const b = await chromium.launch();
const ctx = await b.newContext({ reducedMotion: "reduce" });
await ctx.addCookies([{ name: "tema", value: theme, url: BASE }]);
const page = await ctx.newPage();
// The demo student has no offline courses: serve a synthetic library in the
// browser only (labelled [DEMO], never written anywhere).
const completion = { topicsDone: 3, topicsTotal: 7, quizzesPassed: 1, quizzesTotal: 2, completed: false };
const quizzes = [
  { id: "q1", title: "Cuestionario 1: Interfaz y navegación", lessonId: "l1", passingPercentage: 70, attemptsUsed: 1, attemptsRemaining: 2, passed: true, status: "aprobado" },
  { id: "q2", title: "Cuestionario 2: Muros y niveles", lessonId: "l2", passingPercentage: 70, attemptsUsed: 1, attemptsRemaining: 2, passed: false, status: "disponible" },
];
const curso = {
  id: "oc1", title: "[DEMO] Revit desde cero", hasThumbnail: false,
  descriptionMd: "Curso a tu ritmo: interfaz, muros, niveles y planos. Cada tema tiene su video y una guía escrita.",
  lessons: [
    { id: "l1", title: "Primeros pasos", topics: [
      { id: "t1", title: "La interfaz de Revit", completed: true, unlocked: true },
      { id: "t2", title: "Navegar el modelo", completed: true, unlocked: true },
      { id: "t3", title: "Configurar el proyecto", completed: true, unlocked: true } ] },
    { id: "l2", title: "Muros y niveles", topics: [
      { id: "t4", title: "Crear niveles", completed: false, unlocked: true },
      { id: "t5", title: "Muros básicos", completed: false, unlocked: false },
      { id: "t6", title: "Muros cortina", completed: false, unlocked: false },
      { id: "t7", title: "Planos y vistas", completed: false, unlocked: false } ] },
  ],
  quizzes, completion,
};
await page.route("**/api/portal/me/offline-courses**", async (route) => {
  const u = new URL(route.request().url());
  const p = u.pathname.replace("/api/portal/me/offline-courses", "");
  if (route.request().method() === "POST") return route.fulfill({ json: { progress: { watchedRatio: 0, completed: false } } });
  if (p === "" ) return route.fulfill({ json: { courses: [
    { id: "oc1", title: curso.title, hasThumbnail: false, topics: 7, quizzesTotal: 2, quizzesPassed: 1, completion },
    { id: "oc2", title: "[DEMO] AutoCAD 2D para arquitectura", hasThumbnail: false, topics: 12, quizzesTotal: 3, quizzesPassed: 3,
      completion: { topicsDone: 12, topicsTotal: 12, quizzesPassed: 3, quizzesTotal: 3, completed: true } } ] } });
  if (p === "/oc1") return route.fulfill({ json: { course: curso } });
  if (p.startsWith("/oc1/topics/")) return route.fulfill({ json: { topic: {
    course: { id: "oc1", title: curso.title }, lessonTitle: "Muros y niveles",
    topic: { id: "t4", title: "Crear niveles", contentMd: "Los **niveles** definen las alturas del proyecto.\n\n1. Abrí una vista de alzado.\n2. Usá la herramienta *Nivel* de la pestaña Arquitectura.\n3. Renombrá cada nivel con su cota." },
    video: null, progress: { completed: false, watchedRatio: 0 },
    prev: { id: "t3", title: "Configurar el proyecto" }, next: { id: "t5", title: "Muros básicos" } } } });
  if (p.startsWith("/oc1/quizzes/")) return route.fulfill({ json: { quiz: {
    ...quizzes[1], descriptionMd: "Cinco preguntas. Necesitás 70% para aprobar.", course: { id: "oc1", title: curso.title }, maxAttempts: 3,
    questions: [{ id: "p1", questionMd: "¿Qué define un **nivel** en Revit?", answerType: "single", answers: [{ id: "a", text: "Una altura de referencia del proyecto" }, { id: "b", text: "Un tipo de muro" }, { id: "c", text: "Una vista 3D" }] }],
    attempts: [{ attemptNumber: 1, scorePercentage: 40, passed: false, createdAt: new Date(Date.now() - 86400000 * 3).toISOString() }] } } });
  return route.fallback();
});

await page.goto(`${BASE}/login`);
await page.request.post(`${BASE}/api/auth/sign-in/email`, {
  data: { email: "alumno.demo@ejemplo.test", password: "demo-cianotipo-2026" },
  headers: { origin: BASE },
});

const lista = { courses: [{ id: "oc1" }] };
console.log("offline courses:", lista?.courses?.length ?? "error");

async function shoot(path, name, prep) {
  for (const [vp, w, h] of [["desktop", 1440, 900], ["mobile", 390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => !document.querySelector(".animate-pulse"), null, { timeout: 60000 }).catch(() => {});
    if (prep) await prep();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}resto-${theme}-${name}-${vp}.png`, fullPage: true });
  }
}

await shoot("/portal/cursos-offline", "offline");
const primero = lista?.courses?.[0];
if (primero) {
  await shoot(`/portal/cursos-offline/${primero.id}`, "offline-curso");
  const detalle = { course: { lessons: [{ topics: [{ id: "t4", unlocked: true }] }], quizzes: [{ id: "q2" }] } };
  const tema = detalle.course?.lessons?.flatMap((l) => l.topics).find((t) => t.unlocked);
  if (tema) await shoot(`/portal/cursos-offline/${primero.id}/temas/${tema.id}`, "offline-tema");
  const quiz = detalle.course?.quizzes?.[0];
  if (quiz) await shoot(`/portal/cursos-offline/${primero.id}/cuestionarios/${quiz.id}`, "offline-quiz");
}
await page.goto(`${BASE}/portal`, { waitUntil: "networkidle" });
const href = await page.locator('a[href^="/portal/cursadas/"]').first().getAttribute("href");
await shoot(href, "cursada-evaluaciones", async () => {
  await page.getByRole("tab", { name: /Evaluaciones/ }).click();
  await page.waitForFunction(() => !document.querySelector(".animate-pulse"), null, { timeout: 60000 }).catch(() => {});
});
await shoot("/portal/guia", "guia");
await b.close();
console.log("ok");
