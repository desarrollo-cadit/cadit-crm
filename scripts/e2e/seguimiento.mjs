/**
 * Seguimiento de leads — la pestaña «Seguimiento» del contacto.
 *
 * El recorrido de punta a punta: alguien deja sus datos DOS veces en la página
 * pública de un curso (el segundo mensaje antes se perdía), el equipo ve los
 * dos envíos en la línea de tiempo, agrega una nota, registra que le escribió
 * por WhatsApp y el orden queda «lo más nuevo primero». Una cuenta que solo ve
 * contactos lee la pestaña pero no puede escribir en ella (403).
 *
 * En el navegador: un lead abre directo en «Seguimiento». Con
 * `E2E_CAPTURAS=<carpeta>` guarda una captura en tema claro y otra en oscuro.
 */

/** Fetcher con tarro propio, para entrar con otra cuenta. */
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
    let json = null;
    try {
      json = await res.clone().json();
    } catch {}
    return { res, json };
  };
}

export async function seccionSeguimiento({ api, ok, BASE, getCookie }) {
  console.log("\n== Seguimiento de leads: formularios, notas y contactos ==");

  const sello = Date.now();
  const sufijo = String(sello).slice(-8);
  const telefono = `5989${sufijo}`; // 12 dígitos, Uruguay
  const ip = `198.51.100.${(sello % 200) + 20}`;

  // ---- Un curso PUBLICADO (la puerta pública solo acepta el catálogo).
  const alta = await api("/api/courses", {
    method: "POST",
    body: JSON.stringify({ name: `Seguimiento E2E ${sello}`, published: true }),
  });
  const curso = alta.json?.course;
  ok("setup: curso publicado para recibir el formulario", alta.res.status === 201 && Boolean(curso?.id), `${alta.res.status}`);

  try {
    // ---- Dos envíos del formulario público del curso, con mensajes distintos.
    const enviar = (message) =>
      fetch(`${BASE}/api/public/courses/${curso?.slug ?? curso?.id}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({
          name: "Lucía",
          lastName: "Seguimiento",
          phone: telefono,
          email: `lucia-${sello}@example.com`,
          message,
        }),
      });
    const primero = await enviar("Quiero saber el horario de la noche.");
    await new Promise((r) => setTimeout(r, 50));
    const segundo = await enviar("¿Hay descuento para empresas?");
    ok(
      "el formulario público del curso acepta los dos envíos (201)",
      primero.status === 201 && segundo.status === 201,
      `${primero.status} ${segundo.status}`
    );

    const contactos = await api(`/api/contacts?q=${telefono}`);
    const lista = contactos.json?.contacts ?? contactos.json?.items ?? [];
    const contacto = lista.find((c) => c.phone === telefono || c.waIdentity === telefono) ?? lista[0];
    ok("el lead quedó como contacto (uno solo para los dos envíos)", Boolean(contacto?.id) && lista.length === 1, JSON.stringify(lista.map((c) => c.id)));
    const id = contacto?.id;

    // ---- La pestaña: los dos envíos, con lo que mandó cada vez.
    const leer = () => api(`/api/contacts/${id}/seguimiento`);
    const antes = await leer();
    const envios = (antes.json?.timeline ?? []).filter((e) => e.tipo === "formulario");
    ok(
      "Seguimiento muestra LOS DOS envíos, cada uno con su mensaje (el segundo ya no pisa al primero)",
      antes.res.status === 200 &&
        envios.length === 2 &&
        envios[0]?.message === "¿Hay descuento para empresas?" &&
        envios[1]?.message === "Quiero saber el horario de la noche.",
      `${antes.res.status} ${JSON.stringify(envios.map((e) => e.message))}`
    );
    const e0 = envios[0] ?? {};
    ok(
      "cada envío trae origen, curso de interés, fecha y los campos enviados",
      e0.source === `formulario:${curso?.name}` &&
        e0.interestKind === "curso" &&
        e0.interestName === curso?.name &&
        e0.firstName === "Lucía" &&
        e0.lastName === "Seguimiento" &&
        e0.phone === telefono &&
        e0.email === `lucia-${sello}@example.com` &&
        !Number.isNaN(Date.parse(e0.at)),
      JSON.stringify(e0)
    );
    ok(
      "y el teléfono del contacto viaja para el botón de WhatsApp",
      antes.json?.contact?.phone === telefono,
      JSON.stringify(antes.json?.contact)
    );

    // ---- Una nota y un contacto por WhatsApp.
    const nota = await api(`/api/contacts/${id}/seguimiento`, {
      method: "POST",
      body: JSON.stringify({ kind: "nota", body: "  Llamar el lunes a la tarde.  " }),
    });
    ok(
      "agregar una nota responde 201 con el texto limpio y su autor",
      nota.res.status === 201 &&
        nota.json?.activity?.kind === "nota" &&
        nota.json?.activity?.body === "Llamar el lunes a la tarde." &&
        nota.json?.activity?.authorName === "Operador E2E",
      `${nota.res.status} ${JSON.stringify(nota.json)}`
    );
    const vacia = await api(`/api/contacts/${id}/seguimiento`, {
      method: "POST",
      body: JSON.stringify({ kind: "nota", body: "   " }),
    });
    ok("una nota vacía responde 422", vacia.res.status === 422, `${vacia.res.status}`);

    await new Promise((r) => setTimeout(r, 50));
    const wa = await api(`/api/contacts/${id}/seguimiento`, {
      method: "POST",
      body: JSON.stringify({ kind: "contacto_whatsapp" }),
    });
    ok(
      "registrar «Contactado por WhatsApp» responde 201",
      wa.res.status === 201 && wa.json?.activity?.kind === "contacto_whatsapp" && wa.json?.activity?.body === null,
      `${wa.res.status} ${JSON.stringify(wa.json)}`
    );

    const despues = await leer();
    const tipos = (despues.json?.timeline ?? []).map((e) => e.tipo);
    ok(
      "la línea de tiempo queda lo más nuevo primero: WhatsApp, nota, segundo envío, primer envío",
      JSON.stringify(tipos) === JSON.stringify(["contacto_whatsapp", "nota", "formulario", "formulario"]),
      JSON.stringify(tipos)
    );
    const fechas = (despues.json?.timeline ?? []).map((e) => Date.parse(e.at));
    ok(
      "y las fechas bajan de verdad (no solo el orden de los tipos)",
      fechas.every((t, i) => i === 0 || fechas[i - 1] >= t),
      JSON.stringify(fechas)
    );

    const ajeno = await api(`/api/contacts/ct_no_existe/seguimiento`);
    ok("un contacto inexistente responde 404", ajeno.res.status === 404, `${ajeno.res.status}`);
    const ajenoPost = await api(`/api/contacts/ct_no_existe/seguimiento`, {
      method: "POST",
      body: JSON.stringify({ kind: "contacto_email" }),
    });
    ok("y escribirle también (404)", ajenoPost.res.status === 404, `${ajenoPost.res.status}`);

    // ---- Una cuenta que solo ve contactos: lee, pero no escribe.
    const rol = await api("/api/settings/roles", {
      method: "POST",
      body: JSON.stringify({ name: `Solo contactos ${sello}`, capabilities: ["contactos.ver"] }),
    });
    const correo = `seguimiento-${sello}@example.com`;
    const clave = `clave-seg-${sello}`;
    const cuenta = await api("/api/settings/team", {
      method: "POST",
      body: JSON.stringify({ name: "Solo Contactos E2E", email: correo, password: clave, roleKey: rol.json?.role?.key }),
    });
    const jar = { cookie: "" };
    const como = conJar(BASE, jar);
    const login = await como("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "x-forwarded-for": "192.0.2.211" },
      body: JSON.stringify({ email: correo, password: clave }),
    });
    ok(
      "setup: entra una cuenta con solo contactos.ver",
      rol.res.status === 201 && cuenta.res.status === 201 && login.res.ok,
      `${rol.res.status} ${cuenta.res.status} ${login.res.status}`
    );
    const lee = await como(`/api/contacts/${id}/seguimiento`);
    ok("sin inscripciones.seguimiento, la pestaña se lee (200)", lee.res.status === 200, `${lee.res.status}`);
    const escribeNota = await como(`/api/contacts/${id}/seguimiento`, {
      method: "POST",
      body: JSON.stringify({ kind: "nota", body: "no debería quedar" }),
    });
    const escribeWa = await como(`/api/contacts/${id}/seguimiento`, {
      method: "POST",
      body: JSON.stringify({ kind: "contacto_whatsapp" }),
    });
    ok(
      "pero escribir una nota o registrar un contacto responde 403",
      escribeNota.res.status === 403 && escribeWa.res.status === 403,
      `${escribeNota.res.status} ${escribeWa.res.status}`
    );
    const igual = await leer();
    ok("y no quedó nada escrito", (igual.json?.timeline ?? []).length === 4, `${(igual.json?.timeline ?? []).length}`);

    // ---- En el navegador: un lead abre directo en «Seguimiento».
    let navegador = null;
    try {
      const { chromium } = await import("playwright");
      navegador = await chromium.launch();
      const url = new URL(BASE);
      const capturas = process.env.E2E_CAPTURAS;
      for (const tema of capturas ? ["light", "dark"] : ["light"]) {
        const contexto = await navegador.newContext({ viewport: { width: 1280, height: 1100 } });
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
        await pagina.goto(`${BASE}/contacts/${id}/legajo`, { timeout: 120000 });
        const linea = pagina.getByRole("list", { name: "Línea de tiempo del seguimiento" });
        await linea.waitFor({ timeout: 60000 });
        const seleccionada = await pagina.getByRole("tab", { name: "Seguimiento" }).getAttribute("aria-selected");
        const texto = (await linea.innerText()).replace(/\s+/g, " ");
        if (tema === "light") {
          ok("en el navegador, un lead abre en la pestaña «Seguimiento»", seleccionada === "true", String(seleccionada));
          ok(
            "y la línea muestra el contacto por WhatsApp, la nota y el mensaje del formulario",
            texto.includes("Contactado por WhatsApp") &&
              texto.includes("Llamar el lunes a la tarde.") &&
              texto.includes("¿Hay descuento para empresas?"),
            texto.slice(0, 300)
          );
          const waHref = await pagina.getByRole("link", { name: "Escribir por WhatsApp" }).getAttribute("href");
          ok("el botón de WhatsApp apunta a wa.me con el teléfono", waHref === `https://wa.me/${telefono}`, String(waHref));
        }
        if (capturas) {
          await pagina.screenshot({ path: `${capturas}/seguimiento-${tema}.png`, fullPage: true });
          console.log(`  …  captura: ${capturas}/seguimiento-${tema}.png`);
        }
        await contexto.close();
      }
    } catch (err) {
      ok("pestaña «Seguimiento» en el navegador", false, String(err?.message ?? err));
    } finally {
      await navegador?.close().catch(() => {});
    }
  } finally {
    // El curso de prueba no queda en el catálogo público de nadie.
    if (curso?.id) {
      await api(`/api/courses/${curso.id}`, { method: "PATCH", body: JSON.stringify({ published: false }) });
    }
  }
}
