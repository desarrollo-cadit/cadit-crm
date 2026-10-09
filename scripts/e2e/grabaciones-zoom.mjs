/**
 * 030 — Grabaciones de Zoom (guion: tests/e2e/us-grabaciones-zoom.md).
 *
 *   E2E_SECCIONES=grabaciones-zoom node --env-file=.env.e2e scripts/e2e-selftest.mjs
 *
 * Necesita la app con el zoom-mock: `ZOOM_API_BASE_URL=<app>/api/dev/zoom-mock/v2`
 * y `ZOOM_OAUTH_BASE_URL=<app>/api/dev/zoom-mock` (más `WA_MOCK_ENABLED=true`,
 * que es el gate de todos los mocks). NUNCA habla con Zoom real: las
 * credenciales que carga son de mentira y el mock las acepta o rechaza
 * (`bad…`) sin salir de la app.
 *
 * Todo se conduce por la API y la pantalla, como un usuario, y se observa en
 * las respuestas y en el log del mock.
 *
 * MVP (US4 + US1): checks 1–6 (el 6 sin estados de adjudicación), la
 * idempotencia de una segunda corrida, el 17 y el bloque de pantalla de
 * `/grabaciones`. La adjudicación (US2/US3), la periódica (US5) y los portales
 * (US6) suman sus checks acá cuando lleguen.
 *
 * Deja la instancia ordenada: archiva las conexiones de corridas anteriores al
 * empezar (si no, la sincronización de la organización las incluiría) y deja
 * la suya activa al terminar.
 */

import { alEntrar } from "./cambio-de-contrasena.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isoDia = (desplazamiento) =>
  new Date(Date.now() + desplazamiento * 86_400_000).toISOString().slice(0, 10);

/** Fetcher con tarro propio (alumno, profesor, cuentas del equipo); no sigue redirecciones. */
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

/** Cada persona entra desde su propia IP (el límite de login es por IP), de un rango de pruebas. */
const ipDe = (() => {
  const red = Math.floor(Math.random() * 250);
  let n = 0;
  return () => ({ "x-forwarded-for": `198.18.${red}.${++n}` });
})();

/**
 * GUARD — Antes de cargar una sola credencial: la app tiene que estar
 * hablándole al zoom-mock. Una corrida que olvidó `ZOOM_API_BASE_URL` /
 * `ZOOM_OAUTH_BASE_URL` le mandó credenciales de mentira a zoom.us; esto no
 * se vuelve a repetir. Se pregunta a la APP (`/api/dev/zoom-mock/config`,
 * las bases que su adaptador usa de verdad) y, si el arnés también las trae
 * en su entorno, tienen que ser las del mock. Devuelve `false` = abortar.
 */
async function exigirZoomMock({ api, ok }) {
  const cfg = await api("/api/dev/zoom-mock/config");
  const ajenas = ["ZOOM_API_BASE_URL", "ZOOM_OAUTH_BASE_URL"].filter(
    (k) => process.env[k] && !/\/api\/dev\/zoom-mock(\/|$)/.test(process.env[k])
  );
  const bien = cfg.res.ok && cfg.json?.mock === true && ajenas.length === 0;
  ok(
    "guard — la app le habla al zoom-mock, no a zoom.us (ZOOM_API_BASE_URL / ZOOM_OAUTH_BASE_URL)",
    bien,
    `${cfg.res.status} ${JSON.stringify(cfg.json)} ${ajenas.length ? `entorno del arnés: ${ajenas.join(", ")}` : ""}`
  );
  if (!bien) {
    console.error(
      "\n  ABORTADA la sección de grabaciones: levantá la app con\n" +
        "    ZOOM_API_BASE_URL=<app>/api/dev/zoom-mock/v2 ZOOM_OAUTH_BASE_URL=<app>/api/dev/zoom-mock\n" +
        "  en la línea de comandos. Sin eso, el adaptador le habla a zoom.us real.\n"
    );
  }
  return bien;
}

export async function seccionGrabacionesZoom({ api, ok, BASE, getCookie }) {
  console.log("\n== 030: grabaciones de Zoom — conexiones, aulas y sincronización ==");
  if (!(await exigirZoomMock({ api, ok }))) return;
  const periodica = (await api("/api/recordings/sync")).json?.periodicIntervalMin;
  if (periodica !== 0) {
    ok(
      "guard — esta sección corre con la periódica APAGADA (ZOOM_SYNC_INTERVAL_MIN=0); la periódica tiene su sección",
      false,
      `periodicIntervalMin=${periodica}: una corrida periódica en medio de los checks los volvería azarosos`
    );
    return;
  }

  const sello = Date.now();
  const cola = String(sello).slice(-6);
  const ACC = `acc-e2e-${cola}`;
  const SECRETO_MALO = `bad-secret-${cola}`;
  const SECRETO_BUENO = `good-secret-${cola}`;
  // Números de reunión PROPIOS de cada corrida: las cohortes de corridas
  // anteriores siguen en la base con las mismas fechas relativas, y un número
  // repetido las volvería candidatas (la ambigüedad sería real, no un error).
  const MEET_A = `9${cola}001`;
  const PMI_1 = `1${cola}101`;
  const PMI_2 = `2${cola}202`;
  // La sala personal REAL de u2 (Zoom): distinta del enlace cargado en Zoom 2,
  // para que Configuración › Zoom avise y ofrezca actualizar (addendum A3).
  const PMI_2_ZOOM = `3${cola}303`;

  /* ---------- helpers del mock ---------- */
  const zoomSeed = (state) =>
    api("/api/dev/zoom-mock/seed", { method: "POST", body: JSON.stringify(state) });
  const zoomReset = () => api("/api/dev/zoom-mock/seed", { method: "DELETE" });
  const zoomFail = (spec) =>
    api("/api/dev/zoom-mock/fail", { method: "POST", body: JSON.stringify(spec) });
  const zoomLog = async () => (await api("/api/dev/zoom-mock/log")).json?.log ?? [];
  /** Espera a que no haya corrida en curso; devuelve el último estado. */
  async function esperarSyncLibre(ms = 60000) {
    const hasta = Date.now() + ms;
    let estado = null;
    while (Date.now() < hasta) {
      estado = (await api("/api/recordings/sync")).json;
      if (estado && estado.running === null) return estado;
      await sleep(500);
    }
    return estado;
  }

  /** Ningún texto de la respuesta lleva el secreto ni columnas cifradas. */
  const limpio = (json, ...secretos) => {
    const s = JSON.stringify(json ?? null);
    return (
      secretos.every((x) => !s.includes(x)) &&
      !/clientSecret"|_cipher|Cipher|SecretIv|SecretTag|passcodeIv|passcodeTag/.test(s)
    );
  };

  /* ---------- limpieza de corridas anteriores ---------- */
  await zoomReset();
  const previas = (await api("/api/settings/zoom/connections")).json?.connections ?? [];
  for (const c of previas.filter((c) => !c.archived)) {
    await api(`/api/settings/zoom/connections/${c.id}`, {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
    });
  }
  // Una corrida que quedó colgada de la vez anterior bloquearía el check 4.
  await esperarSyncLibre(20000);

  /* ---------- check 18: sin conexiones activas el CRM funciona como antes ---------- */
  const vacia = await api("/api/recordings");
  const sinConexion = await api("/api/recordings/sync", { method: "POST" });
  ok(
    "18 — sin conexiones activas: Sincronizar → 422 sin_conexiones, sin corrida",
    sinConexion.res.status === 422 && sinConexion.json?.error?.code === "sin_conexiones",
    `${sinConexion.res.status} ${JSON.stringify(sinConexion.json)}`
  );
  if (vacia.json?.configured === false) {
    ok(
      "18 — instancia que nunca conectó Zoom: /api/recordings → configured:false, sin filas (estado vacío 'Conectá Zoom')",
      vacia.res.ok && (vacia.json?.rows ?? []).length === 0,
      JSON.stringify(vacia.json)
    );
  } else {
    console.log("  …  18 — la base ya tuvo conexiones: el estado vacío lo cubre zoom-recordings.test.ts (configured:false)");
  }

  /* ---------- preparación (quickstart §3, pasos 1–3) ---------- */
  const nombreZ1 = `Zoom 1 ${cola}`;
  const nombreZ2 = `Zoom 2 ${cola}`;
  const z1 = await api("/api/virtual-rooms", {
    method: "POST",
    body: JSON.stringify({ name: nombreZ1, url: `https://zoom.us/j/${PMI_1}` }),
  });
  const z2 = await api("/api/virtual-rooms", {
    method: "POST",
    body: JSON.stringify({ name: nombreZ2, url: `https://zoom.us/j/${PMI_2}` }),
  });
  const aula1 = z1.json?.room?.id;
  const aula2 = z2.json?.room?.id;
  ok("prep — dos aulas (Zoom 1 / Zoom 2) con su PMI", Boolean(aula1 && aula2), `${z1.res.status}/${z2.res.status}`);

  const curso = await api("/api/courses", {
    method: "POST",
    body: JSON.stringify({ name: `Curso Grabaciones E2E ${cola}`, published: false }),
  });
  const cursoId = curso.json?.course?.id;
  const profesor = async (n) => {
    const correo = `profe${n}-grab-${cola}@example.com`;
    const r = await api("/api/teachers", { method: "POST", body: JSON.stringify({ name: `Profe ${n} Grab ${cola}`, email: correo }) });
    return { id: r.json?.teacher?.id ?? r.json?.id, correo };
  };
  const profeA = await profesor("A");
  const profeB = await profesor("B");
  // Martes y jueves 18:30–21:30, en el PASADO: las grabaciones caen en la
  // ventana de la primera sincronización (90 días hacia atrás).
  const horario = { startDate: isoDia(-21), endDate: isoDia(-1), daysOfWeek: "1,3", startTime: "18:30", endTime: "21:30" };
  const cohorte = async (name, extra) =>
    (await api("/api/cohorts", { method: "POST", body: JSON.stringify({ courseId: cursoId, name, ...horario, ...extra }) }))
      .json?.cohort?.id;
  const cohA = await cohorte(`Grab A ${cola}`, { virtualRoomId: aula1, meetingUrl: `https://zoom.us/j/${MEET_A}?pwd=x`, teacherId: profeA.id });
  const cohB = await cohorte(`Grab B ${cola}`, { virtualRoomId: aula2, teacherId: profeB.id });
  const cohC = await cohorte(`Grab C ${cola}`, { virtualRoomId: aula1 });
  for (const id of [cohA, cohB, cohC]) await api(`/api/cohorts/${id}/schedule`, { method: "POST" });
  const clases = async (id) => ((await api(`/api/cohorts/${id}/classes`)).json?.classes ?? []).filter((c) => !c.projected);
  const [clA, clB, clC] = [await clases(cohA), await clases(cohB), await clases(cohC)];
  ok(
    "prep — cohortes A/B/C con cronograma real (A y C chocan en Zoom 1)",
    clA.length >= 3 && clB.length >= 2 && clC.length >= 2 && clA.every((c) => c.startsAt),
    `${clA.length}/${clB.length}/${clC.length}`
  );
  const manual = await api(`/api/class-sessions/${clA[2]?.id}/links`, {
    method: "PATCH",
    body: JSON.stringify({ recordingUrl: "https://drive.example.com/grabacion-manual-A3" }),
  });
  ok("prep — enlace de grabación pegado a mano en A/3", manual.res.ok, `${manual.res.status}`);

  /* ---------- sembrado del mock (paso 4) ---------- */
  const mas = (iso, min) => new Date(Date.parse(iso) + min * 60_000).toISOString();
  const domingo = (() => {
    const d = new Date(Date.now() - 7 * 86_400_000);
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return `${d.toISOString().slice(0, 10)}T13:00:00Z`;
  })();
  const rec = (n, id, start, extra = {}) => ({
    uuid: `R${n}-${cola}==`,
    id,
    topic: `Grabación R${n}`,
    start_time: start,
    duration: 175,
    share_url: `https://zoom.us/rec/share/R${n}-${cola}`,
    ...extra,
  });
  const R = {
    1: rec(1, Number(MEET_A), mas(clA[0].startsAt, 4), { recording_play_passcode: null, share_url: `https://zoom.us/rec/share/R1-${cola}?pwd=embebido` }),
    2: rec(2, Number(PMI_2), mas(clB[0].startsAt, 2), { recording_files: [{ file_type: "MP4" }] }),
    3: rec(3, Number(PMI_1), clA[1].startsAt),
    4: rec(4, Number(MEET_A), domingo, { password: "7777" }),
    5: rec(5, Number(PMI_2), mas(clB[1].startsAt, 3), {
      recording_play_passcode: "abc123",
      recording_files: [{ file_type: "MP4" }, { file_type: "TRANSCRIPT" }],
    }),
    6: rec(6, Number(MEET_A), mas(clA[2].startsAt, 1)),
  };
  const R7 = rec(7, Number(`4${cola}404`), `${isoDia(-60)}T13:00:00Z`);
  const sembrado = await zoomSeed({
    pageSize: 2,
    accounts: [
      {
        accountId: ACC,
        users: [
          { id: "u1", email: "zoom1@academia.test", first_name: "Zoom", last_name: "Uno", pmi: Number(PMI_1), recordings: [R[1], R[3], R[4], R[6]] },
          { id: "u2", email: "zoom2@academia.test", first_name: "Zoom", last_name: "Dos", pmi: Number(PMI_2_ZOOM), recordings: [R[2], R[5]] },
          // u3 se vincula DESPUÉS de sincronizar: su grabación de hace 60 días
          // tiene que llegar igual (bug de la marca por conexión, R-12).
          { id: "u3", email: "zoom3@academia.test", first_name: "Zoom", last_name: "Tres", pmi: Number(`4${cola}404`), recordings: [R7] },
        ],
      },
    ],
  });
  ok("prep — zoom-mock sembrado (cuenta, u1/u2, R1..R6, páginas de 2)", sembrado.res.ok, `${sembrado.res.status}`);

  /* ---------- check 1: credenciales malas ---------- */
  const alta = await api("/api/settings/zoom/connections", {
    method: "POST",
    body: JSON.stringify({ name: `Zoom E2E ${cola}`, accountId: ACC, clientId: `cli-${cola}`, clientSecret: SECRETO_MALO }),
  });
  const zc = alta.json?.connection?.id;
  ok(
    "1 — alta de conexión: 201, sin probar, solo los últimos 4 del secreto",
    alta.res.status === 201 && alta.json?.connection?.status === "sin_probar" &&
      alta.json?.connection?.clientSecretLast4 === SECRETO_MALO.slice(-4) && limpio(alta.json, SECRETO_MALO),
    `${alta.res.status} ${JSON.stringify(alta.json)}`
  );
  const prueba1 = await api(`/api/settings/zoom/connections/${zc}/test`, { method: "POST" });
  ok(
    "1 — Probar con secreto bad… → {ok:false, error:credenciales_invalidas} y mensaje legible",
    prueba1.res.status === 200 && prueba1.json?.ok === false && prueba1.json?.error === "credenciales_invalidas" &&
      /credenciales/i.test(prueba1.json?.message ?? "") && limpio(prueba1.json, SECRETO_MALO),
    `${prueba1.res.status} ${JSON.stringify(prueba1.json)}`
  );
  const tras1 = ((await api("/api/settings/zoom/connections")).json?.connections ?? []).find((c) => c.id === zc);
  ok("1 — la conexión queda en estado error", tras1?.status === "error" && Boolean(tras1?.lastError), JSON.stringify(tras1));

  /* ---------- check 2: secreto bueno ---------- */
  const edit = await api(`/api/settings/zoom/connections/${zc}`, {
    method: "PATCH",
    body: JSON.stringify({ clientSecret: SECRETO_BUENO }),
  });
  ok(
    "2 — cambiar el secreto deja la conexión 'sin probar' y no devuelve el secreto",
    edit.res.ok && edit.json?.connection?.status === "sin_probar" && limpio(edit.json, SECRETO_BUENO, SECRETO_MALO),
    `${edit.res.status} ${JSON.stringify(edit.json)}`
  );
  const prueba2 = await api(`/api/settings/zoom/connections/${zc}/test`, { method: "POST" });
  const ids2 = (prueba2.json?.users ?? []).map((u) => u.id).sort();
  ok(
    "2 — Probar con el secreto bueno lista u1, u2 y u3 con su sala personal (pmi)",
    prueba2.json?.ok === true && JSON.stringify(ids2) === JSON.stringify(["u1", "u2", "u3"]) &&
      (prueba2.json?.users ?? []).find((u) => u.id === "u2")?.pmi === PMI_2_ZOOM,
    JSON.stringify(prueba2.json)
  );

  /* ---------- addendum A1/A2: sin aulas vinculadas no hay corrida ---------- */
  const sinAulas = await api("/api/recordings/sync", { method: "POST" });
  const trasSinAulas = (await api("/api/recordings/sync")).json;
  ok(
    "A2 — Sincronizar sin aulas vinculadas → 422 sin_aulas con el mensaje, sin corrida ni marca",
    sinAulas.res.status === 422 && sinAulas.json?.error?.code === "sin_aulas" &&
      sinAulas.json?.error?.message === "No hay aulas vinculadas a Zoom: vinculalas en Configuración › Zoom" &&
      (trasSinAulas?.connections ?? []).find((c) => c.id === zc)?.lastRun === null &&
      (trasSinAulas?.connections ?? []).find((c) => c.id === zc)?.syncedThrough === null,
    `${sinAulas.res.status} ${JSON.stringify(sinAulas.json)}`
  );
  const lista2 = await api("/api/settings/zoom/connections");
  const tras2 = (lista2.json?.connections ?? []).find((c) => c.id === zc);
  ok(
    "2 — GET muestra clientSecretLast4 y nada más del secreto; estado ok",
    tras2?.status === "ok" && tras2?.clientSecretLast4 === SECRETO_BUENO.slice(-4) &&
      limpio(lista2.json, SECRETO_BUENO, SECRETO_MALO),
    JSON.stringify(tras2)
  );
  const sinSecretoEnLog = JSON.stringify(await zoomLog());
  ok(
    "2 — el log del mock no guarda autorización ni secretos",
    !sinSecretoEnLog.includes(SECRETO_BUENO) && !/authorization|bearer|basic /i.test(sinSecretoEnLog)
  );

  /* ---------- check 3: vincular aulas ---------- */
  const v1 = await api(`/api/settings/zoom/rooms/${aula1}`, {
    method: "PUT",
    body: JSON.stringify({ connectionId: zc, zoomUserId: "u1", zoomUserEmail: "zoom1@academia.test", zoomUserPmi: PMI_1 }),
  });
  const v2 = await api(`/api/settings/zoom/rooms/${aula2}`, {
    method: "PUT",
    body: JSON.stringify({ connectionId: zc, zoomUserId: "u2", zoomUserEmail: "zoom2@academia.test", zoomUserPmi: PMI_2_ZOOM }),
  });
  const v3 = await api(`/api/settings/zoom/rooms/${aula2}`, {
    method: "PUT",
    body: JSON.stringify({ connectionId: zc, zoomUserId: "u1" }),
  });
  ok(
    "3 — Zoom 1 → u1 (200), Zoom 2 → u2 (200), Zoom 2 → u1 (409 usuario_ya_vinculado, nombra el aula)",
    v1.res.status === 200 && v2.res.status === 200 && v3.res.status === 409 &&
      v3.json?.error?.code === "usuario_ya_vinculado" && v3.json?.error?.roomName === nombreZ1,
    `${v1.res.status}/${v2.res.status}/${v3.res.status} ${JSON.stringify(v3.json)}`
  );
  const conAulas = ((await api("/api/settings/zoom/connections")).json?.connections ?? []).find((c) => c.id === zc);
  ok(
    "3 — la conexión lista sus dos aulas vinculadas (Zoom 2 sigue en u2)",
    (conAulas?.rooms ?? []).length === 2 &&
      conAulas.rooms.find((r) => r.id === aula2)?.zoomUserId === "u2",
    JSON.stringify(conAulas?.rooms)
  );
  const aulasTras3 = (await api("/api/virtual-rooms")).json?.rooms ?? [];
  ok(
    "A3 — vincular llena el correo de la cuenta del aula con el del usuario de Zoom",
    aulasTras3.find((r) => r.id === aula1)?.accountEmail === "zoom1@academia.test" &&
      aulasTras3.find((r) => r.id === aula2)?.accountEmail === "zoom2@academia.test",
    JSON.stringify(aulasTras3.filter((r) => [aula1, aula2].includes(r.id)).map((r) => [r.name, r.accountEmail]))
  );
  const r1Dto = conAulas?.rooms?.find((r) => r.id === aula1);
  const r2Dto = conAulas?.rooms?.find((r) => r.id === aula2);
  ok(
    "A3 — Zoom 2 avisa que su enlace no es la sala personal (sugiere la del PMI); Zoom 1 no",
    r1Dto?.pmiMismatch === false && r2Dto?.pmiMismatch === true &&
      r2Dto?.suggestedUrl === `https://zoom.us/j/${PMI_2_ZOOM}` && r2Dto?.roomUrl === `https://zoom.us/j/${PMI_2}`,
    JSON.stringify([r1Dto, r2Dto])
  );

  /* ---------- check 4: sincronizar, dos veces seguidas ---------- */
  const logAntes = (await zoomLog()).length;
  const s1 = await api("/api/recordings/sync", { method: "POST" });
  const s2 = await api("/api/recordings/sync", { method: "POST" });
  ok(
    "4 — Sincronizar: 202 con runIds; la segunda, en seguida, 409 sync_en_curso con desde cuándo",
    s1.res.status === 202 && (s1.json?.runIds ?? []).length === 1 &&
      s2.res.status === 409 && s2.json?.error?.code === "sync_en_curso" && Boolean(s2.json?.error?.startedAt),
    `${s1.res.status} ${JSON.stringify(s1.json)} / ${s2.res.status} ${JSON.stringify(s2.json)}`
  );

  /* ---------- check 5: termina ok con 6 nuevas ---------- */
  const estado5 = await esperarSyncLibre();
  const run5 = (estado5?.connections ?? []).find((c) => c.id === zc)?.lastRun;
  ok(
    "5 — la corrida termina ok con 6 grabaciones nuevas",
    estado5?.running === null && run5?.status === "ok" && run5?.newCount === 6,
    JSON.stringify(run5)
  );

  /* ---------- check 6 (parcial, sin adjudicación): las 6 filas ---------- */
  const lista6 = await api(`/api/recordings?connectionId=${zc}`);
  const filas = lista6.json?.rows ?? [];
  const porTema = (n) => filas.find((f) => f.topic === `Grabación R${n}`);
  ok(
    "6 — GET /api/recordings trae R1..R6, más recientes primero, con aula y cuenta",
    lista6.json?.configured === true && filas.length === 6 &&
      [1, 2, 3, 4, 5, 6].every((n) => porTema(n)) &&
      filas.every((f, i) => i === 0 || f.startTime <= filas[i - 1].startTime) &&
      porTema(2)?.room?.name === nombreZ2 && porTema(1)?.connection?.id === zc,
    `${lista6.res.status} ${JSON.stringify(filas.map((f) => [f.topic, f.room?.name]))}`
  );
  ok(
    "6 — R5: playUrl termina en pwd=abc123 y el código no viaja aparte",
    porTema(5)?.playUrl?.endsWith("pwd=abc123") && porTema(5)?.passcodeEmbedded === true && porTema(5)?.passcode === null,
    JSON.stringify(porTema(5))
  );
  ok(
    "A4 — R5 trae transcripción (TRANSCRIPT) y R2 no; solo tipos de archivo, nada de descargas",
    porTema(5)?.hasTranscript === true && JSON.stringify(porTema(5)?.fileTypes) === JSON.stringify(["MP4", "TRANSCRIPT"]) &&
      porTema(2)?.hasTranscript === false && !/download_url|downloadUrl/.test(JSON.stringify(lista6.json)),
    JSON.stringify([porTema(5)?.fileTypes, porTema(2)?.fileTypes])
  );
  ok(
    "6 — R4 (sin pwd en el enlace): el código de acceso viaja para el staff",
    porTema(4)?.passcodeEmbedded === false && porTema(4)?.passcode === "7777",
    JSON.stringify(porTema(4))
  );
  const estadoDe = (f) => [f?.assignment?.mode, f?.assignment?.state, f?.assignment?.classSession?.id ?? null];
  ok(
    "6 — US2: R1 asignada a A/1 (señal reunión), R2 a B/1 y R5 a B/2 (señal aula)",
    JSON.stringify(estadoDe(porTema(1))) === JSON.stringify(["auto", "asignada", clA[0].id]) &&
      JSON.stringify(estadoDe(porTema(2))) === JSON.stringify(["auto", "asignada", clB[0].id]) &&
      JSON.stringify(estadoDe(porTema(5))) === JSON.stringify(["auto", "asignada", clB[1].id]),
    JSON.stringify([1, 2, 5].map((n) => estadoDe(porTema(n))))
  );
  ok(
    "6 — US2: R3 ambigua con A/2 y C/2 como candidatas (choque de aulas: no adivina)",
    porTema(3)?.assignment?.state === "ambigua" &&
      JSON.stringify((porTema(3)?.assignment?.candidates ?? []).map((c) => c.id).sort()) ===
        JSON.stringify([clA[1].id, clC[1].id].sort()),
    JSON.stringify(porTema(3)?.assignment)
  );
  ok(
    "6 — US2: R4 (domingo) sin_clase; R6 en conflicto con el enlace manual de A/3",
    porTema(4)?.assignment?.state === "sin_clase" &&
      porTema(6)?.assignment?.state === "conflicto" &&
      porTema(6)?.assignment?.conflictWith?.id === clA[2].id,
    JSON.stringify([porTema(4)?.assignment, porTema(6)?.assignment])
  );
  ok(
    "5/6 — la corrida cuenta 3 asignadas, 1 ambigua y 1 en conflicto",
    run5?.assignedCount === 3 && run5?.ambiguousCount === 1 && run5?.conflictCount === 1,
    JSON.stringify(run5)
  );
  const clasesA = (await api(`/api/cohorts/${cohA}/classes`)).json?.classes ?? [];
  const a1 = clasesA.find((c) => c.id === clA[0].id);
  const a3 = clasesA.find((c) => c.id === clA[2].id);
  ok(
    "6 — la clase A/1 ofrece la grabación de R1 (origen Zoom) y A/3 conserva el enlace manual",
    a1?.recordingUrl === porTema(1)?.playUrl && a1?.recordingSource === "zoom" &&
      a3?.recordingUrl === "https://drive.example.com/grabacion-manual-A3" && a3?.recordingSource === "manual",
    JSON.stringify([a1?.recordingUrl, a1?.recordingSource, a3?.recordingUrl, a3?.recordingSource])
  );
  ok("6 — ninguna fila lleva columnas cifradas", limpio(lista6.json));
  const log6 = (await zoomLog()).slice(logAntes);
  const pedidos = log6.filter((l) => l.path.includes("/recordings"));
  const rangoOk = pedidos.every((l) => {
    const q = new URLSearchParams(l.query);
    const dias = (Date.parse(`${q.get("to")}T00:00:00Z`) - Date.parse(`${q.get("from")}T00:00:00Z`)) / 86_400_000 + 1;
    return dias <= 30 && q.get("trash") === "false";
  });
  ok(
    "6 — el log del mock muestra paginación (next_page_token) y tramos de ≤ 30 días",
    pedidos.some((l) => l.query.includes("next_page_token=")) && rangoOk && pedidos.length >= 8,
    `${pedidos.length} pedidos`
  );
  const filtro = await api(`/api/recordings?roomId=${aula2}`);
  ok(
    "6 — filtrar por aula Zoom 2 deja solo R2 y R5",
    JSON.stringify((filtro.json?.rows ?? []).map((f) => f.topic).sort()) === JSON.stringify(["Grabación R2", "Grabación R5"]),
    JSON.stringify((filtro.json?.rows ?? []).map((f) => f.topic))
  );
  const pag = await api(`/api/recordings?connectionId=${zc}&pageSize=25&page=1`);
  const fuera = await api(`/api/recordings?connectionId=${zc}&pageSize=25&page=9`);
  const asc = await api(`/api/recordings?connectionId=${zc}&sort=asc`);
  const malTam = await api(`/api/recordings?connectionId=${zc}&pageSize=30`);
  ok(
    "B — paginación numerada: total 6, 1 página; una página fuera de rango cae en la última",
    pag.json?.total === 6 && pag.json?.totalPages === 1 && pag.json?.page === 1 && pag.json?.pageSize === 25 &&
      fuera.json?.page === 1 && (fuera.json?.rows ?? []).length === 6,
    `${JSON.stringify({ t: pag.json?.total, p: pag.json?.totalPages })} / ${fuera.json?.page}`
  );
  ok(
    "B — orden por fecha: asc es el inverso de desc; un tamaño de página inventado → 422",
    JSON.stringify((asc.json?.rows ?? []).map((f) => f.id)) === JSON.stringify([...(pag.json?.rows ?? [])].reverse().map((f) => f.id)) &&
      malTam.res.status === 422,
    `${malTam.res.status}`
  );

  /* ---------- idempotencia: segunda corrida ---------- */
  const s3 = await api("/api/recordings/sync", { method: "POST" });
  const estado7 = await esperarSyncLibre();
  const run7 = (estado7?.connections ?? []).find((c) => c.id === zc)?.lastRun;
  const lista7 = (await api(`/api/recordings?connectionId=${zc}`)).json?.rows ?? [];
  ok(
    "segunda sincronización: mismas 6 filas (mismos ids), 0 nuevas",
    s3.res.status === 202 && run7?.status === "ok" && run7?.newCount === 0 && lista7.length === 6 &&
      JSON.stringify(lista7.map((f) => f.id).sort()) === JSON.stringify(filas.map((f) => f.id).sort()),
    `${s3.res.status} ${JSON.stringify(run7)} ${lista7.length}`
  );
  const resumen = (rows) => JSON.stringify(rows.map((f) => [f.id, ...estadoDe(f)]).sort());
  ok(
    "7 — segunda sincronización: mismos estados y clases (la adjudicación es estable)",
    resumen(lista7) === resumen(filas),
    resumen(lista7)
  );

  /* ---------- checks 8 y 9 (US6): los portales ven solo lo adjudicado a lo suyo ---------- */
  // La huella de cada grabación es su share_url: si aparece en una respuesta
  // de portal, esa grabación viajó. Las no adjudicadas (R3 ambigua, R4 sin
  // clase, R6 en conflicto) no tienen clase, así que no deben aparecer NUNCA.
  const huella = (n) => `R${n}-${cola}`;
  const NO_ADJUDICADAS = [3, 4, 6];
  const inscribir = async (cohortId, nombre) => {
    const correo = `alumno-${nombre}-grab-${cola}@example.com`;
    const r = await api("/api/enrollments", {
      method: "POST",
      body: JSON.stringify({ cohortId, contact: { firstName: `Alumno ${nombre}`, lastName: `Grab ${cola}`, email: correo, phone: `5989${cola}${nombre === "A" ? 1 : 2}` } }),
    });
    return { id: r.json?.enrollment?.id ?? r.json?.id, correo, motivo: `${r.res.status}` };
  };
  const entrar = async (accesoPath, correo) => {
    const acceso = await api(accesoPath, { method: "POST", body: "{}" });
    const jar = { cookie: "" };
    const como = conJar(BASE, jar);
    const ip = ipDe();
    const clave = acceso.json?.temporaryPassword;
    const login = await como("/api/auth/sign-in/email", {
      method: "POST",
      headers: ip,
      body: JSON.stringify({ email: correo, password: clave }),
    });
    await alEntrar(como, login, correo, clave, ip);
    return { como, entro: login.res.ok, motivo: `${acceso.res.status} / login ${login.res.status}` };
  };
  const insA = await inscribir(cohA, "A");
  const insB = await inscribir(cohB, "B");
  const alumnoA = await entrar(`/api/enrollments/${insA.id}/access`, insA.correo);
  const alumnoB = await entrar(`/api/enrollments/${insB.id}/access`, insB.correo);
  const portalA = await entrar(`/api/teachers/${profeA.id}/access`, profeA.correo);
  const portalB = await entrar(`/api/teachers/${profeB.id}/access`, profeB.correo);
  ok(
    "8/9 — prep: alumno de A, alumno de B y los profesores de A y de B entran a su portal",
    alumnoA.entro && alumnoB.entro && portalA.entro && portalB.entro,
    [alumnoA, alumnoB, portalA, portalB].map((x) => x.motivo).join(" · ")
  );

  /** Todo lo que el portal del alumno devuelve, junto: la grabación no tiene que viajar por NINGÚN lado. */
  const todoDelAlumno = async (como, enrollmentId) => {
    const rutas = ["/api/portal/me", `/api/portal/me/cursadas/${enrollmentId}`, "/api/portal/me/cuenta",
      "/api/portal/me/certificados", "/api/portal/me/entregas", "/api/portal/me/offline-courses"];
    const r = await Promise.all(rutas.map((p) => como(p)));
    return { cursada: r[1], texto: r.map((x) => x.text ?? "").join("\n") };
  };
  const vistaA = await todoDelAlumno(alumnoA.como, insA.id);
  const claseDe = (lista, id) => (lista ?? []).find((c) => c.id === id);
  ok(
    "8 — el alumno de A ve la grabación de R1 en la clase 1 y el enlace manual en la clase 3",
    claseDe(vistaA.cursada.json?.classes, clA[0].id)?.recordingUrl === porTema(1)?.playUrl &&
      claseDe(vistaA.cursada.json?.classes, clA[2].id)?.recordingUrl === "https://drive.example.com/grabacion-manual-A3",
    JSON.stringify((vistaA.cursada.json?.classes ?? []).map((c) => [c.number, c.recordingUrl]))
  );
  ok(
    "8 — ninguna grabación sin adjudicar (R3 ambigua, R4 sin clase, R6 en conflicto) ni de otra cohorte viaja al alumno de A",
    [...NO_ADJUDICADAS, 2, 5].every((n) => !vistaA.texto.includes(huella(n))) && !/recordingSource|zoom_recording/.test(vistaA.texto),
    [...NO_ADJUDICADAS, 2, 5].filter((n) => vistaA.texto.includes(huella(n))).join(",")
  );
  const vistaB = await todoDelAlumno(alumnoB.como, insB.id);
  const ajenaB = await alumnoB.como(`/api/portal/me/cursadas/${insA.id}`);
  ok(
    "9 — el alumno de B no ve R1 en ninguna pantalla ni en GET /api/portal/me/*; la cursada de A le da 404",
    !vistaB.texto.includes(huella(1)) && NO_ADJUDICADAS.every((n) => !vistaB.texto.includes(huella(n))) &&
      ajenaB.res.status === 404,
    `${ajenaB.res.status} ${[1, ...NO_ADJUDICADAS].filter((n) => vistaB.texto.includes(huella(n))).join(",")}`
  );
  ok(
    "9 — y sí ve las de SU cohorte (R2 en B/1)",
    claseDe(vistaB.cursada.json?.classes, clB[0].id)?.recordingUrl === porTema(2)?.playUrl,
    JSON.stringify((vistaB.cursada.json?.classes ?? []).map((c) => [c.number, c.recordingUrl]))
  );
  const delProfeA = await portalA.como(`/api/portal/cohorts/${cohA}/classes`);
  const clasesProfeA = delProfeA.json?.classes?.classes ?? [];
  ok(
    "8 — el profesor de A ve la clase 1 con la grabación de R1 y la 3 con el enlace manual, sin el origen",
    claseDe(clasesProfeA, clA[0].id)?.recordingUrl === porTema(1)?.playUrl &&
      claseDe(clasesProfeA, clA[2].id)?.recordingUrl === "https://drive.example.com/grabacion-manual-A3" &&
      !/recordingSource/.test(delProfeA.text ?? "") && NO_ADJUDICADAS.every((n) => !(delProfeA.text ?? "").includes(huella(n))),
    `${delProfeA.res.status} ${JSON.stringify(clasesProfeA.map((c) => [c.number, c.recordingUrl]))}`
  );
  const ajenaProfe = await portalB.como(`/api/portal/cohorts/${cohA}/classes`);
  const cohortesProfeB = await portalB.como("/api/portal/cohorts");
  ok(
    "9 — el profesor ajeno (de B): la cohorte A le da 404 y R1 no aparece en su portal",
    ajenaProfe.res.status === 404 && !(cohortesProfeB.text ?? "").includes(huella(1)) && !(ajenaProfe.text ?? "").includes(huella(1)),
    `${ajenaProfe.res.status} / ${cohortesProfeB.res.status}`
  );

  /* ---------- bloque de pantalla (Playwright) ---------- */
  await pantalla({ ok, BASE, getCookie, nombreZ2, desde: clB[0].date.slice(0, 10), hasta: clB[1].date.slice(0, 10), R5: porTema(5), secretoBueno: SECRETO_BUENO,
    R3: porTema(3), sugeridasR3: [clA[1].id, clC[1].id], aula2, zc });

  // El clic de la pantalla cambió el enlace de Zoom 2 a la sala personal.
  const trasPmi = ((await api("/api/settings/zoom/connections")).json?.connections ?? [])
    .find((c) => c.id === zc)?.rooms?.find((r) => r.id === aula2);
  const aula2Tras = ((await api("/api/virtual-rooms")).json?.rooms ?? []).find((r) => r.id === aula2);
  ok(
    "A3 — 'Actualizar enlace': Zoom 2 ahora es la sala personal, sin aviso, y el nombre no cambió",
    trasPmi?.roomUrl === `https://zoom.us/j/${PMI_2_ZOOM}` && trasPmi?.pmiMismatch === false && aula2Tras?.name === nombreZ2,
    JSON.stringify([trasPmi, aula2Tras?.name])
  );

  /* ---------- US3: asignar y desasignar a mano ---------- */
  const sincronizar = async () => {
    await api("/api/recordings/sync", { method: "POST" });
    return esperarSyncLibre();
  };
  const fila = async (n) =>
    ((await api(`/api/recordings?connectionId=${zc}`)).json?.rows ?? []).find((f) => f.topic === `Grabación R${n}`);
  const asignar = (rec, classSessionId, extra = {}) =>
    api(`/api/recordings/${rec.id}/assignment`, { method: "PUT", body: JSON.stringify({ classSessionId, ...extra }) });

  const cand = await api(`/api/recordings/${porTema(3).id}/candidates`);
  ok(
    "US3 — candidatas de R3: A/2 y C/2 primero entre las sugeridas, con quién está en cada una",
    JSON.stringify((cand.json?.suggested ?? []).slice(0, 2).map((c) => c.id).sort()) ===
      JSON.stringify([clA[1].id, clC[1].id].sort()),
    JSON.stringify((cand.json?.suggested ?? []).map((c) => c.id))
  );
  const busca = await api(`/api/recordings/${porTema(3).id}/candidates?q=${encodeURIComponent(`Grab C ${cola}`)}`);
  const deC = await api(`/api/recordings/${porTema(3).id}/candidates?cohortId=${cohC}`);
  ok(
    "US3 — cohorte → clase: buscar 'Grab C' encuentra la cohorte y trae todas sus clases reales",
    (busca.json?.cohorts ?? []).some((c) => c.id === cohC) &&
      (deC.json?.results ?? []).length === clC.length && deC.json.results.every((c) => c.cohortId === cohC),
    `${JSON.stringify(busca.json?.cohorts)} ${deC.json?.results?.length}/${clC.length}`
  );

  const r10 = await asignar(porTema(3), clC[1].id);
  await sincronizar();
  const r3 = await fila(3);
  ok(
    "10 — R3 asignada a mano a C/2 y se mantiene tras sincronizar (manual/asignada)",
    r10.res.status === 200 && r10.json?.assignment?.mode === "manual" &&
      JSON.stringify(estadoDe(r3)) === JSON.stringify(["manual", "asignada", clC[1].id]) &&
      Boolean(r3?.assignment?.assignedBy),
    `${r10.res.status} ${JSON.stringify(r3?.assignment)}`
  );

  const r11 = await api(`/api/recordings/${porTema(1).id}/assignment`, { method: "DELETE" });
  await sincronizar();
  const r1 = await fila(1);
  const a1Tras = ((await api(`/api/cohorts/${cohA}/classes`)).json?.classes ?? []).find((c) => c.id === clA[0].id);
  ok(
    "11 — desasignar R1: manual/sin_clase, A/1 deja de ofrecer la grabación y la sincronización no la vuelve a poner",
    r11.res.status === 200 && JSON.stringify(estadoDe(r1)) === JSON.stringify(["manual", "sin_clase", null]) &&
      a1Tras?.recordingUrl === null,
    `${r11.res.status} ${JSON.stringify(r1?.assignment)} ${a1Tras?.recordingUrl}`
  );

  const r12 = await api(`/api/recordings/${porTema(1).id}/assignment/reset`, { method: "POST" });
  const r12b = await api(`/api/recordings/${porTema(1).id}/assignment/reset`, { method: "POST" });
  ok(
    "12 — volver a automático: R1 vuelve a A/1 (auto/asignada); repetirlo → 422 ya_automatica",
    r12.res.status === 200 && JSON.stringify(estadoDe(r12.json)) === JSON.stringify(["auto", "asignada", clA[0].id]) &&
      r12b.res.status === 422 && r12b.json?.error?.code === "ya_automatica",
    `${r12.res.status} ${JSON.stringify(r12.json?.assignment)} / ${r12b.res.status}`
  );

  const r13 = await asignar(porTema(6), clA[2].id);
  const r13b = await asignar(porTema(6), clA[2].id, { replace: true });
  const a3Tras = ((await api(`/api/cohorts/${cohA}/classes`)).json?.classes ?? []).find((c) => c.id === clA[2].id);
  ok(
    "13 — R6 → A/3 sin replace: 409 requiere_reemplazo (enlace manual); con replace: 200 y la clase ofrece R6",
    r13.res.status === 409 && r13.json?.error?.code === "requiere_reemplazo" &&
      r13.json?.error?.current?.kind === "manual" &&
      r13b.res.status === 200 && a3Tras?.recordingUrl === porTema(6).playUrl && a3Tras?.recordingSource === "zoom",
    `${r13.res.status} ${JSON.stringify(r13.json)} / ${r13b.res.status} ${a3Tras?.recordingUrl}`
  );

  const r13c = await asignar(porTema(4), clB[0].id);
  ok(
    "13 — una clase con OTRA grabación también pide confirmar, y dice cuál",
    r13c.res.status === 409 && r13c.json?.error?.current?.kind === "zoom" &&
      r13c.json?.error?.current?.recordingId === porTema(2).id,
    `${r13c.res.status} ${JSON.stringify(r13c.json)}`
  );

  const cancelada = clC[clC.length - 1];
  await api(`/api/class-sessions/${cancelada.id}`, { method: "PATCH", body: JSON.stringify({ cancelReason: "feriado E2E 030" }) });
  const r14 = await asignar(porTema(4), cancelada.id);
  ok(
    "14 — asignar a una clase cancelada → 422 clase_cancelada",
    r14.res.status === 422 && r14.json?.error?.code === "clase_cancelada",
    `${r14.res.status} ${JSON.stringify(r14.json)}`
  );

  // R6 del plan — pegar un enlace a mano en una clase con grabación de Zoom la libera.
  await api(`/api/class-sessions/${clB[0].id}/links`, {
    method: "PATCH",
    body: JSON.stringify({ recordingUrl: "https://drive.example.com/otra-B1" }),
  });
  await sincronizar();
  const r2 = await fila(2);
  const b1 = ((await api(`/api/cohorts/${cohB}/classes`)).json?.classes ?? []).find((c) => c.id === clB[0].id);
  ok(
    "R6 — pegar a mano en B/1 libera R2 (manual/sin_clase) y la sincronización respeta el enlace manual",
    JSON.stringify(estadoDe(r2)) === JSON.stringify(["manual", "sin_clase", null]) &&
      b1?.recordingUrl === "https://drive.example.com/otra-B1" && b1?.recordingSource === "manual",
    `${JSON.stringify(r2?.assignment)} ${b1?.recordingUrl} ${b1?.recordingSource}`
  );

  /* ---------- check 17: archivar la conexión ---------- */
  await api(`/api/settings/zoom/connections/${zc}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
  const s17 = await api("/api/recordings/sync", { method: "POST" });
  const lista17 = (await api(`/api/recordings?connectionId=${zc}`)).json?.rows ?? [];
  ok(
    "17 — con la conexión archivada: sync → 422 sin_conexiones; las grabaciones siguen, marcadas archivadas",
    s17.res.status === 422 && s17.json?.error?.code === "sin_conexiones" &&
      lista17.length === 6 && lista17.every((f) => f.connection.archived === true),
    `${s17.res.status} ${JSON.stringify(s17.json)} ${lista17.length}`
  );
  await api(`/api/settings/zoom/connections/${zc}`, { method: "PATCH", body: JSON.stringify({ archived: false }) });

  /* ---------- addendum A1: un aula vinculada DESPUÉS trae su respaldo ---------- */
  const z3 = await api("/api/virtual-rooms", {
    method: "POST",
    body: JSON.stringify({ name: `Zoom 3 ${cola}`, url: `https://zoom.us/j/4${cola}404` }),
  });
  const aula3 = z3.json?.room?.id;
  await api(`/api/settings/zoom/rooms/${aula3}`, {
    method: "PUT",
    body: JSON.stringify({ connectionId: zc, zoomUserId: "u3", zoomUserEmail: "zoom3@academia.test" }),
  });
  const logAntesA1 = (await zoomLog()).length;
  const estadoA1 = await sincronizar();
  const runA1 = (estadoA1?.connections ?? []).find((c) => c.id === zc)?.lastRun;
  const r7 = await fila(7);
  const pedidosU3 = (await zoomLog()).slice(logAntesA1).filter((l) => l.path.includes("/users/u3/recordings"));
  const desdeU3 = pedidosU3.map((l) => new URLSearchParams(l.query).get("from")).sort()[0] ?? "";
  const pedidosU1 = (await zoomLog()).slice(logAntesA1).filter((l) => l.path.includes("/users/u1/recordings"));
  const desdeU1 = pedidosU1.map((l) => new URLSearchParams(l.query).get("from")).sort()[0] ?? "";
  ok(
    "A1 — el aula vinculada después pide sus 90 días (u3) mientras las otras solo el solape; trae R7 de hace 60 días",
    runA1?.status === "ok" && runA1?.newCount === 1 && Boolean(r7) && r7?.room?.id === aula3 &&
      desdeU3 <= isoDia(-90) && desdeU1 >= isoDia(-5),
    `${JSON.stringify(runA1)} u3 desde ${desdeU3} u1 desde ${desdeU1} R7 ${Boolean(r7)}`
  );

  /* ---------- US6-3 (riesgo R6): el profesor pega su enlace en una clase con grabación de Zoom ---------- */
  // A/3 ofrece R6 desde el check 13 (reemplazo confirmado). El profesor decide otra cosa.
  const ENLACE_PROFE = `https://drive.example.com/profe-A3-${cola}`;
  const pega = await portalA.como(`/api/portal/classes/${clA[2].id}/recording`, {
    method: "PUT",
    body: JSON.stringify({ recordingUrl: ENLACE_PROFE }),
  });
  await sincronizar();
  const r6Tras = await fila(6);
  const a3Profe = claseDe((await portalA.como(`/api/portal/cohorts/${cohA}/classes`)).json?.classes?.classes, clA[2].id);
  const a3Staff = ((await api(`/api/cohorts/${cohA}/classes`)).json?.classes ?? []).find((c) => c.id === clA[2].id);
  const a3Alumno = claseDe((await alumnoA.como(`/api/portal/me/cursadas/${insA.id}`)).json?.classes, clA[2].id);
  ok(
    "US6-3 — gana el enlace del profesor: R6 pasa a manual/sin_clase y una sincronización posterior no lo pisa",
    pega.res.ok && JSON.stringify(estadoDe(r6Tras)) === JSON.stringify(["manual", "sin_clase", null]) &&
      a3Profe?.recordingUrl === ENLACE_PROFE && a3Staff?.recordingSource === "manual" && a3Alumno?.recordingUrl === ENLACE_PROFE,
    `${pega.res.status} ${JSON.stringify(r6Tras?.assignment)} ${a3Profe?.recordingUrl} ${a3Staff?.recordingSource}`
  );

  /* ---------- check 15 (US5): un 429 transitorio no rompe la corrida ---------- */
  await zoomFail({ status: 429, times: 2, retryAfterSec: 1 });
  const estado15 = await sincronizar();
  const run15 = (estado15?.connections ?? []).find((c) => c.id === zc)?.lastRun;
  ok(
    "15 — Zoom responde 429 dos veces (Retry-After 1 s): el adaptador espera y la corrida termina ok",
    run15?.status === "ok" && run15?.error === null,
    JSON.stringify(run15)
  );

  /* ---------- check 16 (US5): Zoom caído no tumba nada y no mueve la marca ---------- */
  const marcaAntes = (estado15?.connections ?? []).find((c) => c.id === zc)?.syncedThrough;
  await zoomFail({ status: 500, times: 100 });
  const s16 = await api("/api/recordings/sync", { method: "POST" });
  const salud = await api("/api/health");
  const clasesDurante = await api(`/api/cohorts/${cohA}/classes`);
  const estado16 = await esperarSyncLibre(120000);
  await zoomFail({ status: 500, times: 0 });
  const c16 = (estado16?.connections ?? []).find((c) => c.id === zc);
  ok(
    "16 — Zoom con 500 persistente: la corrida termina 'error' con mensaje propio y syncedThrough no se mueve",
    s16.res.status === 202 && c16?.lastRun?.status === "error" && /Zoom/.test(c16?.lastRun?.error ?? "") &&
      c16?.syncedThrough === marcaAntes,
    `${s16.res.status} ${JSON.stringify(c16)} antes=${marcaAntes}`
  );
  ok(
    "16 — mientras tanto el resto del CRM responde (/api/health y la lista de clases)",
    salud.res.ok && clasesDurante.res.ok,
    `${salud.res.status}/${clasesDurante.res.status}`
  );

  /* ---------- check 20: capacidades ---------- */
  const cuentaEquipo = async (nombre, roleKey) => {
    const correo = `${nombre}-grab-${cola}@example.com`;
    const clave = `clave-${nombre}-${cola}`;
    const alta = await api("/api/settings/team", {
      method: "POST",
      body: JSON.stringify({ name: `${nombre} Grab E2E`, email: correo, password: clave, roleKey }),
    });
    const jar = { cookie: "" };
    const como = conJar(BASE, jar);
    const ip = ipDe();
    const login = await como("/api/auth/sign-in/email", {
      method: "POST",
      headers: ip,
      body: JSON.stringify({ email: correo, password: clave }),
    });
    await alEntrar(como, login, correo, clave, ip);
    return { como, entro: alta.res.status === 201 && login.res.ok, motivo: `${alta.res.status} / ${login.res.status}` };
  };
  const soporte = await cuentaEquipo("soporte", "soporte");
  const rolSinGrab = await api("/api/settings/roles", {
    method: "POST",
    body: JSON.stringify({ name: `Sin grabaciones ${cola}`, capabilities: ["contactos.ver"] }),
  });
  const sinVer = await cuentaEquipo("singrab", rolSinGrab.json?.role?.key);
  ok("20 — prep: una cuenta de soporte y una sin grabaciones.ver entran", soporte.entro && sinVer.entro, `${soporte.motivo} · ${sinVer.motivo}`);
  const sopLista = await soporte.como(`/api/recordings?connectionId=${zc}`);
  const sopAsigna = await soporte.como(`/api/recordings/${porTema(4).id}/assignment`, {
    method: "PUT",
    body: JSON.stringify({ classSessionId: clB[1].id }),
  });
  const sopSync = await soporte.como("/api/recordings/sync", { method: "POST" });
  const sopPagina = await soporte.como("/grabaciones");
  ok(
    "20 — soporte ve /grabaciones y la lista, pero asignar y sincronizar → 403",
    sopLista.res.status === 200 && sopPagina.res.status === 200 && sopAsigna.res.status === 403 && sopSync.res.status === 403,
    `${sopLista.res.status}/${sopPagina.res.status}/${sopAsigna.res.status}/${sopSync.res.status}`
  );
  const sinLista = await sinVer.como("/api/recordings");
  const sinEstado = await sinVer.como("/api/recordings/sync");
  const sinInicio = await sinVer.como("/contacts");
  const conInicio = await soporte.como("/contacts");
  ok(
    "20 — sin grabaciones.ver: /api/recordings y su estado → 403, y el menú no ofrece Grabaciones (soporte sí)",
    sinLista.res.status === 403 && sinEstado.res.status === 403 && sinInicio.res.status === 200 &&
      !/href="\/grabaciones"/.test(sinInicio.text ?? "") && /href="\/grabaciones"/.test(conInicio.text ?? ""),
    `${sinLista.res.status}/${sinEstado.res.status}/${sinInicio.res.status}/${conInicio.res.status}`
  );

  /* ---------- salida: el zoom-mock queda limpio ---------- */
  await zoomFail({ status: 500, times: 0 });
  await zoomReset();
}

/**
 * 030 US5 — Check 19: la periódica, SIN tocar el botón.
 *
 *   ZOOM_SYNC_INTERVAL_MIN=1 en la app + E2E_SECCIONES=grabaciones-zoom-periodica
 *
 * Va en su propia sección porque necesita la app con la periódica ENCENDIDA,
 * y la sección principal la necesita APAGADA (un tick en medio de sus checks
 * los volvería azarosos). Con la periódica apagada se salta con aviso.
 * Conexión, cuenta y usuario propios; nunca se aprieta "Sincronizar".
 */
export async function seccionGrabacionesZoomPeriodica({ api, ok }) {
  console.log("\n== 030 US5: sincronización periódica (check 19) ==");
  if (!(await exigirZoomMock({ api, ok }))) return;
  const intervalo = (await api("/api/recordings/sync")).json?.periodicIntervalMin;
  if (!(intervalo > 0)) {
    console.log("  …  19 — se salta: la app corre con ZOOM_SYNC_INTERVAL_MIN=0 (periódica apagada)");
    return;
  }
  const cola = String(Date.now()).slice(-6);
  const previas = (await api("/api/settings/zoom/connections")).json?.connections ?? [];
  for (const c of previas.filter((c) => !c.archived)) {
    await api(`/api/settings/zoom/connections/${c.id}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
  }
  const ACC = `acc-per-${cola}`;
  await api("/api/dev/zoom-mock/seed", {
    method: "POST",
    body: JSON.stringify({
      accounts: [
        {
          accountId: ACC,
          users: [
            {
              id: "u9",
              email: "zoom9@academia.test",
              first_name: "Zoom",
              last_name: "Nueve",
              pmi: Number(`9${cola}909`),
              recordings: [
                {
                  uuid: `R8-${cola}==`,
                  id: Number(`8${cola}808`),
                  topic: "Grabación R8 (periódica)",
                  start_time: `${isoDia(-2)}T21:30:00Z`,
                  duration: 120,
                  share_url: `https://zoom.us/rec/share/R8-${cola}`,
                },
              ],
            },
          ],
        },
      ],
    }),
  });
  const alta = await api("/api/settings/zoom/connections", {
    method: "POST",
    body: JSON.stringify({ name: `Zoom periódica ${cola}`, accountId: ACC, clientId: `cli-per-${cola}`, clientSecret: `good-secret-${cola}` }),
  });
  const zc = alta.json?.connection?.id;
  const prueba = await api(`/api/settings/zoom/connections/${zc}/test`, { method: "POST" });
  const aula = (
    await api("/api/virtual-rooms", { method: "POST", body: JSON.stringify({ name: `Zoom 9 ${cola}`, url: `https://zoom.us/j/9${cola}909` }) })
  ).json?.room?.id;
  const vinculo = await api(`/api/settings/zoom/rooms/${aula}`, {
    method: "PUT",
    body: JSON.stringify({ connectionId: zc, zoomUserId: "u9", zoomUserEmail: "zoom9@academia.test" }),
  });
  ok(
    "19 — prep: conexión probada y aula vinculada, sin apretar Sincronizar",
    alta.res.status === 201 && prueba.json?.ok === true && vinculo.res.ok,
    `${alta.res.status}/${JSON.stringify(prueba.json?.ok)}/${vinculo.res.status}`
  );
  const limite = Date.now() + (intervalo * 60 + 150) * 1000;
  let fila = null;
  let ultimo = null;
  while (Date.now() < limite && !fila) {
    await sleep(5000);
    fila = ((await api(`/api/recordings?connectionId=${zc}`)).json?.rows ?? []).find((f) => f.topic === "Grabación R8 (periódica)");
    ultimo = ((await api("/api/recordings/sync")).json?.connections ?? []).find((c) => c.id === zc)?.lastRun ?? null;
  }
  ok(
    `19 — sin tocar nada, la periódica (cada ${intervalo} min) trae R8 y la corrida termina ok`,
    Boolean(fila) && ultimo?.status === "ok",
    JSON.stringify(ultimo)
  );
  await api(`/api/settings/zoom/connections/${zc}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
  await api("/api/dev/zoom-mock/seed", { method: "DELETE" });
}

/**
 * `/grabaciones` en un navegador real: filtro por aula y fechas, "Copiar
 * enlace" (el portapapeles queda con el `playUrl`), "Ver" (pestaña nueva, el
 * CRM no intermedia) y capturas en tema claro y oscuro. "Ver" se comprueba
 * por sus atributos y NO se abre: abrirlo saldría a zoom.us.
 */
async function pantalla({ ok, BASE, getCookie, nombreZ2, desde, hasta, R5, secretoBueno, R3, sugeridasR3, aula2, zc }) {
  let navegador = null;
  try {
    const { chromium } = await import("playwright");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    navegador = await chromium.launch();
    const url = new URL(BASE);
    for (const tema of ["light", "dark"]) {
      const contexto = await navegador.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
      await contexto.addCookies([
        ...getCookie()
          .split("; ")
          .filter(Boolean)
          .map((par) => {
            const i = par.indexOf("=");
            return { name: par.slice(0, i), value: par.slice(i + 1), domain: url.hostname, path: "/" };
          }),
        { name: "tema", value: tema, domain: url.hostname, path: "/" },
      ]);
      const pagina = await contexto.newPage();
      await pagina.goto(`${BASE}/grabaciones`, { timeout: 120000 });
      await pagina.getByRole("heading", { name: "Grabaciones" }).waitFor({ timeout: 60000 });

      // El resumen de la paginación solo existe cuando el cliente ya hidrató y
      // cargó: elegir un filtro ANTES deja el select con el valor puesto y
      // React no ve el cambio cuando se vuelve a elegir el mismo.
      await pagina.locator("[data-pagination-summary]").waitFor({ timeout: 120000 });
      // Hasta que hidrata, el select existe pero no dispara la consulta: se reintenta.
      const filas = pagina.locator("tbody tr");
      for (let intento = 0; intento < 60; intento++) {
        await pagina.locator("#rec-room").selectOption({ label: nombreZ2 });
        await pagina.locator("#rec-from").fill(desde);
        await pagina.locator("#rec-to").fill(hasta);
        await pagina.waitForTimeout(800);
        if ((await filas.count()) === 2) break;
      }
      const temas = await filas.locator("[data-topic]").allInnerTexts();
      if (tema === "light") {
        ok(
          "UI — filtro aula Zoom 2 + rango de la semana: solo R2 y R5",
          JSON.stringify(temas.sort()) === JSON.stringify(["Grabación R2", "Grabación R5"]),
          JSON.stringify(temas)
        );

        const filaR5 = filas.filter({ hasText: "Grabación R5" });
        await filaR5.getByRole("button", { name: "Copiar enlace" }).click();
        // El aviso es un toast (sonner): vive en el contenedor de avisos, no en la fila.
        await pagina.locator("[data-sonner-toast]").getByText("Enlace copiado").waitFor({ timeout: 5000 });
        const portapapeles = await pagina.evaluate(() => navigator.clipboard.readText());
        ok("UI — Copiar enlace deja el playUrl en el portapapeles y avisa", portapapeles === R5?.playUrl, portapapeles);

        ok(
          "UI — duración legible ('2 h 55 min') y chip Transcripción solo en R5",
          (await filaR5.locator("[data-duration]").innerText()) === "2 h 55 min" &&
            (await filaR5.locator("[data-transcript]").count()) === 1 &&
            (await filas.filter({ hasText: "Grabación R2" }).locator("[data-transcript]").count()) === 0,
          await filaR5.innerText()
        );
        ok(
          "UI — los filtros quedan en la URL",
          /roomId=/.test(pagina.url()) && pagina.url().includes(`from=${desde}`) && pagina.url().includes(`to=${hasta}`),
          pagina.url()
        );
        await pagina.reload({ timeout: 120000 });
        await pagina.locator("[data-pagination-summary]").waitFor({ timeout: 60000 });
        await pagina.waitForTimeout(500);
        ok(
          "UI — al recargar se conservan los filtros (sigue mostrando solo R2 y R5) y el total",
          (await filas.count()) === 2 && (await pagina.locator("#rec-from").inputValue()) === desde &&
            /^1–2 de 2/.test(await pagina.locator("[data-pagination-summary]").innerText()),
          await pagina.locator("[data-pagination-summary]").innerText()
        );
        const primeraAntes = await filas.first().locator("[data-topic]").innerText();
        await pagina.locator("[data-sort-toggle]").click();
        await pagina.waitForURL(/sort=asc/, { timeout: 30000 });
        await pagina.waitForTimeout(800);
        ok(
          "UI — ordenar por Inicio invierte el orden (sort=asc en la URL)",
          (await filas.first().locator("[data-topic]").innerText()) !== primeraAntes,
          primeraAntes
        );
        await pagina.locator("[data-sort-toggle]").click();
        await pagina.waitForURL((u) => !u.search.includes("sort=asc"), { timeout: 30000 });

        const ver = filaR5.getByRole("link", { name: "Ver" });
        ok(
          "UI — Ver abre el playUrl en pestaña nueva (noopener), sin intermediar",
          (await ver.getAttribute("href")) === R5?.playUrl &&
            (await ver.getAttribute("target")) === "_blank" &&
            /noopener/.test((await ver.getAttribute("rel")) ?? ""),
          await ver.getAttribute("href")
        );
      }
      if (tema === "light") {
        // La fila ambigua se destaca y su panel ofrece A/2 y C/2 como sugeridas.
        await pagina.locator("#rec-room").selectOption({ label: "Todas" });
        await pagina.locator("#rec-from").fill("");
        await pagina.locator("#rec-to").fill("");
        // Con la base del arnés acumulando corridas, R3 puede caer en otra
        // página: se acota a la cuenta de ESTA corrida.
        await pagina.locator("#rec-connection").selectOption({ value: zc });
        const filaR3 = pagina.locator(`tr[data-recording-id="${R3?.id}"]`);
        await filaR3.waitFor({ timeout: 30000 });
        ok("UI — la fila ambigua se marca como tal", (await filaR3.getAttribute("data-state")) === "ambigua");
        await filaR3.getByRole("button", { name: "Asignar a clase" }).click();
        const sugeridas = pagina.locator('[data-testid="sugeridas"] [data-class-id]');
        await sugeridas.first().waitFor({ timeout: 30000 });
        const ids = await sugeridas.evaluateAll((els) => els.map((e) => e.getAttribute("data-class-id")));
        ok(
          "UI — el panel de asignar muestra A/2 y C/2 primero entre las sugeridas",
          JSON.stringify(ids.slice(0, 2).sort()) === JSON.stringify([...sugeridasR3].sort()),
          JSON.stringify(ids)
        );
      }
      if (tema === "light") {
        // Celular: la página no se desplaza de costado; lo hace la tabla.
        await pagina.setViewportSize({ width: 390, height: 800 });
        await pagina.locator("#rec-room").selectOption({ label: "Todas" });
        await pagina.locator("[data-recordings-table]").waitFor({ timeout: 30000 });
        await pagina.waitForTimeout(500);
        const anchos = await pagina.evaluate(() => {
          const t = document.querySelector("[data-recordings-table]")?.parentElement;
          return {
            pagina: document.documentElement.scrollWidth,
            vista: document.documentElement.clientWidth,
            tabla: t ? t.scrollWidth > t.clientWidth : false,
          };
        });
        ok(
          "UI — a 390 px no hay scroll horizontal de página; la tabla se desplaza dentro de su contenedor",
          anchos.pagina <= anchos.vista && anchos.tabla === true,
          JSON.stringify(anchos)
        );
        await pagina.screenshot({ path: path.join(tmpdir(), "cadit-030-grabaciones-celular.png"), fullPage: true });
        await pagina.setViewportSize({ width: 1280, height: 800 });
      }
      const archivo = path.join(tmpdir(), `cadit-030-grabaciones-${tema}.png`);
      await pagina.screenshot({ path: archivo, fullPage: true });
      console.log(`  …  captura ${tema}: ${archivo}`);

      // Configuración › Zoom: la conexión con su secreto enmascarado.
      await pagina.goto(`${BASE}/settings/zoom`, { timeout: 120000 });
      await pagina.getByText("Conectar una cuenta de Zoom").waitFor({ timeout: 60000 });
      await pagina.getByText(/Client Secret ••••/).first().waitFor({ timeout: 30000 });
      if (tema === "light") {
        const html = await pagina.content();
        ok(
          "UI — Configuración › Zoom muestra el secreto como ••••últimos 4 y nunca entero",
          !html.includes(secretoBueno) && html.includes(`••••${secretoBueno.slice(-4)}`)
        );
        const aviso = pagina.locator(`[data-pmi-warning="${aula2}"]`);
        await aviso.waitFor({ timeout: 30000 });
        await pagina.screenshot({ path: path.join(tmpdir(), "cadit-030-settings-zoom-aviso-pmi.png"), fullPage: true });
        await aviso.getByRole("button", { name: "Actualizar enlace del aula a la sala personal de Zoom" }).click();
        await pagina.getByText(/ahora es https:\/\/zoom\.us\/j\//).waitFor({ timeout: 30000 });
        const seFue = await aviso.waitFor({ state: "detached", timeout: 30000 }).then(() => true, () => false);
        ok("UI — el aviso del PMI ofrece 'Actualizar enlace' y al usarlo desaparece", seFue);
      }
      const archivoZoom = path.join(tmpdir(), `cadit-030-settings-zoom-${tema}.png`);
      await pagina.screenshot({ path: archivoZoom, fullPage: true });
      console.log(`  …  captura ${tema}: ${archivoZoom}`);
      await contexto.close();
    }
  } catch (err) {
    ok("UI — /grabaciones en el navegador", false, String(err?.message ?? err));
  } finally {
    await navegador?.close();
  }
}
