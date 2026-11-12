/**
 * Portal del profesor: ingresar y ver mis grupos.
 *
 * Este archivo también es la biblioteca de los guiones de los portales
 * (profesor y alumno): exporta el cliente de la API con la sesión en caché y el
 * armado de los datos de apoyo. Importarlo no graba nada.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { BASE, SALIDA } from "../grabador.mjs";

/* ============================================================
 * Biblioteca compartida por los guiones de los portales
 * ============================================================ */

export const CLAVE = "Demo-Guia-2026";
export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Cookie de un rol, de la sesión guardada en disco (sesiones.mjs). Nunca inicia sesión: espera a que exista. */
export async function cookieDe(rol) {
  const archivo = path.join(SALIDA, "sesiones", `${rol}.json`);
  for (let i = 0; i < 720; i++) {
    try {
      const cookies = JSON.parse(await readFile(archivo, "utf8"));
      return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    } catch {
      await dormir(5000);
    }
  }
  throw new Error(`no existe la sesión guardada de ${rol}`);
}

/** Cliente de la API para un rol: `api(ruta, { method, body })` → `{ ok, status, json }`. */
export async function clienteDe(rol) {
  const cookie = await cookieDe(rol);
  return async (ruta, { method = "GET", body } = {}) => {
    const res = await fetch(`${BASE}${ruta}`, {
      method,
      headers: { "content-type": "application/json", origin: BASE, cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try {
      json = await res.json();
    } catch {}
    return { ok: res.ok, status: res.status, json };
  };
}

export const comoStaff = (rol = "direccion") => clienteDe(rol);

export async function cuenta(rol) {
  const cuentas = JSON.parse(await readFile(path.join(SALIDA, "cuentas.json"), "utf8"));
  return cuentas[rol];
}

export function ok(nombre, r) {
  if (!r.ok) throw new Error(`${nombre}: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json;
}

/** Día `YYYY-MM-DD` a `n` días de hoy. */
export const dia = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
/** Sufijo único y corto para lo que crea un guion. */
export const sufijo = () => Date.now().toString(36).slice(-5);

/* ============================================================
 * Datos de apoyo (todo lo que se crea lleva el sufijo de la corrida)
 * ============================================================ */

const ALUMNOS_FICTICIOS = [
  ["Lucía", "Ferrero"],
  ["Mateo", "Cabrera"],
  ["Valentina", "Olivera"],
  ["Joaquín", "Techera"],
  ["Camila", "Barreto"],
];
const sinTildes = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Hora de pared de la academia: minutos desde medianoche y día (lunes = 0). */
function ahoraEn(zona = "America/Montevideo") {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: zona, hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value])
  );
  return {
    minutos: Number(p.hour) * 60 + Number(p.minute),
    dia: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday),
  };
}
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Cursos, profesores y el contacto del alumno de demostración. */
export async function datosBase() {
  const staff = await comoStaff("direccion");
  const cursos = ok("cursos", await staff("/api/courses")).courses;
  const profesores = ok("profesores", await staff("/api/teachers")).teachers;
  const correoProf = await cuenta("profesor");
  const florencia = profesores.find((t) => t.email === correoProf);
  if (!florencia) throw new Error("no se encontró a la profesora de demostración");
  const otro = profesores.find((t) => t.id !== florencia.id) ?? florencia;
  const correoAlumno = await cuenta("alumno");
  const lista = ok("contacto del alumno", await staff(`/api/contacts?q=${encodeURIComponent(correoAlumno)}`)).contacts;
  const santiago = lista.find((c) => c.email === correoAlumno) ?? lista[0];
  if (!santiago) throw new Error("no se encontró al alumno de demostración");
  return { staff, cursos, florencia, otro, santiago, correoProf, correoAlumno };
}

/**
 * Un grupo propio de la corrida: con la profesora de demostración (o la otra),
 * el alumno de demostración y compañeros ficticios, y su cronograma.
 *
 * opciones: etiqueta, curso, inicio/fin (días desde hoy), dias, horario
 * {desde, hasta}, enVivo (una clase en curso ahora), otraProfesora,
 * conSantiago, companeros, monto (centésimos; plan de 3 cuotas).
 */
export async function armarGrupo(o = {}) {
  const base = await datosBase();
  const { staff } = base;
  const s = sufijo();
  const curso = base.cursos.find((c) => c.name === (o.curso ?? "AutoCAD 2D Profesionales")) ?? base.cursos[0];
  const profesor = o.otraProfesora ? base.otro : base.florencia;

  let dias = o.dias ?? "0,2";
  let desde = o.horario?.desde ?? "18:30";
  let hasta = o.horario?.hasta ?? "20:30";
  if (o.enVivo) {
    // Una clase que empezó hace unos minutos y dura dos horas.
    const ahora = ahoraEn();
    const inicio = Math.floor((ahora.minutos - 12) / 5) * 5;
    if (inicio >= 0 && inicio + 120 < 24 * 60) {
      desde = hhmm(inicio);
      hasta = hhmm(inicio + 120);
      dias = [...new Set([ahora.dia, (ahora.dia + 3) % 7])].sort().join(",");
    }
  }

  const nombre = `${o.etiqueta ?? "Grupo de la guía"} ${s}`;
  const alta = ok(
    "alta del grupo",
    await staff("/api/cohorts", {
      method: "POST",
      body: {
        courseId: curso.id,
        teacherId: profesor.id,
        name: nombre,
        startDate: dia(o.inicio ?? -21),
        endDate: dia(o.fin ?? 21),
        daysOfWeek: dias,
        startTime: desde,
        endTime: hasta,
        classroom: "Sala virtual 2",
        meetingUrl: "https://zoom.us/j/81234567890",
      },
    })
  );
  const cohortId = alta.cohort?.id ?? alta.id;
  ok("cronograma", await staff(`/api/cohorts/${cohortId}/schedule`, { method: "POST" }));

  const inscripciones = [];
  const vendedor = (ok("vendedores", await staff("/api/sellers")).sellers.find((v) => !v.archived) ?? {}).id;
  const inscribir = async (cuerpo, quien) => {
    const r = ok(`inscripción de ${quien}`, await staff("/api/enrollments", { method: "POST", body: { cohortId, sellerId: vendedor, ...cuerpo } }));
    return r.enrollment?.id ?? r.id;
  };
  let santiagoEnr = null;
  if (o.conSantiago !== false) {
    santiagoEnr = await inscribir(
      o.monto ? { contactId: base.santiago.id, amount: o.monto, currency: "UYU" } : { contactId: base.santiago.id },
      "Santiago"
    );
    inscripciones.push({ id: santiagoEnr, nombre: "Santiago Rodríguez", santiago: true });
  }
  const n = o.companeros ?? 4;
  for (const [i, [nom, ape]] of ALUMNOS_FICTICIOS.slice(0, n).entries()) {
    const id = await inscribir(
      { contact: { firstName: nom, lastName: ape, email: `${sinTildes(nom)}.${sinTildes(ape)}.${s}${i}@demo.test` } },
      nom
    );
    inscripciones.push({ id, nombre: `${nom} ${ape}`, santiago: false });
  }

  if (o.monto && santiagoEnr) {
    ok("plan de cuotas", await staff(`/api/enrollments/${santiagoEnr}/installments`, { method: "POST", body: { count: 3, firstDueDate: dia(-10) } }));
  }

  const clases = ok("clases", await staff(`/api/cohorts/${cohortId}/classes`)).classes.filter((c) => c.id);
  return { ...base, s, cohortId, nombre, curso, inscripciones, santiagoEnr, clases };
}

/** Pasa lista en las primeras `cuantas` clases (el alumno de demostración falta a la tercera). */
export async function pasarLista(g, cuantas, { sinFaltas = false } = {}) {
  const ESTADOS = ["presente", "presente", "tarde", "presente", "presente"];
  for (const [k, clase] of g.clases.slice(0, cuantas).entries()) {
    ok(
      `asistencia de la clase ${clase.number}`,
      await g.staff(`/api/class-sessions/${clase.id}`, {
        method: "PATCH",
        body: {
          attendance: g.inscripciones.map((e, i) => ({
            enrollmentId: e.id,
            status: e.santiago && k === 2 && !sinFaltas ? "ausente" : ESTADOS[(i + k) % ESTADOS.length],
          })),
        },
      })
    );
  }
}

export async function grabacionDeClase(g, numero, url) {
  const clase = g.clases.find((c) => c.number === numero);
  ok(`grabación de la clase ${numero}`, await g.staff(`/api/class-sessions/${clase.id}/links`, { method: "PATCH", body: { recordingUrl: url } }));
}

/** Una evaluación del grupo; `plantilla`, `consigna` y `plazo` opcionales. */
export async function crearEvaluacion(g, nombre, { plantilla, consigna, plazo } = {}) {
  const a = ok(`evaluación ${nombre}`, await g.staff(`/api/cohorts/${g.cohortId}/grading`, { method: "POST", body: { name: nombre, required: true } }));
  const id = a.assessment?.id ?? a.id;
  if (plantilla) ok(`plantilla de ${nombre}`, await g.staff(`/api/assessments/${id}/template`, { method: "PUT", body: plantilla }));
  if (consigna) ok(`consigna de ${nombre}`, await g.staff(`/api/assessments/${id}/consigna`, { method: "PUT", body: consigna }));
  if (plazo) ok(`plazo de ${nombre}`, await g.staff(`/api/assessments/${id}/plazo`, { method: "PUT", body: { plazo } }));
  return id;
}

/** Rúbrica de tres criterios que suman 100, con descriptores en el primero. */
export const PLANTILLA_RUBRICA = (requiresApproval) => ({
  scale: "numeric",
  minScore: 60,
  requiresApproval,
  criteria: [
    {
      id: "c1",
      name: "Organización del plano",
      maxPoints: 40,
      levels: {
        excelente: "Capas, escalas y ejes ordenados",
        bueno: "Pequeños desprolijos",
        suficiente: "Faltan capas",
        insuficiente: "Sin criterio de orden",
      },
    },
    { id: "c2", name: "Acotación y cotas", maxPoints: 40 },
    { id: "c3", name: "Presentación final", maxPoints: 20 },
  ],
  textFields: [],
});

export const CONSIGNA = {
  instructionsMd:
    "Dibuje la planta del departamento entregado en clase.\n\nIncluya muros, aberturas y **cotas generales**. Suba el archivo a Drive y entregue el enlace.",
  adjuntos: [{ title: "Plano base del departamento", url: "https://drive.example.com/plano-base" }],
};

/** El alumno de demostración entrega, por su propia puerta (como en el portal). */
export async function entregaDeSantiago(g, assessmentId, titulo) {
  const api = await clienteDe("alumno");
  return ok(
    "entrega de Santiago",
    await api("/api/portal/me/entregas", {
      method: "POST",
      body: { assessmentId, url: "https://drive.example.com/entregas/santiago-planta", title: titulo },
    })
  );
}

/** Arma datos solo cuando se graba ESTE guion (los demás importan esta biblioteca sin efectos). */
export const para = (id, fn) => (process.argv.slice(2).includes(id) ? fn() : null);

/** Pide las páginas con la sesión del rol para que el servidor las compile antes de grabar. */
export async function calentar(rol, rutas) {
  const cookie = await cookieDe(rol);
  for (const r of rutas) await fetch(`${BASE}${r}`, { headers: { cookie } }).catch(() => null);
}

/** Pone las cookies guardadas de un rol en el navegador de la grabación. */
export async function entrarComo(page, rol) {
  const cookie = await cookieDe(rol);
  await page.context().addCookies(
    cookie.split("; ").map((c) => {
      const i = c.indexOf("=");
      return { name: c.slice(0, i), value: c.slice(i + 1), url: BASE };
    })
  );
}

/* ============================================================
 * Guion: prof-ingreso
 * ============================================================ */

// Solo cuando se graba ESTE guion (los demás importan la biblioteca de arriba).
const datos = await para("prof-ingreso", async () => {
  const d = await armarGrupo({ etiqueta: "Taller de planos", enVivo: true, conSantiago: false, companeros: 3, fin: 14 });
  await calentar("profesor", ["/portal/dictado", "/api/portal/cohorts", `/portal/cohortes/${d.cohortId}`, `/api/portal/cohorts/${d.cohortId}/classes`]);
  return d;
});

export const rol = "publico";
export const ruta = "/login";

export async function guion(g) {
  const { page } = g;
  const correo = await cuenta("profesor");

  await g.paso("El ingreso pide el correo y la contraseña que entregó la academia", page.locator("form"), {
    sostener: 5,
    despues: async () => {
      await g.escribir(page.getByLabel("Correo"), correo);
      await g.escribir(page.getByLabel("Contraseña", { exact: true }), CLAVE);
    },
  });

  await g.paso("Entrar abre el portal del profesor, en Mis grupos", page.getByRole("button", { name: "Entrar" }), {
    sostener: 3.5,
    despues: async () => {
      // El cupo de ingresos de la demostración es compartido: no se envía el formulario.
      // Se usa la sesión guardada de la profesora, que lleva al mismo destino.
      const cookie = await cookieDe("profesor");
      await page.context().addCookies(
        cookie.split("; ").map((c) => {
          const i = c.indexOf("=");
          return { name: c.slice(0, i), value: c.slice(i + 1), url: BASE };
        })
      );
      await page.goto(`${BASE}/portal/dictado`, { waitUntil: "load" });
      await page.getByRole("heading", { name: "Mis grupos" }).waitFor({ state: "visible", timeout: 60000 });
      await page.locator(`a[href="/portal/cohortes/${datos.cohortId}"]`).waitFor({ state: "visible", timeout: 30000 });
    },
  });

  await g.paso(
    "El menú lateral lleva a Mis grupos, a Horas dictadas y a la guía del portal",
    page.locator("nav").filter({ hasText: "Mis grupos" }).first(),
    { sostener: 4.5 }
  );

  await g.paso("Los grupos en curso van primero, con la cantidad de alumnos", page.locator('section[aria-labelledby="mis-grupos-en-curso"]'), {
    sostener: 5,
  });

  const tarjeta = page.locator(`a[href="/portal/cohortes/${datos.cohortId}"]`);
  await g.paso("Cada tarjeta indica el curso, el grupo, el inicio y el avance: «Clase X de Y»", tarjeta, { sostener: 5 });

  await g.paso("Los grupos finalizados quedan más abajo y se consultan solo para lectura", page.locator("#mis-grupos-finalizados"), {
    sostener: 4.5,
  });

  await g.paso("Seleccionar la tarjeta abre el grupo", tarjeta, {
    accion: "clic",
    sostener: 3.5,
    despues: async () => {
      await page.getByRole("button", { name: "Evaluaciones" }).waitFor({ state: "visible", timeout: 30000 });
    },
  });

  await g.paso(
    "El grupo tiene cinco pestañas: Clases, Evaluaciones, Entregas, Resultado final y Material",
    page.locator("div.border-b").filter({ has: page.getByRole("button", { name: "Evaluaciones" }) }).first(),
    { sostener: 5 }
  );

  await g.paso(
    "Cerca del horario de la clase aparece «Ingresar a la clase», con el enlace de la reunión",
    page.getByRole("link", { name: "Ingresar a la clase" }).first(),
    { sostener: 5 }
  );
}
