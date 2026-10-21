/**
 * Video de capacitación: el portal del profesor.
 *
 * Arma un grupo ficticio por la API del staff (sin grabar), le asigna una
 * profesora nueva con acceso al portal y graba, en un contexto de navegador
 * propio, el recorrido completo de la profesora: ingreso, grupos, asistencia,
 * grabación, evaluaciones, entregas, material, horas dictadas y cierre.
 *
 * SOLO contra el entorno de pruebas (base `vocero_e2e`). Ver README.md.
 *
 *   node --env-file=.env.e2e scripts/demos/portal-profesor.mjs
 *
 * Salida:
 *   demos-output/portal-profesor.webm y .mp4 (el .mp4 solo si se encuentra ffmpeg)
 *   demos-output/portal-profesor-timeline.json (inicio de cada subtítulo, para narrar)
 *   demos-output/portal-profesor-frames/*.png (una captura por paso)
 */

import path from "node:path";
import {
  asegurarVendedor,
  convertirAMp4,
  crearCliente,
  crearDirector,
  duracionDeVideo,
  entrarComoStaff,
  exigir,
  guardarVideo,
  instalarReintentoDeConexion,
  isoDia,
  limpiarTemporales,
  mantenerCaliente,
  precalentar,
  sleep,
  tamañoMb,
} from "./lib.mjs";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3005";
const SALIDA = path.resolve("demos-output");
const TMP = path.join(SALIDA, "tmp");
const FRAMES = path.join(SALIDA, "portal-profesor-frames");
const VIDEO = path.join(SALIDA, "portal-profesor.webm");
const LINEA_DE_TIEMPO = path.join(SALIDA, "portal-profesor-timeline.json");
const TAMANO = { width: 1440, height: 900 };

/** Guardas: el guion crea datos, así que nunca corre contra una base real. */
if (!/localhost|127\.0\.0\.1/.test(BASE)) {
  console.error(`APP_BASE_URL=${BASE} no es local: los demos solo corren contra el entorno de pruebas.`);
  process.exit(1);
}
if (process.env.DATABASE_URL && !/vocero_e2e/.test(process.env.DATABASE_URL)) {
  console.error("DATABASE_URL no apunta a vocero_e2e: los demos solo corren contra la base de pruebas.");
  process.exit(1);
}

instalarReintentoDeConexion();

const CURSO = "AutoCAD 2D — Nivel inicial";
const PROFESORA = "Laura Fernández";
const ALUMNOS = [
  ["Martina", "Rodríguez"],
  ["Santiago", "Pereira"],
  ["Valentina", "Silva"],
  ["Joaquín", "González"],
  ["Camila", "Martínez"],
  ["Facundo", "Suárez"],
];

/* ============================================================
 * Armado de datos (no se graba)
 * ============================================================ */

/** Hora local de la academia: minutos desde medianoche y día (lunes = 0). */
function ahoraEn(zona) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zona,
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  const dias = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return {
    minutos: Number(partes.hour) * 60 + Number(partes.minute),
    dia: dias.indexOf(partes.weekday),
  };
}

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

async function armarDatos() {
  const { api } = crearCliente(BASE);
  await entrarComoStaff(api);
  const sello = Date.now().toString(36);

  // El curso se reutiliza entre corridas; el grupo es siempre nuevo.
  const cursos = (await api("/api/courses")).json?.courses ?? [];
  const cursoId =
    cursos.find((c) => c.name === CURSO)?.id ??
    exigir("alta del curso", await api("/api/courses", { method: "POST", body: JSON.stringify({ name: CURSO }) }))
      .course.id;

  /**
   * La profesora va en el alta del grupo, ANTES de generar el cronograma:
   * cada clase guarda su profesor al generarse, y "Horas dictadas" cuenta las
   * clases que llevan su nombre. Asignarla después dejaría las horas vacías.
   */
  const email = `laura.fernandez.${sello}@demo.test`;
  const profesora = exigir(
    "alta de la profesora",
    await api("/api/teachers", { method: "POST", body: JSON.stringify({ name: PROFESORA, email }) })
  );
  const profesoraId = profesora.teacher?.id ?? profesora.id;

  const grupo = exigir(
    "alta del grupo",
    await api("/api/cohorts", {
      method: "POST",
      body: JSON.stringify({
        courseId: cursoId,
        teacherId: profesoraId,
        name: "Grupo Octubre 2026",
        startDate: isoDia(-14),
        endDate: isoDia(14),
        daysOfWeek: "0,2",
        startTime: "18:30",
        endTime: "20:30",
        classroom: "Sala Virtual 2",
        meetingUrl: "https://zoom.us/j/81234567890",
      }),
    })
  );
  const grupoId = grupo.cohort?.id ?? grupo.id;

  /**
   * Una clase EN CURSO en este momento, para que el video muestre el enlace
   * "Ingresar a la clase" (solo aparece cerca del horario). Hoy y otro día de
   * la semana; si la hora local no deja una clase completa dentro del día, se
   * queda el horario de las 18:30 y la demo sigue sin enlace en vivo.
   */
  const zona = (await api(`/api/cohorts/${grupoId}/classes`)).json?.timezone ?? "America/Montevideo";
  const ahora = ahoraEn(zona);
  const inicio = Math.floor((ahora.minutos - 30) / 5) * 5;
  const hayClaseEnVivo = inicio >= 0 && inicio + 120 < 24 * 60;
  const dias = [...new Set([ahora.dia, (ahora.dia + 5) % 7])].sort().join(",");
  exigir(
    "horario del grupo",
    await api(`/api/cohorts/${grupoId}`, {
      method: "PATCH",
      body: JSON.stringify(
        hayClaseEnVivo
          ? { daysOfWeek: dias, startTime: hhmm(inicio), endTime: hhmm(inicio + 120) }
          : { daysOfWeek: dias }
      ),
    })
  );
  exigir("cronograma", await api(`/api/cohorts/${grupoId}/schedule`, { method: "POST" }));

  const vendedorId = await asegurarVendedor(api, "Ventas Demo");
  for (const [i, [nombre, apellido]] of ALUMNOS.entries()) {
    const telefono = `5989${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
    exigir(
      `inscripción de ${nombre}`,
      await api("/api/enrollments", {
        method: "POST",
        body: JSON.stringify({
          cohortId: grupoId,
          sellerId: vendedorId,
          contact: {
            firstName: nombre,
            lastName: apellido,
            phone: telefono,
            email: `${nombre}.${apellido}.${sello}.${i}@demo.test`
              .normalize("NFD")
              .replace(/[̀-ͯ]/g, "")
              .toLowerCase(),
          },
        }),
      })
    );
  }

  for (const nombre of ["Ejercicio práctico 1", "Proyecto final"]) {
    exigir(
      `evaluación ${nombre}`,
      await api(`/api/cohorts/${grupoId}/grading`, {
        method: "POST",
        body: JSON.stringify({ name: nombre, required: true }),
      })
    );
  }

  const clases = (await api(`/api/cohorts/${grupoId}/classes`)).json?.classes ?? [];
  const primera = clases.find((c) => c.id);
  if (primera) {
    exigir(
      "material de la academia",
      await api("/api/resources", {
        method: "POST",
        body: JSON.stringify({
          title: "Guía de la clase 1 — Interfaz y comandos básicos",
          url: "https://drive.example.com/autocad-clase-1",
          kind: "guia",
          classSessionId: primera.id,
        }),
      })
    );
  }
  exigir(
    "aviso de la academia",
    await api(`/api/cohorts/${grupoId}/announcements`, {
      method: "POST",
      body: JSON.stringify({
        title: "Bienvenida al curso",
        body: "Les damos la bienvenida a AutoCAD 2D. Recuerden instalar la versión de prueba antes de la segunda clase.",
      }),
    })
  );

  const acceso = exigir(
    "acceso al portal",
    await api(`/api/teachers/${profesoraId}/access`, { method: "POST", body: JSON.stringify({}) })
  );

  console.log(`  grupo ${grupoId} · ${clases.length} clases · zona ${zona} · en vivo: ${hayClaseEnVivo}`);
  return { grupoId, email, clave: acceso.temporaryPassword, hayClaseEnVivo };
}

/* ============================================================
 * Guion grabado
 * ============================================================ */

async function grabar(datos) {
  const { chromium } = await import("playwright");
  await limpiarTemporales(TMP);
  const navegador = await chromium.launch({ headless: true });
  // Contexto propio, sin cookies del staff.
  const context = await navegador.newContext({
    viewport: TAMANO,
    recordVideo: { dir: TMP, size: TAMANO },
    locale: "es-UY",
    colorScheme: "light",
  });
  const page = await context.newPage();
  const d = await crearDirector(context, page, { framesDir: FRAMES, totalPasos: 8 });
  const boton = (nombre, exact = true) => page.getByRole("button", { name: nombre, exact });
  const enlace = (nombre) => page.getByRole("link", { name: nombre, exact: true }).filter({ visible: true }).first();
  const inicio = Date.now();

  try {
    await page.goto(`${BASE}/login`, { waitUntil: "load", timeout: 120000 });
    await page.locator("#email").waitFor({ timeout: 180000 });

    await d.tarjeta(
      {
        titulo: "Portal del profesor — Guía de uso",
        subtitulo: "CadIT · Capacitación interna",
        pie: "Recorrido completo por las funciones del portal",
        archivo: "intro",
      },
      { ms: 5000 }
    );

    /* ---------- 1. Ingreso ---------- */
    await d.seccion("Ingreso al portal", "Primer acceso y definición de la contraseña personal.");
    await d.decir("Para ingresar, abra la dirección del portal que le envió la academia.");
    await d.decir("Escriba su correo electrónico y la contraseña temporal que recibió.", { sostener: false });
    await d.escribir(page.locator("#email"), datos.email, { retardo: 22 });
    await d.escribir(page.locator("#password"), datos.clave, { retardo: 22 });
    await d.clic(boton("Entrar"));

    await page.locator("#actual").waitFor({ timeout: 180000 });
    await d.decir("En el primer ingreso, el sistema solicita definir una contraseña personal antes de continuar.");
    await d.decir("Ingrese la contraseña temporal y, a continuación, la nueva contraseña dos veces.", {
      sostener: false,
    });
    const nueva = "Clave-Profesora-2026";
    await d.escribir(page.locator("#actual"), datos.clave, { retardo: 22 });
    await d.escribir(page.locator("#nueva"), nueva, { retardo: 22 });
    await d.escribir(page.locator("#repetida"), nueva, { retardo: 22 });
    await d.clic(boton("Guardar contraseña"));
    await page.waitForURL(/\/portal\/dictado/, { timeout: 180000 });
    await page.getByRole("heading", { name: "Mis grupos" }).waitFor({ timeout: 180000 });
    await d.decir("A partir de este momento, ingresará siempre con su contraseña personal.");

    /* ---------- 2. Mis grupos ---------- */
    await d.seccion("Mis grupos", "Los grupos a su cargo y el estado de cada uno.");
    const tarjeta = page.locator(`a[href="/portal/cohortes/${datos.grupoId}"]`);
    await tarjeta.waitFor({ timeout: 180000 });
    await d.decir("La sección Mis grupos reúne los grupos que la academia le asignó.", { sostener: false });
    await d.resaltar(page.getByRole("heading", { name: "Mis grupos" }));
    await sleep(1800);
    await d.decir(
      "Cada tarjeta muestra el curso, el nombre del grupo, la fecha de inicio, el horario y la cantidad de alumnos.",
      { sostener: false }
    );
    await d.resaltar(tarjeta, { ms: 3500 });
    await d.decir("El estado indica si el grupo está En curso, Por iniciar o Finalizado.", { sostener: false });
    await d.resaltar(tarjeta.getByText("En curso", { exact: true }), { ms: 2500 });
    await d.decir("Los grupos finalizados se muestran aparte y quedan disponibles solo para consulta.");
    await d.decir("Si cubre una clase como suplente, ese grupo también aparece aquí, con la indicación «suplencia».");
    await d.decir("Seleccione la tarjeta para abrir el grupo.", { sostener: false });
    await d.clic(tarjeta, { hasta: boton("Evaluaciones") });

    /* ---------- 3. Clases y asistencia ---------- */
    await d.seccion("Clases y asistencia", "Registro de la asistencia de cada clase.");
    const pestanas = page.locator("div.border-b").filter({ has: boton("Evaluaciones") }).first();
    await d.decir("El grupo se organiza en cuatro pestañas: Clases, Evaluaciones, Entregas y Material.", {
      sostener: false,
    });
    await d.resaltar(pestanas, { ms: 3000 });
    await d.decir("La pestaña Clases lista todas las clases del cronograma, con su fecha y su horario.");

    const ingresar = page.getByRole("link", { name: "Ingresar a la clase" }).first();
    let filaClase;
    if (datos.hayClaseEnVivo && (await ingresar.isVisible().catch(() => false))) {
      await d.decir(
        "El enlace «Ingresar a la clase» aparece poco antes del inicio y permanece disponible durante la clase.",
        { sostener: false }
      );
      await d.resaltar(ingresar, { ms: 3500 });
      filaClase = page.locator("li").filter({ has: ingresar }).first().getByRole("button").first();
    } else {
      filaClase = page.locator("li").filter({ hasText: "Cargar grabación" }).last().getByRole("button").first();
    }
    await d.decir("Para registrar la asistencia, seleccione la clase correspondiente.", { sostener: false });
    await d.clic(filaClase, { hasta: boton("Volver a las clases", false) });

    const masivo = page.getByRole("button", { name: /Marcar como presentes/ });
    await masivo.waitFor({ timeout: 180000 });
    await d.decir("La planilla muestra a todos los alumnos inscriptos en el grupo.");
    await d.decir(
      "El botón «Marcar como presentes» registra de una sola vez a todos los alumnos que aún no tienen marca.",
      { sostener: false }
    );
    const [ausente, tarde] = [ALUMNOS[2], ALUMNOS[4]].map(([n, a]) => `${n} ${a}`);
    await d.clic(masivo, { hasta: page.getByRole("button", { name: `${ausente}: Presente` }).and(page.locator('[aria-pressed="true"]')) });
    await sleep(1200);
    await d.decir("Luego, corrija los casos particulares; por ejemplo, un alumno ausente.", { sostener: false });
    await d.clic(boton(`${ausente}: Ausente`), {
      hasta: boton(`${ausente}: Ausente`).and(page.locator('[aria-pressed="true"]')),
    });
    await sleep(1000);
    await d.decir("O un alumno que llegó tarde.", { sostener: false });
    await d.clic(boton(`${tarde}: Tarde`), {
      hasta: boton(`${tarde}: Tarde`).and(page.locator('[aria-pressed="true"]')),
    });
    await sleep(1200);
    await d.decir("La asistencia se guarda automáticamente con cada selección; no es necesario confirmar.");
    await d.decir("Debajo de cada alumno queda registrado quién hizo la última marca y en qué fecha.");
    await d.decir("Para regresar al listado, seleccione «Volver a las clases».", { sostener: false });
    await d.clic(boton("Volver a las clases", false), { hasta: boton("Evaluaciones") });

    /* ---------- 4. Grabaciones ---------- */
    await d.seccion("Grabaciones", "Carga del enlace de la grabación de una clase.");
    const cargar = page.getByRole("button", { name: "Cargar grabación" }).last();
    await cargar.waitFor({ timeout: 180000 });
    await d.decir("Una vez finalizada la clase, puede cargar el enlace de su grabación.", { sostener: false });
    await d.clic(cargar, { hasta: page.locator("#grabacion-url") });
    await d.decir("Pegue el enlace de la grabación. El sistema guarda solo el enlace, no el video.", {
      sostener: false,
    });
    await d.escribir(page.locator("#grabacion-url"), "https://drive.example.com/autocad-grabacion-clase", {
      retardo: 16,
    });
    await sleep(1000);
    await d.clic(boton("Guardar"));
    await page.locator("#grabacion-url").waitFor({ state: "detached", timeout: 180000 });
    await sleep(800);
    const grabacion = page.getByRole("link", { name: "Grabación", exact: true }).last();
    await d.decir("Al guardar, la grabación queda disponible para los alumnos del grupo junto a esa clase.", {
      sostener: false,
    });
    await d.resaltar(grabacion, { ms: 3500 });
    await sleep(1000);

    /* ---------- 5. Evaluaciones y entregas ---------- */
    await d.seccion("Evaluaciones y entregas", "Registro de resultados y revisión de los trabajos.");
    await d.decir("En Evaluaciones se registran los resultados de las evaluaciones que define la academia.", {
      sostener: false,
    });
    const [primerAlumno] = ALUMNOS.map(([n, a]) => `${n} ${a}`);
    const selector = page.getByLabel(`${primerAlumno}, Ejercicio práctico 1`);
    await d.clic(boton("Evaluaciones"), { hasta: selector });
    await sleep(1000);
    await d.decir("Para cada alumno, seleccione Aprobado o No aprobado. El resultado se guarda al seleccionarlo.", {
      sostener: false,
    });
    await d.elegir(selector, "si");
    await sleep(1000);
    await d.decir("La opción «Sin corregir» indica que todavía no hay resultado; no equivale a un desaprobado.");
    await d.decir("En Entregas se revisan los trabajos que envían los alumnos para cada evaluación.", {
      sostener: false,
    });
    await d.clic(boton("Entregas"), { hasta: page.getByText("Todavía no entregó.").first() });
    await sleep(1000);
    const plazo = page.getByRole("button", { name: /Establecer plazo/ }).first();
    await d.decir("Desde aquí puede corregir cada entrega, otorgar una prórroga y establecer la fecha límite de la evaluación.", {
      sostener: false,
    });
    await d.resaltar(plazo, { ms: 3000 });
    await sleep(1000);
    await d.decir("Cuando el grupo finaliza, las entregas quedan disponibles solo para consulta.");

    /* ---------- 6. Material y avisos ---------- */
    await d.seccion("Material y avisos", "Consulta de avisos y publicación de material para el grupo.");
    await d.decir("En Material se consultan los avisos de la academia y el material publicado para el grupo.", {
      sostener: false,
    });
    const publicar = boton("Publicar material");
    await d.clic(boton("Material"), { hasta: publicar });
    await sleep(1000);
    await d.resaltar(page.getByText("Bienvenida al curso").first(), { ms: 2500 });
    await d.decir("Para compartir material con sus alumnos, seleccione «Publicar material».", { sostener: false });
    await d.clic(publicar, { hasta: page.locator("#material-title") });
    await d.decir(
      "Indique un título, el enlace y el tipo de material. Se admiten enlaces de Drive, WeTransfer o Autodesk Docs.",
      { sostener: false }
    );
    await d.escribir(page.locator("#material-title"), "Ejercicios de práctica — Clase 4", { retardo: 28 });
    await d.escribir(page.locator("#material-url"), "https://drive.example.com/autocad-ejercicios-4", {
      retardo: 16,
    });
    await d.elegir(page.locator("#material-kind"), "ejemplo");
    await sleep(1200);
    await d.clic(boton("Publicar"));
    await page.locator("#material-title").waitFor({ state: "detached", timeout: 180000 });
    await sleep(800);
    await d.decir("El material queda visible de inmediato para los alumnos de este grupo.", { sostener: false });
    await d.resaltar(page.getByText("Ejercicios de práctica — Clase 4").first(), { ms: 3500 });
    await sleep(1000);

    /* ---------- 7. Horas dictadas ---------- */
    await d.seccion("Horas dictadas", "Resumen de las clases dictadas, como referencia para la liquidación.");
    await d.decir("La sección Horas dictadas resume las clases que usted dictó y sus horas.", { sostener: false });
    await d.clic(enlace("Horas dictadas"), { hasta: page.getByText("clases dictadas", { exact: true }) });
    await sleep(1000);
    await d.resaltar(page.locator("div.grid").first(), { ms: 3000 });
    await d.decir("Solo se cuentan las clases que ya terminaron. Las programadas se informan aparte y las canceladas no se cuentan.");
    await d.decir("El resumen es una referencia para controlar la liquidación. Ante cualquier diferencia, comuníquese con la academia.");

    /* ---------- 8. Guía y cierre de sesión ---------- */
    await d.seccion("Guía del portal y cierre de sesión", "Dónde consultar ayuda y cómo salir del portal.");
    await d.decir("La Guía del portal describe cada sección del menú y puede consultarse en cualquier momento.", {
      sostener: false,
    });
    await d.clic(enlace("Guía del portal"), { hasta: page.getByText("Como profesor") });
    await sleep(4000);
    await d.decir("Al terminar, cierre la sesión, en especial si utiliza una computadora compartida.", {
      sostener: false,
    });
    await d.clic(page.getByRole("button", { name: "Cerrar sesión" }).filter({ visible: true }).first());
    await page.waitForURL(/\/login/, { timeout: 180000 });
    await page.locator("#email").waitFor({ timeout: 180000 });
    await d.callar();
    await sleep(1200);

    await d.tarjeta(
      {
        titulo: "Ante cualquier consulta, comuníquese con Coordinación Académica.",
        subtitulo: "Portal del profesor · CadIT",
        archivo: "cierre",
      },
      { ms: 6000 }
    );
  } catch (err) {
    await page.screenshot({ path: path.join(SALIDA, "portal-profesor-error.png") }).catch(() => {});
    throw err;
  } finally {
    await d.guardarLineaDeTiempo(LINEA_DE_TIEMPO);
    const video = page.video();
    await context.close();
    await navegador.close();
    if (video) await guardarVideo(video, VIDEO);
  }
  return (Date.now() - inicio) / 1000;
}

async function main() {
  console.log("== Demo: portal del profesor ==");
  const salud = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!salud?.ok) throw new Error(`la app no responde en ${BASE}/api/health`);

  console.log("· Armando datos ficticios…");
  const datos = await armarDatos();
  console.log("· Precalentando rutas (con next dev, cada ruta compila al primer pedido)…");
  const g = datos.grupoId;
  const rutas = [
    "/login",
    "/",
    "/cambiar-contrasena",
    "/portal",
    "/portal/dictado",
    `/portal/cohortes/${g}`,
    "/portal/horas",
    "/portal/guia",
    "/api/account/password",
    "/api/portal/cohorts",
    `/api/portal/cohorts/${g}/classes`,
    `/api/portal/cohorts/${g}/grading`,
    `/api/portal/cohorts/${g}/content`,
    `/api/portal/cohorts/${g}/entregas`,
    `/api/portal/cohorts/${g}/offline-attempts`,
    `/api/portal/cohorts/${g}/resources`,
    "/api/portal/classes/x/attendance",
    "/api/portal/classes/x/recording",
    "/api/portal/assessments/x/results",
    "/api/portal/hours",
  ];
  await precalentar(BASE, rutas);
  console.log("· Grabando…");
  const parar = mantenerCaliente(BASE, rutas);
  let segundos;
  try {
    segundos = await grabar(datos);
  } finally {
    parar();
  }
  console.log("· Convirtiendo a MP4…");
  const mp4 = convertirAMp4(VIDEO);
  const duracion = duracionDeVideo(mp4 ?? VIDEO);
  const largo = duracion ? `${duracion.toFixed(1)} s` : `~${Math.round(segundos)} s`;
  console.log(`\nListo: ${VIDEO} (${await tamañoMb(VIDEO)} MB, ${largo})`);
  console.log(
    mp4
      ? `       ${mp4} (${await tamañoMb(mp4)} MB)`
      : "       sin MP4: no se encontró ffmpeg (FFMPEG_PATH, PATH o WinGet)."
  );
  console.log(`Línea de tiempo: ${LINEA_DE_TIEMPO}`);
  console.log(`Capturas: ${FRAMES}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
