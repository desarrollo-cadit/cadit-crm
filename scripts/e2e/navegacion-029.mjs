/**
 * 029 — Navegación y agregados de la especialización (guion:
 * tests/e2e/us-navegacion-especializacion.md).
 *
 * Vive en su propio módulo para poder correrlo SOLO (el arnés entero tarda
 * más de diez minutos): `e2e-selftest.mjs` lo llama al final, y cualquier
 * entrada temporal puede importarlo con una sesión ya abierta.
 *
 * Conduce, en navegador real:
 *  - la pestaña Clases de una cohorte común pide el material en UN request;
 *  - la madre entra por el Recorrido, con la grilla de estados;
 *  - la pestaña Clases de la madre muestra las clases de sus módulos y genera
 *    el cronograma de TODOS en un pedido (y repetirlo no duplica);
 *  - Asistencia de la madre: "Todos" y la planilla de un módulo;
 *  - la miga de pan de un módulo lleva a su especialización.
 */

export async function seccion029({ api, ok, BASE, getCookie }) {
  console.log("\n== 029: navegación, material en un pedido y agregados de la especialización ==");

  const sello = Date.now();
  const isoDia = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const curso = async (name) =>
    (await api("/api/courses", { method: "POST", body: JSON.stringify({ name, published: false }) }))
      .json?.course?.id;
  const cohorte = async (datos) => {
    const r = await api("/api/cohorts", { method: "POST", body: JSON.stringify(datos) });
    return { id: r.json?.cohort?.id, status: r.res.status, json: r.json };
  };

  // ---- Una cohorte común con cronograma y material en dos clases.
  const cursoComun = await curso(`Común 029 ${sello}`);
  const comun = await cohorte({
    courseId: cursoComun,
    name: `Común 029 ${sello}`,
    startDate: isoDia(-14),
    endDate: isoDia(60),
    daysOfWeek: "0,2,4",
    startTime: "18:30",
    endTime: "20:30",
  });
  const genComun = await api(`/api/cohorts/${comun.id}/schedule`, { method: "POST" });
  const clasesComun = genComun.json?.classes ?? [];
  for (const c of clasesComun.slice(0, 2)) {
    await api("/api/resources", {
      method: "POST",
      body: JSON.stringify({ title: `Guía ${c.number}`, url: `https://ejemplo.com/${c.number}`, classSessionId: c.id }),
    });
  }
  const agrupado = (await api(`/api/resources?classesOfCohortId=${comun.id}`)).json?.byClass ?? {};
  ok(
    "API: el material de todas las clases de la cohorte, repartido por clase, en UN pedido",
    clasesComun.length > 10 &&
      agrupado[clasesComun[0].id]?.[0]?.title === "Guía 1" &&
      agrupado[clasesComun[1].id]?.[0]?.title === "Guía 2" &&
      Object.keys(agrupado).length === 2,
    `${clasesComun.length} clases, ${JSON.stringify(Object.keys(agrupado))}`
  );

  // ---- Una especialización con tres módulos; el tercero sin días.
  const cursoMadre = await curso(`Esp 029 ${sello}`);
  const cursoA = await curso(`Mod A 029 ${sello}`);
  const cursoB = await curso(`Mod B 029 ${sello}`);
  const cursoC = await curso(`Mod C 029 ${sello}`);
  const nombreMadre = `EBIM 029 ${sello}`;
  const madre = await cohorte({
    courseId: cursoMadre,
    name: nombreMadre,
    startDate: isoDia(-10),
    endDate: isoDia(120),
    isSpecialization: true,
  });
  const modulo = (courseId, name, position, extra) =>
    cohorte({ courseId, name, parentCohortId: madre.id, position, startTime: "18:30", endTime: "20:30", ...extra });
  const nombreA = `A 029 ${sello}`;
  const nombreB = `B 029 ${sello}`;
  const modA = await modulo(cursoA, nombreA, 10, { startDate: isoDia(-10), endDate: isoDia(20), daysOfWeek: "0,2" });
  const modB = await modulo(cursoB, nombreB, 20, { startDate: isoDia(21), endDate: isoDia(50), daysOfWeek: "1,3" });
  const modC = await modulo(cursoC, `C 029 ${sello}`, 30, { startDate: isoDia(51), endDate: isoDia(80) });
  ok(
    "especialización con tres módulos",
    [madre, modA, modB, modC].every((c) => c.status === 201),
    JSON.stringify([madre, modA, modB, modC].map((c) => c.status))
  );

  const inscMadre = await api("/api/enrollments", {
    method: "POST",
    body: JSON.stringify({
      cohortId: madre.id,
      contact: { firstName: "Recorrido", lastName: `E2E ${sello}`, phone: `5987${String(sello).slice(-8)}` },
    }),
  });
  const madreEnr = inscMadre.json?.enrollment?.id;
  const contactId = inscMadre.json?.enrollment?.contactId;
  const hijaA = await api("/api/enrollments", {
    method: "POST",
    body: JSON.stringify({ cohortId: modA.id, contactId, parentEnrollmentId: madreEnr }),
  });
  // 030 — Y en el módulo B, que no tiene evaluación obligatoria ni lista
  // tomada: es `sin_datos`, y la celda tiene que decirlo en vez de "Aprobado".
  const hijaB = await api("/api/enrollments", {
    method: "POST",
    body: JSON.stringify({ cohortId: modB.id, contactId, parentEnrollmentId: madreEnr }),
  });
  ok(
    "alumno inscripto en la especialización y en sus módulos 1 y 2",
    inscMadre.res.status === 201 && hijaA.res.status === 201 && hijaB.res.status === 201,
    `${inscMadre.res.status}/${hijaA.res.status}/${hijaB.res.status}`
  );
  const nombreAlumno = `Recorrido E2E ${sello}`;
  // Una evaluación obligatoria sin corregir en A: el módulo queda `pendiente`
  // y, dentro de sus fechas, "Cursando". B queda sin datos a propósito.
  await api(`/api/cohorts/${modA.id}/grading`, {
    method: "POST",
    body: JSON.stringify({ name: `Parcial 029 ${sello}`, required: true }),
  });

  let navegador = null;
  try {
    const { chromium } = await import("playwright");
    navegador = await chromium.launch();
    const contexto = await navegador.newContext();
    const url = new URL(BASE);
    await contexto.addCookies(
      getCookie()
        .split("; ")
        .filter(Boolean)
        .map((par) => {
          const i = par.indexOf("=");
          return { name: par.slice(0, i), value: par.slice(i + 1), domain: url.hostname, path: "/" };
        })
    );
    const pagina = await contexto.newPage();

    // Hasta que hidrata, el botón no responde: se reintenta hasta ver `destino`.
    async function clicHasta(boton, destino) {
      await boton.waitFor({ timeout: 30000 });
      for (let i = 0; i < 30 && !(await destino.isVisible()); i++) {
        await boton.click().catch(() => {});
        await destino.waitFor({ timeout: 2000 }).catch(() => {});
      }
      await destino.waitFor({ timeout: 10000 });
    }

    /*
      Se cuentan los pedidos que TERMINARON: en `next dev` React monta dos
      veces (StrictMode) y el primer fetch se cancela — ese no llega a la base
      ni existe en producción. Aparte se cuenta cualquier pedido por clase
      (`classSessionId=`), que es el N+1 que no tiene que volver, ni cancelado.
    */
    const pedidosDeMaterial = [];
    const pedidosPorClase = [];
    pagina.on("requestfinished", (r) => {
      if (r.url().includes("/api/resources?")) pedidosDeMaterial.push(r.url());
    });
    pagina.on("request", (r) => {
      if (r.url().includes("/api/resources?classSessionId=")) pedidosPorClase.push(r.url());
    });

    // ---- Clases de una cohorte común: UN pedido de material, no uno por fila.
    await pagina.goto(`${BASE}/cohorts/${comun.id}`, { timeout: 120000 });
    await clicHasta(
      pagina.getByRole("button", { name: "Clases", exact: true }),
      pagina.getByText("Guía 1").first()
    );
    await pagina.waitForTimeout(1500);
    ok(
      "Clases de una cohorte común: exactamente 1 request de material para todas las filas",
      pedidosDeMaterial.length === 1 &&
        pedidosDeMaterial[0].includes("classesOfCohortId=") &&
        pedidosPorClase.length === 0,
      `${pedidosDeMaterial.length} (por clase: ${pedidosPorClase.length}): ${pedidosDeMaterial.slice(0, 3).join(" ")}`
    );
    const encabezadoComun = pagina.getByRole("navigation", { name: "Migas de pan" });
    ok(
      "cohorte común: miga Académico › cohorte",
      (await encabezadoComun.innerText()).replace(/\s+/g, " ").includes(`Académico`) &&
        (await encabezadoComun.getByText(`Común 029 ${sello}`).count()) === 1
    );

    // ---- La madre entra por el Recorrido, con la grilla de estados.
    pedidosDeMaterial.length = 0;
    await pagina.goto(`${BASE}/cohorts/${madre.id}`, { timeout: 120000 });
    const filaAlumno = pagina.locator("tr", { hasText: nombreAlumno });
    await filaAlumno.waitFor({ timeout: 30000 });
    const estados = await filaAlumno.locator("td[data-estado]").evaluateAll((tds) =>
      tds.map((td) => td.getAttribute("data-estado"))
    );
    const pestanaActiva = await pagina
      .getByRole("button", { name: "Recorrido", exact: true })
      .getAttribute("aria-pressed");
    ok(
      "la madre abre en Recorrido: fila del alumno con un estado por módulo (cursando / sin datos / sin cursada)",
      pestanaActiva === "true" &&
        JSON.stringify(estados) === JSON.stringify(["cursando", "sin_datos", "sin_cursada"]),
      `activa=${pestanaActiva} estados=${JSON.stringify(estados)}`
    );
    const textoFila = await filaAlumno.innerText();
    ok(
      "la celda DICE el estado con texto y la fila cierra con el certificado; nada de plata",
      /Cursando/.test(textoFila) && /Pendiente/.test(textoFila) && !/\$|UYU|USD/.test(textoFila),
      textoFila.replace(/\s+/g, " ").slice(0, 200)
    );
    // 030 — Sin notas ni asistencia NO es aprobado: la celda dice "Sin datos"
    // (con tooltip) y el general no certifica, nombrando el módulo.
    const celdaSinDatos = filaAlumno.locator('td[data-estado="sin_datos"]');
    const tituloSinDatos = await celdaSinDatos.locator("a").getAttribute("title");
    ok(
      "030 — módulo sin notas ni asistencia: «Sin datos», nunca «Aprobado», y el general no certifica",
      (await celdaSinDatos.innerText()).includes("Sin datos") &&
        /Nadie cargó/.test(tituloSinDatos ?? "") &&
        !/Aprobado|Certifica\b/.test(textoFila) &&
        /sin datos/.test(textoFila),
      `${tituloSinDatos} | ${textoFila.replace(/\s+/g, " ").slice(0, 300)}`
    );

    // ---- Clases de la madre: generar todos los módulos en UN pedido.
    const boton = pagina.getByRole("button", { name: "Generar cronograma de todos los módulos" });
    await clicHasta(pagina.getByRole("button", { name: "Clases", exact: true }), boton);
    const generar = pagina.waitForResponse((r) => r.url().includes("/modules/schedule"), { timeout: 30000 });
    await boton.click();
    const respuesta = await generar;
    await pagina.getByRole("status").getByText(/Se generaron/).waitFor({ timeout: 15000 });
    await pagina.getByText(`Módulo 1 — ${nombreA}`).first().waitFor({ timeout: 15000 });
    const programa = (await api(`/api/cohorts/${madre.id}/modules/classes`)).json;
    const porModulo = (programa?.modules ?? []).map((m) => [m.label, m.projected, m.classes.length]);
    ok(
      "generar todos: 1 request, A y B con clases reales, C salteado (sin días)",
      respuesta.status() === 201 &&
        programa?.modules?.[0]?.projected === false &&
        programa?.modules?.[1]?.projected === false &&
        programa?.modules?.[2]?.projected === true &&
        (await pagina.getByText(/No declara días de cursada/).count()) > 0,
      JSON.stringify(porModulo)
    );
    ok(
      "Clases de la madre: el material de TODOS los módulos también en 1 request",
      pedidosDeMaterial.length === 1 &&
        pedidosDeMaterial[0].includes(`classesOfCohortId=${madre.id}`) &&
        pedidosPorClase.length === 0,
      `${pedidosDeMaterial.length} (por clase: ${pedidosPorClase.length})`
    );
    const total = programa.modules[0].classes.length + programa.modules[1].classes.length;
    const otraVez = await api(`/api/cohorts/${madre.id}/modules/schedule`, { method: "POST" });
    const despues = (await api(`/api/cohorts/${madre.id}/modules/classes`)).json;
    ok(
      "repetir no duplica: todo salteado y la misma cantidad de clases",
      otraVez.res.status === 201 &&
        otraVez.json?.generated?.length === 0 &&
        otraVez.json?.skipped?.length === 3 &&
        despues.modules[0].classes.length + despues.modules[1].classes.length === total,
      JSON.stringify(otraVez.json)
    );

    // ---- Asistencia de la madre: "Todos" y la planilla de un módulo.
    const selector = pagina.getByRole("group", { name: "Módulo a mostrar" });
    await clicHasta(pagina.getByRole("button", { name: "Asistencia", exact: true }), selector);
    const planilla = pagina.waitForResponse((r) => r.url().includes(`/api/cohorts/${modA.id}/attendance`), {
      timeout: 30000,
    });
    await selector.getByRole("button", { name: `Módulo 1 — ${nombreA}` }).click();
    ok("Asistencia de la madre: elegir un módulo abre SU planilla", (await planilla).ok());

    // ---- Miga de pan: del módulo a la especialización.
    await pagina.goto(`${BASE}/cohorts/${modA.id}`, { timeout: 120000 });
    const migas = pagina.getByRole("navigation", { name: "Migas de pan" });
    await migas.waitFor({ timeout: 30000 });
    const textoMigas = (await migas.innerText()).replace(/\s+/g, " ");
    const actual = await migas.locator('[aria-current="page"]').innerText();
    const siguiente = await pagina.getByRole("navigation", { name: "Módulos vecinos" }).innerText();
    ok(
      "módulo: Académico › especialización › Módulo 1 — nombre, con insignia y “Módulo 2 →”",
      textoMigas.includes(nombreMadre) &&
        actual === `Módulo 1 — ${nombreA}` &&
        (await pagina.getByText("Módulo 1 de 3").count()) === 1 &&
        siguiente.includes("Módulo 2"),
      `${textoMigas} | ${actual} | ${siguiente}`
    );
    await migas.getByRole("link", { name: nombreMadre }).click();
    await pagina.waitForURL(`**/cohorts/${madre.id}`, { timeout: 30000 });
    ok("la miga lleva del módulo a su especialización", pagina.url().endsWith(`/cohorts/${madre.id}`));
  } catch (err) {
    ok("029 en el navegador", false, String(err?.message ?? err));
  } finally {
    await navegador?.close().catch(() => {});
  }
}
