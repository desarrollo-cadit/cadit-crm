/**
 * Diálogos y montos — tres arreglos de UI, de punta a punta en el navegador:
 *
 * 1. Cambios sin guardar: un diálogo con datos cargados NO se pierde por un
 *    click afuera ni por Escape: pregunta ("Tenés cambios sin guardar…").
 *    "Seguir editando" conserva todo; guardar con éxito cierra sin preguntar;
 *    un diálogo sin cambios cierra como siempre.
 * 2. El buscador de contacto existente al inscribir CIERRA la lista al elegir
 *    y muestra a la persona elegida (con mouse y con teclado).
 * 3. El monto se ve con separador de miles ("5.000"), la coma no entra (sin
 *    centésimos, DV-008) y lo guardado es el entero 5000.
 *
 * Con `E2E_CAPTURAS=<carpeta>` guarda capturas de cada paso.
 */

const isoDia = (d) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

export async function seccionDialogosYMontos({ api, ok, BASE, getCookie }) {
  console.log("\n== Diálogos: cambios sin guardar, buscador de contacto y montos ==");

  const sello = Date.now();
  const cola = String(sello).slice(-7);
  const apellido = `Dialogo${cola}`;

  // ---- Setup por API: un grupo, un vendedor y un contacto que ya existe.
  const curso = await api("/api/courses", {
    method: "POST",
    body: JSON.stringify({ name: `Diálogos ${sello}`, published: false }),
  });
  const cohorte = await api("/api/cohorts", {
    method: "POST",
    body: JSON.stringify({
      courseId: curso.json?.course?.id,
      name: `Diálogos ${sello}`,
      startDate: isoDia(7),
      endDate: isoDia(60),
    }),
  });
  const cohortId = cohorte.json?.cohort?.id;
  const vendedor = await api("/api/sellers", {
    method: "POST",
    body: JSON.stringify({ name: `Vendedora Diálogos ${cola}` }),
  });
  const sellerId = vendedor.json?.seller?.id;
  const telefono = `5989${cola}1`;
  const alta = await api("/api/contacts", {
    method: "POST",
    body: JSON.stringify({
      firstName: "Ximena",
      lastName: apellido,
      phone: telefono,
      email: `ximena-${cola}@example.com`,
    }),
  });
  const contacto = alta.json?.contact;
  ok(
    "setup: grupo, vendedor y contacto existente",
    Boolean(cohortId && sellerId && contacto?.id),
    `${cohorte.res.status} ${vendedor.res.status} ${alta.res.status}`
  );
  if (!cohortId || !sellerId || !contacto?.id) return;

  const capturas = process.env.E2E_CAPTURAS;
  let navegador = null;
  try {
    const { chromium } = await import("playwright");
    navegador = await chromium.launch();
    const url = new URL(BASE);
    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 1000 } });
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
    const captura = async (nombre) => {
      if (!capturas) return;
      await pagina.screenshot({ path: `${capturas}/${nombre}.png` });
      console.log(`  …  captura: ${capturas}/${nombre}.png`);
    };

    await pagina.goto(`${BASE}/cohorts/${cohortId}`, { timeout: 120000 });
    const abrir = async () => {
      await pagina.getByRole("button", { name: "Inscribir alumno" }).click({ timeout: 60000 });
      const d = pagina.getByRole("dialog", { name: "Inscribir alumno" });
      await d.waitFor({ timeout: 30000 });
      return d;
    };
    const aviso = pagina.getByRole("alertdialog");
    const afuera = () => pagina.mouse.click(8, 8);

    // ---- Un diálogo SIN cambios cierra con un click afuera, sin preguntar.
    let dialogo = await abrir();
    await afuera();
    await dialogo.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
    ok(
      "sin cambios, un click afuera cierra el diálogo sin preguntar",
      !(await dialogo.isVisible()) && !(await aviso.isVisible())
    );

    // ---- Elegir un contacto existente con el mouse: la lista se cierra.
    dialogo = await abrir();
    await dialogo.getByRole("button", { name: "Contacto existente" }).click();
    const buscador = dialogo.locator("#enr-contact-search");
    await buscador.fill(apellido);
    const opcion = dialogo.getByRole("option", { name: new RegExp(apellido) });
    await opcion.first().waitFor({ timeout: 20000 });
    await captura("dialogos-1-lista-abierta");
    await opcion.first().click();
    const elegido = dialogo.getByTestId("contacto-elegido");
    await elegido.waitFor({ timeout: 10000 });
    const textoElegido = (await elegido.innerText()).replace(/\s+/g, " ");
    ok(
      "elegir un contacto CIERRA la lista y lo muestra (nombre y celular)",
      (await dialogo.getByRole("listbox").count()) === 0 &&
        textoElegido.includes(`Ximena ${apellido}`) &&
        textoElegido.includes(telefono),
      textoElegido
    );

    // ---- Con teclado: "Cambiar", buscar, Escape cierra la lista (no el diálogo), Enter elige.
    await elegido.getByRole("button", { name: "Cambiar" }).click();
    await buscador.fill("");
    await buscador.fill(apellido);
    await dialogo.getByRole("listbox").waitFor({ timeout: 20000 });
    await buscador.press("Escape");
    const listaTrasEsc = await dialogo.getByRole("listbox").count();
    ok(
      "Escape en el buscador cierra la lista y deja el diálogo abierto",
      listaTrasEsc === 0 && (await dialogo.isVisible()) && !(await aviso.isVisible()),
      `lista=${listaTrasEsc}`
    );
    await buscador.press("ArrowDown");
    await dialogo.getByRole("listbox").waitFor({ timeout: 10000 });
    await buscador.press("Enter");
    await elegido.waitFor({ timeout: 10000 });
    ok(
      "con teclado: flecha abajo + Enter elige el contacto y cierra la lista",
      (await elegido.isVisible()) && (await dialogo.getByRole("listbox").count()) === 0
    );

    // ---- Monto: 5000 se ve 5.000; la coma no entra y se avisa.
    const monto = dialogo.locator("#enr-amount");
    await monto.click();
    await monto.pressSequentially("5000");
    const visto = await monto.inputValue();
    ok("tipear 5000 en el monto muestra 5.000", visto === "5.000", visto);
    await monto.pressSequentially(",");
    const conComa = await monto.inputValue();
    const pista = await dialogo.getByText("Los montos se cargan sin centésimos.").isVisible();
    ok(
      "una coma no entra: el monto queda 5.000 y se avisa que va sin centésimos",
      pista && conComa === "5.000",
      `${conComa} pista=${pista}`
    );
    await captura("dialogos-2-contacto-y-monto");

    // ---- Click afuera con cambios: pregunta; "Seguir editando" conserva todo.
    await afuera();
    await aviso.waitFor({ timeout: 10000 });
    const textoAviso = (await aviso.innerText()).replace(/\s+/g, " ");
    await captura("dialogos-3-cambios-sin-guardar");
    ok(
      "con cambios, un click afuera pregunta antes de cerrar",
      textoAviso.includes("Tenés cambios sin guardar. ¿Querés salir igual?") &&
        textoAviso.includes("Seguir editando") &&
        textoAviso.includes("Salir sin guardar"),
      textoAviso
    );
    await aviso.getByRole("button", { name: "Seguir editando" }).click();
    await aviso.waitFor({ state: "hidden", timeout: 10000 });
    ok(
      "«Seguir editando» deja el diálogo abierto con el contacto y el monto",
      (await dialogo.isVisible()) &&
        (await elegido.isVisible()) &&
        (await monto.inputValue()) === "5.000"
    );

    // ---- Escape con cambios también pregunta (Escape en el aviso = seguir editando).
    await monto.press("Escape");
    await aviso.waitFor({ timeout: 10000 });
    ok("con cambios, Escape también pregunta", await aviso.isVisible());
    await pagina.keyboard.press("Escape");
    await aviso.waitFor({ state: "hidden", timeout: 10000 });
    ok("Escape en el aviso vuelve al formulario", (await dialogo.isVisible()) && (await monto.inputValue()) === "5.000");

    // ---- La X con cambios también pregunta.
    await dialogo.getByRole("button", { name: "Cerrar", exact: true }).click();
    await aviso.waitFor({ timeout: 10000 });
    ok("con cambios, la X también pregunta", await aviso.isVisible());
    await aviso.getByRole("button", { name: "Seguir editando" }).click();

    // ---- Guardar: cierra SIN preguntar y lo guardado es el entero 5000.
    await dialogo.locator("#enr-seller").selectOption(sellerId);
    await dialogo.getByRole("button", { name: "Inscribir", exact: true }).click();
    await dialogo.waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
    ok(
      "inscribir con éxito cierra el diálogo sin preguntar",
      !(await dialogo.isVisible()) && !(await aviso.isVisible())
    );
    const roster = await api(`/api/cohorts/${cohortId}/roster`);
    const fila = (roster.json?.enrollments ?? []).find((e) => e.contact?.id === contacto.id);
    ok(
      "la inscripción quedó del contacto existente, con monto 5000 (entero)",
      fila?.amount === 5000,
      JSON.stringify(fila ? { amount: fila.amount, contact: fila.contact?.id } : roster.json).slice(0, 300)
    );
    await captura("dialogos-4-inscripto");

    // ---- "Salir sin guardar" descarta y cierra.
    dialogo = await abrir();
    await dialogo.locator("#enr-amount").pressSequentially("1234567");
    ok(
      "1234567 se ve 1.234.567",
      (await dialogo.locator("#enr-amount").inputValue()) === "1.234.567"
    );
    await afuera();
    await aviso.waitFor({ timeout: 10000 });
    await aviso.getByRole("button", { name: "Salir sin guardar" }).click();
    await dialogo.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
    ok("«Salir sin guardar» cierra el diálogo", !(await dialogo.isVisible()) && !(await aviso.isVisible()));

    await contexto.close();
  } catch (err) {
    ok("diálogos y montos en el navegador", false, String(err?.message ?? err));
  } finally {
    await navegador?.close().catch(() => {});
  }
}
