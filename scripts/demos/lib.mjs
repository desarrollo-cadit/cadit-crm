/**
 * Utilidades compartidas por los videos de demostración (scripts/demos/*.mjs).
 *
 * Cada video es un guion de Playwright que se graba contra el entorno de
 * pruebas (base `vocero_e2e`, mocks encendidos) y SOLO con datos ficticios.
 * Nunca se apunta a producción: los datos se crean por la API del staff antes
 * de grabar y la grabación usa un contexto de navegador aparte.
 *
 * Contenido:
 *   - Cliente de la API con tarro de cookies (mismo patrón que `api()` de
 *     scripts/e2e-selftest.mjs) y reintento ante reinicios del dev server.
 *   - `isoDia`, `entrarComoStaff`, `asegurarVendedor`.
 *   - Capa visual del video: subtítulos con indicador de paso, tarjetas de
 *     título a pantalla completa, cursor simulado y anillo de resaltado.
 *     Se inyecta con `context.addInitScript`, así que sobrevive a cada
 *     navegación (el subtítulo vigente se restaura desde sessionStorage).
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/* ============================================================
 * Red y API
 * ============================================================ */

const CONEXION_CAIDA = new Set(["ECONNRESET", "ECONNREFUSED", "UND_ERR_SOCKET", "EPIPE"]);

/**
 * El dev server se reinicia solo cuando se acerca al límite de memoria, y el
 * pedido que llega en ese momento muere con ECONNRESET. Se reintenta SOLO el
 * fallo de conexión (nunca un status HTTP): el pedido que falla no llegó a
 * procesarse, así que repetirlo no duplica nada.
 */
export function instalarReintentoDeConexion() {
  if (globalThis.fetch.__conReintento) return;
  const original = globalThis.fetch;
  const envuelto = async (input, init) => {
    for (let intento = 1; ; intento++) {
      try {
        return await original(input, init);
      } catch (err) {
        const codigo = err?.cause?.code ?? err?.code;
        if (!CONEXION_CAIDA.has(codigo) || intento >= 60) throw err;
        if (intento === 1) console.log(`  …  el servidor se está reiniciando (${codigo}): reintento`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  };
  envuelto.__conReintento = true;
  globalThis.fetch = envuelto;
}

/**
 * Cliente con su propio tarro de cookies. Cada audiencia (staff, profesor…)
 * usa el suyo: compartirlo mezclaría sesiones.
 */
export function crearCliente(BASE) {
  const jar = { cookie: "" };
  async function api(ruta, opts = {}) {
    const res = await fetch(`${BASE}${ruta}`, {
      ...opts,
      headers: {
        "content-type": "application/json",
        // Better Auth valida Origin (CSRF) en los endpoints de auth.
        origin: BASE,
        ...(jar.cookie ? { cookie: jar.cookie } : {}),
        ...(opts.headers ?? {}),
      },
    });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    if (setCookie.length) {
      jar.cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
    }
    let json = null;
    try {
      json = await res.clone().json();
    } catch {}
    return { res, json };
  }
  return { api, jar };
}

/** Lanza si la respuesta no es 2xx: el armado de datos no puede fallar a medias. */
export function exigir(nombre, r) {
  if (!r.res.ok) {
    throw new Error(`${nombre}: ${r.res.status} ${JSON.stringify(r.json)}`);
  }
  return r.json;
}

/** Un día relativo a hoy, como `YYYY-MM-DD`. */
export const isoDia = (desplazamiento) =>
  new Date(Date.now() + desplazamiento * 86_400_000).toISOString().slice(0, 10);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Operador del entorno de pruebas (el mismo que usa el self-test). */
export const STAFF_E2E = { email: "e2e@vocero.test", password: "password-e2e-123" };

/** Registro o, si la organización ya existe, ingreso del operador de pruebas. */
export async function entrarComoStaff(api, { email, password } = STAFF_E2E) {
  let r = await api("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email, password, name: "Operador E2E" }),
  });
  if (!r.res.ok) {
    r = await api("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }
  exigir("ingreso del staff", r);
}

/** Toda inscripción lleva vendedor: se reutiliza uno por nombre o se crea. */
export async function asegurarVendedor(api, nombre) {
  const lista = (await api("/api/sellers")).json?.sellers ?? [];
  const existente = lista.find((s) => s.name === nombre && !s.archived);
  if (existente) return existente.id;
  const creado = exigir(
    "alta de vendedor",
    await api("/api/sellers", { method: "POST", body: JSON.stringify({ name: nombre }) })
  );
  return creado.seller.id;
}

/**
 * `next dev` compila cada ruta la primera vez que se pide, y eso tarda de 5 a
 * 30 segundos: en el video quedaría una pantalla congelada. Se piden antes,
 * sin sesión (una redirección o un 401 ya obliga a compilar). Las páginas se
 * piden con `cookie` para que el caparazón autenticado también compile.
 */
export async function precalentar(BASE, rutas, { cookie = "" } = {}) {
  for (const ruta of rutas) {
    const t = Date.now();
    await fetch(`${BASE}${ruta}`, { redirect: "manual", headers: cookie ? { cookie } : {} }).catch(() => null);
    const s = ((Date.now() - t) / 1000).toFixed(1);
    if (Number(s) > 2) console.log(`  precalentado ${ruta} (${s} s)`);
  }
}

/**
 * `next dev` descarta de memoria las rutas que nadie pidió en el último
 * minuto (`onDemandEntries`) y las vuelve a compilar al siguiente pedido: en
 * un video de varios minutos, la pestaña que se abre al final llegaría fría.
 * Mientras se graba, se vuelven a pedir cada `cadaMs`. Devuelve cómo parar.
 */
export function mantenerCaliente(BASE, rutas, { cadaMs = 20000 } = {}) {
  let activo = true;
  const vuelta = async () => {
    while (activo) {
      for (const ruta of rutas) {
        if (!activo) break;
        await fetch(`${BASE}${ruta}`, { redirect: "manual" }).catch(() => null);
      }
      await sleep(cadaMs);
    }
  };
  void vuelta();
  return () => {
    activo = false;
  };
}

/* ============================================================
 * Capa visual (se ejecuta DENTRO de la página)
 * ============================================================ */

/**
 * Script de inicio de la página. Se serializa con `toString()`, así que no
 * puede usar nada de fuera de su propio cuerpo.
 */
function capaVisual(opciones) {
  if (window.__demo) return;
  const CLAVE = "__demo_estado";
  const marca = opciones.marca;

  const leer = () => {
    try {
      return JSON.parse(sessionStorage.getItem(CLAVE) ?? "{}");
    } catch {
      return {};
    }
  };
  const guardar = (parcial) => {
    try {
      sessionStorage.setItem(CLAVE, JSON.stringify({ ...leer(), ...parcial }));
    } catch {}
  };

  const css = `
    #demo-capa, #demo-capa * { box-sizing: border-box; }
    nextjs-portal { display: none !important; }
    #demo-capa { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646;
      font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif; }
    #demo-sub { position: absolute; left: 50%; transform: translateX(-50%);
      bottom: 28px; width: min(1180px, calc(100% - 64px));
      background: #001b5e; color: #fff; border-radius: 14px;
      box-shadow: 0 12px 40px rgba(0, 12, 48, .35);
      padding: 16px 26px 18px; display: flex; gap: 22px; align-items: center;
      opacity: 0; transition: opacity .35s ease, top .35s ease, bottom .35s ease; }
    #demo-sub.visible { opacity: 1; }
    #demo-sub.arriba { bottom: auto; top: 24px; }
    #demo-paso { flex: none; font-size: 13px; font-weight: 600; letter-spacing: .06em;
      text-transform: uppercase; color: #9fb4ff; border-right: 1px solid rgba(255,255,255,.22);
      padding-right: 20px; line-height: 1.35; max-width: 220px; }
    #demo-paso b { display: block; color: #fff; font-size: 15px; letter-spacing: .02em;
      text-transform: none; margin-top: 2px; }
    #demo-texto { font-size: 22px; line-height: 1.4; font-weight: 500;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    #demo-tarjeta { position: absolute; inset: 0; background: #001b5e; color: #fff;
      display: flex; flex-direction: column; justify-content: center; padding: 0 140px;
      opacity: 0; transition: opacity .5s ease; pointer-events: none;
      background-image: radial-gradient(circle at 85% 20%, rgba(80,120,255,.35), transparent 45%),
        radial-gradient(circle at 10% 90%, rgba(0,140,255,.18), transparent 40%); }
    #demo-tarjeta.visible { opacity: 1; }
    #demo-capa.con-tarjeta #demo-cursor, #demo-capa.con-tarjeta #demo-anillo { opacity: 0; }
    #demo-tarjeta .marca { position: absolute; top: 64px; left: 140px; display: flex;
      align-items: center; gap: 14px; font-size: 22px; font-weight: 700; letter-spacing: .02em; }
    #demo-tarjeta .marca i { width: 40px; height: 40px; border-radius: 10px; background: #fff;
      color: #001b5e; display: grid; place-items: center; font-style: normal; font-weight: 800; }
    #demo-tarjeta .antetitulo { font-size: 18px; font-weight: 600; letter-spacing: .14em;
      text-transform: uppercase; color: #9fb4ff; margin-bottom: 18px; }
    #demo-tarjeta .titulo { font-size: 64px; line-height: 1.08; font-weight: 700; max-width: 1100px; }
    #demo-tarjeta .regla { width: 88px; height: 4px; background: #5b7cff; border-radius: 2px; margin: 34px 0 26px; }
    #demo-tarjeta .subtitulo { font-size: 26px; line-height: 1.45; color: #d5defc; max-width: 1000px; }
    #demo-tarjeta .pie { position: absolute; bottom: 56px; left: 140px; font-size: 15px; color: #8fa3e0; }
    #demo-cursor { position: absolute; left: 0; top: 0; width: 26px; height: 26px;
      transform: translate(-100px, -100px); transition: transform .8s cubic-bezier(.45,.05,.25,1);
      filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
    #demo-cursor.pulso::after { content: ""; position: absolute; left: -14px; top: -14px;
      width: 28px; height: 28px; border-radius: 50%; border: 3px solid #ff8a00;
      animation: demo-pulso .5s ease-out forwards; }
    @keyframes demo-pulso { from { transform: scale(.3); opacity: 1; } to { transform: scale(1.6); opacity: 0; } }
    #demo-anillo { position: absolute; border: 3px solid #ff8a00; border-radius: 10px;
      box-shadow: 0 0 0 6px rgba(255,138,0,.22); opacity: 0; transition: opacity .25s ease; }
    #demo-anillo.visible { opacity: 1; }
  `;

  const cursorSvg =
    '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 2l7.5 19 2.6-7.9L21 10.5z" fill="#fff" stroke="#001b5e" stroke-width="1.6" stroke-linejoin="round"/></svg>';

  function montar() {
    if (document.getElementById("demo-capa")) return;
    const estilo = document.createElement("style");
    estilo.textContent = css;
    document.head.appendChild(estilo);
    const capa = document.createElement("div");
    capa.id = "demo-capa";
    capa.innerHTML = `
      <div id="demo-anillo"></div>
      <div id="demo-sub"><div id="demo-paso"></div><div id="demo-texto"></div></div>
      <div id="demo-tarjeta"></div>
      <div id="demo-cursor">${cursorSvg}</div>`;
    document.documentElement.appendChild(capa);

    // Restaura lo que había en pantalla antes de navegar.
    const e = leer();
    if (e.cursor) moverCursor(e.cursor.x, e.cursor.y, 0);
    if (e.subtitulo) subtitulo(e.subtitulo, true);
  }

  const $ = (id) => document.getElementById(id);

  function subtitulo(s, restaurando = false) {
    if (!s) {
      $("demo-sub")?.classList.remove("visible");
      if (!restaurando) guardar({ subtitulo: null });
      return;
    }
    $("demo-paso").innerHTML = s.paso
      ? `${s.paso}${s.seccion ? `<b>${s.seccion}</b>` : ""}`
      : `${marca}`;
    $("demo-texto").textContent = s.texto;
    // Con barra lateral fija (clase `barra-marca`), el subtítulo se centra en
    // el área de contenido para no tapar el usuario ni "Cerrar sesión".
    const barra = [...document.querySelectorAll(".barra-marca")]
      .map((b) => b.getBoundingClientRect())
      .find((r) => r.left <= 0 && r.width > 0 && r.width < window.innerWidth / 2 && r.height > window.innerHeight / 2);
    const izquierda = barra ? barra.right : 0;
    Object.assign($("demo-sub").style, {
      left: `${izquierda + (window.innerWidth - izquierda) / 2}px`,
      width: `min(1120px, ${window.innerWidth - izquierda - 64}px)`,
    });
    $("demo-sub").classList.toggle("arriba", Boolean(s.arriba));
    $("demo-sub").classList.add("visible");
    if (!restaurando) guardar({ subtitulo: s });
  }

  function tarjeta(t) {
    const el = $("demo-tarjeta");
    if (!t) {
      el.classList.remove("visible");
      $("demo-capa").classList.remove("con-tarjeta");
      return;
    }
    el.innerHTML = `
      <div class="marca"><i>C</i>${marca}</div>
      ${t.antetitulo ? `<div class="antetitulo">${t.antetitulo}</div>` : ""}
      <div class="titulo">${t.titulo}</div>
      <div class="regla"></div>
      ${t.subtitulo ? `<div class="subtitulo">${t.subtitulo}</div>` : ""}
      ${t.pie ? `<div class="pie">${t.pie}</div>` : ""}`;
    el.classList.add("visible");
    $("demo-capa").classList.add("con-tarjeta");
  }

  function moverCursor(x, y, ms = 800) {
    const c = $("demo-cursor");
    if (!c) return;
    c.style.transitionDuration = `${ms}ms`;
    c.style.transform = `translate(${x}px, ${y}px)`;
    guardar({ cursor: { x, y } });
  }

  function pulso() {
    const c = $("demo-cursor");
    c.classList.remove("pulso");
    void c.offsetWidth;
    c.classList.add("pulso");
  }

  function anillo(r) {
    const a = $("demo-anillo");
    if (!r) {
      a.classList.remove("visible");
      return;
    }
    const m = 6;
    Object.assign(a.style, {
      left: `${r.x - m}px`,
      top: `${r.y - m}px`,
      width: `${r.width + 2 * m}px`,
      height: `${r.height + 2 * m}px`,
    });
    a.classList.add("visible");
  }

  window.__demo = { subtitulo, tarjeta, moverCursor, pulso, anillo, montar };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", montar, { once: true });
  } else {
    montar();
  }
}

/* ============================================================
 * Director: lo que el guion usa desde Node
 * ============================================================ */

/**
 * Cuánto sostener un subtítulo: palabras / 2.5 segundos, mínimo 3 s.
 * `duracion` (ms) manda cuando se conoce de antemano; por ejemplo, el largo
 * del audio de narración que corresponde a ese subtítulo.
 */
export function tiempoDeLectura(texto, duracion) {
  if (typeof duracion === "number" && duracion > 0) return duracion;
  const palabras = texto.trim().split(/\s+/).length;
  return Math.max(3000, Math.round((palabras / 2.5) * 1000));
}

/**
 * Prepara un contexto ya creado (con `recordVideo`) para la demostración y
 * devuelve el "director": el objeto con el que el guion narra y actúa.
 */
export async function crearDirector(context, page, { marca = "CadIT", framesDir, totalPasos }) {
  await context.addInitScript(capaVisual, { marca });
  if (framesDir) {
    await rm(framesDir, { recursive: true, force: true });
    await mkdir(framesDir, { recursive: true });
  }

  let paso = 0;
  let seccion = "";
  let foto = 0;
  let subtituloActual = null;
  /**
   * Línea de tiempo de los subtítulos, en ms desde el inicio del video (que
   * arranca al crear la página). Queda lista para sincronizar una narración.
   */
  const inicioVideo = Date.now();
  const lineaDeTiempo = [];
  const alto = page.viewportSize()?.height ?? 900;

  /** La capa puede no estar montada todavía si la página recién navegó. */
  async function enPagina(fn, arg) {
    await page.waitForFunction(() => Boolean(window.__demo && document.getElementById("demo-capa")), null, {
      timeout: 30000,
    }).catch(async () => {
      await page.evaluate(() => window.__demo?.montar());
    });
    return page.evaluate(fn, arg);
  }

  const director = {
    page,

    async captura(nombre) {
      if (!framesDir) return;
      foto++;
      const archivo = `${String(foto).padStart(3, "0")}-${nombre}.png`;
      await page.screenshot({ path: path.join(framesDir, archivo) });
    },

    /** Tarjeta de título a pantalla completa, en la misma página (y el mismo video). */
    async tarjeta(t, { ms } = {}) {
      await enPagina((x) => window.__demo.subtitulo(null), null);
      await enPagina((x) => window.__demo.tarjeta(x), t);
      lineaDeTiempo.push({
        step: paso,
        section: seccion,
        text: [t.titulo, t.subtitulo]
          .filter(Boolean)
          .map((s) => (/[.!?]$/.test(s) ? s : `${s}.`))
          .join(" "),
        startMs: Date.now() - inicioVideo,
        card: true,
      });
      await sleep(600);
      await director.captura(`tarjeta-${t.archivo ?? "seccion"}`);
      const texto = [t.titulo, t.subtitulo].filter(Boolean).join(" ");
      await sleep(ms ?? Math.max(3500, tiempoDeLectura(texto)));
      await enPagina(() => window.__demo.tarjeta(null));
      await sleep(600);
    },

    /** Abre una sección: avanza el indicador de paso y muestra su tarjeta. */
    async seccion(titulo, subtitulo, { ms = 3500 } = {}) {
      paso++;
      seccion = titulo;
      await director.tarjeta(
        {
          antetitulo: `Paso ${paso} de ${totalPasos}`,
          titulo,
          subtitulo,
          archivo: `paso-${paso}`,
        },
        { ms }
      );
    },

    /**
     * Muestra un subtítulo y lo sostiene el tiempo de lectura. `arriba` lo
     * sube cuando el elemento que se explica queda en la franja inferior.
     */
    async decir(texto, { arriba = false, sostener = true, foto = true, duracion } = {}) {
      subtituloActual = {
        texto,
        paso: paso ? `Paso ${paso} de ${totalPasos}` : "",
        seccion,
        arriba,
      };
      await enPagina((s) => window.__demo.subtitulo(s), subtituloActual);
      lineaDeTiempo.push({ step: paso, section: seccion, text: texto, startMs: Date.now() - inicioVideo });
      await sleep(400);
      if (foto) await director.captura(`paso${paso}-${texto.slice(0, 28).replace(/[^\p{L}\p{N}]+/gu, "-")}`);
      if (sostener) await sleep(tiempoDeLectura(texto, duracion));
    },

    /** Escribe la línea de tiempo de subtítulos: [{ step, section, text, startMs }]. */
    async guardarLineaDeTiempo(archivo) {
      await mkdir(path.dirname(archivo), { recursive: true });
      await writeFile(archivo, `${JSON.stringify(lineaDeTiempo, null, 2)}\n`, "utf8");
      return lineaDeTiempo.length;
    },

    async callar() {
      subtituloActual = null;
      await enPagina(() => window.__demo.subtitulo(null));
    },

    /**
     * Lleva el cursor al elemento, lo resalta ~1 s y recién ahí hace el clic
     * real. Si el elemento queda tapado por el subtítulo (franja inferior),
     * el subtítulo sube.
     */
    async señalar(locator, { ms = 1000 } = {}) {
      await locator.scrollIntoViewIfNeeded();
      const caja = await locator.boundingBox();
      if (!caja) throw new Error("el elemento no tiene caja visible");
      if (subtituloActual) {
        // Tapado = en la franja inferior Y dentro del ancho del subtítulo
        // (un botón de la barra lateral queda a su izquierda, no debajo).
        const sub = await enPagina(() => {
          const r = document.getElementById("demo-sub").getBoundingClientRect();
          return { izquierda: r.left, derecha: r.right };
        });
        const tapado =
          caja.y + caja.height > alto - 150 &&
          caja.x < sub.derecha &&
          caja.x + caja.width > sub.izquierda;
        if (tapado !== subtituloActual.arriba) {
          subtituloActual = { ...subtituloActual, arriba: tapado };
          await enPagina((s) => window.__demo.subtitulo(s), subtituloActual);
        }
      }
      const x = Math.round(caja.x + Math.min(caja.width / 2, 60));
      const y = Math.round(caja.y + caja.height / 2);
      await enPagina(({ x, y }) => window.__demo.moverCursor(x, y, 800), { x, y });
      await page.mouse.move(x, y, { steps: 12 });
      await sleep(850);
      await enPagina((r) => window.__demo.anillo(r), caja);
      await sleep(300);
      await director.captura(`paso${paso}-accion`);
      await sleep(Math.max(0, ms - 300));
      return { x, y };
    },

    /**
     * Clic visible. `hasta` (un locator) es la señal de que el clic surtió
     * efecto: mientras React no hidrata, el botón existe pero no responde, así
     * que se reintenta hasta verla.
     */
    async clic(locator, { hasta, limiteMs = 180000 } = {}) {
      await locator.waitFor({ state: "visible", timeout: 180000 });
      await director.señalar(locator);
      await enPagina(() => window.__demo.pulso());
      // Con `next dev` en frío una pantalla puede tardar más de un minuto en
      // responder: se reintenta hasta el límite, no una cantidad fija de veces.
      const limite = Date.now() + limiteMs;
      for (;;) {
        const vencido = Date.now() > limite;
        await locator.click({ timeout: 15000 }).catch((err) => {
          if (!hasta || vencido) throw err;
        });
        if (!hasta) break;
        const listo = await hasta.waitFor({ state: "visible", timeout: 2500 }).then(() => true, () => false);
        if (listo) break;
        // Si el elemento ya no está, el clic surtió efecto (navegó o cerró
        // algo): se espera el resultado en vez de volver a hacer clic.
        if (!(await locator.isVisible().catch(() => false))) {
          await hasta.waitFor({ state: "visible", timeout: 180000 });
          break;
        }
        if (vencido) throw new Error("el clic no produjo el resultado esperado");
      }
      await enPagina(() => window.__demo.anillo(null)).catch(() => {});
      await sleep(500);
    },

    /** Escribe como una persona, con el cursor sobre el campo. */
    async escribir(locator, texto, { retardo = 55 } = {}) {
      await locator.waitFor({ state: "visible", timeout: 180000 });
      await director.señalar(locator, { ms: 400 });
      await locator.click();
      await locator.fill("");
      await locator.pressSequentially(texto, { delay: retardo });
      await enPagina(() => window.__demo.anillo(null));
      await sleep(400);
    },

    /** Elige una opción de un `<select>` con el mismo gesto visible. */
    async elegir(locator, valor) {
      await locator.waitFor({ state: "visible", timeout: 180000 });
      await director.señalar(locator);
      await enPagina(() => window.__demo.pulso());
      await locator.selectOption(valor);
      await enPagina(() => window.__demo.anillo(null));
      await sleep(600);
    },

    /** Resalta sin hacer clic (para explicar una parte de la pantalla). */
    async resaltar(locator, { ms = 1200 } = {}) {
      await director.señalar(locator, { ms });
      await enPagina(() => window.__demo.anillo(null));
    },
  };
  return director;
}

/* ============================================================
 * Video
 * ============================================================ */

/**
 * Mueve el .webm que grabó Playwright a su nombre final. El video se termina
 * de escribir al cerrar el contexto, así que esto va DESPUÉS de `close()`.
 */
export async function guardarVideo(video, destino) {
  const origen = await video.path();
  await rm(destino, { force: true });
  await rename(origen, destino);
  return destino;
}

/** Borra los .webm sueltos de corridas anteriores en la carpeta temporal. */
export async function limpiarTemporales(dir) {
  await mkdir(dir, { recursive: true });
  for (const f of await readdir(dir)) {
    if (f.endsWith(".webm")) await rm(path.join(dir, f), { force: true });
  }
}

/**
 * Dónde está ffmpeg, en este orden: la variable FFMPEG_PATH, `ffmpeg` en el
 * PATH y la carpeta donde lo deja WinGet (las consolas abiertas antes de la
 * instalación no ven el PATH nuevo). `null` si no aparece.
 */
export function resolverFfmpeg() {
  const funciona = (bin) => spawnSync(bin, ["-version"], { stdio: "ignore" }).status === 0;
  const candidatos = [];
  if (process.env.FFMPEG_PATH) candidatos.push(process.env.FFMPEG_PATH);
  candidatos.push("ffmpeg");
  if (process.env.LOCALAPPDATA) {
    const paquetes = path.join(process.env.LOCALAPPDATA, "Microsoft", "WinGet", "Packages");
    if (existsSync(paquetes)) {
      for (const paquete of readdirSync(paquetes).filter((p) => p.startsWith("Gyan.FFmpeg"))) {
        const raiz = path.join(paquetes, paquete);
        for (const build of readdirSync(raiz).filter((b) => b.startsWith("ffmpeg-"))) {
          candidatos.push(path.join(raiz, build, "bin", "ffmpeg.exe"));
        }
      }
    }
  }
  return candidatos.find(funciona) ?? null;
}

/** Convierte el .webm a .mp4 (H.264, yuv420p, +faststart). `null` si no hay ffmpeg o falla. */
export function convertirAMp4(webm) {
  const ffmpeg = resolverFfmpeg();
  if (!ffmpeg) return null;
  const mp4 = webm.replace(/\.webm$/, ".mp4");
  const r = spawnSync(
    ffmpeg,
    ["-y", "-loglevel", "error", "-i", webm, "-c:v", "libx264", "-preset", "medium", "-crf", "20",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", mp4],
    { stdio: "inherit" }
  );
  return r.status === 0 ? mp4 : null;
}

/** Duración de un video en segundos, leída con ffmpeg (o `null`). */
export function duracionDeVideo(archivo) {
  const ffmpeg = resolverFfmpeg();
  if (!ffmpeg) return null;
  const r = spawnSync(ffmpeg, ["-i", archivo], { encoding: "utf8" });
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(r.stderr ?? "");
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

export async function tamañoMb(archivo) {
  return ((await stat(archivo)).size / 1_048_576).toFixed(1);
}
