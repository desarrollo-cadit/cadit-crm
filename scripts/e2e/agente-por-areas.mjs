/**
 * 029 — Agente por áreas: derivación por correo a Ventas/Soporte y
 * clasificación del tema (guion: tests/e2e/us-agente-por-areas.md).
 *
 *   E2E_SECCIONES=agente-por-areas node --env-file=.env.e2e scripts/e2e-selftest.mjs
 *
 * Necesita la app con los tres mocks: wa-mock (canal), ai-mock (modelo) y
 * m365-mock (correo: `M365_GRAPH_BASE_URL` / `M365_LOGIN_BASE_URL` apuntando a
 * `<app>/api/dev/m365-mock`), y el proveedor de IA configurado contra el
 * ai-mock. Todo se conduce por la línea del canal (`/api/dev/wa-mock/inbound`)
 * y se observa en los outbox de los mocks y en la API, como un usuario.
 *
 * Deja la instancia como la encontró: el ruteo apagado y el agente en el
 * estado previo (la corrida completa sigue con otras secciones).
 *
 * MVP (US1 + US2): checks 1–8, 13 y 14 de quickstart.md §3, el cambio de tema,
 * el `aiTopic` de los salientes y el respaldo de handoff con el ruteo apagado
 * (riesgo R3). Las consultas del alumno (US3), la pantalla de áreas (US4) y el
 * Laboratorio (US5) suman sus checks acá cuando lleguen.
 */

const PN = "PN-E2E-1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function seccionAgentePorAreas({ api, ok, BASE, getCookie }) {
  console.log("\n== 029: agente por áreas — derivación por correo y tema ==");

  const sello = Date.now();
  const cola = String(sello).slice(-6);
  // Números nuevos por corrida: un caso abierto (7 días) de una corrida
  // anterior convertiría la apertura en seguimiento.
  const tel = (n) => `5989${cola}${n}`;

  const inbound = (phone, text, name = "Cliente E2E") =>
    api("/api/dev/wa-mock/inbound", {
      method: "POST",
      body: JSON.stringify({ phoneNumberId: PN, from: phone, name, text }),
    });
  const waOutbox = async () => (await api("/api/dev/wa-mock/outbox")).json?.outbox ?? [];
  const m365Outbox = async () => (await api("/api/dev/m365-mock/outbox")).json?.outbox ?? [];
  const textosA = async (phone) =>
    (await waOutbox()).filter((o) => o.to === phone).map((o) => o.body?.text?.body ?? "");

  /** Espera hasta que `fn` devuelva algo truthy (el turno del agente tiene debounce). */
  async function esperar(fn, ms = 30000) {
    const hasta = Date.now() + ms;
    let ultimo;
    while (Date.now() < hasta) {
      ultimo = await fn();
      if (ultimo) return ultimo;
      await sleep(400);
    }
    return ultimo;
  }

  /** Manda un mensaje y espera la respuesta NUEVA del agente a ese número. */
  async function charlar(phone, text, name) {
    const antes = (await textosA(phone)).length;
    await inbound(phone, text, name);
    const nuevos = await esperar(async () => {
      const t = await textosA(phone);
      return t.length > antes ? t.slice(antes) : null;
    });
    return nuevos ?? [];
  }

  const conversacionDe = async (phone) =>
    esperar(async () =>
      ((await api("/api/conversations")).json?.conversations ?? []).find(
        (c) => c.contact.phone === phone
      )
    );
  const derivaciones = async (convId) =>
    (await api(`/api/conversations/${convId}/area-handoffs`)).json?.handoffs ?? [];
  const mensajes = async (convId) =>
    (await api(`/api/conversations/${convId}/messages`)).json?.messages ?? [];

  // ---------------------------------------------------------------- preparación
  const perfilAntes = (await api("/api/agent/profile")).json;
  const agenteEstaba = Boolean(perfilAntes?.profile?.enabled);
  ok(
    "la instancia tiene el proveedor de IA configurado (ai-mock)",
    perfilAntes?.aiConfigured === true,
    JSON.stringify(perfilAntes)
  );

  const encender = await api("/api/agent/profile", {
    method: "PUT",
    body: JSON.stringify({ enabled: true }),
  });
  ok("agente encendido", encender.res.ok, JSON.stringify(encender.json));

  const ruteo = await api("/api/settings/areas", {
    method: "PATCH",
    body: JSON.stringify({ routingEnabled: true }),
  });
  ok("ruteo por áreas encendido", ruteo.res.ok && ruteo.json?.routingEnabled === true);

  const vendedor = await api("/api/sellers", {
    method: "POST",
    body: JSON.stringify({ name: `Vendedora Áreas ${sello}`, email: `vende-${sello}@academia.test` }),
  });
  const vendedorId = vendedor.json?.seller?.id;
  ok("vendedor con correo creado", vendedor.res.status === 201, JSON.stringify(vendedor.json));

  const TEXTO_VENTAS = "Te va a contactar el equipo comercial de CAD IT en el día.";
  const ventas = await api("/api/settings/areas/ventas", {
    method: "PUT",
    body: JSON.stringify({
      enabled: true,
      mailbox: "comercial@academia.test",
      ccEmails: ["gerencia@academia.test"],
      ccSellerIds: [vendedorId],
      contactText: TEXTO_VENTAS,
      // Todo el día, todos los días: la línea de horario no depende de la hora de la corrida.
      officeHours: { days: [0, 1, 2, 3, 4, 5, 6], from: "00:00", to: "23:59" },
    }),
  });
  ok("Ventas configurada por API", ventas.res.ok && ventas.json?.area?.enabled === true, JSON.stringify(ventas.json));

  const soporteConVendedor = await api("/api/settings/areas/soporte", {
    method: "PUT",
    body: JSON.stringify({
      enabled: false,
      mailbox: null,
      ccEmails: [],
      ccSellerIds: [vendedorId],
      contactText: null,
      officeHours: null,
    }),
  });
  ok("Soporte no acepta vendedores en copia → 422", soporteConVendedor.res.status === 422);

  const soporte = await api("/api/settings/areas/soporte", {
    method: "PUT",
    body: JSON.stringify({
      enabled: false,
      mailbox: null,
      ccEmails: [],
      ccSellerIds: [],
      contactText: null,
      officeHours: null,
    }),
  });
  ok("Soporte apagada (camino sin_configurar)", soporte.res.ok);

  const areaInventada = await api("/api/settings/areas/marketing", {
    method: "PUT",
    body: JSON.stringify({}),
  });
  ok("un área fuera de la lista → 404", areaInventada.res.status === 404);

  const config = (await api("/api/settings/areas")).json;
  ok(
    "GET /api/settings/areas: las dos áreas, el vendedor y m365Configured sin secretos",
    config?.areas?.length === 2 &&
      config.m365Configured === true &&
      config.sellers?.some((s) => s.id === vendedorId) &&
      !JSON.stringify(config).includes("mock-secret"),
    JSON.stringify(config).slice(0, 300)
  );

  // El arnés deja el correo fallando como línea base: esta sección lo
  // necesita andando (DELETE también apaga la falla) y lo restaura al final.
  await api("/api/dev/m365-mock/outbox", { method: "DELETE" });
  await api("/api/dev/wa-mock/outbox", { method: "DELETE" });

  try {
    // ---------------------------------------------------------- US1: Ventas
    const A = tel(1);
    const r1 = await charlar(A, "necesito 5 licencias de AutoCAD", "Laura");
    ok(
      "1 · consulta de Ventas sin correo: el agente pide los datos",
      r1.some((t) => /correo/i.test(t)),
      JSON.stringify(r1)
    );
    ok("1 · todavía no sale ningún correo", (await m365Outbox()).length === 0);

    const r2 = await charlar(A, "Soy Laura Gómez de Constructora Sur, mi correo es laura@sur.test", "Laura");
    const correos2 = await esperar(async () => {
      const o = await m365Outbox();
      return o.length >= 1 ? o : null;
    });
    const mail1 = correos2?.[0]?.message;
    ok("2 · exactamente 1 correo", correos2?.length === 1, `n=${correos2?.length}`);
    const direcciones = (lista) => (lista ?? []).map((r) => r.emailAddress.address);
    ok(
      "2 · To = casilla de Ventas",
      JSON.stringify(direcciones(mail1?.toRecipients)) === JSON.stringify(["comercial@academia.test"]),
      JSON.stringify(mail1?.toRecipients)
    );
    ok(
      "2 · CC = copia manual + vendedor, sin duplicados",
      JSON.stringify(direcciones(mail1?.ccRecipients)) ===
        JSON.stringify(["gerencia@academia.test", `vende-${sello}@academia.test`]),
      JSON.stringify(mail1?.ccRecipients)
    );
    ok(
      "2 · Reply-To = el correo del cliente; sin Bcc",
      JSON.stringify(direcciones(mail1?.replyTo)) === JSON.stringify(["laura@sur.test"]) &&
        !mail1?.bccRecipients,
      JSON.stringify(mail1?.replyTo)
    );
    ok(
      "2 · asunto [Ventas] resumen — nombre (empresa)",
      mail1?.subject === "[Ventas] 5 licencias de AutoCAD — Laura Gómez (Constructora Sur)",
      mail1?.subject
    );
    ok(
      "2 · el cuerpo trae el caso y la transcripción",
      /Caso AH-[A-Z2-9]{6}/.test(mail1?.body?.content ?? "") &&
        (mail1?.body?.content ?? "").includes("necesito 5 licencias de AutoCAD"),
      (mail1?.body?.content ?? "").slice(0, 200)
    );
    ok("2 · el cliente recibe el texto configurado del área", r2.includes(TEXTO_VENTAS), JSON.stringify(r2));

    const convA = await conversacionDe(A);
    const casosA = await esperar(async () => {
      const d = await derivaciones(convA?.id);
      return d[0]?.status === "enviado" ? d : null;
    });
    ok(
      "3 · 1 caso `enviado` con 1 correo de apertura",
      casosA?.length === 1 &&
        casosA[0].emails.length === 1 &&
        casosA[0].emails[0].kind === "apertura" &&
        casosA[0].emails[0].sentAt !== null,
      JSON.stringify(casosA)
    );
    const caseRef = casosA?.[0]?.caseRef;

    // 14 · FR-011 — derivar NO silencia la IA.
    const r14 = await charlar(A, "¿y cuándo empieza el curso de Revit?", "Laura");
    const convA14 = await conversacionDe(A);
    ok(
      "14 · tras derivar, la IA sigue respondiendo lo de la Academia",
      r14.some((t) => t.startsWith("Respuesta de prueba sobre")) && !convA14?.handoffAt,
      JSON.stringify({ r14, handoffAt: convA14?.handoffAt })
    );

    // 4 · seguimiento con un dato nuevo.
    await charlar(A, "me olvidé, son 7 licencias", "Laura");
    const correos4 = await esperar(async () => {
      const o = await m365Outbox();
      return o.length >= 2 ? o : null;
    });
    const mail2 = correos4?.[1]?.message;
    ok(
      "4 · seguimiento: asunto `RE: …` y «Qué hay de nuevo: cantidad 7»",
      mail2?.subject === `RE: ${mail1?.subject}` &&
        /Qué hay de nuevo[\s\S]*Cantidad[\s\S]*>7</.test(mail2?.body?.content ?? ""),
      mail2?.subject
    );
    const casosA4 = await derivaciones(convA?.id);
    ok(
      "4 · mismo caso, dos correos",
      casosA4.length === 1 && casosA4[0].caseRef === caseRef && casosA4[0].emails.length === 2,
      JSON.stringify(casosA4.map((h) => [h.caseRef, h.emails.length]))
    );

    // 5 · sin datos nuevos: sin correo, y el agente recuerda el caso.
    const r5 = await charlar(A, "gracias, quedo atento", "Laura");
    await sleep(1500);
    ok("5 · sin datos nuevos no sale otro correo", (await m365Outbox()).length === 2);
    ok(
      "5 · el agente recuerda que Ventas ya tiene el caso",
      r5.some((t) => t.includes(caseRef ?? "AH-")),
      JSON.stringify(r5)
    );

    // US2 — el tema viaja en cada saliente de la IA.
    const salientesA = (await mensajes(convA?.id)).filter((m) => m.direction === "out" && m.origin === "ai");
    ok(
      "US2 · los salientes de la IA traen el tema (ventas / academia)",
      salientesA.length >= 4 &&
        salientesA.some((m) => m.aiTopic === "ventas") &&
        salientesA.some((m) => m.aiTopic === "academia") &&
        salientesA.every((m) => m.aiTopic !== null),
      JSON.stringify(salientesA.map((m) => m.aiTopic))
    );

    // 6 · Graph caído: el cliente igual recibe el cierre, el caso queda `fallido`.
    await api("/api/dev/m365-mock/fail", { method: "POST", body: JSON.stringify({ fail: true }) });
    const B = tel(2);
    const r6 = await charlar(
      B,
      "Hola, quiero 3 licencias de Revit, soy Pedro Ruiz de Obras Norte, mi correo es pedro@norte.test",
      "Pedro"
    );
    ok("6 · con Graph caído el cliente igual recibe el cierre", r6.includes(TEXTO_VENTAS), JSON.stringify(r6));
    const convB = await conversacionDe(B);
    const casosB = await esperar(async () => {
      const d = await derivaciones(convB?.id);
      return d[0]?.status === "fallido" ? d : null;
    });
    ok(
      "6 · caso `fallido` con el motivo visible en la API",
      casosB?.[0]?.status === "fallido" && casosB[0].emails[0].error === "mock: fallo forzado",
      JSON.stringify(casosB)
    );
    const listaB = await esperar(async () => {
      const c = await conversacionDe(B);
      return c?.lastAreaHandoff?.status === "fallido" ? c : null;
    });
    ok(
      "6 · la lista del inbox marca la derivación fallida",
      listaB?.lastAreaHandoff?.area === "ventas",
      JSON.stringify(listaB?.lastAreaHandoff)
    );
    await api("/api/dev/m365-mock/outbox", { method: "DELETE" }); // apaga la falla

    // 7 · Soporte apagada: sin correo, cierre genérico, `sin_configurar`.
    const C = tel(3);
    const r7 = await charlar(C, "no me activa la licencia de Revit desde ayer", "Carla");
    await sleep(1000);
    const convC = await conversacionDe(C);
    const casosC = await derivaciones(convC?.id);
    ok("7 · Soporte sin configurar: no sale correo", (await m365Outbox()).length === 0);
    ok("7 · el cliente recibe un cierre genérico de Soporte", r7.some((t) => t.includes("Soporte")), JSON.stringify(r7));
    ok(
      "7 · caso `sin_configurar` y chip en la lista",
      casosC[0]?.status === "sin_configurar" &&
        casosC[0]?.area === "soporte" &&
        (await conversacionDe(C))?.lastAreaHandoff?.status === "sin_configurar",
      JSON.stringify(casosC)
    );

    // 8 · Ambiguo: aclaración, sin caso.
    const D = tel(4);
    const r8 = await charlar(D, "tengo un problema con Revit", "Diego");
    const convD = await conversacionDe(D);
    const salientesD = (await mensajes(convD?.id)).filter((m) => m.direction === "out");
    ok(
      "8 · consulta ambigua: pregunta de aclaración, sin caso",
      r8.some((t) => t.includes("?")) && (await derivaciones(convD?.id)).length === 0,
      JSON.stringify(r8)
    );
    ok(
      "8 · la aclaración lleva el tema `sin_determinar`",
      salientesD.at(-1)?.aiTopic === "sin_determinar",
      JSON.stringify(salientesD.map((m) => m.aiTopic))
    );

    // US2-3 · cambio de tema a mitad de la charla.
    const E = tel(5);
    const rE1 = await charlar(E, "¿cuándo empieza el curso de Revit?", "Elena");
    const rE2 = await charlar(E, "además necesito licencias para mi empresa", "Elena");
    const convE = await conversacionDe(E);
    const salientesE = (await mensajes(convE?.id)).filter((m) => m.direction === "out");
    ok(
      "US2-3 · de Academia a Ventas: responde el curso y después pide datos de Ventas",
      rE1.some((t) => t.startsWith("Respuesta de prueba sobre")) &&
        rE2.some((t) => /correo/i.test(t)) &&
        JSON.stringify(salientesE.map((m) => m.aiTopic)) === JSON.stringify(["academia", "ventas"]),
      JSON.stringify(salientesE.map((m) => [m.aiTopic, m.text?.slice(0, 30)]))
    );

    // DV-006 · "hablar con alguien de ventas" ya no silencia la IA.
    const G = tel(6);
    const rG = await charlar(G, "quiero hablar con alguien de ventas", "Gabi");
    const convG = await conversacionDe(G);
    ok(
      "DV-006 · «hablar con alguien de ventas» llega al modelo: pide datos, la IA sigue activa",
      rG.some((t) => /correo/i.test(t)) && !convG?.handoffAt,
      JSON.stringify({ rG, handoffAt: convG?.handoffAt })
    );

    // 13 · el handoff humano de la ACADEMIA sigue como hoy.
    const F = tel(7);
    await inbound(F, "quiero hablar con alguien de la academia", "Fede");
    const convF = await esperar(async () => {
      const c = await conversacionDe(F);
      return c?.handoffAt ? c : null;
    });
    ok("13 · «hablar con alguien de la academia» → handoff humano", Boolean(convF?.handoffAt));

    // 6 (UI) · el panel del inbox muestra la derivación fallida.
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
      await pagina.goto(`${BASE}/inbox?contact=${convB?.contact?.id}`, { timeout: 120000 });
      const seccion = pagina.getByRole("region", { name: "Derivaciones" });
      await seccion.waitFor({ timeout: 60000 });
      const texto = (await seccion.innerText()).replace(/\s+/g, " ");
      ok(
        "6 · el panel del inbox muestra «Derivaciones» con el fallo y su motivo",
        texto.includes("Falló el envío") && texto.includes("mock: fallo forzado"),
        texto
      );
      const chip = await pagina.getByText("Derivación fallida").first().isVisible();
      ok("6 · la lista muestra el chip «Derivación fallida»", chip);
    } catch (err) {
      ok("6 · panel del inbox en el navegador", false, String(err?.message ?? err));
    } finally {
      await navegador?.close().catch(() => {});
    }
  } finally {
    // ------------------------------------------------- R3 · ruteo apagado = hoy
    await api("/api/settings/areas", { method: "PATCH", body: JSON.stringify({ routingEnabled: false }) });
  }

  const H = tel(8);
  await inbound(H, "quiero hablar con alguien de ventas", "Hugo");
  const convH = await esperar(async () => {
    const c = await conversacionDe(H);
    return c?.handoffAt ? c : null;
  });
  ok(
    "R3 · con el ruteo apagado, «hablar con alguien de ventas» es handoff como siempre",
    Boolean(convH?.handoffAt) && convH?.handoffReason === "cliente"
  );
  const I = tel(9);
  const rI = await charlar(I, "necesito 2 licencias de AutoCAD, mi correo es ines@x.test", "Inés");
  const convI = await conversacionDe(I);
  const salientesI = (await mensajes(convI?.id)).filter((m) => m.direction === "out");
  ok(
    "R3 · con el ruteo apagado no hay derivación ni tema: el turno de siempre",
    rI.some((t) => t.startsWith("Respuesta de prueba sobre")) &&
      (await derivaciones(convI?.id)).length === 0 &&
      salientesI.every((m) => m.aiTopic === null),
    JSON.stringify({ rI, topics: salientesI.map((m) => m.aiTopic) })
  );

  // Dejar la instancia como estaba.
  await api("/api/agent/profile", { method: "PUT", body: JSON.stringify({ enabled: agenteEstaba }) });
  await api("/api/dev/m365-mock/outbox", { method: "DELETE" });
  await api("/api/dev/wa-mock/outbox", { method: "DELETE" });
  await api("/api/dev/m365-mock/fail", { method: "POST", body: JSON.stringify({ fail: true }) });
}
