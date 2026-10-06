/**
 * 2026-10-06 — Vendedores: alta y archivo, vendedor obligatorio en la venta,
 * el vendedor en el roster y el reporte "Ventas por vendedor" de Finanzas.
 *
 *   E2E_SECCIONES=vendedores node --env-file=.env.e2e scripts/e2e-selftest.mjs
 *
 * Las altas de este bloque mandan `sellerId` explícito (null incluido), así
 * que el vendedor de prueba que el arnés inyecta a los bloques viejos no las
 * toca: lo que se ve acá es la regla real del servidor.
 */

export async function seccionVendedores({ api, ok, BASE, getCookie }) {
  console.log("\n== 2026-10-06: vendedores y ventas por vendedor ==");

  const sello = Date.now();
  const cola = String(sello).slice(-7);
  const isoDia = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const mesMontevideo = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montevideo",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);

  // ---- Alta de dos vendedores que no usan el panel.
  const ana = await api("/api/sellers", {
    method: "POST",
    body: JSON.stringify({ name: `Ana Ventas ${sello}`, email: `ana-${sello}@example.com` }),
  });
  ok("alta de un vendedor sin cuenta del panel", ana.res.status === 201, JSON.stringify(ana.json));
  const anaId = ana.json?.seller?.id;

  const duplicado = await api("/api/sellers", {
    method: "POST",
    body: JSON.stringify({ name: `ana ventas ${sello}` }),
  });
  ok("nombre repetido entre activos → 409", duplicado.res.status === 409, JSON.stringify(duplicado.json));

  const beto = await api("/api/sellers", {
    method: "POST",
    body: JSON.stringify({ name: `Beto Ventas ${sello}` }),
  });
  const betoId = beto.json?.seller?.id;
  const archivar = await api(`/api/sellers/${betoId}`, {
    method: "PATCH",
    body: JSON.stringify({ archived: true }),
  });
  ok("archivar un vendedor", archivar.res.ok && archivar.json?.seller?.archived === true);

  const lista = (await api("/api/sellers")).json?.sellers ?? [];
  ok(
    "la lista trae al archivado, marcado (no se borra)",
    lista.some((s) => s.id === betoId && s.archived === true)
  );

  // ---- Una cohorte para vender.
  const curso = await api("/api/courses", {
    method: "POST",
    body: JSON.stringify({ name: `Ventas ${sello}`, published: false }),
  });
  const cohorte = await api("/api/cohorts", {
    method: "POST",
    body: JSON.stringify({
      courseId: curso.json?.course?.id,
      name: `Ventas ${sello}`,
      startDate: isoDia(5),
      endDate: isoDia(60),
    }),
  });
  const cohortId = cohorte.json?.cohort?.id;
  ok("cohorte creada", Boolean(cohortId), JSON.stringify(cohorte.json));

  const inscribir = (firstName, phone, extra) =>
    api("/api/enrollments", {
      method: "POST",
      body: JSON.stringify({
        cohortId,
        contact: { firstName, lastName: `Ventas ${sello}`, phone },
        amount: 12000,
        currency: "UYU",
        ...extra,
      }),
    });

  const sinVendedor = await inscribir("Sin", `59891${cola}`, { sellerId: null });
  ok(
    "inscribir en una cohorte SIN vendedor → 422 seller_required",
    sinVendedor.res.status === 422 && sinVendedor.json?.error?.code === "seller_required",
    JSON.stringify(sinVendedor.json)
  );

  const conArchivado = await inscribir("Archi", `59892${cola}`, { sellerId: betoId });
  ok(
    "un vendedor archivado no se elige para una venta nueva → 422",
    conArchivado.res.status === 422,
    JSON.stringify(conArchivado.json)
  );

  const venta = await inscribir("Vale", `59893${cola}`, { sellerId: anaId });
  ok("inscribir con vendedor activo → 201", venta.res.status === 201, JSON.stringify(venta.json));
  const enrollmentId = venta.json?.enrollment?.id;

  const usd = await inscribir("Dola", `59894${cola}`, {
    sellerId: anaId,
    amount: 300,
    currency: "USD",
  });
  ok("segunda venta, en USD", usd.res.status === 201, JSON.stringify(usd.json));

  // ---- El roster muestra el vendedor.
  const roster = await api(`/api/cohorts/${cohortId}/roster`);
  const fila = roster.json?.enrollments?.find((e) => e.id === enrollmentId);
  ok("el roster trae el nombre del vendedor", fila?.seller?.name === `Ana Ventas ${sello}`, JSON.stringify(fila?.seller));

  // ---- Quitarle el vendedor a una venta no se puede.
  const quitar = await api(`/api/enrollments/${enrollmentId}`, {
    method: "PATCH",
    body: JSON.stringify({ sellerId: null }),
  });
  ok("quitarle el vendedor a una venta → 422", quitar.res.status === 422, JSON.stringify(quitar.json));

  // ---- El reporte del mes en curso.
  const reporte = await api(`/api/finanzas/ventas?mes=${mesMontevideo}`);
  ok("reporte de ventas por vendedor → 200", reporte.res.ok, JSON.stringify(reporte.json));
  const grupo = reporte.json?.grupos?.find((g) => g.vendedor?.id === anaId);
  ok("el vendedor tiene su grupo con las dos ventas", grupo?.filas?.length === 2, JSON.stringify(grupo));
  ok(
    "totales separados por moneda, sin total general",
    JSON.stringify(grupo?.totales) ===
      JSON.stringify([
        { currency: "UYU", total: 12000, ventas: 1 },
        { currency: "USD", total: 300, ventas: 1 },
      ]),
    JSON.stringify(grupo?.totales)
  );
  ok(
    "cada fila enlaza a su cohorte",
    grupo?.filas?.every((f) => f.cohortId === cohortId)
  );

  // ---- Las pantallas responden.
  for (const ruta of ["/settings/vendedores", "/finanzas"]) {
    const r = await fetch(`${BASE}${ruta}`, { headers: { cookie: getCookie() }, redirect: "manual" });
    ok(`${ruta} se abre para dirección`, r.status === 200, `status=${r.status}`);
  }
}
