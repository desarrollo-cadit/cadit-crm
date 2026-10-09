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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isoDia = (desplazamiento) =>
  new Date(Date.now() + desplazamiento * 86_400_000).toISOString().slice(0, 10);

export async function seccionGrabacionesZoom({ api, ok, BASE, getCookie }) {
  console.log("\n== 030: grabaciones de Zoom — conexiones, aulas y sincronización ==");

  const sello = Date.now();
  const cola = String(sello).slice(-6);
  const ACC = `acc-e2e-${cola}`;
  const SECRETO_MALO = `bad-secret-${cola}`;
  const SECRETO_BUENO = `good-secret-${cola}`;

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
  void zoomFail; // US5 (checks 15–16) lo usa.

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

  /* ---------- preparación (quickstart §3, pasos 1–3) ---------- */
  const nombreZ1 = `Zoom 1 ${cola}`;
  const nombreZ2 = `Zoom 2 ${cola}`;
  const z1 = await api("/api/virtual-rooms", {
    method: "POST",
    body: JSON.stringify({ name: nombreZ1, url: "https://zoom.us/j/1110000001" }),
  });
  const z2 = await api("/api/virtual-rooms", {
    method: "POST",
    body: JSON.stringify({ name: nombreZ2, url: "https://zoom.us/j/2220000002" }),
  });
  const aula1 = z1.json?.room?.id;
  const aula2 = z2.json?.room?.id;
  ok("prep — dos aulas (Zoom 1 / Zoom 2) con su PMI", Boolean(aula1 && aula2), `${z1.res.status}/${z2.res.status}`);

  const curso = await api("/api/courses", {
    method: "POST",
    body: JSON.stringify({ name: `Curso Grabaciones E2E ${cola}`, published: false }),
  });
  const cursoId = curso.json?.course?.id;
  // Martes y jueves 18:30–21:30, en el PASADO: las grabaciones caen en la
  // ventana de la primera sincronización (90 días hacia atrás).
  const horario = { startDate: isoDia(-21), endDate: isoDia(-1), daysOfWeek: "1,3", startTime: "18:30", endTime: "21:30" };
  const cohorte = async (name, extra) =>
    (await api("/api/cohorts", { method: "POST", body: JSON.stringify({ courseId: cursoId, name, ...horario, ...extra }) }))
      .json?.cohort?.id;
  const cohA = await cohorte(`Grab A ${cola}`, { virtualRoomId: aula1, meetingUrl: "https://zoom.us/j/9990000001?pwd=x" });
  const cohB = await cohorte(`Grab B ${cola}`, { virtualRoomId: aula2 });
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
    1: rec(1, 9990000001, mas(clA[0].startsAt, 4), { recording_play_passcode: null, share_url: `https://zoom.us/rec/share/R1-${cola}?pwd=embebido` }),
    2: rec(2, 2220000002, mas(clB[0].startsAt, 2)),
    3: rec(3, 1110000001, clA[1].startsAt),
    4: rec(4, 9990000001, domingo, { password: "7777" }),
    5: rec(5, 2220000002, mas(clB[1].startsAt, 3), { recording_play_passcode: "abc123" }),
    6: rec(6, 9990000001, mas(clA[2].startsAt, 1)),
  };
  const sembrado = await zoomSeed({
    pageSize: 2,
    accounts: [
      {
        accountId: ACC,
        users: [
          { id: "u1", email: "zoom1@academia.test", first_name: "Zoom", last_name: "Uno", recordings: [R[1], R[3], R[4], R[6]] },
          { id: "u2", email: "zoom2@academia.test", first_name: "Zoom", last_name: "Dos", recordings: [R[2], R[5]] },
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
    "2 — Probar con el secreto bueno lista u1 y u2",
    prueba2.json?.ok === true && JSON.stringify(ids2) === JSON.stringify(["u1", "u2"]),
    JSON.stringify(prueba2.json)
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
    body: JSON.stringify({ connectionId: zc, zoomUserId: "u1", zoomUserEmail: "zoom1@academia.test" }),
  });
  const v2 = await api(`/api/settings/zoom/rooms/${aula2}`, {
    method: "PUT",
    body: JSON.stringify({ connectionId: zc, zoomUserId: "u2", zoomUserEmail: "zoom2@academia.test" }),
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
    "6 — R4 (sin pwd en el enlace): el código de acceso viaja para el staff",
    porTema(4)?.passcodeEmbedded === false && porTema(4)?.passcode === "7777",
    JSON.stringify(porTema(4))
  );
  ok(
    "6 — sin adjudicación todavía (US2): todas en estado pendiente",
    filas.every((f) => f.assignment?.state === "pendiente" && f.assignment?.mode === "auto"),
    JSON.stringify(filas.map((f) => f.assignment?.state))
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
  const pag = await api(`/api/recordings?connectionId=${zc}&limit=4`);
  const pag2 = await api(`/api/recordings?connectionId=${zc}&limit=4&cursor=${encodeURIComponent(pag.json?.nextCursor ?? "")}`);
  ok(
    "6 — paginación por cursor: 4 + 2, sin repetir",
    (pag.json?.rows ?? []).length === 4 && (pag2.json?.rows ?? []).length === 2 && pag2.json?.nextCursor === null &&
      new Set([...pag.json.rows, ...pag2.json.rows].map((f) => f.id)).size === 6,
    `${pag.json?.rows?.length}/${pag2.json?.rows?.length}`
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

  /* ---------- bloque de pantalla (Playwright) ---------- */
  await pantalla({ ok, BASE, getCookie, nombreZ2, desde: clB[0].date.slice(0, 10), hasta: clB[1].date.slice(0, 10), R5: porTema(5), secretoBueno: SECRETO_BUENO });

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
}

/**
 * `/grabaciones` en un navegador real: filtro por aula y fechas, "Copiar
 * enlace" (el portapapeles queda con el `playUrl`), "Ver" (pestaña nueva, el
 * CRM no intermedia) y capturas en tema claro y oscuro. "Ver" se comprueba
 * por sus atributos y NO se abre: abrirlo saldría a zoom.us.
 */
async function pantalla({ ok, BASE, getCookie, nombreZ2, desde, hasta, R5, secretoBueno }) {
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

      // Hasta que hidrata, el select existe pero no dispara la consulta: se reintenta.
      const filas = pagina.locator("tbody tr");
      for (let intento = 0; intento < 20; intento++) {
        await pagina.locator("#rec-room").selectOption({ label: nombreZ2 });
        await pagina.locator("#rec-from").fill(desde);
        await pagina.locator("#rec-to").fill(hasta);
        await pagina.waitForTimeout(800);
        if ((await filas.count()) === 2) break;
      }
      const temas = await filas.locator("td:nth-child(4)").allInnerTexts();
      if (tema === "light") {
        ok(
          "UI — filtro aula Zoom 2 + rango de la semana: solo R2 y R5",
          JSON.stringify(temas.sort()) === JSON.stringify(["Grabación R2", "Grabación R5"]),
          JSON.stringify(temas)
        );

        const filaR5 = filas.filter({ hasText: "Grabación R5" });
        await filaR5.getByRole("button", { name: "Copiar enlace" }).click();
        await filaR5.getByText("Enlace copiado").waitFor({ timeout: 5000 });
        const portapapeles = await pagina.evaluate(() => navigator.clipboard.readText());
        ok("UI — Copiar enlace deja el playUrl en el portapapeles y avisa", portapapeles === R5?.playUrl, portapapeles);

        const ver = filaR5.getByRole("link", { name: "Ver" });
        ok(
          "UI — Ver abre el playUrl en pestaña nueva (noopener), sin intermediar",
          (await ver.getAttribute("href")) === R5?.playUrl &&
            (await ver.getAttribute("target")) === "_blank" &&
            /noopener/.test((await ver.getAttribute("rel")) ?? ""),
          await ver.getAttribute("href")
        );
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
