/**
 * cursos-offline — The LearnDash content library, end to end (script:
 * tests/e2e/us-cursos-offline.md).
 *
 * Own module so it can run ALONE (the whole harness takes more than ten
 * minutes): `e2e-selftest.mjs` calls it near the end, and any temporary entry
 * point can import it with a staff session already open.
 *
 * It drives, as real users and through the real HTTP API:
 *  - the importer over a SYNTHETIC fixture (tests/e2e/fixtures/cursos-offline;
 *    client content never enters the repo), twice: the second run writes nothing;
 *  - staff: library, detail with the answer key, pending/skip quizzes absent;
 *  - cohort assignment + per-student grant/revoke and the resulting states;
 *  - student portal: who sees what, 404 (never 403) for what they cannot read,
 *    the answer key never travelling, grading and the retry limit;
 *  - teacher portal and staff attempt history, with their 404s;
 *  - the staff and portal pages render.
 *
 * The importer writes straight to DATABASE_URL, so the section refuses to run
 * unless that URL is the ephemeral `vocero_e2e` database.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURES = path.join(ROOT, "tests", "e2e", "fixtures", "cursos-offline");
const TITLE_A = "Curso E2E A";
const TITLE_B = "Curso E2E B";
const SIMPLE = "Cuestionario simple E2E";
const MULTIPLE = "Cuestionario múltiple E2E";

/** Own cookie jar: the harness's global cookie belongs to the staff operator. */
function conJar(BASE, jar) {
  return async (p, opts = {}) => {
    const res = await fetch(`${BASE}${p}`, {
      redirect: "manual",
      ...opts,
      headers: {
        "content-type": "application/json",
        origin: BASE,
        ...(jar.cookie ? { cookie: jar.cookie } : {}),
        ...(opts.headers ?? {}),
      },
    });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) jar.cookie = set.map((c) => c.split(";")[0]).join("; ");
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { res, json, text };
  };
}

/** Per-table insert/update counts from the importer's report table. */
function parseCounts(stdout) {
  const out = {};
  for (const line of stdout.split(/\r?\n/)) {
    const m = /^\s+(offline_\w+|media_asset)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/.exec(line);
    if (m) out[m[1]] = { insert: +m[2], update: +m[3], noop: +m[4], delete: +m[5] };
  }
  return out;
}

async function buildImporter() {
  const { build } = await import("esbuild");
  mkdirSync(path.join(ROOT, ".tmp"), { recursive: true });
  const outfile = path.join(ROOT, ".tmp", "import-offline-courses-e2e.mjs");
  // Same flags as `pnpm import:offline-courses`; `.tmp/` is gitignored and sits
  // inside the repo so the external packages resolve from its node_modules.
  await build({
    absWorkingDir: ROOT,
    entryPoints: ["scripts/import/offline-courses.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    alias: { "@": "./src" },
    packages: "external",
    logLevel: "error",
  });
  return outfile;
}

export async function seccionCursosOffline({ api, ok, BASE, getCookie }) {
  console.log("\n== cursos-offline: biblioteca importada, acceso y cuestionarios ==");

  // ---- 0. Guard: the importer writes to DATABASE_URL directly.
  const dbUrl = process.env.DATABASE_URL ?? "";
  const dbName = /\/([^/?]+)(\?|$)/.exec(dbUrl)?.[1] ?? "";
  ok("DATABASE_URL apunta a la base efímera vocero_e2e", dbName === "vocero_e2e", `base=${dbName || "(vacía)"}`);
  if (dbName !== "vocero_e2e") return;

  // ---- 1. Import the synthetic fixture, twice.
  const orgs = (await api("/api/auth/organization/list")).json;
  const orgId = Array.isArray(orgs) && orgs.length === 1 ? orgs[0]?.id : null;
  let bundle;
  try {
    bundle = await buildImporter();
  } catch (e) {
    ok("el importador compila (esbuild)", false, String(e));
    return;
  }
  const runImport = () =>
    spawnSync(
      process.execPath,
      [
        bundle,
        "--file",
        path.join(FIXTURES, "courses.json"),
        "--map",
        path.join(FIXTURES, "quiz-map.json"),
        ...(orgId ? ["--org", orgId] : []),
        "--apply",
      ],
      { cwd: ROOT, env: process.env, encoding: "utf8" }
    );

  const first = runImport();
  const firstCounts = parseCounts(first.stdout ?? "");
  ok(
    "importador: primera corrida aplicada",
    first.status === 0 && Object.keys(firstCounts).length >= 6,
    `exit=${first.status} ${first.stderr?.slice(0, 400)} ${first.stdout?.slice(-600)}`
  );
  ok(
    "importador: el cuestionario `pending` queda fuera y se informa",
    /PENDING owner confirmation — not imported: quiz:9003/.test(first.stdout ?? "") &&
      /skipped \(skip\): quiz:9004/.test(first.stdout ?? ""),
    first.stdout?.slice(0, 800)
  );
  const second = runImport();
  const secondCounts = parseCounts(second.stdout ?? "");
  const written = Object.values(secondCounts).reduce((n, c) => n + c.insert + c.update + c.delete, 0);
  ok(
    "importador: la segunda corrida no inserta ni cambia nada (idempotente)",
    second.status === 0 && Object.keys(secondCounts).length >= 6 && written === 0,
    `exit=${second.status} ${JSON.stringify(secondCounts)}`
  );
  rmSync(bundle, { force: true });

  // ---- 2. Staff: library and read-only detail.
  const lib = await api("/api/offline-courses");
  const libCourses = lib.json?.courses ?? [];
  const A = libCourses.find((c) => c.title === TITLE_A);
  const B = libCourses.find((c) => c.title === TITLE_B);
  ok(
    "staff: la biblioteca lista los dos cursos con sus conteos",
    lib.res.ok && A?.lessons === 2 && A?.topics === 4 && A?.quizzes === 2 && B?.lessons === 1 && B?.quizzes === 0,
    `${lib.res.status} ${JSON.stringify(libCourses)}`
  );
  if (!A || !B) return;

  const detA = (await api(`/api/offline-courses/${A.id}`)).json?.course;
  const detB = (await api(`/api/offline-courses/${B.id}`)).json?.course;
  const simpleStaff = detA?.quizzes?.find((q) => q.title === SIMPLE);
  const correctTexts = (simpleStaff?.questions ?? []).flatMap((q) =>
    q.answers.filter((a) => a.isCorrect).map((a) => a.text)
  );
  ok(
    "staff: el detalle trae la clave de respuestas",
    JSON.stringify(correctTexts) === JSON.stringify(["4", "Azul"]) &&
      simpleStaff?.retriesAllowed === 1 &&
      simpleStaff?.passingPercentage === 80,
    JSON.stringify({ correctTexts, simpleStaff: simpleStaff && { ...simpleStaff, questions: undefined } })
  );
  const allQuizTitles = [...(detA?.quizzes ?? []), ...(detB?.quizzes ?? [])].map((q) => q.title);
  ok(
    "staff: los cuestionarios pending y skip no existen",
    allQuizTitles.length === 2 && !allQuizTitles.some((t) => /pendiente|descartado/.test(t)),
    JSON.stringify(allQuizTitles)
  );
  ok(
    "staff: un curso inexistente responde 404",
    (await api("/api/offline-courses/ofc_no_existe")).res.status === 404
  );

  // ---- 3. People: a cohort with two students and its teacher; another teacher elsewhere.
  const sello = Date.now();
  const isoDia = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const courseId = (
    await api("/api/courses", {
      method: "POST",
      body: JSON.stringify({ name: `Curso offline E2E ${sello}`, published: false }),
    })
  ).json?.course?.id;
  const teacher = async (name, email) => {
    const r = await api("/api/teachers", { method: "POST", body: JSON.stringify({ name, email }) });
    return r.json?.teacher?.id ?? r.json?.id;
  };
  const emailProfe = `profe-offline-${sello}@example.com`;
  const emailOtro = `profe-offline-otro-${sello}@example.com`;
  const profeId = await teacher("Profe Offline E2E", emailProfe);
  const otroId = await teacher("Profe Ajeno Offline E2E", emailOtro);
  const cohort = async (name, teacherId) => {
    const r = await api("/api/cohorts", {
      method: "POST",
      body: JSON.stringify({
        courseId,
        name,
        startDate: isoDia(-7),
        endDate: isoDia(60),
        daysOfWeek: "0,2",
        startTime: "18:30",
        endTime: "20:30",
        teacherId,
      }),
    });
    return r.json?.cohort?.id ?? r.json?.id;
  };
  const cohId = await cohort(`Cohorte offline ${sello}`, profeId);
  const otraCohId = await cohort(`Cohorte ajena offline ${sello}`, otroId);

  const inscribir = async (firstName, email, phone) => {
    const r = await api("/api/enrollments", {
      method: "POST",
      body: JSON.stringify({ cohortId: cohId, contact: { firstName, lastName: "Offline", phone, email } }),
    });
    return r.json?.enrollment?.id ?? r.json?.id;
  };
  const tail = String(sello).slice(-6);
  const email1 = `alumno1-offline-${sello}@example.com`;
  const email2 = `alumno2-offline-${sello}@example.com`;
  const e1 = await inscribir("Uno", email1, `59891${tail}`);
  const e2 = await inscribir("Dos", email2, `59892${tail}`);
  ok(
    "setup: curso, dos profesores, dos cohortes y dos inscripciones",
    Boolean(courseId && profeId && otroId && cohId && otraCohId && e1 && e2),
    JSON.stringify({ courseId, profeId, otroId, cohId, otraCohId, e1, e2 })
  );

  // Each person logs in from their own address: the sign-in limiter is per IP.
  let ip = 0;
  const otraIp = () => ({ "x-forwarded-for": `203.0.113.${++ip}` });
  const loginAlumno = async (enrollmentId, email) => {
    const acceso = await api(`/api/enrollments/${enrollmentId}/access`, { method: "POST" });
    const jar = { cookie: "" };
    const como = conJar(BASE, jar);
    const login = await como("/api/auth/sign-in/email", {
      method: "POST",
      headers: otraIp(),
      body: JSON.stringify({ email, password: acceso.json?.temporaryPassword }),
    });
    return { como, entro: login.res.ok, motivo: `${acceso.res.status} / login ${login.res.status}` };
  };
  const loginProfe = async (teacherId, email) => {
    const inv = await api(`/api/teachers/${teacherId}/access`, { method: "POST", body: "{}" });
    const jar = { cookie: "" };
    const como = conJar(BASE, jar);
    const login = await como("/api/auth/sign-in/email", {
      method: "POST",
      headers: otraIp(),
      body: JSON.stringify({ email, password: inv.json?.temporaryPassword }),
    });
    return { como, entro: login.res.ok, motivo: `${inv.res.status} / login ${login.res.status}` };
  };

  // ---- 4. Assignment: the cohort inherits A; student 2 loses A; student 1 gains B.
  const asignar = await api(`/api/cohorts/${cohId}/offline-courses`, {
    method: "PUT",
    body: JSON.stringify({ courseIds: [A.id] }),
  });
  const asignado = (await api(`/api/cohorts/${cohId}/offline-courses`)).json;
  ok(
    "staff: la cohorte hereda el curso A",
    asignar.res.ok && JSON.stringify(asignado?.courseIds) === JSON.stringify([A.id]),
    `${asignar.res.status} ${JSON.stringify(asignado?.courseIds)}`
  );
  const asignarInventado = await api(`/api/cohorts/${cohId}/offline-courses`, {
    method: "PUT",
    body: JSON.stringify({ courseIds: [A.id, "ofc_no_existe"] }),
  });
  const trasInventado = (await api(`/api/cohorts/${cohId}/offline-courses`)).json?.courseIds;
  ok(
    "staff: asignar un curso inexistente se rechaza (422) y no toca nada",
    asignarInventado.res.status === 422 && JSON.stringify(trasInventado) === JSON.stringify([A.id]),
    `${asignarInventado.res.status} ${JSON.stringify(trasInventado)}`
  );

  const quitar = await api(`/api/enrollments/${e2}/offline-courses`, {
    method: "PUT",
    body: JSON.stringify({ courseId: A.id, action: "revoke" }),
  });
  const agregar = await api(`/api/enrollments/${e1}/offline-courses`, {
    method: "PUT",
    body: JSON.stringify({ courseId: B.id, action: "grant" }),
  });
  const estados = async (enr) => {
    const list = (await api(`/api/enrollments/${enr}/offline-courses`)).json?.courses ?? [];
    return Object.fromEntries(list.filter((c) => c.courseId === A.id || c.courseId === B.id).map((c) => [c.title, c.state]));
  };
  const est1 = await estados(e1);
  const est2 = await estados(e2);
  ok(
    "staff: alumno 1 → A heredado, B agregado; alumno 2 → A quitado, B sin acceso",
    quitar.res.ok &&
      agregar.res.ok &&
      est1[TITLE_A] === "inherited" &&
      est1[TITLE_B] === "granted" &&
      est2[TITLE_A] === "revoked" &&
      est2[TITLE_B] === "none",
    JSON.stringify({ quitar: quitar.res.status, agregar: agregar.res.status, est1, est2 })
  );

  // ---- 5. Student portal: who sees what.
  const al1 = await loginAlumno(e1, email1);
  const al2 = await loginAlumno(e2, email2);
  ok("portal: los dos alumnos entran", al1.entro && al2.entro, `${al1.motivo} | ${al2.motivo}`);

  const lista1 = (await al1.como("/api/portal/me/offline-courses")).json?.courses ?? [];
  const lista2 = await al2.como("/api/portal/me/offline-courses");
  ok(
    "portal: el alumno 1 ve A (heredado) y B (agregado)",
    lista1.some((c) => c.id === A.id) && lista1.some((c) => c.id === B.id),
    JSON.stringify(lista1.map((c) => c.title))
  );
  ok(
    "portal: el alumno 2 no ve ninguno (A quitado, sin agregados)",
    lista2.res.ok && (lista2.json?.courses ?? []).length === 0,
    `${lista2.res.status} ${JSON.stringify(lista2.json)}`
  );
  const ajeno = await al2.como(`/api/portal/me/offline-courses/${A.id}`);
  ok("portal: el curso quitado responde 404, no 403", ajeno.res.status === 404, `${ajeno.res.status}`);

  // ---- 6. Reading.
  const cursoA = (await al1.como(`/api/portal/me/offline-courses/${A.id}`)).json?.course;
  const tema11 = cursoA?.lessons?.[0]?.topics?.[0];
  const tema = await al1.como(`/api/portal/me/offline-courses/${A.id}/topics/${tema11?.id}`);
  ok(
    "portal: el tema trae su markdown tal cual y el siguiente tema",
    tema.res.ok &&
      tema.json?.topic?.topic?.contentMd?.includes("**negrita E2E**") &&
      tema.json?.topic?.next?.title === "Tema 1.2 E2E" &&
      tema.json?.topic?.prev === null,
    `${tema.res.status} ${tema.text.slice(0, 300)}`
  );
  const temaAjeno = await al2.como(`/api/portal/me/offline-courses/${A.id}/topics/${tema11?.id}`);
  ok("portal: el tema de un curso quitado responde 404", temaAjeno.res.status === 404, `${temaAjeno.res.status}`);

  // ---- 7. Quizzes: the key never travels; grading and the retry limit.
  const simple = cursoA?.quizzes?.find((q) => q.title === SIMPLE);
  const multiple = cursoA?.quizzes?.find((q) => q.title === MULTIPLE);
  const quizUrl = (qid) => `/api/portal/me/offline-courses/${A.id}/quizzes/${qid}`;
  const quiz = await al1.como(quizUrl(simple?.id));
  ok(
    "portal: el cuestionario llega SIN la clave de respuestas (texto crudo)",
    quiz.res.ok && !/is_?correct/i.test(quiz.text) && (quiz.json?.quiz?.questions ?? []).length === 2,
    `${quiz.res.status} ${quiz.text.slice(0, 300)}`
  );
  ok(
    "portal: 2 intentos como máximo (retries_allowed 1)",
    quiz.json?.quiz?.maxAttempts === 2 && quiz.json?.quiz?.attemptsRemaining === 2,
    JSON.stringify({ max: quiz.json?.quiz?.maxAttempts, left: quiz.json?.quiz?.attemptsRemaining })
  );

  const preguntas = quiz.json?.quiz?.questions ?? [];
  const elegir = (texts) =>
    Object.fromEntries(
      preguntas.map((q, i) => [q.id, q.answers.filter((a) => a.text === texts[i]).map((a) => a.id)])
    );
  const enviar = (como, qid, body) =>
    como(`${quizUrl(qid)}/attempts`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

  const mal = await enviar(al1.como, simple?.id, { answers: elegir(["3", "Verde"]) });
  ok(
    "intento 1 (mal): no aprueba, queda 1 intento",
    mal.res.status === 201 &&
      mal.json?.result?.passed === false &&
      mal.json?.result?.scorePercentage === 0 &&
      mal.json?.result?.attemptsRemaining === 1 &&
      !/is_?correct/i.test(mal.text),
    `${mal.res.status} ${mal.text}`
  );
  const bien = await enviar(al1.como, simple?.id, { answers: elegir(["4", "Azul"]) });
  ok(
    "intento 2 (bien): aprueba con 100, quedan 0",
    bien.res.status === 201 &&
      bien.json?.result?.passed === true &&
      bien.json?.result?.scorePercentage === 100 &&
      bien.json?.result?.attemptsRemaining === 0,
    `${bien.res.status} ${bien.text}`
  );
  const tercero = await enviar(al1.como, simple?.id, { answers: elegir(["4", "Azul"]) });
  ok(
    "intento 3: 409 attempts_exhausted",
    tercero.res.status === 409 && tercero.json?.error?.code === "attempts_exhausted",
    `${tercero.res.status} ${tercero.text}`
  );
  const malformado = await enviar(al1.como, multiple?.id, { answers: "nope" });
  ok("un cuerpo malformado responde 422", malformado.res.status === 422, `${malformado.res.status}`);
  const inventado = await enviar(al1.como, "oqz_no_existe", { answers: {} });
  const inventadoGet = await al1.como(quizUrl("oqz_no_existe"));
  ok(
    "un cuestionario inexistente responde 404 (GET y POST)",
    inventado.res.status === 404 && inventadoGet.res.status === 404,
    `${inventado.res.status}/${inventadoGet.res.status}`
  );
  const ajenoPost = await enviar(al2.como, simple?.id, { answers: {} });
  ok("el alumno sin acceso no puede enviar (404)", ajenoPost.res.status === 404, `${ajenoPost.res.status}`);

  const multi = (await al1.como(quizUrl(multiple?.id))).json?.quiz;
  const pares = multi?.questions?.[0];
  const conjunto = (texts) => ({ [pares?.id]: pares?.answers.filter((a) => texts.includes(a.text)).map((a) => a.id) });
  const parcial = await enviar(al1.como, multiple?.id, { answers: conjunto(["2"]) });
  const exacto = await enviar(al1.como, multiple?.id, { answers: conjunto(["2", "4"]) });
  ok(
    "opción múltiple: todo o nada; sin límite de intentos",
    parcial.json?.result?.passed === false &&
      exacto.json?.result?.passed === true &&
      exacto.json?.result?.attemptsRemaining === null,
    `${parcial.text} ${exacto.text}`
  );

  const tras = (await al1.como(quizUrl(simple?.id))).json?.quiz;
  ok(
    "portal: el alumno ve su propio historial (2 intentos, aprobado)",
    tras?.attempts?.length === 2 && tras?.passed === true && tras?.attemptsRemaining === 0,
    JSON.stringify({ attempts: tras?.attempts, passed: tras?.passed })
  );

  // ---- 8. Teacher portal and staff history.
  const profe = await loginProfe(profeId, emailProfe);
  const otro = await loginProfe(otroId, emailOtro);
  ok("portal: los dos profesores entran", profe.entro && otro.entro, `${profe.motivo} | ${otro.motivo}`);
  const hist = await profe.como(`/api/portal/cohorts/${cohId}/offline-attempts`);
  const simples = (hist.json?.attempts ?? []).filter((a) => a.quizTitle === SIMPLE && a.enrollmentId === e1);
  ok(
    "profesor de la cohorte: ve los 2 intentos del alumno 1, sin respuestas",
    hist.res.ok && simples.length === 2 && !/is_?correct|answers_?given/i.test(hist.text),
    `${hist.res.status} ${hist.text.slice(0, 400)}`
  );
  const histAjeno = await otro.como(`/api/portal/cohorts/${cohId}/offline-attempts`);
  ok("profesor de otra cohorte: 404", histAjeno.res.status === 404, `${histAjeno.res.status}`);

  const histStaff = await api(`/api/cohorts/${cohId}/offline-attempts`);
  const histEnr = (await api(`/api/enrollments/${e1}/offline-courses`)).json?.attempts ?? [];
  ok(
    "staff: historial de la cohorte y de la inscripción (4 intentos del alumno 1)",
    histStaff.res.ok &&
      (histStaff.json?.attempts ?? []).filter((a) => a.enrollmentId === e1).length === 4 &&
      histEnr.length === 4,
    `${histStaff.res.status} cohorte=${histStaff.json?.attempts?.length} inscripción=${histEnr.length}`
  );
  const cohInventada = await api("/api/cohorts/coh_no_existe/offline-attempts");
  const enrInventada = await api("/api/enrollments/enr_no_existe/offline-courses");
  ok(
    "staff: cohorte o inscripción inexistente → 404",
    cohInventada.res.status === 404 && enrInventada.res.status === 404,
    `${cohInventada.res.status}/${enrInventada.res.status}`
  );

  // ---- 9. Thumbnails and pages.
  const miniatura = await al2.como(`/api/portal/me/offline-courses/${A.id}/thumbnail`);
  ok("portal: la miniatura de un curso sin acceso responde 404", miniatura.res.status === 404, `${miniatura.res.status}`);

  const pagina = (p, galleta) =>
    fetch(`${BASE}${p}`, { redirect: "manual", headers: galleta ? { cookie: galleta } : {} }).then(async (r) => ({
      status: r.status,
      html: await r.text(),
    }));
  const libPage = await pagina("/cursos-offline", getCookie());
  ok(
    "UI staff: /cursos-offline responde 200 con el curso",
    libPage.status === 200 && libPage.html.includes(TITLE_A),
    `${libPage.status}`
  );
  const detPage = await pagina(`/cursos-offline/${A.id}`, getCookie());
  ok(
    "UI staff: el detalle escapa el <script> del contenido y pinta la negrita",
    detPage.status === 200 &&
      detPage.html.includes("&lt;script&gt;") &&
      !detPage.html.includes("<script>alert(") &&
      detPage.html.includes("<strong>negrita E2E</strong>"),
    `${detPage.status}`
  );
  const portalPage = await al1.como("/portal/cursos-offline", { headers: { "content-type": "text/html" } });
  ok(
    "UI portal: /portal/cursos-offline responde 200 al alumno",
    portalPage.res.status === 200 && portalPage.text.includes("Cursos offline"),
    `${portalPage.res.status}`
  );
  const portalCurso = await al1.como(`/portal/cursos-offline/${A.id}`);
  ok("UI portal: la página del curso responde 200", portalCurso.res.status === 200, `${portalCurso.res.status}`);
}
