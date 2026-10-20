/**
 * El portal del alumno en otra zona horaria (guion: tests/e2e/us-portal-zonas-horarias.md).
 *
 *   E2E_SECCIONES=portal-zonas-horarias node --env-file=.env.e2e scripts/e2e-selftest.mjs
 *
 * Lo que se prueba, contra la app real:
 *
 * 1. La HORA se pinta en la zona de quien mira. Una clase a las 15:00 de
 *    Montevideo se lee 15:00 en Montevideo, 14:00 en Santo Domingo y 20:00 o
 *    19:00 en Madrid según el horario de verano de España ESE día (se calcula
 *    con Intl, no se escribe a mano). Fuera de Montevideo aparece además la
 *    hora de la academia ("… en Montevideo").
 * 2. El botón "Ingresar a la clase" lo decide el SERVIDOR con instantes
 *    absolutos: se ve igual en las tres zonas. Como el reloj del servidor no
 *    se puede mover, se crean dos clases relativas a "ahora": una que empieza
 *    en ~30 min (fuera de la ventana de 15 min → oculto) y otra en ~10 min
 *    (dentro → visible).
 *
 * Cada zona es un contexto de Playwright con `timezoneId` y la MISMA sesión
 * del alumno: lo único que cambia entre las tres es el reloj del navegador.
 */

import { alEntrar } from "./cambio-de-contrasena.mjs";

const ZONA_ACADEMIA = "America/Montevideo";
const ZONAS = ["America/Montevideo", "America/Santo_Domingo", "Europe/Madrid"];
/** Ventana por defecto de la organización (minutos antes del inicio). */
const ANTES_MIN = 15;
const LEJOS_MIN = 30;
const CERCA_MIN = 10;

/** Fetcher con tarro propio (el alumno); no sigue redirecciones. */
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

/** Fecha, hora y día de la semana (lunes = 0, como `days_of_week`) de un instante en una zona. */
function paredEn(instante, timeZone) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    })
      .formatToParts(instante)
      .map((p) => [p.type, p.value])
  );
  const fecha = `${partes.year}-${partes.month}-${partes.day}`;
  const dias = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return { fecha, hora: `${partes.hour}:${partes.minute}`, dia: dias.indexOf(partes.weekday) };
}

/** La hora `HH:MM` (24 h) de un instante en una zona: la expectativa, calculada y no escrita. */
const horaEn = (instante, timeZone) => paredEn(instante, timeZone).hora;

/** Un número estable por nombre: cada grupo con su propio enlace de reunión. */
const hash = (t) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);

const sumarDia = (fecha, n) =>
  new Date(Date.parse(`${fecha}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);

const sumarMinutos = (hhmm, n) => {
  const [h, m] = hhmm.split(":").map(Number);
  const total = Math.min(h * 60 + m + n, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

export async function seccionPortalZonasHorarias({ api, ok, BASE }) {
  console.log("\n== Portal del alumno: la hora en su zona y el botón en el mismo instante ==");
  const sello = Date.now().toString(36);

  /* ---------- preparación, por la API del staff ---------- */
  const curso = await api("/api/courses", {
    method: "POST",
    body: JSON.stringify({ name: `Curso Zonas E2E ${sello}`, published: false }),
  });
  const cursoId = curso.json?.course?.id;

  /**
   * Una cohorte de UN día con una clase a la hora dada (pared de Montevideo).
   * `endDate` es el día siguiente: con `endDate` = hoy la cohorte ya se lee
   * finalizada (fin a las 00:00 UTC) y no tendría "próxima clase".
   */
  const grupoConUnaClase = async (nombre, fecha, dia, inicio, fin) => {
    const r = await api("/api/cohorts", {
      method: "POST",
      body: JSON.stringify({
        courseId: cursoId,
        name: `${nombre} ${sello}`,
        startDate: fecha,
        endDate: sumarDia(fecha, 1),
        daysOfWeek: String(dia),
        startTime: inicio,
        endTime: fin,
        meetingUrl: `https://zoom.us/j/777${String(Math.abs(hash(nombre + sello))).padStart(8, "0").slice(0, 8)}?pwd=zonas`,
      }),
    });
    const id = r.json?.cohort?.id;
    if (id) await api(`/api/cohorts/${id}/schedule`, { method: "POST" });
    return { id, motivo: `${r.res.status} ${JSON.stringify(r.json?.error ?? "")}` };
  };

  const ahora = Date.now();
  // Se redondea al minuto HACIA ABAJO: la clase "lejos" empieza entre 29 y 30
  // minutos después, la "cerca" entre 9 y 10. Las dos quedan del lado correcto.
  const lejos = paredEn(new Date(ahora + LEJOS_MIN * 60_000), ZONA_ACADEMIA);
  const cerca = paredEn(new Date(ahora + CERCA_MIN * 60_000), ZONA_ACADEMIA);
  // La fija: 15:00 de Montevideo dentro de una semana (Uruguay no tiene
  // horario de verano; España puede cambiar de horario en el medio).
  const diaFijo = paredEn(new Date(ahora + 7 * 86_400_000), ZONA_ACADEMIA);

  const gLejos = await grupoConUnaClase("Zonas lejos", lejos.fecha, lejos.dia, lejos.hora, sumarMinutos(lejos.hora, 60));
  const gCerca = await grupoConUnaClase("Zonas cerca", cerca.fecha, cerca.dia, cerca.hora, sumarMinutos(cerca.hora, 60));
  const gFija = await grupoConUnaClase("Zonas fija", diaFijo.fecha, diaFijo.dia, "15:00", "17:00");
  ok(
    "prep — tres grupos de una clase (lejos, cerca, 15:00 fija) con cronograma",
    Boolean(cursoId && gLejos.id && gCerca.id && gFija.id),
    [curso.res.status, gLejos.motivo, gCerca.motivo, gFija.motivo].join(" · ")
  );

  // Una sola alumna en los tres grupos: la misma sesión en las tres zonas.
  const correo = `alumna-zonas-${sello}@example.com`;
  const primera = await api("/api/enrollments", {
    method: "POST",
    body: JSON.stringify({
      cohortId: gLejos.id,
      contact: {
        firstName: "Alumna",
        lastName: `Zonas ${sello}`,
        email: correo,
        phone: `5989${String(Date.now()).slice(-7)}`,
      },
    }),
  });
  const contactId = primera.json?.enrollment?.contactId;
  const inscribir = async (cohortId) =>
    (await api("/api/enrollments", { method: "POST", body: JSON.stringify({ cohortId, contactId }) })).json
      ?.enrollment?.id;
  const ins = {
    lejos: primera.json?.enrollment?.id,
    cerca: await inscribir(gCerca.id),
    fija: await inscribir(gFija.id),
  };

  const acceso = await api(`/api/enrollments/${ins.lejos}/access`, { method: "POST", body: "{}" });
  const jar = { cookie: "" };
  const como = conJar(BASE, jar);
  const ip = { "x-forwarded-for": `198.18.${Math.floor(Math.random() * 250)}.77` };
  const clave = acceso.json?.temporaryPassword;
  const login = await como("/api/auth/sign-in/email", {
    method: "POST",
    headers: ip,
    body: JSON.stringify({ email: correo, password: clave }),
  });
  await alEntrar(como, login, correo, clave, ip);
  ok(
    "prep — la alumna está en los tres grupos y entra a su portal",
    Boolean(ins.lejos && ins.cerca && ins.fija && login.res.ok && jar.cookie),
    `${primera.res.status} ${JSON.stringify(ins)} acceso ${acceso.res.status} login ${login.res.status}`
  );
  if (!jar.cookie) return;

  /* ---------- lo que decide el servidor (sin navegador) ---------- */
  const detalle = async (id) => (await como(`/api/portal/me/cursadas/${id}`)).json;
  const [dLejos, dCerca, dFija] = [await detalle(ins.lejos), await detalle(ins.cerca), await detalle(ins.fija)];
  ok(
    "API — la academia está en Montevideo (la zona de referencia del guion)",
    dFija?.timezone === ZONA_ACADEMIA,
    String(dFija?.timezone)
  );
  const inicioFijo = dFija?.nextClass?.startsAt;
  ok(
    "API — la clase fija empieza a las 15:00 de Montevideo, como instante absoluto",
    Boolean(inicioFijo) && horaEn(new Date(inicioFijo), ZONA_ACADEMIA) === "15:00" &&
      paredEn(new Date(inicioFijo), ZONA_ACADEMIA).fecha === diaFijo.fecha,
    String(inicioFijo)
  );
  ok(
    `API — a +${LEJOS_MIN} min el enlace NO viaja; a +${CERCA_MIN} min sí`,
    dLejos?.nextClass && dLejos.nextClass.meetingUrl === null && Boolean(dCerca?.nextClass?.meetingUrl),
    JSON.stringify({ lejos: dLejos?.nextClass?.meetingUrl, cerca: dCerca?.nextClass?.meetingUrl })
  );
  const inicioLejos = dLejos?.nextClass?.startsAt ? Date.parse(dLejos.nextClass.startsAt) : NaN;

  /* ---------- lo que ve, en tres zonas ---------- */
  // Hechos fijos (ninguna de las dos zonas tiene horario de verano)…
  ok(
    "expectativa — 15:00 de Montevideo es 14:00 en Santo Domingo",
    Boolean(inicioFijo) && horaEn(new Date(inicioFijo), "America/Santo_Domingo") === "14:00",
    inicioFijo ? horaEn(new Date(inicioFijo), "America/Santo_Domingo") : "sin clase"
  );
  // …y la de Madrid, calculada para ESE día.
  const esperado = (zona) => ({
    rango: `${horaEn(new Date(inicioFijo), zona)} – ${horaEn(new Date(Date.parse(inicioFijo) + 2 * 3_600_000), zona)}`,
    pista: zona !== ZONA_ACADEMIA,
  });

  let navegador = null;
  try {
    const { chromium } = await import("playwright");
    navegador = await chromium.launch();
    const url = new URL(BASE);
    const cookies = jar.cookie
      .split("; ")
      .filter(Boolean)
      .map((par) => {
        const i = par.indexOf("=");
        return { name: par.slice(0, i), value: par.slice(i + 1), domain: url.hostname, path: "/" };
      });

    const botones = {};
    for (const zona of ZONAS) {
      const contexto = await navegador.newContext({ timezoneId: zona, locale: "es-UY" });
      await contexto.addCookies(cookies);
      const pagina = await contexto.newPage();
      const tarjeta = pagina.locator('[aria-labelledby="proxima-clase"]');
      const hora = tarjeta.locator("p.text-4xl");
      const pista = tarjeta.getByText(`Hora local. En Montevideo: 15:00.`);
      const zonaDelNavegador = await pagina.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);

      // 1 — La clase fija, 15:00 de Montevideo.
      const e = esperado(zona);
      await pagina.goto(`${BASE}/portal/cursadas/${ins.fija}`, { timeout: 180000 });
      await hora.waitFor({ timeout: 180000 });
      if (e.pista) {
        // La pista aparece recién cuando el efecto leyó la zona del navegador:
        // esperarla es esperar que la hora ya se haya recalculado.
        await pista.waitFor({ timeout: 30000 }).catch(() => {});
      } else {
        // En Montevideo la hora no cambia al hidratar; se espera el texto final.
        await pagina.getByText(e.rango).first().waitFor({ timeout: 30000 }).catch(() => {});
        await pagina.waitForTimeout(1000);
      }
      const leido = (await hora.innerText()).trim();
      const hayPista = (await pista.count()) > 0;
      ok(
        `UI ${zona} — la clase de las 15:00 de Montevideo se lee ${e.rango} (hora local)`,
        zonaDelNavegador === zona && leido === e.rango,
        `navegador=${zonaDelNavegador} leído="${leido}"`
      );
      ok(
        `UI ${zona} — la hora de la academia ("… en Montevideo") ${e.pista ? "aparece" : "no hace falta y no aparece"}`,
        hayPista === e.pista,
        `pista=${hayPista}`
      );
      // La lista de clases dice lo mismo (ClassTime): "hora local · 15:00 en Montevideo".
      const enLista = (await pagina.getByText("hora local · 15:00 en Montevideo").count()) > 0;
      ok(
        `UI ${zona} — la fila de la clase repite la hora de la academia solo fuera de Montevideo`,
        enLista === e.pista,
        `fila=${enLista}`
      );

      // 2 — El botón, con el mismo instante absoluto en las tres zonas.
      const boton = tarjeta.getByRole("link", { name: "Ingresar a la clase" });
      const aviso = tarjeta.getByText("El enlace de acceso se habilita 15 minutos antes del inicio.");

      await pagina.goto(`${BASE}/portal/cursadas/${ins.lejos}`, { timeout: 180000 });
      await aviso.or(boton).first().waitFor({ timeout: 180000 });
      const aTiempo = Date.now() < inicioLejos - ANTES_MIN * 60_000;
      const lejosVisible = (await boton.count()) > 0;
      ok(
        `UI ${zona} — a +${LEJOS_MIN} min "Ingresar a la clase" NO está (fuera de la ventana de ${ANTES_MIN} min)`,
        aTiempo && !lejosVisible,
        aTiempo ? `botón=${lejosVisible}` : "la corrida tardó tanto que la clase lejana ya entró en la ventana"
      );

      await pagina.goto(`${BASE}/portal/cursadas/${ins.cerca}`, { timeout: 180000 });
      await aviso.or(boton).first().waitFor({ timeout: 180000 });
      const cercaVisible = (await boton.count()) > 0;
      const href = cercaVisible ? await boton.getAttribute("href") : null;
      ok(
        `UI ${zona} — a +${CERCA_MIN} min "Ingresar a la clase" está y lleva al enlace del grupo`,
        cercaVisible && href === dCerca?.nextClass?.meetingUrl,
        `botón=${cercaVisible} href=${href}`
      );
      botones[zona] = [lejosVisible, cercaVisible];
      await contexto.close();
    }
    ok(
      "UI — el botón se ve IGUAL en las tres zonas (lo decide el instante, no el reloj de quien mira)",
      Object.keys(botones).length === ZONAS.length &&
        new Set(Object.values(botones).map((b) => JSON.stringify(b))).size === 1,
      JSON.stringify(botones)
    );
  } catch (err) {
    ok("UI — el portal del alumno en el navegador, en tres zonas", false, String(err?.message ?? err));
  } finally {
    await navegador?.close();
  }
}
