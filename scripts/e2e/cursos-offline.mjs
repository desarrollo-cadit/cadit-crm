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
 *  - topic progress (T9): sequential gating (404 for a locked topic), played
 *    ranges vs. the 90% rule, topics without video, the staff override and
 *    course completion (every topic AND every quiz); viewing split across
 *    reports accumulates over the union of ranges (T9b);
 *  - teacher portal and staff attempt history, with their 404s;
 *  - the staff and portal pages render;
 *  - T11 editor: a course built through the staff editing API (validation,
 *    reorder, publish, 409 on deletes with history, 403 without academico.editar).
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

/** Per-table counts from the importer's report table (insert update kept no-op delete). */
function parseCounts(stdout) {
  const out = {};
  for (const line of stdout.split(/\r?\n/)) {
    const m = /^\s+(offline_\w+|media_asset)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/.exec(line);
    if (m) out[m[1]] = { insert: +m[2], update: +m[3], kept: +m[4], noop: +m[5], delete: +m[6] };
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

  // ---- 7b. Progress (T9): sequential topics, video ranges, no-video, staff override.
  //   Course A: 1.1 video (BEFORE) → 1.2 no video → 2.1 video → 2.2 video; both
  //   quizzes are already passed above, so completion hinges on the topics.
  const topicsA = (cursoA?.lessons ?? []).flatMap((l) => l.topics);
  const [t1, t2, t3, t4] = topicsA;
  const topicUrl = (id, course = A.id) => `/api/portal/me/offline-courses/${course}/topics/${id}`;
  const progreso = (como, id, body, course = A.id) =>
    como(`${topicUrl(id, course)}/progress`, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  const verCursoA = async () => (await al1.como(`/api/portal/me/offline-courses/${A.id}`)).json?.course;

  ok(
    "progreso: el curso marca solo el primer tema como habilitado",
    topicsA.length === 4 &&
      t1?.unlocked === true &&
      [t2, t3, t4].every((t) => t?.unlocked === false && t?.completed === false) &&
      cursoA?.completion?.completed === false,
    JSON.stringify({ topics: topicsA, completion: cursoA?.completion })
  );
  const t2Bloqueado = await al1.como(topicUrl(t2?.id));
  ok("progreso: el tema 2 responde 404 antes de completar el 1", t2Bloqueado.res.status === 404, `${t2Bloqueado.res.status}`);
  const t4Bloqueado = await progreso(al1.como, t4?.id, { noVideo: true });
  ok("progreso: reportar un tema bloqueado responde 404", t4Bloqueado.res.status === 404, `${t4Bloqueado.res.status}`);

  const t1Datos = (await al1.como(topicUrl(t1?.id))).json?.topic;
  ok(
    "progreso: el tema 1 trae su video de Vimeo (antes del texto) y no está completo",
    t1Datos?.video?.id === "900000001" && t1Datos?.video?.shown === "before" && t1Datos?.progress?.completed === false,
    JSON.stringify({ video: t1Datos?.video, progress: t1Datos?.progress })
  );

  const mitad = await progreso(al1.como, t1?.id, { playedRanges: [{ start: 0, end: 50 }], duration: 100 });
  ok(
    "progreso: 50% visto → no completo, sin siguiente",
    mitad.res.status === 200 &&
      mitad.json?.progress?.completed === false &&
      mitad.json?.progress?.watchedRatio === 0.5 &&
      mitad.json?.progress?.nextTopicId === null,
    `${mitad.res.status} ${mitad.text}`
  );
  const salto = await progreso(al1.como, t1?.id, {
    playedRanges: [{ start: 0, end: 50 }, { start: 95, end: 100 }],
    duration: 100,
  });
  ok(
    "progreso: saltar al final no cuenta como visto (55%)",
    salto.json?.progress?.completed === false && salto.json?.progress?.watchedRatio === 0.55,
    salto.text
  );
  ok(
    "progreso: el tema 2 sigue en 404",
    (await al1.como(topicUrl(t2?.id))).res.status === 404
  );
  // T9b: 0–92 joins the stored 0–50 + 95–100 → the union covers 97%.
  const casi = await progreso(al1.como, t1?.id, { playedRanges: [{ start: 0, end: 92 }], duration: 100 });
  ok(
    "progreso: la unión ≥ 90% (0–92 + 95–100 = 97%) → completo y habilita el tema 2",
    casi.res.status === 200 &&
      casi.json?.progress?.completed === true &&
      casi.json?.progress?.watchedRatio === 0.97 &&
      casi.json?.progress?.nextTopicId === t2?.id,
    `${casi.res.status} ${casi.text}`
  );
  const menos = await progreso(al1.como, t1?.id, { playedRanges: [{ start: 0, end: 10 }], duration: 100 });
  ok(
    "progreso: un reporte menor no baja el porcentaje ni descompleta",
    menos.json?.progress?.completed === true && menos.json?.progress?.watchedRatio === 0.97,
    menos.text
  );

  const t2Abierto = await al1.como(topicUrl(t2?.id));
  ok(
    "progreso: el tema 2 ahora responde 200 (sin video)",
    t2Abierto.res.status === 200 && t2Abierto.json?.topic?.video === null,
    `${t2Abierto.res.status} ${t2Abierto.text.slice(0, 200)}`
  );
  const rangosSinVideo = await progreso(al1.como, t2?.id, { playedRanges: [{ start: 0, end: 1 }], duration: 1 });
  const noVideoConVideo = await progreso(al1.como, t1?.id, { noVideo: true });
  ok(
    "progreso: el reporte que no corresponde al tema responde 422",
    rangosSinVideo.res.status === 422 &&
      rangosSinVideo.json?.error?.code === "topic_without_video" &&
      noVideoConVideo.res.status === 422 &&
      noVideoConVideo.json?.error?.code === "topic_has_video",
    `${rangosSinVideo.res.status} ${rangosSinVideo.text} | ${noVideoConVideo.res.status} ${noVideoConVideo.text}`
  );
  const sinVideo = await progreso(al1.como, t2?.id, { noVideo: true });
  ok(
    "progreso: el tema sin video se completa con {noVideo:true} y habilita el 3",
    sinVideo.res.status === 200 &&
      sinVideo.json?.progress?.completed === true &&
      sinVideo.json?.progress?.nextTopicId === t3?.id,
    `${sinVideo.res.status} ${sinVideo.text}`
  );

  const malos = [
    "{",
    { playedRanges: "nope", duration: 10 },
    { playedRanges: [{ start: 5, end: 1 }], duration: 10 },
    { playedRanges: [], duration: 90_000 },
    { noVideo: true, duration: 1 },
  ];
  const estados422 = [];
  for (const body of malos) estados422.push((await progreso(al1.como, t1?.id, body)).res.status);
  ok("progreso: un cuerpo inválido responde 422", estados422.every((s) => s === 422), JSON.stringify(estados422));

  const ajenoProgreso = await progreso(al2.como, t1?.id, { noVideo: true });
  const temaInventado = await progreso(al1.como, "otop_no_existe", { noVideo: true });
  const temaB = (await al1.como(`/api/portal/me/offline-courses/${B.id}`)).json?.course?.lessons?.[0]?.topics?.[0];
  const temaDeOtroCurso = await progreso(al1.como, temaB?.id, { noVideo: true });
  ok(
    "progreso: curso sin acceso, tema inexistente o de otro curso → 404",
    ajenoProgreso.res.status === 404 && temaInventado.res.status === 404 && temaDeOtroCurso.res.status === 404,
    `${ajenoProgreso.res.status}/${temaInventado.res.status}/${temaDeOtroCurso.res.status}`
  );

  // Staff override on topic 2.1 (the fallback when the player cannot play).
  const marcar = await api(`/api/enrollments/${e1}/offline-courses/topics/${t3?.id}/complete`, { method: "PUT" });
  const marcarAjeno = await api(`/api/enrollments/${e2}/offline-courses/topics/${t3?.id}/complete`, { method: "PUT" });
  const marcarInventada = await api(`/api/enrollments/enr_no_existe/offline-courses/topics/${t3?.id}/complete`, {
    method: "PUT",
  });
  const marcarYaVisto = await api(`/api/enrollments/${e1}/offline-courses/topics/${t1?.id}/complete`, { method: "PUT" });
  ok(
    "staff: marca el tema 2.1 como completado; 422 sin acceso al curso; 404 inscripción inexistente",
    marcar.res.status === 200 &&
      marcar.json?.completionSource === "staff" &&
      marcarAjeno.res.status === 422 &&
      marcarInventada.res.status === 404 &&
      marcarYaVisto.json?.completionSource === "video",
    `${marcar.res.status} ${marcar.text} | ${marcarAjeno.res.status} | ${marcarInventada.res.status} | ${marcarYaVisto.text}`
  );
  const progresoStaff = async () =>
    ((await api(`/api/enrollments/${e1}/offline-courses`)).json?.progress ?? []).find((p) => p.courseId === A.id);
  const pA = await progresoStaff();
  const fuente = (id) => pA?.topics?.find((t) => t.id === id)?.completionSource;
  ok(
    "staff: la inscripción refleja el avance (1.1 video, 1.2 sin video, 2.1 staff; 3/4 temas, 2/2 cuestionarios)",
    fuente(t1?.id) === "video" &&
      fuente(t2?.id) === "no_video" &&
      fuente(t3?.id) === "staff" &&
      pA?.completion?.topicsDone === 3 &&
      pA?.completion?.quizzesPassed === 2 &&
      pA?.completion?.completed === false,
    JSON.stringify(pA)
  );

  const antes = await verCursoA();
  ok(
    "progreso: con 3/4 temas y los cuestionarios aprobados el curso NO está terminado",
    antes?.completion?.topicsDone === 3 &&
      antes?.completion?.quizzesPassed === 2 &&
      antes?.completion?.completed === false &&
      antes?.lessons?.[1]?.topics?.[1]?.unlocked === true,
    JSON.stringify(antes?.completion)
  );
  // T9b: the last topic is watched in two sittings — 0–55% one day, 50–100%
  // the next. Before T9b each report was measured alone and this never ended.
  const primeraVez = await progreso(al1.como, t4?.id, { playedRanges: [{ start: 0, end: 33 }], duration: 60 });
  const ultimo = await progreso(al1.como, t4?.id, { playedRanges: [{ start: 30, end: 60 }], duration: 60 });
  ok(
    "progreso: ver el último tema en dos veces (0–55% y 50–100%) lo completa; no hay siguiente",
    primeraVez.json?.progress?.completed === false &&
      primeraVez.json?.progress?.watchedRatio === 0.55 &&
      ultimo.json?.progress?.completed === true &&
      ultimo.json?.progress?.watchedRatio === 1 &&
      ultimo.json?.progress?.nextTopicId === null,
    `${primeraVez.text} | ${ultimo.text}`
  );
  const despues = await verCursoA();
  const tarjeta = ((await al1.como("/api/portal/me/offline-courses")).json?.courses ?? []).find((c) => c.id === A.id);
  const pAFinal = await progresoStaff();
  ok(
    "progreso: todos los temas + todos los cuestionarios → curso terminado (portal, lista y staff)",
    despues?.completion?.completed === true &&
      tarjeta?.completion?.completed === true &&
      pAFinal?.completion?.completed === true,
    JSON.stringify({ curso: despues?.completion, tarjeta: tarjeta?.completion, staff: pAFinal?.completion })
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

  // ---- 10. Editor (T11): the whole course built from the staff API.
  await seccionEditor({ api, ok, BASE, getCookie, cohId, A, alumno: al1, otraIp, sello });
}

/**
 * cursos-offline T11 — Staff builds a course through the editing API: course,
 * lessons, topics (Vimeo URL validated), reorder, quiz and questions (answer
 * sets validated), thumbnail, publish, assign; the student sees it and its
 * edits; a delete with student history is refused (409); a role without
 * `academico.editar` reads but gets 403 on a write.
 */
async function seccionEditor({ api, ok, BASE, getCookie, cohId, A, alumno, otraIp, sello }) {
  console.log("\n== cursos-offline T11: editor de contenido ==");
  const base = "/api/offline-courses";
  const send = (p, method, body) => api(p, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

  // Course: created as draft; a second one with the same title gets "-2".
  const titulo = `Curso editor E2E ${sello}`;
  const curso = await send(base, "POST", { title: titulo, descriptionMd: "Descripción **E2E**" });
  const gemelo = await send(base, "POST", { title: titulo });
  const C = curso.json?.id;
  ok(
    "editor: crear curso → 201 {id, slug}; el mismo título recibe slug -2",
    curso.res.status === 201 && C && gemelo.res.status === 201 && gemelo.json?.slug === `${curso.json?.slug}-2`,
    `${curso.res.status} ${JSON.stringify(curso.json)} | ${gemelo.res.status} ${JSON.stringify(gemelo.json)}`
  );
  if (!C) return;
  const borrarGemelo = await send(`${base}/${gemelo.json?.id}`, "DELETE");
  ok("editor: borrar un curso sin historial → 200", borrarGemelo.res.status === 200, `${borrarGemelo.res.status}`);
  const cBase = `${base}/${C}`;

  const l1 = await send(`${cBase}/lessons`, "POST", { title: "Lección editor 1" });
  const l2 = await send(`${cBase}/lessons`, "POST", { title: "Lección editor 2", contentMd: "Intro" });
  const L1 = l1.json?.id;
  const L2 = l2.json?.id;
  ok(
    "editor: dos lecciones en posiciones 0 y 1",
    l1.res.status === 201 && l2.res.status === 201 && l1.json?.position === 0 && l2.json?.position === 1,
    `${l1.res.status} ${JSON.stringify(l1.json)} | ${l2.res.status} ${JSON.stringify(l2.json)}`
  );

  const conVideo = await send(`${cBase}/lessons/${L1}/topics`, "POST", {
    title: "Tema con video E2E",
    contentMd: "Mirá el video.",
    videoUrl: "https://vimeo.com/900000123",
    videoShown: "before",
  });
  const sinVideo = await send(`${cBase}/lessons/${L1}/topics`, "POST", {
    title: "Tema sin video E2E",
    contentMd: "Solo **texto** editado.",
    videoUrl: "",
  });
  const malaUrl = await send(`${cBase}/lessons/${L1}/topics`, "POST", {
    title: "Tema URL inválida",
    videoUrl: "https://www.youtube.com/watch?v=abc",
  });
  const T1 = conVideo.json?.id;
  const T2 = sinVideo.json?.id;
  ok(
    "editor: dos temas (uno con Vimeo); una URL que no es de Vimeo → 422 invalid_video_url",
    conVideo.res.status === 201 &&
      sinVideo.res.status === 201 &&
      malaUrl.res.status === 422 &&
      malaUrl.json?.error?.code === "invalid_video_url",
    `${conVideo.res.status} ${sinVideo.res.status} ${malaUrl.res.status} ${JSON.stringify(malaUrl.json)}`
  );

  const orden = await send(`${cBase}/lessons/${L1}/topics/order`, "PUT", { ids: [T2, T1] });
  const ordenMalo = await send(`${cBase}/lessons/${L1}/topics/order`, "PUT", { ids: [T1] });
  const tras = (await api(cBase)).json?.course;
  const idsL1 = tras?.lessons?.find((l) => l.id === L1)?.topics?.map((t) => t.id);
  ok(
    "editor: reordenar temas → el orden nuevo queda; una lista incompleta → 422 invalid_order",
    orden.res.ok &&
      JSON.stringify(idsL1) === JSON.stringify([T2, T1]) &&
      ordenMalo.res.status === 422 &&
      ordenMalo.json?.error?.code === "invalid_order",
    `${orden.res.status} ${JSON.stringify(idsL1)} | ${ordenMalo.res.status}`
  );

  // A third topic, moved to lesson 2: it is the one deleted without history below.
  const T3 = (await send(`${cBase}/lessons/${L1}/topics`, "POST", { title: "Tema a mover E2E" })).json?.id;
  const mover = await send(`${cBase}/topics/${T3}`, "PATCH", { lessonId: L2 });
  ok(
    "editor: mover un tema a otra lección del curso",
    mover.res.ok && mover.json?.lessonId === L2,
    `${mover.res.status} ${JSON.stringify(mover.json)}`
  );

  const quiz = await send(`${cBase}/quizzes`, "POST", {
    title: "Cuestionario editor E2E",
    passingPercentage: 50,
    retriesAllowed: 2,
    lessonId: L1,
  });
  const Q = quiz.json?.id;
  const qBase = `${cBase}/quizzes/${Q}/questions`;
  const unica = await send(qBase, "POST", {
    questionMd: "¿Cuánto es 1 + 1?",
    answerType: "single",
    answers: [
      { text: "2", isCorrect: true },
      { text: "3", isCorrect: false },
    ],
  });
  const multiple = await send(qBase, "POST", {
    questionMd: "¿Cuáles son pares?",
    answerType: "multiple",
    points: 2,
    answers: [
      { text: "2", isCorrect: true },
      { text: "3", isCorrect: false },
      { text: "4", isCorrect: true },
    ],
  });
  const invalidos = [
    { answerType: "single", answers: [{ text: "a", isCorrect: true }, { text: "b", isCorrect: true }] },
    { answerType: "multiple", answers: [{ text: "a", isCorrect: false }, { text: "b", isCorrect: false }] },
    { answerType: "single", answers: [{ text: "a", isCorrect: true }] },
  ];
  const codigos = [];
  for (const body of invalidos) {
    const r = await send(qBase, "POST", { questionMd: "Inválida", ...body });
    codigos.push(`${r.res.status}:${r.json?.error?.code}`);
  }
  ok(
    "editor: cuestionario con una pregunta única y una múltiple; conjuntos inválidos → 422 invalid_answers",
    quiz.res.status === 201 &&
      unica.res.status === 201 &&
      multiple.res.status === 201 &&
      codigos.every((c) => c === "422:invalid_answers"),
    `${quiz.res.status} ${unica.res.status} ${multiple.res.status} ${JSON.stringify(codigos)}`
  );
  const noEncontrada = await send(`${cBase}/lessons/ole_no_existe`, "DELETE");
  ok(
    "editor: 404 con el género correcto («Lección no encontrada»)",
    noEncontrada.res.status === 404 && noEncontrada.json?.error?.message === "Lección no encontrada",
    `${noEncontrada.res.status} ${JSON.stringify(noEncontrada.json)}`
  );

  // Thumbnail: a 1×1 PNG goes in; a text file does not.
  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64"
  );
  const subir = async (blob, name) => {
    const form = new FormData();
    form.append("file", blob, name);
    const res = await fetch(`${BASE}${cBase}/thumbnail`, {
      method: "PUT",
      headers: { cookie: getCookie(), origin: BASE },
      body: form,
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  const png = await subir(new Blob([PNG], { type: "image/png" }), "portada.png");
  const txt = await subir(new Blob(["hola"], { type: "text/plain" }), "portada.txt");
  const verMiniatura = await api(`${cBase}/thumbnail`);
  ok(
    "editor: portada PNG → {thumbnailUrl} y se sirve; un .txt → 422 invalid_image",
    png.status === 200 &&
      /^\/api\/media\//.test(png.json?.thumbnailUrl ?? "") &&
      verMiniatura.res.status === 200 &&
      txt.status === 422 &&
      txt.json?.error?.code === "invalid_image",
    `${png.status} ${JSON.stringify(png.json)} | ${verMiniatura.res.status} | ${txt.status} ${JSON.stringify(txt.json)}`
  );

  // Publish + assign to the cohort (next to A, which it already had).
  const publicar = await send(cBase, "PATCH", { status: "published" });
  const asignar = await send(`/api/cohorts/${cohId}/offline-courses`, "PUT", { courseIds: [A.id, C] });
  ok(
    "editor: publicar y asignar a la cohorte",
    publicar.res.ok && asignar.res.ok,
    `${publicar.res.status} ${asignar.res.status} ${JSON.stringify(asignar.json)}`
  );

  // The student sees it, in the edited order, with its content.
  const lista = (await alumno.como("/api/portal/me/offline-courses")).json?.courses ?? [];
  const cursoC = (await alumno.como(`/api/portal/me/offline-courses/${C}`)).json?.course;
  const temasL1 = cursoC?.lessons?.[0]?.topics?.map((t) => t.id);
  const temaUrl = (id) => `/api/portal/me/offline-courses/${C}/topics/${id}`;
  const leer = await alumno.como(temaUrl(T2));
  const quizPortal = await alumno.como(`/api/portal/me/offline-courses/${C}/quizzes/${Q}`);
  ok(
    "portal: el alumno ve el curso nuevo, los temas en el orden editado y su contenido",
    lista.some((c) => c.id === C) &&
      JSON.stringify(temasL1) === JSON.stringify([T2, T1]) &&
      leer.res.ok &&
      leer.json?.topic?.topic?.contentMd === "Solo **texto** editado." &&
      quizPortal.res.ok &&
      (quizPortal.json?.quiz?.questions ?? []).length === 2 &&
      !/is_?correct/i.test(quizPortal.text),
    `${JSON.stringify(lista.map((c) => c.title))} ${JSON.stringify(temasL1)} ${leer.res.status} ${leer.text.slice(0, 200)} ${quizPortal.res.status}`
  );

  const renombrar = await send(`${cBase}/topics/${T2}`, "PATCH", { title: "Tema sin video E2E (editado)" });
  const releer = await alumno.como(temaUrl(T2));
  ok(
    "portal: editar el título de un tema se ve en el portal",
    renombrar.res.ok && releer.json?.topic?.topic?.title === "Tema sin video E2E (editado)",
    `${renombrar.res.status} ${releer.text.slice(0, 200)}`
  );

  // History guards: the student completes T2; T3 has nobody.
  const completar = await alumno.como(`${temaUrl(T2)}/progress`, {
    method: "POST",
    body: JSON.stringify({ noVideo: true }),
  });
  const borrarConHistoria = await send(`${cBase}/topics/${T2}`, "DELETE");
  const borrarCurso = await send(cBase, "DELETE");
  const borrarSinHistoria = await send(`${cBase}/topics/${T3}`, "DELETE");
  ok(
    "editor: borrar un tema (o el curso) con progreso → 409 has_history; uno sin progreso → 200",
    completar.res.ok &&
      borrarConHistoria.res.status === 409 &&
      borrarConHistoria.json?.error?.code === "has_history" &&
      borrarCurso.res.status === 409 &&
      borrarSinHistoria.res.status === 200 &&
      borrarSinHistoria.json?.id === T3,
    `${completar.res.status} ${completar.text?.slice(0, 200)} | ${borrarConHistoria.res.status} ${JSON.stringify(borrarConHistoria.json)} | ${borrarCurso.res.status} | ${borrarSinHistoria.res.status}`
  );

  // The staff page is the editor for whoever can edit.
  const pagina = await fetch(`${BASE}/cursos-offline/${C}`, { redirect: "manual", headers: { cookie: getCookie() } });
  const html = await pagina.text();
  ok(
    "UI staff: con academico.editar la página del curso es el editor",
    pagina.status === 200 && html.includes("Agregar lección") && html.includes("Agregar cuestionario"),
    `${pagina.status}`
  );

  // A role with academico.ver but not academico.editar: reads, cannot write.
  const email = `e2e.admin-offline-${sello}@vocero.test`;
  const password = "password-admin-offline";
  const alta = await api("/api/settings/team", {
    method: "POST",
    body: JSON.stringify({ name: "Administración Offline E2E", email, password, roleKey: "administracion" }),
  });
  const como = conJar(BASE, { cookie: "" });
  const login = await como("/api/auth/sign-in/email", {
    method: "POST",
    headers: otraIp(),
    body: JSON.stringify({ email, password }),
  });
  const leeBiblioteca = await como(base);
  const escribe = await como(`${cBase}/lessons`, { method: "POST", body: JSON.stringify({ title: "No debería" }) });
  const paginaLectura = await como(`/cursos-offline/${C}`);
  ok(
    "sin academico.editar: lee la biblioteca (200), escribir → 403, la página queda de solo lectura",
    (alta.res.status === 201 || alta.res.status === 409) &&
      login.res.ok &&
      leeBiblioteca.res.status === 200 &&
      escribe.res.status === 403 &&
      paginaLectura.res.status === 200 &&
      paginaLectura.text.includes("Tema con video E2E") &&
      !paginaLectura.text.includes("Agregar lección"),
    `${alta.res.status} ${JSON.stringify(alta.json)} ${login.res.status} ${leeBiblioteca.res.status} ${escribe.res.status} ${paginaLectura.res.status}`
  );
}
