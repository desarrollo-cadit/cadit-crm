/** Vencimiento de accesos de un grupo: calculado, fijado a mano y qué conserva el alumno. */

import { apiComo } from "../datos.mjs";

/* ------------------------------------------------------------------ apoyo */
const sello = Date.now().toString(36).slice(-5);
const dia = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const ok = (n, r) => {
  if (!r.res.ok) throw new Error(`${n}: ${r.res.status} ${JSON.stringify(r.json)}`);
  return r.json;
};
const enviar = (api, ruta, body, metodo = "POST") => api(ruta, { method: metodo, body: JSON.stringify(body) });

/** Cliente de Coordinación con la sesión guardada en disco (no se llama a sign-in: tiene cupo). */
const apiCoordinacion = async () => (await apiComo("coordinacion")).api;

const NOMBRES = [["Martina", "Rodríguez"], ["Santiago", "Pereira"], ["Valentina", "Silva"], ["Joaquín", "González"], ["Camila", "Martínez"], ["Facundo", "Suárez"]];

/** Un curso propio y un grupo con cronograma, alumnos y (si se pide) la lista tomada en todas las clases. */
async function armarGrupo(api, { curso, cursoId, nombre, inicio = -28, fin = -2, alumnos = 4, pasarLista = true }) {
  cursoId ??= ok("curso", await enviar(api, "/api/courses", { name: curso ?? `Curso demo ${sello}`, grantsCertificate: true })).course.id;
  const alta = ok("grupo", await enviar(api, "/api/cohorts", {
    courseId: cursoId, name: nombre ?? `Grupo demo ${sello}`, startDate: dia(inicio), endDate: dia(fin),
    daysOfWeek: "0,2", startTime: "18:30", endTime: "20:30",
  }));
  const grupoId = alta.cohort?.id ?? alta.id;
  ok("cronograma", await api(`/api/cohorts/${grupoId}/schedule`, { method: "POST" }));
  const sellerId = ((await api("/api/sellers")).json?.sellers ?? []).find((s) => !s.archived)?.id;
  const inscripciones = [];
  for (const [i, [n, a]] of NOMBRES.slice(0, alumnos).entries()) {
    const r = ok(`inscripción de ${n}`, await enviar(api, "/api/enrollments", {
      cohortId: grupoId, sellerId,
      contact: {
        firstName: n, lastName: `${a} ${sello}`,
        phone: `5989${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
        email: `${n}.${a}.${sello}.${i}@demo.test`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(),
      },
    }));
    inscripciones.push({ id: r.enrollment?.id, nombre: `${n} ${a} ${sello}` });
  }
  const clases = ((await api(`/api/cohorts/${grupoId}/classes`)).json?.classes ?? []).filter((c) => c.id);
  if (pasarLista) {
    const E = ["presente", "presente", "presente", "tarde"];
    for (const [k, c] of clases.entries()) {
      ok("lista", await enviar(api, `/api/class-sessions/${c.id}`, {
        attendance: inscripciones.map((e, i) => ({ enrollmentId: e.id, status: i === 3 && k % 3 === 0 ? "ausente" : E[(i + k) % 4] })),
      }, "PATCH"));
    }
  }
  return { cursoId, grupoId, inscripciones, clases };
}
/* ------------------------------------------------------------------------- */

const api = await apiCoordinacion();
// Un grupo que terminó hace 40 días: el acceso calculado (un mes después del fin) ya venció.
const g = await armarGrupo(api, { nombre: `Grupo acceso ${sello}`, inicio: -70, fin: -40, alumnos: 3, pasarLista: false });

export const rol = "coordinacion";
export const ruta = `/cohorts/${g.grupoId}?tab=alumnos`;

export async function guion(g2) {
  const { page } = g2;
  const nueva = dia(30);

  await g2.paso(
    "Bajo cada alumno se indica hasta cuándo ve grabaciones y material",
    page.getByText(/Acceso vencido el/).first(),
    { sostener: 3.6 }
  );
  await g2.paso(
    "Para ver el detalle, abra la fila del alumno",
    page.getByRole("button", { name: "Ver detalle" }).first(),
    { accion: "clic", sostener: 2.4, despues: () => page.getByText("Acceso a grabaciones y material vencido el").first().waitFor({ timeout: 15000 }) }
  );
  const linea = page.getByText("Acceso a grabaciones y material vencido el").first().locator("xpath=ancestor::div[contains(@class,'flex')][1]");
  await g2.paso("Por defecto vence un mes después del fin del grupo, y aquí figura como vencido", linea, { sostener: 4 });
  await g2.paso(
    "Con permiso de edición académica, «Extender o cambiar» permite fijar otra fecha",
    page.getByRole("button", { name: "Extender o cambiar" }).first(),
    { accion: "clic", sostener: 3, despues: () => page.getByLabel("Acceso hasta").first().waitFor({ timeout: 10000 }) }
  );
  await g2.paso("Se elige el día hasta el cual el alumno conserva el acceso", page.getByLabel("Acceso hasta").first(), {
    sostener: 1,
  });
  await page.getByLabel("Acceso hasta").first().fill(nueva);
  await g2.paso(
    "Al guardar, la fecha queda fijada a mano, con su autor y su día",
    page.getByRole("button", { name: "Guardar" }).first(),
    { accion: "clic", sostener: 2.6, despues: () => page.getByText(/Fijada a mano/).first().waitFor({ timeout: 15000 }) }
  );
  await g2.paso(
    "La calculada sigue visible y «Volver a la calculada» deshace el cambio",
    page.getByText("Acceso a grabaciones y material hasta el").first().locator("xpath=ancestor::div[contains(@class,'flex')][1]"),
    { sostener: 4 }
  );
  await g2.paso(
    "Al vencer, el alumno deja de ver grabaciones y material. Conserva notas, asistencia y certificados",
    null,
    { sostener: 4.4 }
  );
}
